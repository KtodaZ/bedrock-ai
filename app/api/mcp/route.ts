import { NextRequest } from "next/server";
import {
  fetchCSV,
  getDatabase,
  runSQL,
  isReadOnlySelect,
  searchPax,
} from "@/lib/attendance-db";

export const runtime = "nodejs";

// ── MCP server metadata ────────────────────────────────────────────────────
const SERVER_NAME = "bedrock-data-ai";
const SERVER_VERSION = "1.0.0";
const DEFAULT_PROTOCOL = "2025-06-18";

// Domain knowledge handed to the connecting agent so it reasons about the data
// the same way Bedrock Data AI does. Surfaced via get_schema and tool text.
const SCHEMA_GUIDE = `Bedrock Data AI exposes read-only access to an F3 Nation workout group's attendance records as a single SQLite table you query with the run_sql tool.

TABLE: attendance
Columns:
- "PAX Name" TEXT — participant name (mixed casing; fuzzy-match with search_pax first)
- "Site Name" TEXT — workout location / AO (Grizzly Bar, Rattlesnake Ridge, Hilltop, Divento, Spartan, Trailhead, Outpost)
- "FNG" INTEGER — 1 if first-time attendee, else 0
- "Post" INTEGER — 1 if attended this workout. ALWAYS filter WHERE "Post" = 1 for actual attendance; rows exist for every PAX at every session even when they did not post.
- "Q" INTEGER — 1 if led this workout as the Q
- "QS" INTEGER — Qsource indicator
- "QS-Q" INTEGER — Qsource Q indicator
- "Date" TEXT — ISO date YYYY-MM-DD, sortable lexicographically
- "Month" INTEGER — month number 1–12
- "Year" INTEGER — calendar year
- "Month_1" TEXT — month name (the sheet's second "Month" column)
- "Day of the Week" TEXT — day name
- "City" TEXT — Granite Bay or Roseville

F3 TERMINOLOGY:
- PAX = members/participants · Q = the session's leader · FNG = first-time attendee · post = attend a workout · HIM = a member · AO = a site/location · EH = recruit someone · Site Q = the ongoing leader of a specific AO
- Kotter List = PAX who have posted at least once ever, but NOT in the last 30 days
- Reach-out list = PAX with a 60+ day gap after a history of regular attendance

ANALYTICAL RULES:
1. "Last X days" is relative to the MOST RECENT date in the data, never today. Start with: SELECT MAX("Date") FROM attendance
2. "Posted" requires WHERE "Post" = 1.
3. Use SQLite date arithmetic on ISO strings: WHERE "Date" >= date((SELECT MAX("Date") FROM attendance), '-30 days')
4. Look up a PAX's exact stored name before querying their stats (use search_pax or a LOWER(...) LIKE lookup).
5. Always report exact counts/totals and state the specific date range an answer covers.
6. Only SELECT/WITH queries are permitted — the data is read-only.`;

// ── Tool definitions ───────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "get_schema",
    description:
      "Return the attendance table schema, F3 terminology, and analytical rules. Call this first to understand the data before writing queries.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "run_sql",
    description:
      "Run a read-only SQL SELECT query against the F3 attendance table and get the result rows back as a formatted table. Only a single SELECT/WITH statement is allowed. Filter WHERE \"Post\" = 1 for actual attendance. Use MAX(\"Date\") as the reference point for any 'last N days' question.",
    inputSchema: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: "A single read-only SQL SELECT (or WITH ... SELECT) statement.",
        },
      },
      required: ["sql"],
      additionalProperties: false,
    },
  },
  {
    name: "search_pax",
    description:
      "Fuzzy-find the exact stored PAX name(s) matching a search string. Use this before querying a specific person's stats, since names are stored with mixed casing and spelling.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full or partial PAX name to search for." },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
];

// ── JSON-RPC helpers ───────────────────────────────────────────────────────
type JsonRpcId = string | number | null;
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
};

function result(id: JsonRpcId, res: unknown) {
  return { jsonrpc: "2.0" as const, id, result: res };
}
function error(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}
function textContent(text: string, isError = false) {
  return { content: [{ type: "text", text }], isError };
}

// ── Auth ───────────────────────────────────────────────────────────────────
function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.MCP_TOKEN;
  if (!expected) return false; // endpoint stays closed until a token is configured
  const auth = req.headers.get("authorization");
  const bearer = auth?.match(/^Bearer\s+(.+)$/i)?.[1];
  const key = bearer ?? req.nextUrl.searchParams.get("key") ?? undefined;
  return key === expected;
}

// ── Method dispatch ────────────────────────────────────────────────────────
async function handleRequest(rpc: JsonRpcRequest) {
  const { method, id, params } = rpc;
  const rpcId = id ?? null;

  switch (method) {
    case "initialize": {
      const clientProtocol =
        typeof params?.protocolVersion === "string" ? params.protocolVersion : DEFAULT_PROTOCOL;
      return result(rpcId, {
        protocolVersion: clientProtocol,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          "Query an F3 workout group's attendance data. Call get_schema first, then run_sql for read-only SELECT queries. Use search_pax to resolve a member's exact name.",
      });
    }
    case "ping":
      return result(rpcId, {});
    case "tools/list":
      return result(rpcId, { tools: TOOLS });
    case "tools/call": {
      const name = params?.name as string | undefined;
      const args = (params?.arguments ?? {}) as Record<string, unknown>;
      try {
        if (name === "get_schema") {
          return result(rpcId, textContent(SCHEMA_GUIDE));
        }
        if (name === "run_sql") {
          const sql = String(args.sql ?? "").trim();
          if (!sql) return result(rpcId, textContent("Error: no SQL provided.", true));
          if (!isReadOnlySelect(sql)) {
            return result(
              rpcId,
              textContent(
                "Error: only a single read-only SELECT (or WITH ... SELECT) statement is allowed.",
                true
              )
            );
          }
          const db = await getDatabase(await fetchCSV());
          return result(rpcId, textContent(runSQL(db, sql)));
        }
        if (name === "search_pax") {
          const q = String(args.name ?? "").trim();
          if (!q) return result(rpcId, textContent("Error: no name provided.", true));
          const db = await getDatabase(await fetchCSV());
          return result(rpcId, textContent(searchPax(db, q)));
        }
        return error(rpcId, -32602, `Unknown tool: ${name}`);
      } catch (err) {
        return result(rpcId, textContent(`Error: ${String(err)}`, true));
      }
    }
    default:
      // Unknown notification (id absent) → ignore; unknown request → error.
      if (id === undefined) return null;
      return error(rpcId, -32601, `Method not found: ${method}`);
  }
}

// ── HTTP handlers (Streamable HTTP transport) ──────────────────────────────
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return new Response(
      JSON.stringify(error(null, -32001, "Unauthorized: missing or invalid MCP token.")),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "WWW-Authenticate": 'Bearer realm="bedrock-mcp"',
          ...CORS,
        },
      }
    );
  }

  let body: JsonRpcRequest | JsonRpcRequest[];
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify(error(null, -32700, "Parse error")), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // Batch or single request.
  const items = Array.isArray(body) ? body : [body];
  const responses = [];
  for (const item of items) {
    const res = await handleRequest(item);
    if (res !== null) responses.push(res);
  }

  // Notifications only (e.g. notifications/initialized) → 202, no body.
  if (responses.length === 0) {
    return new Response(null, { status: 202, headers: { ...CORS } });
  }

  const payload = Array.isArray(body) ? responses : responses[0];
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

// Some clients open a GET for a server-initiated SSE stream. We don't push, so
// signal that cleanly rather than falling through to the auth wall.
export function GET() {
  return new Response("Method Not Allowed — POST JSON-RPC to this endpoint.", {
    status: 405,
    headers: { Allow: "POST, OPTIONS", ...CORS },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS } });
}
