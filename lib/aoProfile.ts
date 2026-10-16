/** One AO's recorded attendance: turnout, regulars, Qs, and comparisons. Read-only; no points. */
import {
  isPublicDataName,
  normalizeDataName,
  type ExplorerData,
} from "./dataExplorer";
import { addDataDays, mondayOf } from "./milestones";
import {
  WEEKDAYS,
  attendanceBuckets,
  summarizeAttendance,
  weekdayTurnout,
  type AttendanceBucket,
  type WorkoutAttendance,
} from "./attendanceTrends";
import { aoKind, bedrockFngDates, type AoKind } from "./community";

export const aoURL = (site: string) =>
  "/data/aos?" + new URLSearchParams({ ao: site });

export type AoWeeks = 13 | 26 | 52 | "all";
export const AO_WEEKS: { value: AoWeeks; label: string }[] = [
  { value: 13, label: "Last 13 weeks" },
  { value: 26, label: "Last 26 weeks" },
  { value: 52, label: "Last 52 weeks" },
  { value: "all", label: "All time" },
];
export function parseAoWeeks(value: string | null): AoWeeks {
  return value === "all"
    ? "all"
    : [26, 52].includes(Number(value))
      ? (Number(value) as 26 | 52)
      : 13;
}
/** An AO the sheet marks inactive, or with no workout in this many days, is listed as quiet. */
export const QUIET_DAYS = 90;
/** Qs need this many Qs in the period before their average draw is ranked. */
export const DRAW_MIN_QS = 2;

/** The sheet's city for an AO, ignoring placeholders like "NA". */
const siteCity = (data: ExplorerData, site: string) => {
  const city = data.sites.find((s) => s.name === site)?.city?.trim() ?? "";
  return /^(n\/?a|none|-+)$/i.test(city) ? "" : city;
};
const dayIndex = (date: string) =>
  (new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7;

/** Weekdays with at least two workouts in the window, Monday first. */
function usualDays(workouts: WorkoutAttendance[]) {
  const counts = WEEKDAYS.map(() => 0);
  for (const w of workouts) counts[dayIndex(w.date)]++;
  return WEEKDAYS.filter((_, i) => counts[i] >= 2);
}

export interface AoSummary {
  site: string;
  kind: AoKind | null;
  city: string;
  firstWorkout: string;
  lastWorkout: string;
  quiet: boolean;
  days: string[];
  /** Average PAX per workout in the last 13 weeks. */
  average: number | null;
  workouts: number;
  /** Weekly averages for the last 13 weeks, oldest first. */
  weekly: (number | null)[];
}
export function aoSummaries(
  data: ExplorerData,
  workouts: WorkoutAttendance[],
): AoSummary[] {
  const bySite = new Map<string, WorkoutAttendance[]>();
  for (const w of workouts) {
    if (!w.site) continue;
    const list = bySite.get(w.site) ?? [];
    list.push(w);
    bySite.set(w.site, list);
  }
  const quietFrom = addDataDays(data.asOf, -(QUIET_DAYS - 1));
  return [...bySite.entries()]
    .map(([site, list]) => {
      const buckets = attendanceBuckets(list, data.asOf, 13);
      const recent = list.filter((w) => w.date >= buckets[0].start);
      return {
        site,
        kind: aoKind(site),
        city: siteCity(data, site),
        firstWorkout: list[0].date,
        lastWorkout: list.at(-1)!.date,
        quiet:
          data.sites.find((s) => s.name === site)?.active === false ||
          list.at(-1)!.date < quietFrom,
        days: usualDays(recent),
        average: summarizeAttendance(recent, buckets[0].start, data.asOf)
          .average,
        workouts: recent.length,
        weekly: buckets.map((b) => b.average),
      };
    })
    .sort(
      (a, b) =>
        Number(a.quiet) - Number(b.quiet) ||
        (a.quiet
          ? b.lastWorkout.localeCompare(a.lastWorkout)
          : (b.average ?? 0) - (a.average ?? 0)) ||
        a.site.localeCompare(b.site),
    );
}

export interface AoPerson {
  name: string;
  posts: number;
  /** Share of the AO's workouts in the period this PAX posted at. */
  share: number;
  lastPost: string;
}
export interface AoQ {
  name: string;
  qs: number;
  lastQ: string;
  /** Average PAX at the workouts this PAX Q'd in the period. */
  average: number;
}
export interface AoWorkout {
  date: string;
  pax: number;
  qs: string[];
}
export interface AoDetail {
  site: string;
  kind: AoKind | null;
  city: string;
  firstWorkout: string;
  lastWorkout: string;
  days: string[];
  from: string;
  through: string;
  weeks: number;
  posts: number;
  pax: number;
  workouts: number;
  average: number | null;
  /** Same-length window just before; null for all time or too few workouts. */
  previous: number | null;
  change: number | null;
  fngs: { name: string; date: string }[];
  topPax: AoPerson[];
  topQs: AoQ[];
  /** Qs with DRAW_MIN_QS+ Qs, ranked by average turnout. */
  draws: AoQ[];
  biggest: AoWorkout[];
  weekdays: ReturnType<typeof weekdayTurnout>;
}
export const GROWTH_MIN = 3;

/** Detail for one AO over the selected weeks, anchored to the latest attendance date. */
export function aoDetail(
  data: ExplorerData,
  workouts: WorkoutAttendance[],
  site: string,
  weeksOption: AoWeeks,
): AoDetail | null {
  const all = workouts.filter((w) => w.site === site);
  if (!all.length) return null;
  const endWeek = mondayOf(data.asOf);
  const from =
    weeksOption === "all"
      ? mondayOf(all[0].date)
      : addDataDays(endWeek, -(weeksOption - 1) * 7);
  const weeks = Math.round(
    (Date.parse(endWeek) - Date.parse(from)) / 604800000 + 1,
  );
  const inWindow = all.filter((w) => w.date >= from);
  const now = summarizeAttendance(inWindow, from, data.asOf);
  let previous: number | null = null,
    change: number | null = null;
  if (weeksOption !== "all") {
    const before = summarizeAttendance(
      all,
      addDataDays(from, -weeks * 7),
      addDataDays(from, -1),
    );
    previous = before.average;
    if (
      now.workouts >= GROWTH_MIN &&
      before.workouts >= GROWTH_MIN &&
      before.average
    )
      change = ((now.average! - before.average) / before.average) * 100;
  }
  const names = new Map(
    data.people.map((p) => [normalizeDataName(p.name), p.name]),
  );
  const display = (pax: string) =>
    names.get(normalizeDataName(pax)) ?? pax.trim();
  const turnout = new Map(inWindow.map((w) => [w.date, w.pax.length]));
  const qsByDate = new Map<string, string[]>();
  const people = new Map<string, { name: string; dates: Set<string> }>();
  const qs = new Map<string, { name: string; dates: Set<string> }>();
  for (const row of data.rows) {
    if (
      row.site !== site ||
      !row.post ||
      row.date < from ||
      row.date > data.asOf ||
      !isPublicDataName(row.pax)
    )
      continue;
    const key = normalizeDataName(row.pax);
    const person = people.get(key) ?? {
      name: display(row.pax),
      dates: new Set(),
    };
    person.dates.add(row.date);
    people.set(key, person);
    if (row.q) {
      const q = qs.get(key) ?? { name: person.name, dates: new Set() };
      q.dates.add(row.date);
      qs.set(key, q);
      const list = qsByDate.get(row.date) ?? [];
      if (!list.includes(person.name)) list.push(person.name);
      qsByDate.set(row.date, list);
    }
  }
  const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name);
  const qList: AoQ[] = [...qs.values()].map((q) => {
    const dates = [...q.dates].sort();
    return {
      name: q.name,
      qs: dates.length,
      lastQ: dates.at(-1)!,
      average:
        dates.reduce((sum, d) => sum + (turnout.get(d) ?? 0), 0) / dates.length,
    };
  });
  return {
    site,
    kind: aoKind(site),
    city: siteCity(data, site),
    firstWorkout: all[0].date,
    lastWorkout: all.at(-1)!.date,
    days: usualDays(
      inWindow.filter((w) => w.date >= addDataDays(endWeek, -12 * 7)),
    ),
    from,
    through: data.asOf,
    weeks,
    posts: now.posts,
    pax: now.pax,
    workouts: now.workouts,
    average: now.average,
    previous,
    change,
    fngs: [...bedrockFngDates(data).entries()]
      .filter(([, f]) => f.site === site && f.date >= from)
      .map(([key, f]) => ({ name: names.get(key) ?? f.name, date: f.date }))
      .sort((a, b) => b.date.localeCompare(a.date) || byName(a, b)),
    topPax: [...people.values()]
      .map((p) => {
        const dates = [...p.dates].sort();
        return {
          name: p.name,
          posts: dates.length,
          share: now.workouts ? (dates.length / now.workouts) * 100 : 0,
          lastPost: dates.at(-1)!,
        };
      })
      .sort((a, b) => b.posts - a.posts || byName(a, b)),
    topQs: [...qList].sort(
      (a, b) => b.qs - a.qs || b.lastQ.localeCompare(a.lastQ) || byName(a, b),
    ),
    draws: qList
      .filter((q) => q.qs >= DRAW_MIN_QS)
      .sort((a, b) => b.average - a.average || b.qs - a.qs || byName(a, b)),
    biggest: inWindow
      .map((w) => ({
        date: w.date,
        pax: w.pax.length,
        qs: qsByDate.get(w.date) ?? [],
      }))
      .sort((a, b) => b.pax - a.pax || b.date.localeCompare(a.date)),
    weekdays: weekdayTurnout(inWindow, from, data.asOf),
  };
}

export interface AoYearStats {
  posts: number;
  pax: number;
  workouts: number;
  average: number | null;
  fngs: number;
}
export interface AoYearMonth {
  /** 1–12. */
  month: number;
  current: AttendanceBucket | null;
  previous: AttendanceBucket | null;
}
export interface AoYearOverYear {
  site: string;
  year: number;
  /** The year still in progress; totals stop at the same date both years. */
  partial: boolean;
  from: string;
  through: string;
  previousFrom: string;
  previousThrough: string;
  /** First recorded workout here; later than previousFrom when last year is incomplete. */
  firstWorkout: string;
  current: AoYearStats;
  previous: AoYearStats;
  months: AoYearMonth[];
}
/** Years with a recorded workout at this AO, newest first. */
export function aoYears(workouts: WorkoutAttendance[], site: string) {
  const years = new Set(
    workouts
      .filter((w) => w.site === site)
      .map((w) => Number(w.date.slice(0, 4))),
  );
  return [...years].sort((a, b) => b - a);
}
/** Percent change, withheld unless both sides have GROWTH_MIN+ workouts. */
export function yearChange(
  current: number | null,
  previous: number | null,
  workouts: { current: number; previous: number },
) {
  if (
    current == null ||
    !previous ||
    workouts.current < GROWTH_MIN ||
    workouts.previous < GROWTH_MIN
  )
    return null;
  return ((current - previous) / previous) * 100;
}
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (year: number, month: number) =>
  `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;
/** The same month and day a year earlier; Feb 29 becomes Feb 28. */
const sameDayLastYear = (date: string) => {
  const year = Number(date.slice(0, 4)) - 1;
  const end = lastDay(year, Number(date.slice(5, 7)));
  const candidate = `${year}${date.slice(4)}`;
  return candidate > end ? end : candidate;
};

/**
 * One AO's year compared with the year before. A year still in progress
 * (the latest attendance year) is compared through the same date last year.
 */
export function aoYearOverYear(
  data: ExplorerData,
  workouts: WorkoutAttendance[],
  site: string,
  year: number,
): AoYearOverYear | null {
  // An empty site compares the whole region.
  const here = site ? workouts.filter((w) => w.site === site) : workouts;
  if (!here.length) return null;
  const partial = year === Number(data.asOf.slice(0, 4));
  const from = `${year}-01-01`;
  const through = partial ? data.asOf : `${year}-12-31`;
  const previousFrom = `${year - 1}-01-01`;
  const previousThrough = sameDayLastYear(through);
  const fngs = [...bedrockFngDates(data).values()].filter(
    (f) => !site || f.site === site,
  );
  const stats = (start: string, end: string): AoYearStats => ({
    ...summarizeAttendance(here, start, end),
    fngs: fngs.filter((f) => f.date >= start && f.date <= end).length,
  });
  const bucket = (y: number, month: number, cap: string) => {
    const start = `${y}-${pad(month)}-01`;
    if (start > cap) return null;
    const end = lastDay(y, month) > cap ? cap : lastDay(y, month);
    return { start, end, ...summarizeAttendance(here, start, end) };
  };
  return {
    site,
    year,
    partial,
    from,
    through,
    previousFrom,
    previousThrough,
    firstWorkout: here[0].date,
    current: stats(from, through),
    previous: stats(previousFrom, previousThrough),
    // The chart shows all of last year so the months still ahead are visible.
    months: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      current: bucket(year, i + 1, through),
      previous: bucket(year - 1, i + 1, `${year - 1}-12-31`),
    })),
  };
}
