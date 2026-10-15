import { fetchCSV } from "./attendance-db";
import type { EhLogEntry, ResurrectionEntry } from "./ehChallenge";

const CACHE_TTL_MS = 60 * 1000; // EH attributions are edited live in the sheet.
const ROSTER_CSV_URL = "https://docs.google.com/spreadsheets/d/11fIBnwzcVU2F-OZu7zECq8xROJC6hMY4MryHR4KbUj0/export?format=csv&gid=437240319";

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
  const [attendanceCSV, roster] = await Promise.all([fetchCSV(), fetchRoster()]);
  const bedrockPax = new Set(roster.filter((r) => r.Region.trim().toLowerCase() === "bedrock").map((r) => normalizeName(r["F3 Name"])));
  const rows: AttendanceRow[] = [];
  for (const r of parseCSV(attendanceCSV)) {
    const date = toISO(r["Date"] ?? "");
    const pax = (r["PAX Name"] ?? "").trim();
    if (!date || !pax) continue;
    rows.push({
      pax,
      site: (r["Site Name"] ?? "").trim(),
      fng: r["FNG"] === "1" && bedrockPax.has(normalizeName(pax)),
      post: r["Post"] === "1",
      date,
    });
  }
  return rows;
}

const normalizeName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

async function fetchRoster(): Promise<Record<string, string>[]> {
  const csv = await fetchCachedCSV(ROSTER_CSV_URL);
  const headers = parseCSVLine(csv.split("\n", 1)[0]);
  if (!["F3 Name", "EH'er", "Region"].every((header) => headers.includes(header))) {
    throw new Error("Roster is missing the F3 Name, EH'er, or Region column");
  }
  return parseCSV(csv);
}

export interface EhRosterPerson { name: string; ehBy: string | null }

/** Public EH fields only; never return the intake form's personal information. */
export async function fetchEhRoster(): Promise<EhRosterPerson[]> {
  const people = new Map<string, EhRosterPerson>();
  for (const row of await fetchRoster()) {
    const name = row["F3 Name"].trim();
    if (name) people.set(normalizeName(name), { name, ehBy: row["EH'er"].trim() || null });
  }
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Existing Roster entries are authoritative; a recorded EH'er needs no separate confirmation. */
export async function fetchEhAttributions(): Promise<EhLogEntry[]> {
  return (await fetchRoster())
    .map((row) => ({ pax: row["F3 Name"].trim(), ehBy: row["EH'er"].trim() }))
    .filter((entry) => entry.pax && entry.ehBy);
}

/** Bring-back credit is recorded separately from the original EH'er, on the existing Roster. */
export async function fetchResurrectionAttributions(): Promise<ResurrectionEntry[]> {
  return (await fetchRoster()).flatMap((r) => {
    const pax = r["F3 Name"].trim();
    const broughtBy = (r["Brought back by"] ?? "").trim();
    const date = toISO(r["Return date"] ?? "");
    return pax && broughtBy && date && r.Region.trim().toLowerCase() === "bedrock" ? [{ pax, broughtBy, date }] : [];
  });
}

/** Allowlisted explorer fields only; do not expose the full Roster to the browser. */
export async function fetchDataRoster(): Promise<import('./dataExplorer').DataPerson[]> {
  const { isPublicDataName } = await import('./dataExplorer');
  return (await fetchRoster()).flatMap(row => {
    const name = row['F3 Name'].trim();
    const ehBy = row["EH'er"].trim();
    return isPublicDataName(name) ? [{ name, region: row.Region.trim(), ehBy: isPublicDataName(ehBy) ? ehBy : null }] : [];
  });
}
