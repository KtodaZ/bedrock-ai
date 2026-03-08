import { NextRequest } from "next/server";
import OpenAI from "openai";
import path from "path";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SHEET_ID = "11fIBnwzcVU2F-OZu7zECq8xROJC6hMY4MryHR4KbUj0";
const GID = "729344821";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
const CACHE_TTL_MS = 10 * 60 * 1000;

let csvCache: { data: string; fetchedAt: number } | null = null;

async function fetchCSV(): Promise<string> {
  if (csvCache && Date.now() - csvCache.fetchedAt < CACHE_TTL_MS) {
    return csvCache.data;
  }
  const res = await fetch(CSV_URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status}`);
  const data = await res.text();
  csvCache = { data, fetchedAt: Date.now() };
  return data;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

type SqlJsDatabase = import("sql.js").Database;
let sqlJsDb: SqlJsDatabase | null = null;
let dbBuiltAt = 0;

async function getDatabase(csv: string): Promise<SqlJsDatabase> {
  // Reuse db if CSV cache is still fresh
  if (sqlJsDb && Date.now() - dbBuiltAt < CACHE_TTL_MS) {
    return sqlJsDb;
  }

  const initSqlJs = (await import("sql.js")).default;
  const SQL = await initSqlJs({
    locateFile: (file: string) =>
      path.join(process.cwd(), "node_modules", "sql.js", "dist", file),
  });

  const lines = csv.split("\n").filter((l) => l.trim());
  const rawHeaders = parseCSVLine(lines[0]);

  // Deduplicate headers (the sheet has two "Month" columns)
  const headers: string[] = [];
  const seen: Record<string, number> = {};
  for (const h of rawHeaders) {
    const clean = h.replace(/^"|"$/g, "").trim();
    if (seen[clean] !== undefined) {
      seen[clean]++;
      headers.push(`${clean}_${seen[clean]}`);
    } else {
      seen[clean] = 0;
      headers.push(clean);
    }
  }

  // Convert M/D/YYYY or MM/DD/YYYY to ISO YYYY-MM-DD for correct date sorting/comparison
  function toISO(raw: string): string | null {
    const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    const [, mo, dy, yr] = m;
    return `${yr}-${mo.padStart(2, "0")}-${dy.padStart(2, "0")}`;
  }

  const dateColIndex = headers.indexOf("Date");
  const yearColIndex = headers.indexOf("Year");
  const integerCols = new Set(["FNG", "Post", "Q", "QS", "QS-Q", "Year", "Month"]);
  const columnDefs = headers
    .map((h) => `"${h}" ${integerCols.has(h) ? "INTEGER" : "TEXT"}`)
    .join(", ");

  const db = new SQL.Database();
  db.run(`CREATE TABLE attendance (${columnDefs})`);
  db.run("BEGIN TRANSACTION");

  const placeholders = headers.map(() => "?").join(", ");
  const stmt = db.prepare(`INSERT INTO attendance VALUES (${placeholders})`);

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const row = parseCSVLine(line);
    if (row.length < headers.length) continue;

    // Skip junk/metadata rows: year out of reasonable range or date converts to null
    if (dateColIndex >= 0) {
      const rawDate = (row[dateColIndex] ?? "").replace(/^"|"$/g, "").trim();
      const iso = toISO(rawDate);
      if (!iso) continue; // skip rows with unparseable dates (e.g. the "1/1/2099 UPDATE" row)
      const yr = parseInt(iso.slice(0, 4), 10);
      if (yr < 2020 || yr > 2030) continue; // skip obvious junk years
    }

    const values = headers.map((h, i) => {
      const raw = row[i] ?? "";
      const val = raw.replace(/^"|"$/g, "").trim();
      // Convert date column to ISO format
      if (i === dateColIndex) return toISO(val) ?? val;
      if (integerCols.has(h)) {
        return val === "" ? null : parseInt(val, 10);
      }
      return val || null;
    });
    stmt.run(values);
  }

  stmt.free();
  db.run("COMMIT");

  if (sqlJsDb) sqlJsDb.close();
  sqlJsDb = db;
  dbBuiltAt = Date.now();
  return db;
}

function runSQL(db: SqlJsDatabase, sql: string): string {
  try {
    const results = db.exec(sql);
    if (!results.length) return "Query returned no rows.";
    const { columns, values } = results[0];
    if (!values.length) return "0 rows returned.";
    const header = columns.join(" | ");
    const divider = columns.map((c) => "-".repeat(Math.max(c.length, 3))).join("-+-");
    const rows = values
      .map((row) => row.map((v) => (v === null ? "NULL" : String(v))).join(" | "))
      .join("\n");
    return `${header}\n${divider}\n${rows}\n\n(${values.length} row${values.length === 1 ? "" : "s"})`;
  } catch (err) {
    return `SQL Error: ${String(err)}`;
  }
}

type HistoryMessage = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `You are Bedrock Data AI — an expert data analyst for an F3 Nation workout group. You answer questions by running precise SQL queries against an in-memory SQLite database populated from the group's attendance records.

DATABASE SCHEMA — Table: attendance
Columns:
- "PAX Name" TEXT — participant name
- "Site Name" TEXT — workout location (Grizzly Bar, Rattlesnake Ridge, Hilltop, Divento, Spartan, Trailhead, Outpost)
- "FNG" INTEGER — 1 if first-time attendee, 0 otherwise
- "Post" INTEGER — 1 if attended this workout (always filter WHERE "Post" = 1 for actual attendance)
- "Q" INTEGER — 1 if led this workout as Q leader
- "QS" INTEGER — Qsource indicator
- "QS-Q" INTEGER — Qsource Q indicator
- "Date" TEXT — ISO date string YYYY-MM-DD, sortable lexicographically
- "Month" INTEGER — month number (1–12)
- "Year" INTEGER — calendar year
- "Month_1" TEXT — month name (January, February, etc.) — the second Month column
- "Day of the Week" TEXT — day name
- "City" TEXT — city name (Granite Bay, Roseville)

F3 TERMINOLOGY:
- PAX = participants/members of the workout group
- Q = the workout leader for a given session
- FNG = First 'N' Guy — a first-time attendee (FNG = 1)
- Post = attending a workout (Post = 1)
- HIM = High Impact Man (how F3 refers to members)
- Kotter List = PAX who have posted at least once ever, but NOT in the last 30 days
- Reach-out list = PAX with 60+ day gap after a history of regular attendance

CRITICAL ANALYTICAL RULES:
1. ALWAYS begin by querying the most recent date in the dataset:
   SELECT MAX("Date") as max_date FROM attendance
   Use this as your reference point — never use today's calendar date.
2. "Last X days" = WHERE "Date" >= date(max_date, '-X days')
3. "Posted" requires WHERE "Post" = 1 — rows exist for every PAX at every session even if they didn't post
4. For Kotter List: SELECT DISTINCT "PAX Name" WHERE MAX("Date" WHERE "Post"=1) < date(max_date, '-30 days') AND COUNT("Post"=1) >= 1
5. VALIDATE important results with a follow-up query — if a number seems surprising, verify it
6. For rankings, always include the exact count/total (e.g., "12 posts")
7. Always state the specific date range your answer covers (e.g., "Jan 1 – Mar 15, 2025")
8. Run as many queries as needed — precision matters more than speed
9. When asked about a specific PAX, look up their exact attendance history before answering
10. Cross-check: if you count X people, spot-check a few entries to confirm accuracy

SQL TIPS:
- Use date() and strftime() for date arithmetic: date("Date", '-30 days')
- To count posts: SUM(CASE WHEN "Post" = 1 THEN 1 ELSE 0 END) or COUNT with WHERE
- For "most recent post" per PAX: MAX("Date") WHERE "Post" = 1 GROUP BY "PAX Name"
- SQLite date comparison works on ISO strings: "Date" >= '2025-01-01'
- HAVING clause for filtering aggregated results

RESPONSE FORMATTING RULES:
- Never mention SQL, databases, queries, or any technical details
- Respond naturally as if you have expert knowledge of the group
- Lead with the direct answer — no preamble or "Great question!"
- State the date range covered once, briefly, at the top (e.g. "**Jan 1 – Mar 7, 2026**")
- Use **bold** for PAX names throughout
- Use ### headers to separate distinct sections (e.g. ### Top Posters, ### Sites)
- Use bullet lists for any list of people or data — one item per line, no walls of text
- Each bullet: name + key stat + one short detail (e.g. "- **Clove** — 18 posts, last on Mar 5")
- Always show the data behind the answer — if the answer is a count, list what was counted; if it's a ranking, show the numbers; never return a bare conclusion without the supporting detail
- Use --- to divide major sections only when the response has 3+ distinct sections
- Keep commentary tight — one sentence of context per section max, no lengthy paragraphs
- Include counts and totals always; never just list names without numbers
- Be encouraging and community-focused, but keep it brief

OFF-TOPIC HANDLING:
If asked about anything unrelated to F3 attendance data (workout planning, nutrition, general fitness, etc.), respond:
"I'm Bedrock Data AI — I specialize in F3 attendance and participation data. I can help with attendance stats, workout leaders, participation trends, the Kotter List, FNG counts, site rankings, and more. What would you like to know about your crew?"`;

const RUN_SQL_TOOL: OpenAI.Responses.Tool = {
  type: "function",
  name: "run_sql",
  description:
    "Execute a SQL SELECT query against the F3 attendance database. Returns the result rows as a formatted table. Use this to retrieve any data needed to answer the user's question. You may call this multiple times.",
  parameters: {
    type: "object" as const,
    properties: {
      sql: {
        type: "string",
        description: "The SQL SELECT query to execute against the attendance table.",
      },
      reason: {
        type: "string",
        description: "Brief description of what data this query retrieves and why.",
      },
    },
    required: ["sql", "reason"],
    additionalProperties: false,
  },
  strict: true,
};

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      try {
        const {
          question,
          history = [],
          reasoningLevel = "low",
        }: { question: string; history: HistoryMessage[]; reasoningLevel?: "low" | "medium" | "high" } =
          await req.json();

        if (!question?.trim()) {
          send({ type: "error", message: "No question provided" });
          return;
        }

        const startTime = Date.now();
        console.log(`[chat] question="${question}" reasoning=${reasoningLevel} historyLen=${history.length}`);

        send({ type: "phase", label: "Loading attendance data..." });
        const csv = await fetchCSV();

        send({ type: "phase", label: "Preparing database..." });
        const db = await getDatabase(csv);

        send({ type: "phase", label: "Analyzing your question..." });

        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const systemWithDate = `${SYSTEM_PROMPT}\n\nToday's date: ${today}. All dates in the database are stored in ISO format (YYYY-MM-DD). The dataset may not extend to today — always query MAX("Date") first to find the actual latest record.`;

        const input: OpenAI.Responses.ResponseInput = [
          { role: "system", content: systemWithDate },
          ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
          { role: "user", content: question },
        ];

        let finalAnswer = "";
        let queryBatch = 0;

        // Agentic loop — model calls run_sql as many times as needed
        while (true) {
          const response = await openai.responses.create({
            model: "gpt-5.1",
            reasoning: { effort: reasoningLevel },
            input,
            tools: [RUN_SQL_TOOL],
          });

          const toolCalls = response.output.filter((o) => o.type === "function_call") as OpenAI.Responses.ResponseFunctionToolCallItem[];

          if (toolCalls.length === 0) {
            // No more tool calls — final answer is ready
            finalAnswer = response.output_text ?? "";
            break;
          }

          queryBatch++;
          if (queryBatch === 1) {
            send({ type: "phase", label: "Querying attendance data..." });
          } else if (queryBatch === 2) {
            send({ type: "phase", label: "Validating results..." });
          } else {
            send({ type: "phase", label: `Cross-checking (query ${queryBatch})...` });
          }

          // Add all model output to input (includes reasoning + function_call items)
          input.push(...(response.output as OpenAI.Responses.ResponseInput));

          // Execute each SQL tool call and add results
          for (const call of toolCalls) {
            let args: { sql: string; reason: string };
            try {
              args = JSON.parse(call.arguments);
            } catch {
              args = { sql: call.arguments, reason: "" };
            }
            console.log(`[chat] sql_query=${queryBatch} reason="${args.reason}" sql="${args.sql.replace(/\s+/g, " ").trim()}"`);
            const result = runSQL(db, args.sql);
            input.push({
              type: "function_call_output",
              call_id: call.call_id,
              output: result,
            } as OpenAI.Responses.ResponseInputItem.FunctionCallOutput);
          }
        }

        // Generate follow-up suggestions (lightweight, no CSV needed)
        let suggestions: string[] = [];
        try {
          const suggestionsRes = await openai.responses.create({
            model: "gpt-5-mini",
            input: [
              {
                role: "user",
                content: `Bedrock Data AI is a tool that answers questions about F3 workout attendance data. It can answer questions about: post counts, Q counts, FNG counts, attendance trends, site rankings, the Kotter List (PAX who haven't posted in 30+ days), reach-out lists, specific PAX histories, day-of-week breakdowns, and city/site comparisons.

A leader just asked: "${question}"

Generate exactly 3 short follow-up questions they might ask next — questions that Bedrock Data AI can actually answer using attendance data. Do NOT suggest questions about contact info, waivers, group chats, scheduling, or anything outside of attendance data analysis.

Return ONLY a JSON array of 3 strings, no explanation.`,
              },
            ],
          });
          const raw = suggestionsRes.output_text?.trim() ?? "[]";
          const json = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
          suggestions = JSON.parse(json);
        } catch {}

        console.log(`[chat] done queries=${queryBatch} ms=${Date.now() - startTime} answerLen=${finalAnswer.length}`);
        send({ type: "done", answer: finalAnswer, suggestions });
      } catch (err) {
        console.error(`[chat] error: ${String(err)}`);
        send({ type: "error", message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
