import { fetchCSV } from "./attendance-db";

const CACHE_TTL_MS = 10 * 60 * 1000;

const csvCache = new Map<string, { data: string; fetchedAt: number }>();

async function fetchCachedCSV(url: string): Promise<string> {
  const cached = csvCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status}`);
  const data = await res.text();
  csvCache.set(url, { data, fetchedAt: Date.now() });
  return data;
}

export function parseCSVLine(line: string): string[] {
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

/** Parses a CSV into objects keyed by header (first occurrence wins on duplicate headers). */
export function parseCSV(csv: string): Record<string, string>[] {
  const lines = csv.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h && !(h in row)) row[h] = cells[i] ?? "";
    });
    return row;
  });
}

export interface AttendanceRow {
  pax: string;
  site: string;
  fng: boolean;
  post: boolean;
  date: string; // YYYY-MM-DD
}

function toISO(raw: string): string | null {
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, mo, dy, yr] = m;
  const year = parseInt(yr, 10);
  if (year < 2020 || year > 2030) return null; // skips the "1/1/2099 UPDATE" row
  return `${yr}-${mo.padStart(2, "0")}-${dy.padStart(2, "0")}`;
}

export async function fetchAttendance(): Promise<AttendanceRow[]> {
  const rows: AttendanceRow[] = [];
  for (const r of parseCSV(await fetchCSV())) {
    const date = toISO(r["Date"] ?? "");
    const pax = (r["PAX Name"] ?? "").trim();
    if (!date || !pax) continue;
    rows.push({
      pax,
      site: (r["Site Name"] ?? "").trim(),
      fng: r["FNG"] === "1",
      post: r["Post"] === "1",
      date,
    });
  }
  return rows;
}

/** Optional EH log: a published CSV (e.g. an "EH Log" sheet tab) with "PAX Name" and "EH'd By" columns. */
export async function fetchEhLogCSV(): Promise<Record<string, string>[]> {
  const url = process.env.EH_LOG_CSV_URL;
  if (!url) return [];
  return parseCSV(await fetchCachedCSV(url));
}
