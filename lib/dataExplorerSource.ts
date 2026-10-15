import { fetchCSV } from "./attendance-db";
import { fetchDataRoster } from "./sheet";
import {
  parseDataAttendance,
  parseDataSites,
  type ExplorerData,
} from "./dataExplorer";

const SITES_URL =
  "https://docs.google.com/spreadsheets/d/11fIBnwzcVU2F-OZu7zECq8xROJC6hMY4MryHR4KbUj0/gviz/tq?tqx=out:csv&sheet=Sites";
let cached: { data: ExplorerData; at: number } | null = null;
let pending: Promise<ExplorerData> | null = null;
export async function loadExplorerData(): Promise<ExplorerData> {
  if (cached && Date.now() - cached.at < 60_000) return cached.data;
  if (pending) return pending;
  pending = (async () => {
    const [csv, people, sitesResponse] = await Promise.all([
      fetchCSV(),
      fetchDataRoster(),
      fetch(SITES_URL, { signal: AbortSignal.timeout(15_000) }),
    ]);
    if (!sitesResponse.ok) throw new Error("Could not read Sites");
    const rows = parseDataAttendance(csv),
      sites = parseDataSites(await sitesResponse.text());
    if (!rows.length) throw new Error("No attendance records available");
    const asOf = rows.reduce(
      (latest, row) => (row.date > latest ? row.date : latest),
      "",
    );
    const data = {
      rows,
      people,
      sites,
      asOf,
      loadedAt: new Date().toISOString(),
    };
    cached = { data, at: Date.now() };
    return data;
  })();
  try {
    return await pending;
  } finally {
    pending = null;
  }
}
