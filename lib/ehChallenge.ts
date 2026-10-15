import type { AttendanceRow } from "./sheet";

// ── Challenge config ─────────────────────────────────────────────────────────

export type Period = "month" | "year" | "all" | "challenge";

export const PERIOD_LABELS: Record<Period, string> = {
  challenge: "2026 Challenge", year: "This year", month: "This month", all: "All time",
};
export const PERIODS: Period[] = ["year", "challenge", "month", "all"];
export function parsePeriod(value: string | null | undefined): Period {
  return PERIODS.includes(value as Period) ? value as Period : "year";
}
// Bedrock's calendar day is Pacific time, regardless of the visitor's timezone.
export function attendanceIsBehindToday(sourceAsOf: string, now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  return sourceAsOf < today;
}

export const CHALLENGE_START = "2026-10-15";
export const CHALLENGE_END = "2026-12-31";

export const POINTS = {
  firstPost: 5,
  secondPost: 3,
  fifthPost: 5,
  afterFifth: 1, // each post after the 5th
  referral: 5, // original EH'er's bonus when their FNG EHs another FNG
};

export const CHALLENGE_FNG_GOAL = 50;
export const ANNUAL_FNG_GOAL = 100;

type ThemeKind =
  | "open" // standard scoring without a themed bonus
  | "fng" // any FNG whose first post falls in the window
  | "familyTree" // a PAX EHs his first-ever FNG in the window
  | "resurrection"; // a logged PAX returns after 180+ days away

export interface Theme {
  name: string;
  start: string; // YYYY-MM-DD, inclusive
  end: string;
  description: string;
  kind: ThemeKind;
  bonus: number;
}

export const THEMES: Theme[] = [
  {
    name: "Free for All",
    start: "2026-11-02",
    end: "2026-11-08",
    description: "Bring any new guy to a Bedrock workout.",
    kind: "open",
    bonus: 0,
  },
  {
    name: "Family Tree",
    start: "2026-11-09",
    end: "2026-11-15",
    description: "Get an existing PAX to EH his first FNG",
    kind: "familyTree",
    bonus: 5,
  },
  {
    name: "Resurrection Week",
    start: "2026-11-16",
    end: "2026-11-22",
    description: "Bring a former PAX back after at least 180 days away",
    kind: "resurrection",
    bonus: 5,
  },
  {
    name: "The Christmas Gift",
    start: "2026-12-18",
    end: "2026-12-31",
    description: "Bring an FNG in the final 2 weeks of December",
    kind: "fng",
    bonus: 5,
  },
];

export interface EhLogEntry {
  pax: string; // the FNG (or returning PAX)
  ehBy: string;
}

export interface ResurrectionEntry {
  pax: string;
  broughtBy: string;
  date: string;
}

const RESURRECTION_GAP_DAYS = 180;

// ── Scoring ──────────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  name: string;
  total: number;
  week: number;
  fngs: number;
  breakdown: { workouts: number; referrals: number; themes: number };
}

export type LeaderboardSort = "points" | "fngs";

export function sortLeaderboard(entries: LeaderboardEntry[], sort: LeaderboardSort = "points"): LeaderboardEntry[] {
  return [...entries].sort((a, b) =>
    (sort === "fngs" ? b.fngs - a.fngs : 0) || b.total - a.total || b.week - a.week || a.name.localeCompare(b.name)
  );
}

export interface FngEntry {
  name: string;
  ehBy: string | null;
  firstPost: string;
  posts: number;
  points: number;
  lastPost: string | null;
}

export interface ThemeStatus extends Theme {
  status: "active" | "upcoming" | "past";
}

export interface ChallengeResult {
  period: Period;
  start: string;
  asOf: string;
  sourceAsOf: string;
  end: string;
  scoringEnabled: boolean;
  weekStart: string;
  weekEnd: string;
  goal: number | null;
  regionFngs: number;
  leaderboard: LeaderboardEntry[];
  fngs: FngEntry[];
  unassignedPoints: number;
  themes: ThemeStatus[];
  bandText: string;
}

interface PointEvent {
  who: string;
  date: string;
  points: number;
  kind: keyof LeaderboardEntry["breakdown"];
}

const norm = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function formatDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function postPoints(n: number): number {
  if (n === 1) return POINTS.firstPost;
  if (n === 2) return POINTS.secondPost;
  if (n === 5) return POINTS.fifthPost;
  if (n > 5) return POINTS.afterFifth;
  return 0;
}

export function pointsForPosts(posts: number): number {
  let total = 0;
  for (let post = 1; post <= posts; post++) total += postPoints(post);
  return total;
}

export function computeChallenge(
  rows: AttendanceRow[],
  ehLog: EhLogEntry[],
  period: Period,
  resurrections: ResurrectionEntry[] = []
): ChallengeResult {
  const allDates = rows.map((r) => r.date).sort();
  if (allDates.length === 0) throw new Error("No attendance rows found");
  const sourceAsOf = allDates[allDates.length - 1];
  const scoringEnabled = period === "challenge";
  const asOf = scoringEnabled && sourceAsOf > CHALLENGE_END ? CHALLENGE_END : sourceAsOf;
  const start = scoringEnabled ? CHALLENGE_START :
    period === "month" ? `${asOf.slice(0, 7)}-01` : period === "year" ? `${asOf.slice(0, 4)}-01-01` : allDates[0];
  const end = scoringEnabled ? CHALLENGE_END : asOf;

  // Monday–Sunday week containing the latest data date
  const dow = new Date(`${asOf}T00:00:00Z`).getUTCDay();
  const weekStart = addDays(asOf, -((dow + 6) % 7));
  const weekEnd = addDays(weekStart, 6);

  const displayName = new Map<string, string>();
  const postDates = new Map<string, string[]>();
  const fngDate = new Map<string, string>();
  for (const r of rows) {
    const key = norm(r.pax);
    if (!displayName.has(key)) displayName.set(key, r.pax);
    if (r.post) {
      const list = postDates.get(key) ?? [];
      list.push(r.date);
      postDates.set(key, list);
    }
    if (r.fng && (!fngDate.has(key) || r.date < fngDate.get(key)!)) fngDate.set(key, r.date);
  }
  for (const [key, list] of postDates) postDates.set(key, [...new Set(list)].sort());

  const ehByKey = new Map<string, string>();
  for (const e of ehLog) {
    if (e.pax.trim() && e.ehBy.trim()) ehByKey.set(norm(e.pax), norm(e.ehBy));
  }
  const nameOf = (key: string) =>
    displayName.get(key) ?? ehLog.find((e) => norm(e.ehBy) === key)?.ehBy.trim() ?? resurrections.find((e) => norm(e.broughtBy) === key)?.broughtBy.trim() ?? key;

  const inWindow = (d: string) => d >= start && d <= asOf;
  const challengeFngs = [...fngDate.entries()]
    .filter(([, d]) => inWindow(d))
    .sort((a, b) => a[1].localeCompare(b[1]));
  const isChallengeFng = (key: string) => inWindow(fngDate.get(key) ?? "");

  const events: PointEvent[] = [];
  const fngs: FngEntry[] = [];
  let unassignedPoints = 0;

  for (const [key, first] of challengeFngs) {
    const ehr = ehByKey.get(key) ?? null;
    const posts = (postDates.get(key) ?? []).filter((d) => d >= first && d <= asOf);
    let points = 0;
    posts.forEach((date, i) => {
      const p = scoringEnabled ? postPoints(i + 1) : 0;
      if (!p) return;
      points += p;
      if (ehr) events.push({ who: ehr, date, points: p, kind: "workouts" });
    });
    if (!ehr) unassignedPoints += points;
    fngs.push({ name: nameOf(key), ehBy: ehr ? nameOf(ehr) : null, firstPost: first, posts: posts.length, points, lastPost: posts.at(-1) ?? null });

    // Referral: this FNG was EH'd by another challenge FNG → that FNG's EH'er gets a bonus
    const grand = ehr && isChallengeFng(ehr) ? ehByKey.get(ehr) : undefined;
    if (scoringEnabled && grand) events.push({ who: grand, date: first, points: POINTS.referral, kind: "referrals" });
  }

  // First FNG each EH'er ever brought (for Family Tree)
  const firstFngOf = new Map<string, string>();
  for (const [key] of [...fngDate.entries()].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))) {
    const ehr = ehByKey.get(key);
    if (ehr && !firstFngOf.has(ehr)) firstFngOf.set(ehr, key);
  }

  for (const t of scoringEnabled ? THEMES : []) {
    if (t.kind === "open") continue;
    const from = t.start > start ? t.start : start;
    const to = t.end < asOf ? t.end : asOf;
    if (from > to) continue;
    const inTheme = (d: string) => d >= from && d <= to;

    if (t.kind === "fng" || t.kind === "familyTree") {
      for (const [key, first] of challengeFngs) {
        const ehr = ehByKey.get(key);
        if (!ehr || !inTheme(first)) continue;
        if (t.kind === "familyTree" && firstFngOf.get(ehr) !== key) continue;
        events.push({ who: ehr, date: first, points: t.bonus, kind: "themes" });
      }
    } else {
      const credited = new Set<string>();
      for (const record of resurrections) {
        const key = norm(record.pax);
        const recruiter = norm(record.broughtBy);
        if (!key || !recruiter || !inTheme(record.date) || credited.has(key)) continue;
        const posts = postDates.get(key) ?? [];
        const i = posts.indexOf(record.date);
        if (i > 0 && daysBetween(posts[i - 1], record.date) >= RESURRECTION_GAP_DAYS) {
          events.push({ who: recruiter, date: record.date, points: t.bonus, kind: "themes" });
          credited.add(key);
        }
      }
    }
  }

  const board = new Map<string, LeaderboardEntry>();
  const entry = (key: string) => {
    if (!board.has(key)) board.set(key, { name: nameOf(key), total: 0, week: 0, fngs: 0, breakdown: { workouts: 0, referrals: 0, themes: 0 } });
    return board.get(key)!;
  };
  for (const e of events) {
    const b = entry(e.who);
    b.total += e.points;
    b.breakdown[e.kind] += e.points;
    if (e.date >= weekStart) b.week += e.points;
  }
  for (const [key] of challengeFngs) {
    const ehr = ehByKey.get(key);
    if (ehr) entry(ehr).fngs++;
  }
  const leaderboard = sortLeaderboard([...board.values()], scoringEnabled ? "points" : "fngs");

  const themes: ThemeStatus[] = THEMES.map((t) => ({
    ...t,
    status: asOf < t.start ? "upcoming" : asOf > t.end ? "past" : "active",
  }));

  const result: Omit<ChallengeResult, "bandText"> = {
    period,
    start,
    asOf,
    sourceAsOf,
    end,
    scoringEnabled,
    weekStart,
    weekEnd,
    goal: scoringEnabled ? CHALLENGE_FNG_GOAL : period === "year" ? ANNUAL_FNG_GOAL : null,
    regionFngs: challengeFngs.length,
    leaderboard,
    fngs: fngs.reverse(),
    unassignedPoints,
    themes,
  };
  return { ...result, bandText: buildBandText(result) };
}

export function buildBandText(r: Omit<ChallengeResult, "bandText">, sort: LeaderboardSort = "points"): string {
  const lines = [
    r.scoringEnabled ? `🏆 2026 EH Challenge${sort === "fngs" ? " · Most FNGs" : ""}` : `Bedrock FNGs · ${PERIOD_LABELS[r.period]}`,
    `${formatDay(r.start)} – ${formatDay(r.end)}${r.scoringEnabled ? ` · scored through ${formatDay(r.asOf)}` : " · FNG stats, no challenge points"}`,
    "",
  ];
  if (r.leaderboard.length === 0) {
    lines.push(r.scoringEnabled ? "No points on the board yet. Go EH somebody!" : "No EH’ers recorded for this period yet.");
  } else {
    sortLeaderboard(r.leaderboard, r.scoringEnabled ? sort : "fngs").slice(0, 10).forEach((e, i) => {
      const week = e.week ? ` (+${e.week} this week)` : "";
      const score = !r.scoringEnabled ? `${e.fngs} FNG${e.fngs === 1 ? "" : "s"}` : sort === "fngs" ? `${e.fngs} FNG${e.fngs === 1 ? "" : "s"} · ${e.total} pts` : `${e.total} pts`;
      lines.push(`${i + 1}. ${e.name} — ${score}${week}`);
    });
  }
  const theme = r.themes.find((t) => t.status === "active") ?? r.themes.find((t) => t.status === "upcoming");
  if (r.scoringEnabled && theme) {
    lines.push(
      "",
      "Weekly calendar provisional; awaiting confirmation.",
      `🔥 ${theme.status === "active" ? "This week" : "Coming up"}: ${theme.name} (${formatDay(theme.start)} – ${formatDay(theme.end)})`,
      theme.description
    );
  }
  lines.push("", `🎯 Region FNGs: ${r.regionFngs}${r.goal ? ` / ${r.goal}` : ""}`);
  return lines.join("\n");
}
