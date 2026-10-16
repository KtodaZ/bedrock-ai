/** Community views: FNG follow-through, Roster EH family tree, Q leadership. Read-only; no points. */
import {
  isPublicDataName,
  normalizeDataName,
  type ExplorerData,
} from "./dataExplorer";
import { addDataDays } from "./milestones";

const isBedrock = (region: string | undefined) =>
  region?.trim().toLowerCase() === "bedrock";

/** Same FNG rule as the challenge: earliest FNG-flagged row for a Bedrock Roster PAX. */
export function bedrockFngDates(data: ExplorerData) {
  const regions = new Map(
    data.people.map((p) => [normalizeDataName(p.name), p.region]),
  );
  const firsts = new Map<
    string,
    { name: string; date: string; site: string }
  >();
  for (const row of data.rows) {
    if (!row.fng || row.date > data.asOf || !isPublicDataName(row.pax))
      continue;
    const key = normalizeDataName(row.pax);
    if (!isBedrock(regions.get(key))) continue;
    const seen = firsts.get(key);
    if (!seen || row.date < seen.date)
      firsts.set(key, { name: row.pax, date: row.date, site: row.site });
  }
  return firsts;
}

/** Distinct recorded post dates per normalized name, through asOf. */
function postDates(data: ExplorerData) {
  const dates = new Map<string, Set<string>>();
  for (const row of data.rows) {
    if (!row.post || row.date > data.asOf || !isPublicDataName(row.pax))
      continue;
    const key = normalizeDataName(row.pax);
    const set = dates.get(key) ?? new Set<string>();
    set.add(row.date);
    dates.set(key, set);
  }
  return dates;
}

export interface FngFollowThrough {
  name: string;
  fngDate: string;
  posts: number;
  lastPost: string;
  active: boolean;
  ehBy: string | null;
}
export interface FngCohort {
  month: string;
  fngs: FngFollowThrough[];
  /** The latest attendance month or the one before; follow-through is still forming. */
  early: boolean;
}
export const FNG_STAGES = [
  { key: "one", label: "1 post", min: 1, max: 1 },
  { key: "few", label: "2–4 posts", min: 2, max: 4 },
  { key: "some", label: "5–9 posts", min: 5, max: 9 },
  { key: "ten", label: "10+ posts", min: 10, max: Infinity },
] as const;
export const ACTIVE_DAYS = 30;

export function fngCohorts(data: ExplorerData): FngCohort[] {
  const dates = postDates(data);
  const names = new Map(data.people.map((p) => [normalizeDataName(p.name), p]));
  const activeFrom = addDataDays(data.asOf, -(ACTIVE_DAYS - 1));
  const [asOfYear, asOfMonth] = data.asOf.split("-").map(Number);
  const earlyFrom = new Date(Date.UTC(asOfYear, asOfMonth - 2, 1))
    .toISOString()
    .slice(0, 7);
  const cohorts = new Map<string, FngFollowThrough[]>();
  for (const [key, first] of bedrockFngDates(data)) {
    // The FNG row itself counts as a post even if Post was left blank.
    const mine = [
      ...new Set([
        first.date,
        ...[...(dates.get(key) ?? [])].filter((d) => d >= first.date),
      ]),
    ].sort();
    const lastPost = mine.at(-1) ?? first.date;
    const person = names.get(key);
    const month = first.date.slice(0, 7);
    const list = cohorts.get(month) ?? [];
    list.push({
      name: person?.name ?? first.name,
      fngDate: first.date,
      posts: mine.length,
      lastPost,
      active: lastPost >= activeFrom,
      ehBy: person?.ehBy ?? null,
    });
    cohorts.set(month, list);
  }
  return [...cohorts.entries()]
    .map(([month, fngs]) => ({
      month,
      fngs: fngs.sort(
        (a, b) => b.posts - a.posts || a.name.localeCompare(b.name),
      ),
      early: month >= earlyFrom,
    }))
    .sort((a, b) => b.month.localeCompare(a.month));
}
export function fngTotals(fngs: FngFollowThrough[]) {
  return {
    count: fngs.length,
    returned: fngs.filter((f) => f.posts >= 2).length,
    ten: fngs.filter((f) => f.posts >= 10).length,
    active: fngs.filter((f) => f.active).length,
  };
}

export interface TreeNode {
  key: string;
  name: string;
  /** Distinct recorded post dates; 0 means no public attendance to link to. */
  posts: number;
  children: TreeNode[];
  /** Everyone below this node. */
  size: number;
}

/**
 * Roster EH'er links as written, matched by normalized name like the leaderboard.
 * Unmatched EH'er spellings become their own roots; nothing is inferred.
 */
export function familyTree(data: ExplorerData): TreeNode[] {
  const dates = postDates(data);
  const display = new Map<string, string>();
  const parent = new Map<string, string>();
  for (const p of data.people) {
    const key = normalizeDataName(p.name);
    display.set(key, p.name);
    if (!p.ehBy) continue;
    const by = normalizeDataName(p.ehBy);
    if (!by || by === key) continue;
    parent.set(key, by);
    if (!display.has(by)) display.set(by, p.ehBy.trim());
  }
  for (const p of data.people) display.set(normalizeDataName(p.name), p.name);
  const children = new Map<string, string[]>();
  for (const [child, by] of parent) {
    const list = children.get(by) ?? [];
    list.push(child);
    children.set(by, list);
  }
  const build = (key: string, path: Set<string>): TreeNode => {
    const next = new Set(path).add(key);
    const kids = (children.get(key) ?? [])
      .filter((k) => !next.has(k))
      .map((k) => build(k, next))
      .sort(
        (a, b) =>
          b.size - a.size || b.posts - a.posts || a.name.localeCompare(b.name),
      );
    return {
      key,
      name: display.get(key) ?? key,
      posts: dates.get(key)?.size ?? 0,
      children: kids,
      size: kids.reduce((sum, k) => sum + 1 + k.size, 0),
    };
  };
  // A root has no recorded EH'er; a loop of EH'ers is broken at its alphabetically first name.
  const inTree = new Set<string>();
  const roots: TreeNode[] = [];
  const add = (key: string) => {
    const node = build(key, new Set());
    const mark = (n: TreeNode) => {
      inTree.add(n.key);
      n.children.forEach(mark);
    };
    mark(node);
    roots.push(node);
  };
  for (const key of children.keys()) if (!parent.has(key)) add(key);
  for (const key of [...parent.keys()].sort())
    if (!inTree.has(key) && children.has(key)) add(key);
  return roots.sort((a, b) => b.size - a.size || a.name.localeCompare(b.name));
}
export function treeMatches(node: TreeNode, search: string): boolean {
  return (
    normalizeDataName(node.name).includes(search) ||
    node.children.some((c) => treeMatches(c, search))
  );
}

interface Activity {
  name: string;
  posts: number;
  qs: number;
  recent30: number;
  posts90: number;
  qs90: number;
  lastPost: string;
  lastQ: string;
  sites90: Map<string, number>;
}
function activity(data: ExplorerData) {
  const from30 = addDataDays(data.asOf, -29),
    from90 = addDataDays(data.asOf, -89);
  const people = new Map(
    data.people.map((p) => [normalizeDataName(p.name), p.name]),
  );
  const result = new Map<string, Activity>();
  for (const row of data.rows) {
    if (!row.post || row.date > data.asOf || !isPublicDataName(row.pax))
      continue;
    const key = normalizeDataName(row.pax);
    const a = result.get(key) ?? {
      name: people.get(key) ?? row.pax,
      posts: 0,
      qs: 0,
      recent30: 0,
      posts90: 0,
      qs90: 0,
      lastPost: "",
      lastQ: "",
      sites90: new Map(),
    };
    a.posts++;
    if (row.q) a.qs++;
    if (row.date > a.lastPost) a.lastPost = row.date;
    if (row.q && row.date > a.lastQ) a.lastQ = row.date;
    if (row.date >= from30) a.recent30++;
    if (row.date >= from90) {
      a.posts90++;
      if (row.q) a.qs90++;
      if (row.site) a.sites90.set(row.site, (a.sites90.get(row.site) ?? 0) + 1);
    }
    result.set(key, a);
  }
  return result;
}
const usualAO = (sites: Map<string, number>) =>
  [...sites.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0]?.[0] ?? "";

export const FIRST_Q = { minPosts: 10, minRecent: 2 } as const;
export const REGULAR_POSTS_90 = 13;

export interface FirstQCandidate {
  name: string;
  posts: number;
  recent30: number;
  lastPost: string;
  usualAO: string;
}
/** No recorded Q, 10+ posts, and 2+ posts in the last 30 days. Excludes 2.0s. */
export function firstQCandidates(data: ExplorerData): FirstQCandidate[] {
  return [...activity(data).entries()]
    .filter(
      ([key, a]) =>
        !key.includes("2.0") &&
        a.qs === 0 &&
        a.posts >= FIRST_Q.minPosts &&
        a.recent30 >= FIRST_Q.minRecent,
    )
    .map(([, a]) => ({
      name: a.name,
      posts: a.posts,
      recent30: a.recent30,
      lastPost: a.lastPost,
      usualAO: usualAO(a.sites90),
    }))
    .sort(
      (a, b) =>
        b.recent30 - a.recent30 ||
        b.posts - a.posts ||
        a.name.localeCompare(b.name),
    );
}

export interface RegularQRatio {
  name: string;
  posts90: number;
  qs90: number;
  ratio: number;
  lastQ: string;
}
/** Regulars posted 13+ times (about weekly) in the 90 days ending asOf. */
export function regularQRatios(data: ExplorerData): RegularQRatio[] {
  return [...activity(data).values()]
    .filter((a) => a.posts90 >= REGULAR_POSTS_90)
    .map((a) => ({
      name: a.name,
      posts90: a.posts90,
      qs90: a.qs90,
      ratio: (a.qs90 / a.posts90) * 100,
      lastQ: a.lastQ,
    }))
    .sort(
      (a, b) =>
        b.ratio - a.ratio || b.qs90 - a.qs90 || a.name.localeCompare(b.name),
    );
}

export type AoKind = "run" | "beatdown";
/** Run sites vs beatdowns as given by the region (Oct 2026). Unlisted AOs count as neither. */
const AO_KINDS: Record<string, AoKind> = {
  spartan: "beatdown",
  divento: "beatdown",
  pinnacle: "run",
  "rattlesnake ridge": "run",
  "grizzly bar": "beatdown",
  asylum: "beatdown",
  "great awakening": "beatdown",
  trailhead: "run",
  outpost: "beatdown",
  hilltop: "beatdown",
  excelsior: "beatdown",
};
export function aoKind(site: string): AoKind | null {
  return (
    AO_KINDS[
      site
        .trim()
        .toLowerCase()
        .replace(/^the\s+/, "")
    ] ?? null
  );
}
export const RUN_SITES = Object.keys(AO_KINDS).filter(
  (k) => AO_KINDS[k] === "run",
);
export const Q_MIX = { days: 365, runOnlyMin: 2, mixMin: 3 } as const;

export interface QMix {
  name: string;
  run: number;
  beatdown: number;
  /** Run-site share of run + beatdown Qs in the window. */
  runShare: number;
  lastRun: string;
  /** Most recent beatdown Q in all recorded attendance, or "". */
  lastBeatdown: string;
}
/** Qs at run sites vs beatdowns in the last 365 days ending asOf. */
export function qMix(data: ExplorerData) {
  const from = addDataDays(data.asOf, -(Q_MIX.days - 1));
  const people = new Map(
    data.people.map((p) => [normalizeDataName(p.name), p.name]),
  );
  const result = new Map<string, QMix>();
  const seen = new Set<string>();
  for (const row of data.rows) {
    if (!row.post || !row.q || row.date > data.asOf) continue;
    if (!isPublicDataName(row.pax)) continue;
    const kind = aoKind(row.site);
    if (!kind) continue;
    const key = normalizeDataName(row.pax);
    const id = `${key}\0${row.date}\0${row.site}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const m = result.get(key) ?? {
      name: people.get(key) ?? row.pax.trim(),
      run: 0,
      beatdown: 0,
      runShare: 0,
      lastRun: "",
      lastBeatdown: "",
    };
    if (kind === "beatdown" && row.date > m.lastBeatdown)
      m.lastBeatdown = row.date;
    if (row.date >= from) {
      if (kind === "run") {
        m.run++;
        if (row.date > m.lastRun) m.lastRun = row.date;
      } else m.beatdown++;
    }
    result.set(key, m);
  }
  const all = [...result.values()]
    .map((m) => ({
      ...m,
      runShare: m.run + m.beatdown ? (m.run / (m.run + m.beatdown)) * 100 : 0,
    }))
    .filter((m) => m.run + m.beatdown > 0);
  return {
    /** Led a run site at least twice and no beatdown in the window. */
    runOnly: all
      .filter((m) => m.run >= Q_MIX.runOnlyMin && m.beatdown === 0)
      .sort(
        (a, b) =>
          b.run - a.run ||
          b.lastRun.localeCompare(a.lastRun) ||
          a.name.localeCompare(b.name),
      ),
    mix: all
      .filter((m) => m.run + m.beatdown >= Q_MIX.mixMin)
      .sort(
        (a, b) =>
          b.runShare - a.runShare ||
          b.run - a.run ||
          a.name.localeCompare(b.name),
      ),
  };
}
