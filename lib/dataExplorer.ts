/** Public attendance explorer. No AI, storage writes, or challenge scoring. */
export interface DataRow {
  pax: string;
  site: string;
  city: string;
  date: string;
  post: boolean;
  q: boolean;
  fng: boolean;
  qs: boolean;
  qsq: boolean;
}
export interface DataPerson {
  name: string;
  region: string;
  ehBy: string | null;
}
export interface DataSite {
  name: string;
  city: string;
  active: boolean;
}
export interface ExplorerData {
  rows: DataRow[];
  people: DataPerson[];
  sites: DataSite[];
  asOf: string;
  loadedAt: string;
}
export type DataView = "pax" | "qsource" | "kotter" | "qkotter" | "aos" | "raw";
export type DataPeriod = "year" | "month" | "all" | "custom";
export interface DataFilters {
  view: DataView;
  period: DataPeriod;
  year: string;
  month: string;
  from: string;
  to: string;
  search: string;
  site: string;
  region: string;
  flags: string[];
}
export interface PaxStats {
  name: string;
  posts: number;
  qs: number;
  first: string;
  last: string;
  lastQ: string;
  attendance: number;
  streak: number;
  qRatio: number;
  aos: number;
  aoPercent: number;
  days: number;
  /** Posts in the 12 weeks ending at the latest attendance date (PAX view only). */
  recent?: number;
}
export const normalizeDataName = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, " ");
export const isPublicDataName = (name: string) =>
  !!name.trim() && !/\(archived\)|\(<\s*18\)/i.test(name);

/** Handles quoted commas, escaped quotes and embedded line breaks. */
export function readDataCSV(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  const source = csv.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\n" || char === "\r")) {
      row.push(cell.trim());
      cell = "";
      if (char !== ",") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (char === "\r" && source[i + 1] === "\n") i++;
      }
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export function dataISO(value: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!m) return null;
  const [, mo, day, year] = m;
  const iso = `${year}-${mo.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return +year >= 2020 &&
    +year <= 2030 &&
    !isNaN(+date) &&
    date.toISOString().slice(0, 10) === iso
    ? iso
    : null;
}
export function parseDataAttendance(csv: string): DataRow[] {
  const [headers = [], ...values] = readDataCSV(csv);
  for (const field of [
    "PAX Name",
    "Site Name",
    "Date",
    "Post",
    "Q",
    "FNG",
    "QS",
    "QS-Q",
  ]) {
    if (!headers.includes(field))
      throw new Error(`Attendance is missing ${field}`);
  }
  const get = (row: string[], field: string) =>
    row[headers.indexOf(field)] ?? "";
  return values.flatMap((row) => {
    const pax = get(row, "PAX Name"),
      date = dataISO(get(row, "Date"));
    if (
      !date ||
      !isPublicDataName(pax) ||
      get(row, "Site Name").toUpperCase() === "UPDATE"
    )
      return [];
    return [
      {
        pax,
        date,
        site: get(row, "Site Name"),
        city: get(row, "City"),
        post: get(row, "Post") === "1",
        q: get(row, "Q") === "1",
        fng: get(row, "FNG") === "1",
        qs: get(row, "QS") === "1",
        qsq: get(row, "QS-Q") === "1",
      },
    ];
  });
}
export function parseDataSites(csv: string): DataSite[] {
  const [headers = [], ...values] = readDataCSV(csv);
  const name = headers.indexOf("Name"),
    city = headers.indexOf("City");
  const status = headers.lastIndexOf("Active");
  if (name < 0 || status < 0)
    throw new Error("Sites is missing Name or Active");
  return values
    .filter((row) => row[name])
    .map((row) => ({
      name: row[name],
      city: row[city] ?? "",
      active: /^(y|yes|active|true)$/i.test(row[status] ?? ""),
    }));
}
export function defaultDataFilters(asOf: string): DataFilters {
  return {
    view: "pax",
    period: "year",
    year: asOf.slice(0, 4),
    month: asOf.slice(5, 7),
    from: "",
    to: "",
    search: "",
    site: "",
    region: "",
    flags: [],
  };
}
const views: DataView[] = ["pax", "qsource", "kotter", "qkotter", "aos", "raw"];
const periods: DataPeriod[] = ["year", "month", "all", "custom"];
export function readDataFilters(
  params: URLSearchParams,
  asOf: string,
): DataFilters {
  const defaults = defaultDataFilters(asOf);
  return {
    ...defaults,
    view: views.includes(params.get("view") as DataView)
      ? (params.get("view") as DataView)
      : defaults.view,
    period: periods.includes(params.get("period") as DataPeriod)
      ? (params.get("period") as DataPeriod)
      : defaults.period,
    year: /^20\d{2}$/.test(params.get("year") ?? "")
      ? params.get("year")!
      : defaults.year,
    month: /^(0[1-9]|1[0-2])$/.test(params.get("month") ?? "")
      ? params.get("month")!
      : defaults.month,
    from: validDate(params.get("from")),
    to: validDate(params.get("to")),
    search: (params.get("search") ?? "").slice(0, 200),
    site: (params.get("site") ?? "").slice(0, 200),
    region: ["bedrock", "other"].includes(params.get("region") ?? "")
      ? params.get("region")!
      : "",
    flags: (params.get("flags") ?? "")
      .split(",")
      .filter((f) => ["post", "q", "fng", "qs", "qsq"].includes(f)),
  };
}
function validDate(value: string | null) {
  return value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
    ? value
    : "";
}
export function dataFilterParams(filters: DataFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    const text = Array.isArray(value) ? value.join(",") : value;
    if (text) params.set(key, text);
  }
  return params;
}
export function daysBetween(first: string, last: string) {
  return Math.floor((Date.parse(last) - Date.parse(first)) / 86400000);
}
function inPeriod(row: DataRow, f: DataFilters) {
  if (f.period === "year") return row.date.startsWith(f.year + "-");
  if (f.period === "month") return row.date.startsWith(`${f.year}-${f.month}`);
  if (f.period === "custom")
    return (!f.from || row.date >= f.from) && (!f.to || row.date <= f.to);
  return true;
}
export function filterDataRows(
  data: ExplorerData,
  f: DataFilters,
  includeSearch = true,
): DataRow[] {
  const regions = new Map(
    data.people.map((p) => [
      normalizeDataName(p.name),
      p.region.toLowerCase().trim(),
    ]),
  );
  const search = normalizeDataName(f.search);
  return data.rows.filter(
    (row) =>
      inPeriod(row, f) &&
      (!f.site || row.site === f.site) &&
      (!includeSearch ||
        !search ||
        normalizeDataName(row.pax).includes(search)) &&
      (!f.region ||
        (f.region === "bedrock"
          ? regions.get(normalizeDataName(row.pax)) === "bedrock"
          : !!regions.get(normalizeDataName(row.pax)) &&
            regions.get(normalizeDataName(row.pax)) !== "bedrock")) &&
      f.flags.every((flag) => row[flag as "post" | "q" | "fng" | "qs" | "qsq"]),
  );
}
export function summarizePax(
  data: ExplorerData,
  filters: DataFilters,
): PaxStats[] {
  const qsource = filters.view === "qsource";
  // Search/flags/region narrow people, never the workout-day denominator.
  const opportunities = data.rows.filter(
    (row) =>
      inPeriod(row, filters) &&
      (!filters.site || row.site === filters.site) &&
      (qsource ? row.qs : row.post),
  );
  const dates = [...new Set(opportunities.map((row) => row.date))].sort();
  const dayIndexes = new Map(dates.map((date, index) => [date, index]));
  // Flags select attendance to display, not when a PAX first had an opportunity.
  const firstOpportunity = new Map<string, string>();
  for (const row of opportunities) {
    const key = normalizeDataName(row.pax);
    const first = firstOpportunity.get(key);
    if (!first || row.date < first) firstOpportunity.set(key, row.date);
  }

  const groups = new Map<string, DataRow[]>();
  for (const row of filterDataRows(data, filters).filter((row) =>
    qsource ? row.qs : row.post,
  )) {
    const key = normalizeDataName(row.pax);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  const history = new Map<string, { last: string; lastQ: string }>();
  for (const row of data.rows) {
    if (!row.post) continue;
    const key = normalizeDataName(row.pax),
      item = history.get(key) ?? { last: "", lastQ: "" };
    if (row.date > item.last) item.last = row.date;
    if (row.q && row.date > item.lastQ) item.lastQ = row.date;
    history.set(key, item);
  }
  const bedrock = new Set(
    data.people
      .filter((p) => p.region.trim().toLowerCase() === "bedrock")
      .map((p) => normalizeDataName(p.name)),
  );
  const activeSites = new Set(
    data.sites
      .filter((s) => s.active && (!filters.site || s.name === filters.site))
      .map((s) => s.name),
  );
  const names = new Map(
    data.people.map((p) => [normalizeDataName(p.name), p.name]),
  );
  return [...groups.entries()].flatMap(([key, rows]) => {
    rows.sort((a, b) => a.date.localeCompare(b.date));
    const all = history.get(key),
      days = all
        ? daysBetween(
            filters.view === "qkotter" ? all.lastQ : all.last,
            data.asOf,
          )
        : NaN;
    if (
      filters.view === "kotter" &&
      (!bedrock.has(key) || key.includes("2.0") || !(days > 14 && days < 365))
    )
      return [];
    if (
      filters.view === "qkotter" &&
      (!bedrock.has(key) || !(days > 30 && days < 365))
    )
      return [];
    const attended = [...new Set(rows.map((r) => r.date))];
    let streak = 0,
      best = 0,
      previous = -2;
    for (const date of attended) {
      const i = dayIndexes.get(date)!;
      streak = i === previous + 1 ? streak + 1 : 1;
      best = Math.max(best, streak);
      previous = i;
    }
    const first = rows[0].date;
    const possible =
      filters.period === "all"
        ? dates.filter((d) => d >= (firstOpportunity.get(key) ?? first)).length
        : dates.length;
    const qs = rows.filter((r) => (qsource ? r.qsq : r.q)).length;
    const visited = new Set(
      rows.map((r) => r.site).filter((site) => activeSites.has(site)),
    );
    return [
      {
        name: names.get(key) ?? rows[0].pax,
        posts: rows.length,
        qs,
        first,
        last: all?.last ?? "",
        lastQ: all?.lastQ ?? "",
        attendance: possible ? (attended.length / possible) * 100 : 0,
        streak: best,
        qRatio: (qs / rows.length) * 100,
        aos: visited.size,
        aoPercent: activeSites.size
          ? (visited.size / activeSites.size) * 100
          : 0,
        days,
      },
    ];
  });
}
export function dataCSV(
  headers: string[],
  rows: (string | number | boolean | null)[][],
): string {
  const cell = (value: string | number | boolean | null) => {
    let text =
      value == null
        ? ""
        : typeof value === "boolean"
          ? value
            ? "1"
            : "0"
          : String(value);
    // Protect downloads from spreadsheet formulas in user-controlled names/cells.
    if (/^[\s]*[=+@\-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  return (
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n")
  );
}
export interface Companion {
  name: string;
  count: number;
}
export function companions(
  data: ExplorerData,
  name: string,
  mode: "with" | "by" | "led",
  start = 0,
  limit?: number,
): Companion[] {
  const key = normalizeDataName(name);
  const mine = data.rows
    .filter((r) => r.post && normalizeDataName(r.pax) === key)
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.site.localeCompare(b.site),
    );
  const selection = mine
    .slice(start, limit == null ? undefined : start + limit)
    .filter((r) => mode !== "led" || r.q);
  const events = new Set(selection.map((r) => r.date + "\0" + r.site));
  const counts = new Map<string, Companion>(),
    seen = new Set<string>();
  for (const row of data.rows) {
    const other = normalizeDataName(row.pax),
      event = row.date + "\0" + row.site;
    if (
      !row.post ||
      other === key ||
      !events.has(event) ||
      (mode === "by" && !row.q) ||
      seen.has(event + "\0" + other)
    )
      continue;
    seen.add(event + "\0" + other);
    const item = counts.get(other) ?? { name: row.pax, count: 0 };
    item.count++;
    counts.set(other, item);
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );
}
