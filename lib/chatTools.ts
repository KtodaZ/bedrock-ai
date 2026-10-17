/**
 * Deterministic lookups for chat, built on the same code as the Data pages and
 * EH leaderboard so answers match what PAX see there. Read-only; no AI calls.
 */
import {
  companions,
  defaultDataFilters,
  isPublicDataName,
  normalizeDataName,
  summarizePax,
  type DataView,
  type ExplorerData,
} from "./dataExplorer";
import {
  addDataDays,
  buildMilestones,
  type MilestoneStep,
} from "./milestones";
import {
  aoGrowth,
  attendanceBuckets,
  rawAttendanceURL,
  regionPulse,
  summarizeAttendance,
  weekdayTurnout,
  type WorkoutAttendance,
} from "./attendanceTrends";
import {
  aoDetail,
  aoSummaries,
  aoURL,
  aoYearOverYear,
  parseAoWeeks,
  yearChange,
  type AoDetail,
  type AoYearOverYear,
} from "./aoProfile";
import {
  FIRST_Q,
  Q_MIX,
  REGULAR_POSTS_90,
  bedrockFngDates,
  familyTree,
  firstQCandidates,
  fngCohorts,
  fngTotals,
  qMix,
  regularQRatios,
  type TreeNode,
} from "./community";
import { monthlyActivity } from "./paxActivity";
import { POINTS, type ChallengeResult, type Period } from "./ehChallenge";
import { buildPersonProfile } from "./ehProfile";

export interface ChatToolContext {
  data: ExplorerData;
  workouts: WorkoutAttendance[];
  /** Loads leaderboard standings; injected so tests need no sheet access. */
  challenge: (period: Period) => Promise<ChallengeResult>;
}
export interface ChatToolResult {
  /** Compact JSON for the model. */
  output: string;
  /** Page with the same numbers, when there is one. */
  link?: string;
}
type Json = Record<string, unknown>;

const nullable = (type: string, description: string) => ({
  type: [type, "null"],
  description,
});
const tool = (
  name: string,
  description: string,
  properties: Json,
): ChatToolDefinition => ({
  type: "function",
  name,
  description,
  strict: true,
  parameters: {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  },
});
export interface ChatToolDefinition {
  type: "function";
  name: string;
  description: string;
  strict: true;
  parameters: Json;
}

const DATE = "YYYY-MM-DD, or null";
export const CHAT_TOOLS: ChatToolDefinition[] = [
  tool(
    "pax_profile",
    "One PAX's recorded history: all-time posts, Qs, first/last post, best streak, Qsource, posts by AO, posts and Qs by month, Roster region and EH'er, who he EH'd, Bedrock FNG date, next post milestone forecast, and PAX he posts with most. Optional from/to adds totals for that range. Resolves misspellings; returns close matches when ambiguous.",
    {
      name: { type: "string", description: "PAX name as the user wrote it." },
      from: nullable("string", `Range start, ${DATE}.`),
      to: nullable("string", `Range end, ${DATE}.`),
    },
  ),
  tool(
    "ao_profile",
    "One AO over the last 13, 26, or 52 Monday–Sunday weeks (or all time) ending at the latest attendance date: average PAX per workout, workouts, posts, unique PAX, turnout change vs the same number of weeks before, weekly series, top PAX, top Qs, Qs who draw the most PAX, biggest workouts, turnout by weekday, and Bedrock FNGs who started there. Optionally compares with a second AO.",
    {
      ao: { type: "string", description: "AO name as the user wrote it." },
      weeks: { type: "string", enum: ["13", "26", "52", "all"] },
      compare_with: nullable("string", "Second AO name, or null."),
    },
  ),
  tool(
    "year_over_year",
    "Attendance this year vs last year for one AO or the whole region. The latest attendance year runs Jan 1 through the latest attendance date and is compared with the same dates last year; past years compare whole years. Returns posts, workouts, unique PAX, average PAX per workout, Bedrock FNGs, percent changes, and monthly values for both years.",
    {
      ao: nullable("string", "AO name, or null for the whole region."),
      year: nullable("integer", "Year to compare with the one before; null for the latest."),
    },
  ),
  tool(
    "ao_rankings",
    "Every AO side by side: type (run site or beatdown), city, usual days, active or quiet, and average PAX per workout compared with an earlier period (growth). period 4/13/26/52 = the last N Monday–Sunday weeks vs the N weeks before; ytd = Jan 1 through the latest attendance date vs the same dates last year (use for 'this year'). Also the region's last 7 days vs the 7 before. Use for 'which AO is growing', 'biggest AO', and AO comparisons.",
    { period: { type: "string", enum: ["4", "13", "26", "52", "ytd"] } },
  ),
  tool(
    "period_summary",
    "Totals for any date range, optionally at one AO: posts, workouts, unique PAX, average PAX per workout, Bedrock FNGs (names and dates), top posters, top Qs, posts by AO, and turnout by weekday. Use for 'how was last month', 'who posted most in 2025', 'busiest weekday'.",
    {
      from: { type: "string", description: "Range start, YYYY-MM-DD." },
      to: { type: "string", description: "Range end, YYYY-MM-DD." },
      ao: nullable("string", "AO name, or null for every AO."),
    },
  ),
  tool(
    "pax_list",
    `Ready-made PAX lists that match the Data and Community pages. kotter: Bedrock PAX whose last post was 15–364 days ago (2.0s excluded), with all-time posts and Qs. q_kotter: Bedrock PAX whose last Q was 31–364 days ago, with all-time posts and Qs. qsource: most Qsource posts and Qsource Qs, all time. first_q_candidates: no recorded Q, ${FIRST_Q.minPosts}+ posts, ${FIRST_Q.minRecent}+ posts in the last 30 days (2.0s excluded). q_ratio_regulars: Q ratio among PAX with ${REGULAR_POSTS_90}+ posts in the last 90 days. run_site_qs: Qs with ${Q_MIX.runOnlyMin}+ run-site Qs and no beatdown Q in the last ${Q_MIX.days} days, plus the run vs beatdown Q mix.`,
    {
      list: {
        type: "string",
        enum: [
          "kotter",
          "q_kotter",
          "qsource",
          "first_q_candidates",
          "q_ratio_regulars",
          "run_site_qs",
        ],
      },
      limit: nullable("integer", "Maximum rows, 1–100; null for 25 (kotter and q_kotter: the whole list, up to 100)."),
    },
  ),
  tool(
    "fng_follow_through",
    "How a year's Bedrock FNGs followed through, by month: each FNG's posts since his first post, last post, whether he posted in the last 30 days, and his Roster EH'er. The latest attendance month and the one before are 'still early'. An FNG counts only when attendance marks him FNG and his Roster region is Bedrock.",
    { year: nullable("integer", "Year; null for the latest.") },
  ),
  tool(
    "family_tree",
    "The Roster EH family tree as written (who EH'd whom). With a name: that PAX's EH'er chain upward and everyone below him. Without: the largest trees.",
    { name: nullable("string", "PAX name, or null for the largest trees.") },
  ),
  tool(
    "milestones",
    "Post milestone forecasts from recent pace and milestones recently reached. major = 100, 500, 1,000, then every 500.",
    {
      step: { type: "string", enum: ["major", "100", "500", "1000"] },
      name: nullable("string", "One PAX, or null for the region."),
    },
  ),
  tool(
    "eh_challenge",
    "EH Challenge leaderboard and FNGs exactly as the EH Challenge page scores them. challenge = Oct 15–Dec 31, 2026 cohort with points (goal 50 FNGs); year = this year's FNGs and invitations, no points (goal 100). With a name: that PAX's points, FNGs he EH'd, and next steps.",
    {
      period: { type: "string", enum: ["challenge", "year"] },
      name: nullable("string", "PAX name, or null for the whole leaderboard."),
    },
  ),
];

const squash = (s: string) =>
  normalizeDataName(s)
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]/g, "");
function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = next;
    }
  }
  return row[b.length];
}
type Resolved =
  | { name: string; note?: string }
  | { error: string; closest: string[] };
/** Exact, then partial, then near-spelling matches; ambiguity goes back to the model. */
export function resolveName(
  query: string,
  names: string[],
  kind: "PAX" | "AO",
): Resolved {
  const q = squash(query);
  if (!q) return { error: `No ${kind} name given.`, closest: [] };
  const exact = names.find((n) => squash(n) === q);
  if (exact) return { name: exact };
  const partial = names.filter((n) => {
    const s = squash(n);
    return s.includes(q) || (s.length >= 4 && q.includes(s));
  });
  if (partial.length === 1)
    return { name: partial[0], note: `Showing results for ${partial[0]}.` };
  const ranked = names
    .map((n) => ({ n, d: distance(q, squash(n)) }))
    .sort((a, b) => a.d - b.d || a.n.localeCompare(b.n));
  if (partial.length > 1)
    return {
      error: `Several ${kind}s match "${query}". Call again with one of these.`,
      closest: partial.slice(0, 8),
    };
  const best = ranked[0];
  if (
    best &&
    best.d <= Math.max(1, Math.floor(q.length / 4)) &&
    ranked[1]?.d !== best.d
  )
    return { name: best.n, note: `Showing results for ${best.n}.` };
  return {
    error: `No ${kind} matched "${query}".`,
    closest: ranked.slice(0, 5).map((r) => r.n),
  };
}

const round = (n: number | null | undefined, digits = 1) =>
  n == null ? null : Number(n.toFixed(digits));
const profileLink = (name: string) =>
  "/data?" + new URLSearchParams({ period: "all", pax: name });

/** Public PAX spellings that have at least one post, Roster spelling first. */
function paxNames(data: ExplorerData) {
  const roster = new Map(
    data.people.map((p) => [normalizeDataName(p.name), p.name]),
  );
  const names = new Map<string, string>();
  for (const row of data.rows) {
    if (!row.post || !isPublicDataName(row.pax)) continue;
    const key = normalizeDataName(row.pax);
    if (!names.has(key)) names.set(key, roster.get(key) ?? row.pax.trim());
  }
  return names;
}
const siteNames = (ctx: ChatToolContext) => [
  ...new Set(ctx.workouts.map((w) => w.site).filter(Boolean)),
];
const validDate = (d: unknown): d is string =>
  typeof d === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(d) &&
  !isNaN(Date.parse(d + "T00:00:00Z"));

function paxProfile(ctx: ChatToolContext, args: Json): ChatToolResult {
  const { data } = ctx;
  const names = paxNames(data);
  const found = resolveName(String(args.name ?? ""), [...names.values()], "PAX");
  if ("error" in found) return { output: JSON.stringify(found) };
  const key = normalizeDataName(found.name);
  const filters = {
    ...defaultDataFilters(data.asOf),
    period: "all" as const,
    search: found.name,
  };
  const stats = summarizePax(data, filters).find(
    (s) => normalizeDataName(s.name) === key,
  );
  const qsource = summarizePax(data, { ...filters, view: "qsource" }).find(
    (s) => normalizeDataName(s.name) === key,
  );
  const rows = data.rows
    .filter((r) => normalizeDataName(r.pax) === key && r.date <= data.asOf)
    .sort((a, b) => a.date.localeCompare(b.date));
  const byAO = new Map<string, { posts: Set<string>; qs: Set<string> }>();
  for (const r of rows) {
    if (!r.post) continue;
    const s = byAO.get(r.site) ?? { posts: new Set(), qs: new Set() };
    s.posts.add(r.date);
    if (r.q) s.qs.add(r.date);
    byAO.set(r.site, s);
  }
  const person = data.people.find((p) => normalizeDataName(p.name) === key);
  const fng = bedrockFngDates(data).get(key);
  const forecast = buildMilestones(data, "major").forecasts.find(
    (f) => normalizeDataName(f.name) === key,
  );
  const months = monthlyActivity(rows, data.asOf);
  const busiest = months.reduce<(typeof months)[number] | undefined>(
    (best, m) => (m.posts > (best?.posts ?? 0) ? m : best),
    undefined,
  );
  const result: Json = {
    name: found.name,
    note: found.note,
    asOf: data.asOf,
    region: person?.region || null,
    ehBy: person?.ehBy ?? null,
    ehd: data.people
      .filter((p) => p.ehBy && normalizeDataName(p.ehBy) === key)
      .map((p) => p.name),
    bedrockFngDate: fng?.date ?? null,
    allTime: stats && {
      posts: stats.posts,
      qs: stats.qs,
      firstPost: stats.first,
      lastPost: stats.last,
      lastQ: stats.lastQ || null,
      daysSinceLastPost: stats.days,
      bestStreakWorkoutDays: stats.streak,
      qRatioPct: round(stats.qRatio),
      activeAOsVisited: stats.aos,
    },
    qsource: qsource ? { posts: qsource.posts, qs: qsource.qs } : null,
    byAO: [...byAO.entries()]
      .map(([ao, s]) => ({ ao, posts: s.posts.size, qs: s.qs.size }))
      .sort((a, b) => b.posts - a.posts || a.ao.localeCompare(b.ao)),
    monthly: months.map((m) => [m.month, m.posts, m.qs]),
    monthlyColumns: ["month", "posts", "qs"],
    busiestMonth: busiest && { month: busiest.month, posts: busiest.posts },
    nextMilestone: forecast && {
      target: forecast.target,
      remaining: forecast.remaining,
      postsPerWeek90: round(forecast.postsPerWeek),
      projected: forecast.projected,
      range: forecast.earliest && [forecast.earliest, forecast.latest],
      reason: forecast.reason,
    },
    postsMostWith: companions(data, found.name, "with")
      .slice(0, 5)
      .map((c) => [c.name, c.count]),
  };
  if (validDate(args.from) || validDate(args.to)) {
    const from = validDate(args.from) ? args.from : "0000-01-01";
    const to = validDate(args.to) ? args.to : data.asOf;
    const inRange = rows.filter((r) => r.post && r.date >= from && r.date <= to);
    result.range = {
      from,
      to,
      posts: inRange.length,
      qs: inRange.filter((r) => r.q).length,
      aos: [...new Set(inRange.map((r) => r.site))],
      dates: inRange.length <= 40 ? inRange.map((r) => [r.date, r.site, r.q ? "Q" : ""]) : undefined,
    };
  }
  return { output: JSON.stringify(result), link: profileLink(found.name) };
}

function aoSummary(d: AoDetail, full: boolean): Json {
  return {
    ao: d.site,
    type: d.kind,
    city: d.city || null,
    usualDays: d.days,
    firstWorkout: d.firstWorkout,
    lastWorkout: d.lastWorkout,
    window: { from: d.from, through: d.through, weeks: d.weeks },
    avgPaxPerWorkout: round(d.average),
    workouts: d.workouts,
    posts: d.posts,
    uniquePax: d.pax,
    previousAvg: round(d.previous),
    turnoutChangePct: round(d.change, 0),
    bedrockFngs: full ? d.fngs : d.fngs.length,
    topPax: d.topPax
      .slice(0, full ? 10 : 3)
      .map((p) => [p.name, p.posts, Math.round(p.share)]),
    topQs: d.topQs.slice(0, full ? 10 : 3).map((q) => [q.name, q.qs, q.lastQ]),
    ...(full && {
      columns: {
        topPax: ["name", "posts", "pctOfWorkouts"],
        topQs: ["name", "qs", "lastQ"],
        bestDraw: ["name", "qs", "avgPax"],
        biggest: ["date", "pax", "qs"],
      },
      bestDraw: d.draws.slice(0, 5).map((q) => [q.name, q.qs, round(q.average)]),
      biggest: d.biggest.slice(0, 5).map((w) => [w.date, w.pax, w.qs]),
      weekdays: d.weekdays
        .filter((w) => w.workouts)
        .map((w) => [w.day, w.workouts, round(w.average)]),
    }),
  };
}
function aoProfile(ctx: ChatToolContext, args: Json): ChatToolResult {
  const sites = siteNames(ctx);
  const found = resolveName(String(args.ao ?? ""), sites, "AO");
  if ("error" in found) return { output: JSON.stringify(found) };
  const weeks = parseAoWeeks(String(args.weeks));
  const detail = aoDetail(ctx.data, ctx.workouts, found.name, weeks)!;
  const result: Json = { note: found.note, ...aoSummary(detail, true) };
  const series = attendanceBuckets(
    ctx.workouts,
    ctx.data.asOf,
    Math.min(detail.weeks, 52),
    found.name,
  );
  result.weekly = series
    .filter((b) => b.workouts)
    .map((b) => [b.start, b.workouts, b.posts, round(b.average)]);
  result.weeklyColumns = ["weekOf", "workouts", "posts", "avgPax"];
  let link = aoURL(found.name) + (weeks === 13 ? "" : `&weeks=${weeks}`);
  if (args.compare_with) {
    const other = resolveName(String(args.compare_with), sites, "AO");
    if ("error" in other) result.compareWith = other;
    else {
      const d = aoDetail(ctx.data, ctx.workouts, other.name, weeks)!;
      result.compareWith = aoSummary(d, false);
      link += "&" + new URLSearchParams({ vs: other.name });
    }
  }
  return { output: JSON.stringify(result), link };
}

function yoySummary(y: AoYearOverYear) {
  const w = { current: y.current.workouts, previous: y.previous.workouts };
  const pct = (k: "posts" | "workouts" | "pax" | "average") =>
    round(yearChange(y.current[k], y.previous[k], w), 0);
  return {
    ao: y.site || "Whole region",
    year: y.year,
    partialYear: y.partial,
    current: { from: y.from, through: y.through, ...y.current, average: round(y.current.average) },
    previous: {
      from: y.previousFrom,
      through: y.previousThrough,
      ...y.previous,
      average: round(y.previous.average),
    },
    changePct: {
      posts: pct("posts"),
      workouts: pct("workouts"),
      uniquePax: pct("pax"),
      avgPaxPerWorkout: pct("average"),
      bedrockFngsDifference: y.current.fngs - y.previous.fngs,
    },
    recordsStart: y.firstWorkout,
    previousYearIncomplete: y.firstWorkout > y.previousFrom,
    months: y.months.map((m) => [
      m.month,
      m.current?.workouts ? m.current.posts : null,
      m.current?.workouts ? round(m.current.average) : null,
      m.previous?.workouts ? m.previous.posts : null,
      m.previous?.workouts ? round(m.previous.average) : null,
    ]),
    monthColumns: ["month", "posts", "avgPax", "lastYearPosts", "lastYearAvgPax"],
    rule: "Percent changes need 3+ workouts in both years. Month totals for the current partial month are not comparable with full months.",
  };
}
function yearOverYear(ctx: ChatToolContext, args: Json): ChatToolResult {
  let site = "";
  let note: string | undefined;
  if (args.ao) {
    const found = resolveName(String(args.ao), siteNames(ctx), "AO");
    if ("error" in found) return { output: JSON.stringify(found) };
    site = found.name;
    note = found.note;
  }
  const latest = Number(ctx.data.asOf.slice(0, 4));
  const year =
    Number.isInteger(args.year) && (args.year as number) <= latest
      ? (args.year as number)
      : latest;
  const yoy = aoYearOverYear(ctx.data, ctx.workouts, site, year);
  if (!yoy) return { output: JSON.stringify({ error: "No workouts recorded." }) };
  return {
    output: JSON.stringify({ note, ...yoySummary(yoy) }),
    link: site
      ? aoURL(site) + "&chart=yoy" + (year === latest ? "" : `&year=${year}`)
      : undefined,
  };
}

function aoRankings(ctx: ChatToolContext, args: Json): ChatToolResult {
  const ytd = args.period === "ytd";
  const weeks = [4, 13, 26, 52].includes(Number(args.period))
    ? Number(args.period)
    : 13;
  const sites = aoSummaries(ctx.data, ctx.workouts);
  const year = Number(ctx.data.asOf.slice(0, 4));
  const yearly = new Map(
    ytd
      ? sites.flatMap((s) => {
          const y = aoYearOverYear(ctx.data, ctx.workouts, s.site, year);
          return y ? [[s.site, y] as const] : [];
        })
      : [],
  );
  const growth = new Map(
    aoGrowth(
      ctx.workouts,
      ctx.data.asOf,
      weeks,
      sites.map((s) => s.site),
    ).map((g) => [g.site, g]),
  );
  const pulse = regionPulse(ctx.data);
  return {
    output: JSON.stringify({
      asOf: ctx.data.asOf,
      period: ytd ? "year to date" : `${weeks} weeks`,
      growthRule: ytd
        ? `Average PAX per workout Jan 1–${ctx.data.asOf} vs the same dates in ${year - 1}; needs 3+ workouts in both.`
        : "Average PAX per workout in the last N Monday–Sunday weeks vs the N weeks before; needs 3+ workouts in both.",
      aos: sites.map((s) => {
        const y = yearly.get(s.site);
        const g = y
          ? {
              current: y.current.average,
              previous: y.previous.average,
              change: yearChange(y.current.average, y.previous.average, {
                current: y.current.workouts,
                previous: y.previous.workouts,
              }),
              workouts: y.current.workouts,
              posts: y.current.posts,
            }
          : ytd
            ? undefined
            : growth.get(s.site);
        return {
          ao: s.site,
          type: s.kind,
          city: s.city || null,
          usualDays: s.days,
          status: s.quiet ? "quiet or inactive" : "active",
          lastWorkout: s.lastWorkout,
          avgPaxNow: round(g?.current),
          avgPaxBefore: round(g?.previous),
          changePct: round(g?.change, 0),
          workouts: g?.workouts ?? 0,
          posts: g?.posts ?? 0,
        };
      }),
      last7Days: pulse.current,
      previous7Days: pulse.previous,
    }),
    link: "/data/trends" + (ytd || weeks === 13 || weeks === 4 ? "" : `?weeks=${weeks}`) + "#ao-growth-heading",
  };
}

function periodSummary(ctx: ChatToolContext, args: Json): ChatToolResult {
  const { data } = ctx;
  if (!validDate(args.from) || !validDate(args.to) || args.from > args.to)
    return {
      output: JSON.stringify({ error: "from and to must be YYYY-MM-DD with from ≤ to." }),
    };
  const from = args.from as string;
  const to = (args.to as string) > data.asOf ? data.asOf : (args.to as string);
  let site = "";
  let note: string | undefined;
  if (args.ao) {
    const found = resolveName(String(args.ao), siteNames(ctx), "AO");
    if ("error" in found) return { output: JSON.stringify(found) };
    site = found.name;
    note = found.note;
  }
  const sites = site ? [site] : [];
  const summary = summarizeAttendance(ctx.workouts, from, to, sites);
  const names = paxNames(data);
  const posters = new Map<string, { dates: Set<string>; qs: Set<string> }>();
  const byAO = new Map<string, { posts: number; workouts: Set<string> }>();
  for (const r of data.rows) {
    if (!r.post || r.date < from || r.date > to || !isPublicDataName(r.pax))
      continue;
    if (site && r.site !== site) continue;
    const key = normalizeDataName(r.pax);
    const p = posters.get(key) ?? { dates: new Set(), qs: new Set() };
    p.dates.add(r.date + "\0" + r.site);
    if (r.q) p.qs.add(r.date + "\0" + r.site);
    posters.set(key, p);
    const a = byAO.get(r.site) ?? { posts: 0, workouts: new Set() };
    a.posts++;
    a.workouts.add(r.date);
    byAO.set(r.site, a);
  }
  const ranked = [...posters.entries()].map(([key, p]) => ({
    name: names.get(key) ?? key,
    posts: p.dates.size,
    qs: p.qs.size,
  }));
  const fngs = [...bedrockFngDates(data).entries()]
    .filter(([, f]) => f.date >= from && f.date <= to && (!site || f.site === site))
    .map(([key, f]) => [names.get(key) ?? f.name, f.date, f.site])
    .sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  return {
    output: JSON.stringify({
      note,
      ao: site || "All AOs",
      from,
      to,
      dataEnds: data.asOf,
      posts: summary.posts,
      workouts: summary.workouts,
      uniquePax: summary.pax,
      avgPaxPerWorkout: round(summary.average),
      bedrockFngs: fngs,
      topPosters: ranked
        .sort((a, b) => b.posts - a.posts || a.name.localeCompare(b.name))
        .slice(0, 15)
        .map((p) => [p.name, p.posts]),
      topQs: ranked
        .filter((p) => p.qs)
        .sort((a, b) => b.qs - a.qs || a.name.localeCompare(b.name))
        .slice(0, 10)
        .map((p) => [p.name, p.qs]),
      byAO: site
        ? undefined
        : [...byAO.entries()]
            .map(([ao, a]) => [ao, a.posts, a.workouts.size, round(a.posts / a.workouts.size)])
            .sort((a, b) => Number(b[1]) - Number(a[1])),
      byAOColumns: site ? undefined : ["ao", "posts", "workouts", "avgPax"],
      weekdays: weekdayTurnout(ctx.workouts, from, to, sites)
        .filter((w) => w.workouts)
        .map((w) => [w.day, w.workouts, round(w.average)]),
    }),
    link: rawAttendanceURL(site, from, to),
  };
}

function paxList(ctx: ChatToolContext, args: Json): ChatToolResult {
  const { data } = ctx;
  const list = String(args.list);
  const whole = list === "kotter" || list === "q_kotter";
  const limit = Math.min(
    100,
    Math.max(1, Number.isInteger(args.limit) ? (args.limit as number) : whole ? 100 : 25),
  );
  const all = (view: DataView) =>
    summarizePax(data, { ...defaultDataFilters(data.asOf), view, period: "all" });
  let result: Json;
  let link = "/data/community?tab=q";
  if (list === "kotter" || list === "q_kotter") {
    const rows = all(list === "kotter" ? "kotter" : "qkotter").sort(
      (a, b) => a.days - b.days || a.name.localeCompare(b.name),
    );
    result = {
      rule:
        list === "kotter"
          ? "Bedrock Roster PAX whose last post was 15–364 days before the latest attendance date; 2.0s excluded."
          : "Bedrock Roster PAX whose last Q was 31–364 days before the latest attendance date.",
      total: rows.length,
      columns: ["name", "allTimePosts", "allTimeQs", list === "kotter" ? "lastPost" : "lastQ", "days"],
      rows: rows
        .slice(0, limit)
        .map((r) => [r.name, r.posts, r.qs, list === "kotter" ? r.last : r.lastQ, r.days]),
    };
    link = `/data?view=${list === "kotter" ? "kotter" : "qkotter"}&period=all`;
  } else if (list === "qsource") {
    const rows = all("qsource").sort(
      (a, b) => b.posts - a.posts || a.name.localeCompare(b.name),
    );
    result = {
      total: rows.length,
      columns: ["name", "qsourcePosts", "qsourceQs", "first", "last"],
      rows: rows.slice(0, limit).map((r) => [r.name, r.posts, r.qs, r.first, r.last]),
    };
    link = "/data?view=qsource&period=all";
  } else if (list === "first_q_candidates") {
    const rows = firstQCandidates(data);
    result = {
      rule: `No recorded Q, ${FIRST_Q.minPosts}+ posts, ${FIRST_Q.minRecent}+ posts in the 30 days ending the latest attendance date; 2.0s excluded.`,
      total: rows.length,
      columns: ["name", "posts", "postsLast30", "lastPost", "usualAO"],
      rows: rows.slice(0, limit).map((r) => [r.name, r.posts, r.recent30, r.lastPost, r.usualAO]),
    };
    link += "#first-q-heading";
  } else if (list === "q_ratio_regulars") {
    const rows = regularQRatios(data);
    result = {
      rule: `PAX with ${REGULAR_POSTS_90}+ posts in the 90 days ending the latest attendance date; ratio = Qs ÷ posts in those 90 days.`,
      total: rows.length,
      columns: ["name", "qRatioPct", "qs90", "posts90", "lastQ"],
      rows: rows
        .slice(0, limit)
        .map((r) => [r.name, round(r.ratio), r.qs90, r.posts90, r.lastQ || null]),
    };
    link += "#q-ratio-heading";
  } else if (list === "run_site_qs") {
    const mix = qMix(data);
    result = {
      rule: `Run sites: Pinnacle, Rattlesnake Ridge, Trailhead. Others listed are beatdowns. Run-only = ${Q_MIX.runOnlyMin}+ run-site Qs and no beatdown Q in the ${Q_MIX.days} days ending the latest attendance date.`,
      runOnly: mix.runOnly
        .slice(0, limit)
        .map((m) => [m.name, m.run, m.lastRun, m.lastBeatdown || null]),
      runOnlyColumns: ["name", "runQs", "lastRunQ", "lastBeatdownQEver"],
      mix: mix.mix
        .slice(0, limit)
        .map((m) => [m.name, m.run, m.beatdown, Math.round(m.runShare)]),
      mixColumns: ["name", "runQs", "beatdownQs", "runSharePct"],
    };
    link += "#run-only-heading";
  } else return { output: JSON.stringify({ error: "Unknown list." }) };
  return { output: JSON.stringify({ asOf: data.asOf, list, ...result }), link };
}

function fngFollowThrough(ctx: ChatToolContext, args: Json): ChatToolResult {
  const year = String(
    Number.isInteger(args.year) ? args.year : ctx.data.asOf.slice(0, 4),
  );
  const cohorts = fngCohorts(ctx.data).filter((c) => c.month.startsWith(year));
  const all = cohorts.flatMap((c) => c.fngs);
  return {
    output: JSON.stringify({
      asOf: ctx.data.asOf,
      year,
      rule: "Bedrock FNGs: an FNG-flagged attendance row and Roster region Bedrock. Posts are distinct recorded dates since the first post. Active = posted in the last 30 days.",
      totals: fngTotals(all),
      columns: ["name", "posts", "lastPost", "active", "ehBy"],
      months: cohorts.map((c) => ({
        month: c.month,
        stillEarly: c.early,
        fngs: c.fngs.map((f) => [f.name, f.posts, f.lastPost, f.active, f.ehBy]),
      })),
    }),
    link: "/data/community#fng-months-heading",
  };
}

function familyTreeTool(ctx: ChatToolContext, args: Json): ChatToolResult {
  const roots = familyTree(ctx.data);
  const trim = (n: TreeNode, depth: number): Json => ({
    name: n.name,
    posts: n.posts,
    below: n.size,
    ...(n.children.length && {
      ehd: depth > 0 ? n.children.map((c) => trim(c, depth - 1)) : n.children.length,
    }),
  });
  if (!args.name)
    return {
      output: JSON.stringify({
        rule: "Roster EH'er links as written; nothing inferred.",
        largest: roots.slice(0, 10).map((r) => trim(r, 1)),
      }),
      link: "/data/community?tab=tree#family-tree-heading",
    };
  const nodes = new Map<string, { node: TreeNode; parent: string | null }>();
  const walk = (n: TreeNode, parent: string | null) => {
    nodes.set(n.key, { node: n, parent });
    n.children.forEach((c) => walk(c, n.key));
  };
  roots.forEach((r) => walk(r, null));
  const found = resolveName(
    String(args.name),
    [...nodes.values()].map((n) => n.node.name),
    "PAX",
  );
  if ("error" in found)
    return {
      output: JSON.stringify({ ...found, note: "Not in any Roster EH'er link." }),
    };
  const entry = nodes.get(normalizeDataName(found.name))!;
  const chain: string[] = [];
  for (let p = entry.parent; p; p = nodes.get(p)?.parent ?? null)
    chain.push(nodes.get(p)!.node.name);
  return {
    output: JSON.stringify({
      note: found.note,
      ehChainUpward: chain,
      tree: trim(entry.node, 4),
    }),
    link: `/data/community?${new URLSearchParams({ tab: "tree", search: found.name })}#family-tree-heading`,
  };
}

function milestonesTool(ctx: ChatToolContext, args: Json): ChatToolResult {
  const step: MilestoneStep =
    args.step === "major" ? "major" : (Number(args.step) as 100 | 500 | 1000);
  const { forecasts, reached } = buildMilestones(ctx.data, step);
  const since = addDataDays(ctx.data.asOf, -90);
  const f = (m: (typeof forecasts)[number]) => [
    m.name,
    m.posts,
    m.target,
    m.remaining,
    round(m.postsPerWeek),
    m.projected,
    m.reason,
  ];
  const columns = {
    upcoming: ["name", "posts", "target", "remaining", "postsPerWeek90", "projected", "reason"],
    reached: ["name", "target", "date"],
  };
  const link =
    "/data/milestones" + (step === "major" ? "" : `?step=${step}`);
  const personLink = (name: string) =>
    `/data/milestones?${new URLSearchParams({ ...(step === "major" ? {} : { step: String(step) }), horizon: "all", search: name })}`;
  if (args.name) {
    const found = resolveName(
      String(args.name),
      forecasts.map((m) => m.name),
      "PAX",
    );
    if ("error" in found) return { output: JSON.stringify(found) };
    const key = normalizeDataName(found.name);
    return {
      output: JSON.stringify({
        note: found.note,
        asOf: ctx.data.asOf,
        step,
        columns,
        upcoming: forecasts.filter((m) => normalizeDataName(m.name) === key).map(f),
        reached: reached
          .filter((m) => normalizeDataName(m.name) === key)
          .map((m) => [m.name, m.target, m.date]),
      }),
      link: personLink(found.name),
    };
  }
  return {
    output: JSON.stringify({
      asOf: ctx.data.asOf,
      step,
      rule: "Projection uses the 90-day pace; null projected means too few recent posts.",
      columns,
      upcoming: forecasts.filter((m) => m.projected).slice(0, 20).map(f),
      reachedLast90Days: reached
        .filter((m) => m.date >= since)
        .slice(0, 20)
        .map((m) => [m.name, m.target, m.date]),
    }),
    link,
  };
}

async function ehChallengeTool(
  ctx: ChatToolContext,
  args: Json,
): Promise<ChatToolResult> {
  const period: Period = args.period === "year" ? "year" : "challenge";
  const r = await ctx.challenge(period);
  const link = `/eh-challenge?period=${period}`;
  const base = {
    period,
    from: r.start,
    through: r.asOf,
    ends: r.end,
    goal: r.goal,
    regionFngs: r.regionFngs,
    scoring: r.scoringEnabled
      ? { ...POINTS, note: "Points per FNG's 1st, 2nd, 5th, and each later post; referral = original EH'er's bonus when his FNG EHs another FNG." }
      : "No points in this view.",
  };
  if (args.name) {
    const people = [
      ...new Set([
        ...r.leaderboard.map((p) => p.name),
        ...r.fngs.map((f) => f.name),
        ...r.fngs.flatMap((f) => (f.ehBy ? [f.ehBy] : [])),
      ]),
    ];
    const found = resolveName(String(args.name), people, "PAX");
    if ("error" in found)
      return { output: JSON.stringify({ ...base, ...found }), link };
    const profile = buildPersonProfile(r, found.name);
    return {
      output: JSON.stringify({
        ...base,
        note: found.note,
        name: found.name,
        standing: profile?.standing ?? null,
        rank: r.leaderboard.findIndex((p) => p.name === profile?.standing?.name) + 1 || null,
        ownFng: profile?.ownFng ?? null,
        ehd: profile?.recruits.map((f) => [f.name, f.firstPost, f.posts, f.points]) ?? [],
        ehdColumns: ["name", "firstPost", "posts", "points"],
      }),
      link: `/eh-challenge/person/${encodeURIComponent(found.name)}?period=${period}`,
    };
  }
  return {
    output: JSON.stringify({
      ...base,
      leaderboardColumns: ["name", "points", "fngs", "workoutPoints", "referralPoints", "themePoints"],
      leaderboard: r.leaderboard
        .slice(0, 15)
        .map((p) => [p.name, p.total, p.fngs, p.breakdown.workouts, p.breakdown.referrals, p.breakdown.themes]),
      fngColumns: ["name", "ehBy", "firstPost", "posts", "points"],
      fngs: r.fngs.slice(0, 60).map((f) => [f.name, f.ehBy, f.firstPost, f.posts, f.points]),
      unassignedPoints: r.unassignedPoints,
      themes: r.themes
        .filter((t) => t.status !== "past")
        .map((t) => [t.name, t.start, t.end, t.status, t.bonus, t.description]),
    }),
    link,
  };
}

const HANDLERS: Record<
  string,
  (ctx: ChatToolContext, args: Json) => ChatToolResult | Promise<ChatToolResult>
> = {
  pax_profile: paxProfile,
  ao_profile: aoProfile,
  year_over_year: yearOverYear,
  ao_rankings: aoRankings,
  period_summary: periodSummary,
  pax_list: paxList,
  fng_follow_through: fngFollowThrough,
  family_tree: familyTreeTool,
  milestones: milestonesTool,
  eh_challenge: ehChallengeTool,
};
export const isChatTool = (name: string) => name in HANDLERS;
export async function runChatTool(
  ctx: ChatToolContext,
  name: string,
  args: Json,
): Promise<ChatToolResult> {
  const handler = HANDLERS[name];
  if (!handler) return { output: JSON.stringify({ error: `Unknown tool ${name}.` }) };
  try {
    const result = await handler(ctx, args);
    return {
      ...result,
      output: result.link
        ? result.output.replace(/}$/, `,"link":${JSON.stringify(result.link)}}`)
        : result.output,
    };
  } catch (error) {
    return {
      output: JSON.stringify({ error: `Lookup failed: ${String(error).slice(0, 200)}` }),
    };
  }
}

/** Facts the model would otherwise spend a round querying for. */
export function chatDataFacts(data: ExplorerData, workouts: WorkoutAttendance[]) {
  const first = data.rows.reduce(
    (min, r) => (r.post && (!min || r.date < min) ? r.date : min),
    "",
  );
  const aos = aoSummaries(data, workouts).map((s) =>
    [
      s.site,
      s.kind === "run" ? "run site" : s.kind === "beatdown" ? "beatdown" : "",
      s.city,
      s.days.join("/"),
      s.quiet ? "quiet/inactive" : "",
    ]
      .filter(Boolean)
      .join(" · "),
  );
  return [
    `Attendance records cover ${first} through ${data.asOf} (the latest attendance date; use it as "today" for "last 30 days", "this month", and so on).`,
    `AOs (name · type · city · usual days): ${aos.join("; ")}.`,
    `Run sites are Pinnacle, Rattlesnake Ridge, and Trailhead; the other listed AOs are beatdowns.`,
  ].join("\n");
}
