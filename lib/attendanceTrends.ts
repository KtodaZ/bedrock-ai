import {
  isPublicDataName,
  normalizeDataName,
  type ExplorerData,
} from "./dataExplorer";
import { addDataDays, mondayOf } from "./milestones";
import { bedrockFngDates } from "./community";
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

/** Minimum workouts in each window before a growth percentage is shown. */
export const GROWTH_MIN_WORKOUTS = 3;
export interface AoGrowth {
  site: string;
  current: number | null;
  previous: number | null;
  /** Percent change in average turnout; null when either window is too thin. */
  change: number | null;
  workouts: number;
  posts: number;
  buckets: AttendanceBucket[];
}
/** Average turnout in the selected weeks vs the same number of weeks just before. */
export function aoGrowth(
  workouts: WorkoutAttendance[],
  asOf: string,
  weeks: number,
  sites: string[],
): AoGrowth[] {
  return sites
    .map((site) => {
      const buckets = attendanceBuckets(workouts, asOf, weeks, site);
      const from = buckets[0].start,
        priorFrom = addDataDays(from, -weeks * 7),
        priorTo = addDataDays(from, -1);
      const now = summarizeAttendance(workouts, from, asOf, [site]);
      const before = summarizeAttendance(workouts, priorFrom, priorTo, [site]);
      const comparable =
        now.workouts >= GROWTH_MIN_WORKOUTS &&
        before.workouts >= GROWTH_MIN_WORKOUTS &&
        !!before.average;
      return {
        site,
        current: now.average,
        previous: before.average,
        change: comparable
          ? ((now.average! - before.average!) / before.average!) * 100
          : null,
        workouts: now.workouts,
        posts: now.posts,
        buckets,
      };
    })
    .filter((g) => g.workouts > 0)
    .sort(
      (a, b) =>
        (b.change ?? -Infinity) - (a.change ?? -Infinity) ||
        (b.current ?? 0) - (a.current ?? 0) ||
        a.site.localeCompare(b.site),
    );
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function weekdayTurnout(
  workouts: WorkoutAttendance[],
  from: string,
  through: string,
  sites: string[] = [],
) {
  const days = WEEKDAYS.map((day) => ({ day, workouts: 0, pax: 0 }));
  for (const w of workouts) {
    if (w.date < from || w.date > through) continue;
    if (sites.length && !sites.includes(w.site)) continue;
    const day = days[(new Date(w.date + "T00:00:00Z").getUTCDay() + 6) % 7];
    day.workouts++;
    day.pax += w.pax.length;
  }
  return days.map((d) => ({
    day: d.day,
    workouts: d.workouts,
    average: d.workouts ? d.pax / d.workouts : null,
  }));
}

export interface PulseWindow {
  from: string;
  to: string;
  posts: number;
  pax: number;
  fngs: number;
  topAO: { site: string; average: number } | null;
}
/** Last 7 days ending at the latest attendance date vs the 7 days before. */
export function regionPulse(data: ExplorerData) {
  const workouts = attendanceWorkouts(data);
  const fngDates = [...bedrockFngDates(data).values()].map((f) => f.date);
  const window = (from: string, to: string): PulseWindow => {
    const summary = summarizeAttendance(workouts, from, to);
    const bySite = new Map<string, { workouts: number; pax: number }>();
    for (const w of workouts) {
      if (w.date < from || w.date > to || !w.site) continue;
      const s = bySite.get(w.site) ?? { workouts: 0, pax: 0 };
      s.workouts++;
      s.pax += w.pax.length;
      bySite.set(w.site, s);
    }
    const top = [...bySite.entries()]
      .map(([site, s]) => ({ site, average: s.pax / s.workouts }))
      .sort((a, b) => b.average - a.average || a.site.localeCompare(b.site))[0];
    return {
      from,
      to,
      posts: summary.posts,
      pax: summary.pax,
      fngs: fngDates.filter((d) => d >= from && d <= to).length,
      topAO: top ?? null,
    };
  };
  return {
    current: window(addDataDays(data.asOf, -6), data.asOf),
    previous: window(addDataDays(data.asOf, -13), addDataDays(data.asOf, -7)),
  };
}

/** Weekly post counts per PAX for the trailing weeks ending asOf (oldest first). */
export function weeklyPostCounts(
  data: ExplorerData,
  weeks: number,
  site = "",
): Map<string, number[]> {
  const start = addDataDays(data.asOf, -(weeks * 7 - 1));
  const counts = new Map<string, number[]>();
  for (const row of data.rows) {
    if (!row.post || row.date < start || row.date > data.asOf) continue;
    if (site && row.site !== site) continue;
    const key = normalizeDataName(row.pax);
    const list = counts.get(key) ?? Array(weeks).fill(0);
    list[Math.floor((Date.parse(row.date) - Date.parse(start)) / 604800000)]++;
    counts.set(key, list);
  }
  return counts;
}
