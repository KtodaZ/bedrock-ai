import path from "path";

// ── Google Sheet source ────────────────────────────────────────────────────
const SHEET_ID = "11fIBnwzcVU2F-OZu7zECq8xROJC6hMY4MryHR4KbUj0";
const GID = "729344821";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
const CACHE_TTL_MS = 10 * 60 * 1000;

let csvCache: { data: string; fetchedAt: number } | null = null;

export async function fetchCSV(): Promise<string> {
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

// ── In-memory SQLite (sql.js) ──────────────────────────────────────────────
type SqlJsDatabase = import("sql.js").Database;
let sqlJsDb: SqlJsDatabase | null = null;
let dbBuiltAt = 0;

export async function getDatabase(csv: string): Promise<SqlJsDatabase> {
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

// ── Query helpers ──────────────────────────────────────────────────────────
export function runSQL(db: SqlJsDatabase, sql: string): string {
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

// Reject anything that isn't a single read-only SELECT/WITH statement. The DB is
// an in-memory copy rebuilt from the sheet every 10 min, but we still refuse
// writes/DDL/PRAGMA/ATTACH as defense in depth for the public MCP surface.
export function isReadOnlySelect(sql: string): boolean {
  const stripped = sql
    .replace(/--[^\n]*/g, " ") // line comments
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .trim();
  if (!stripped) return false;
  // Disallow multiple statements (allow a single optional trailing semicolon)
  const withoutTrailing = stripped.replace(/;\s*$/, "");
  if (withoutTrailing.includes(";")) return false;
  if (!/^(select|with)\b/i.test(withoutTrailing)) return false;
  if (/\b(insert|update|delete|drop|alter|create|attach|detach|replace|pragma|vacuum|reindex)\b/i.test(withoutTrailing)) {
    return false;
  }
  return true;
}

// Fuzzy PAX-name lookup — returns exact stored names matching a search string.
export function searchPax(db: SqlJsDatabase, name: string): string {
  const escaped = name.replace(/'/g, "''");
  return runSQL(
    db,
    `SELECT DISTINCT "PAX Name" FROM attendance WHERE LOWER("PAX Name") LIKE LOWER('%${escaped}%') ORDER BY "PAX Name"`
  );
}
