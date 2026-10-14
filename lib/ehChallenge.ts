import type { AttendanceRow } from "./sheet";

// ── Challenge config ─────────────────────────────────────────────────────────

export type Period = "month" | "year" | "all";

export const POINTS = {
  firstPost: 5,
  secondPost: 3,
  fifthPost: 5,
  afterFifth: 1, // each post after the 5th
  referral: 5, // original EH'er's bonus when their FNG EHs another FNG
};

export const REGION_FNG_GOAL = 50;

type ThemeKind =
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
    name: "Resurrection Week",
    start: "2026-10-19",
    end: "2026-10-25",
    description: "Bring back a former PAX who's been absent for at least 6 months",
    kind: "resurrection",
    bonus: 5,
  },
  {
    name: "Family Tree",
    start: "2026-10-26",
    end: "2026-11-01",
    description: "Get an existing PAX to EH his first FNG",
    kind: "familyTree",
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

const RESURRECTION_GAP_DAYS = 180;

// ── Scoring ──────────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  name: string;
  total: number;
  week: number;
  fngs: number;
}

export interface FngEntry {
  name: string;
  ehBy: string | null;
  firstPost: string;
  posts: number;
  points: number;
}

export interface ThemeStatus extends Theme {
  status: "active" | "upcoming" | "past";
}

export interface ChallengeResult {
  period: Period;
  start: string;
  asOf: string;
  weekStart: string;
  weekEnd: string;
  goal: number;
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

export function computeChallenge(
  rows: AttendanceRow[],
  ehLog: EhLogEntry[],
  period: Period
): ChallengeResult {
  const allDates = rows.map((r) => r.date).sort();
  if (allDates.length === 0) throw new Error("No attendance rows found");
  const asOf = allDates[allDates.length - 1];
  const start =
    period === "month" ? `${asOf.slice(0, 7)}-01` : period === "year" ? `${asOf.slice(0, 4)}-01-01` : allDates[0];

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
    displayName.get(key) ?? ehLog.find((e) => norm(e.ehBy) === key)?.ehBy.trim() ?? key;

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
      const p = postPoints(i + 1);
      if (!p) return;
      points += p;
      if (ehr) events.push({ who: ehr, date, points: p });
    });
    if (!ehr) unassignedPoints += points;
    fngs.push({ name: nameOf(key), ehBy: ehr ? nameOf(ehr) : null, firstPost: first, posts: posts.length, points });

    // Referral: this FNG was EH'd by another challenge FNG → that FNG's EH'er gets a bonus
    const grand = ehr && isChallengeFng(ehr) ? ehByKey.get(ehr) : undefined;
    if (grand) events.push({ who: grand, date: first, points: POINTS.referral });
  }

  // First FNG each EH'er ever brought (for Family Tree)
  const firstFngOf = new Map<string, string>();
  for (const [key, d] of [...fngDate.entries()].sort((a, b) => a[1].localeCompare(b[1]))) {
    const ehr = ehByKey.get(key);
    if (ehr && !firstFngOf.has(ehr)) firstFngOf.set(ehr, d);
  }

  for (const t of THEMES) {
    const from = t.start > start ? t.start : start;
    const to = t.end < asOf ? t.end : asOf;
    if (from > to) continue;
    const inTheme = (d: string) => d >= from && d <= to;

    if (t.kind === "fng" || t.kind === "familyTree") {
      for (const [key, first] of challengeFngs) {
        const ehr = ehByKey.get(key);
        if (!ehr || !inTheme(first)) continue;
        if (t.kind === "familyTree" && firstFngOf.get(ehr) !== first) continue;
        events.push({ who: ehr, date: first, points: t.bonus });
      }
    } else {
      for (const [key, ehr] of ehByKey) {
        const posts = postDates.get(key) ?? [];
        const returned = posts.some(
          (d, i) => inTheme(d) && i > 0 && daysBetween(posts[i - 1], d) >= RESURRECTION_GAP_DAYS
        );
        if (returned) events.push({ who: ehr, date: posts.find(inTheme)!, points: t.bonus });
      }
    }
  }

  const board = new Map<string, LeaderboardEntry>();
  const entry = (key: string) => {
    if (!board.has(key)) board.set(key, { name: nameOf(key), total: 0, week: 0, fngs: 0 });
    return board.get(key)!;
  };
  for (const e of events) {
    const b = entry(e.who);
    b.total += e.points;
    if (e.date >= weekStart) b.week += e.points;
  }
  for (const [key] of challengeFngs) {
    const ehr = ehByKey.get(key);
    if (ehr) entry(ehr).fngs++;
  }
  const leaderboard = [...board.values()].sort(
    (a, b) => b.total - a.total || b.week - a.week || a.name.localeCompare(b.name)
  );

  const themes: ThemeStatus[] = THEMES.map((t) => ({
    ...t,
    status: asOf < t.start ? "upcoming" : asOf > t.end ? "past" : "active",
  }));

  const result: Omit<ChallengeResult, "bandText"> = {
    period,
    start,
    asOf,
    weekStart,
    weekEnd,
    goal: REGION_FNG_GOAL,
    regionFngs: challengeFngs.length,
    leaderboard,
    fngs: fngs.reverse(),
    unassignedPoints,
    themes,
  };
  return { ...result, bandText: buildBandText(result) };
}

function buildBandText(r: Omit<ChallengeResult, "bandText">): string {
  const lines = [
    `🏆 EH Challenge Leaderboard`,
    `${formatDay(r.start)} – ${formatDay(r.asOf)} · week of ${formatDay(r.weekStart)}`,
    "",
  ];
  if (r.leaderboard.length === 0) {
    lines.push("No points on the board yet. Go EH somebody!");
  } else {
    r.leaderboard.slice(0, 10).forEach((e, i) => {
      const week = e.week ? ` (+${e.week} this week)` : "";
      lines.push(`${i + 1}. ${e.name} — ${e.total} pts${week}`);
    });
  }
  const theme = r.themes.find((t) => t.status === "active") ?? r.themes.find((t) => t.status === "upcoming");
  if (theme) {
    lines.push(
      "",
      `🔥 ${theme.status === "active" ? "This week" : "Coming up"}: ${theme.name} (${formatDay(theme.start)} – ${formatDay(theme.end)})`,
      theme.description
    );
  }
  lines.push("", `🎯 Region FNGs: ${r.regionFngs} / ${r.goal}`);
  return lines.join("\n");
}
