import {
  isPublicDataName,
  normalizeDataName,
  type ExplorerData,
} from "./dataExplorer";
import { addDataDays, mondayOf } from "./milestones";
export type TrendMetric = "average" | "posts" | "pax" | "workouts";
export interface WorkoutAttendance {
  date: string;
  site: string;
  posts: number;
  pax: string[];
}
export interface AttendanceBucket {
  start: string;
  end: string;
  posts: number;
  pax: number;
  workouts: number;
  average: number | null;
}

/** A workout is one recorded date + AO; flags without Post never create workouts. */
export function attendanceWorkouts(data: ExplorerData): WorkoutAttendance[] {
  const events = new Map<
    string,
    { date: string; site: string; posts: number; people: Map<string, string> }
  >();
  for (const row of data.rows) {
    if (!row.post || !isPublicDataName(row.pax) || row.date > data.asOf)
      continue;
    const key = row.date + "\0" + row.site;
    const event = events.get(key) ?? {
      date: row.date,
      site: row.site,
      posts: 0,
      people: new Map(),
    };
    event.posts++;
    event.people.set(normalizeDataName(row.pax), row.pax);
    events.set(key, event);
  }
  return [...events.values()]
    .map((e) => ({
      date: e.date,
      site: e.site,
      posts: e.posts,
      pax: [...e.people.values()].sort(),
    }))
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.site.localeCompare(b.site),
    );
}
export function attendanceBuckets(
  workouts: WorkoutAttendance[],
  asOf: string,
  weeks: number,
  site = "",
): AttendanceBucket[] {
  const endWeek = mondayOf(asOf),
    first = addDataDays(endWeek, -(weeks - 1) * 7);
  const buckets: AttendanceBucket[] = [];
  for (let start = first; start <= endWeek; start = addDataDays(start, 7)) {
    const end = addDataDays(start, 6) > asOf ? asOf : addDataDays(start, 6);
    const matching = workouts.filter(
      (w) => w.date >= start && w.date <= end && (!site || w.site === site),
    );
    const totalPax = matching.reduce((sum, w) => sum + w.pax.length, 0);
    buckets.push({
      start,
      end,
      posts: matching.reduce((sum, w) => sum + w.posts, 0),
      pax: new Set(matching.flatMap((w) => w.pax.map(normalizeDataName))).size,
      workouts: matching.length,
      average: matching.length ? totalPax / matching.length : null,
    });
  }
  return buckets;
}
export function summarizeAttendance(
  workouts: WorkoutAttendance[],
  from: string,
  through: string,
  sites: string[] = [],
) {
  const matching = workouts.filter(
    (w) =>
      w.date >= from &&
      w.date <= through &&
      (!sites.length || sites.includes(w.site)),
  );
  return {
    posts: matching.reduce((sum, w) => sum + w.posts, 0),
    pax: new Set(matching.flatMap((w) => w.pax.map(normalizeDataName))).size,
    workouts: matching.length,
    average: matching.length
      ? matching.reduce((sum, w) => sum + w.pax.length, 0) / matching.length
      : null,
  };
}
export function attendanceValue(
  bucket: AttendanceBucket,
  metric: TrendMetric,
): number | null {
  // An empty source week is unknown, not proof that an AO had zero turnout.
  return bucket.workouts ? bucket[metric] : null;
}
export function rawAttendanceURL(site: string, from: string, through: string) {
  return (
    "/data?" +
    new URLSearchParams({
      view: "raw",
      period: "custom",
      from,
      to: through,
      site,
      flags: "post",
    })
  );
}
