// Every page view the chat can link to, and the check that keeps answers to real, working in-app links.

export interface PageLink {
  href: string;
  label: string;
}

/** Real PAX and AO names, so a link can't open a profile or AO that doesn't exist. */
export interface LinkNames {
  pax: string[];
  aos: string[];
}

type Kind = "pax" | "ao" | "text" | RegExp | string[];
interface Param {
  kind: Kind;
  doc: string;
  /** Can appear more than once (Trends compares up to four AOs). */
  repeat?: number;
}
interface Route {
  about: string;
  params: Record<string, Param>;
  /** Section headings a #hash scrolls to. */
  sections: Record<string, string>;
}

const YEAR = /^20\d{2}$/;
const DATE = /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH = /^20\d{2}-(0[1-9]|1[0-2])$/;
const METRIC = ["average", "posts", "pax", "workouts"];

/** Mirrors what each page reads from its URL; keep in step with the pages. */
export const LINK_ROUTES: Record<string, Route> = {
  "/data": {
    about: "PAX stats table, Kotter lists, monthly AO totals, raw attendance rows, and PAX profiles",
    params: {
      view: { kind: ["pax", "qsource", "kotter", "qkotter", "aos", "raw"], doc: "pax (default) | qsource | kotter | qkotter | aos (monthly AO totals) | raw (attendance rows)" },
      period: { kind: ["all", "year", "month", "custom"], doc: "all | year (with year) | month (with year, month) | custom (with from, to)" },
      year: { kind: YEAR, doc: "YYYY" },
      month: { kind: /^(0[1-9]|1[0-2])$/, doc: "MM" },
      from: { kind: DATE, doc: "YYYY-MM-DD" },
      to: { kind: DATE, doc: "YYYY-MM-DD" },
      site: { kind: "ao", doc: "an AO" },
      region: { kind: ["bedrock", "other"], doc: "bedrock | other" },
      flags: { kind: /^(post|q|fng|qs|qsq)(,(post|q|fng|qs|qsq))*$/, doc: "comma list of post,q,fng,qs,qsq (raw rows with those marks)" },
      search: { kind: "text", doc: "name filter" },
      pax: { kind: "pax", doc: "opens that PAX's profile" },
      pview: { kind: ["month", "year", "trend"], doc: "profile attendance view: month calendar | year | trend over time" },
      pmonth: { kind: MONTH, doc: "profile calendar month YYYY-MM" },
      pyear: { kind: YEAR, doc: "profile year view YYYY" },
      rel: { kind: ["with", "by", "led"], doc: "profile people list: with (posted with most) | by (Q'd by most) | led (Q'd most)" },
      prange: { kind: /^(recent|\d*00|0)$/, doc: "profile people list range: recent (last 100 posts) | 0, 100, 200… (posts 1–100, 101–200…)" },
      jump: { kind: ["results"], doc: "results = open scrolled to the table rows" },
    },
    sections: {
      "calendar-heading": "profile attendance calendar and charts",
      "pax-aos-heading": "profile posts by AO",
      "companions-heading": "profile people list",
      "post-milestones-heading": "profile 100-post milestones",
    },
  },
  "/data/trends": {
    about: "region attendance graphs, AO growth, turnout by weekday, and the weekly AO heatmap",
    params: {
      weeks: { kind: ["13", "26", "52"], doc: "13 | 26 | 52" },
      metric: { kind: METRIC, doc: "average | posts | pax | workouts" },
      ao: { kind: "ao", doc: "AO to compare; repeat up to 4", repeat: 4 },
    },
    sections: {
      "attendance-trend-heading": "trend chart",
      "ao-growth-heading": "AO growth",
      "weekday-heading": "turnout by weekday",
      "attendance-map-heading": "weekly turnout by AO",
    },
  },
  "/data/aos": {
    about: "AO list, or one AO's trend, people, FNGs, weekday turnout, and year over year",
    params: {
      ao: { kind: "ao", doc: "opens that AO" },
      weeks: { kind: ["13", "26", "52", "all"], doc: "13 | 26 | 52 | all" },
      metric: { kind: METRIC, doc: "average | posts | pax | workouts" },
      vs: { kind: "ao", doc: "second AO to compare" },
      chart: { kind: ["yoy"], doc: "yoy = year-over-year chart" },
      year: { kind: YEAR, doc: "year for the yoy chart" },
      list: { kind: ["pax", "qs", "draw", "biggest"], doc: "people list: pax (top PAX) | qs (top Qs) | draw (Qs who draw the most) | biggest (biggest workouts)" },
    },
    sections: {
      "active-aos-heading": "AO list",
      "ao-chart-heading": "AO chart",
      "ao-people-heading": "AO people lists",
      "ao-fngs-heading": "FNGs who started at the AO",
      "ao-weekday-heading": "AO turnout by day",
    },
  },
  "/data/community": {
    about: "FNG follow-through, the EH family tree, and Q leadership",
    params: {
      tab: { kind: ["fngs", "tree", "q"], doc: "fngs (default) | tree | q" },
      search: { kind: "text", doc: "family tree name search (tab=tree)" },
    },
    sections: {
      "fng-months-heading": "FNGs by month",
      "family-tree-heading": "family tree",
      "first-q-heading": "ready for a first Q",
      "q-ratio-heading": "Q ratio among regulars",
      "run-only-heading": "run-site Qs, no beatdown yet",
      "q-mix-heading": "Q mix: run sites vs beatdowns",
    },
  },
  "/data/milestones": {
    about: "post milestone forecasts and milestones reached",
    params: {
      mode: { kind: ["forecast", "reached", "unprojected"], doc: "forecast | reached | unprojected" },
      step: { kind: ["100", "500", "1000"], doc: "100 | 500 | 1000 (default: 100s to 500, then every 500)" },
      horizon: { kind: ["30", "90", "180", "all"], doc: "days ahead or back: 30 | 90 | 180 | all" },
      region: { kind: ["bedrock", "other", "unknown"], doc: "bedrock | other | unknown" },
      search: { kind: "text", doc: "name filter" },
      sort: { kind: ["soonest", "remaining"], doc: "soonest | remaining" },
    },
    sections: { "milestone-timeline-heading": "milestone timeline" },
  },
  "/eh-challenge": {
    about: "EH Challenge leaderboard and FNG list",
    params: {
      period: { kind: ["challenge", "year"], doc: "challenge (Oct 15–Dec 31 points) | year (annual FNG invitations)" },
      sort: { kind: ["points", "fngs"], doc: "points | fngs" },
      search: { kind: "text", doc: "PAX or EH'er name" },
    },
    sections: { "eh-standings-heading": "standings", "eh-fngs-heading": "FNG list" },
  },
  "/eh-challenge/person/<PAX>": {
    about: "one PAX's EH Challenge page: points, badges, next steps, FNGs invited",
    params: { period: { kind: ["challenge", "year"], doc: "challenge | year" } },
    sections: {
      "next-steps-heading": "next steps",
      "badges-heading": "badges",
      "own-workouts-heading": "his first Bedrock workouts",
      "recruits-heading": "FNGs he invited",
    },
  },
  "/eh-challenge/points": { about: "how EH Challenge points are earned", params: {}, sections: {} },
};

/** Starting points worth naming even without a lookup. */
export const DATA_PAGES: PageLink[] = [
  { href: "/data?period=all", label: "PAX stats" },
  { href: "/data?view=kotter&period=all", label: "Kotter List" },
  { href: "/data?view=qkotter&period=all", label: "Q Kotter List" },
  { href: "/data?view=qsource&period=all", label: "Qsource" },
  { href: "/data?view=aos", label: "Monthly AO totals" },
  { href: "/data/trends", label: "Attendance trends" },
  { href: "/data/aos", label: "AO pages" },
  { href: "/data/community", label: "FNG follow-through" },
  { href: "/data/community?tab=q", label: "Q leaders" },
  { href: "/data/community?tab=tree", label: "EH family tree" },
  { href: "/data/milestones", label: "Milestones" },
  { href: "/eh-challenge", label: "EH Challenge standings" },
  { href: "/eh-challenge/points", label: "EH Challenge points guide" },
];

export const PAGES_PROMPT = Object.entries(LINK_ROUTES)
  .map(([path, r]) => {
    const params = Object.entries(r.params).map(([k, p]) => `  ${k}=${p.doc}`);
    const sections = Object.entries(r.sections).map(([id, about]) => `#${id} (${about})`);
    return [`${path} — ${r.about}`, ...params, ...(sections.length ? [`  sections: ${sections.join(", ")}`] : [])].join("\n");
  })
  .join("\n");

const BASE = "https://bedrock.local";
const squash = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
function canonical(value: string, names: string[]) {
  const key = squash(value);
  return names.find((n) => squash(n) === key);
}

/**
 * The working form of an in-app link, or null if any part of it isn't something the page understands:
 * an unknown path, parameter, value, PAX, AO, or section. PAX and AO names are corrected to their real spelling.
 * Without names (tests, no data), PAX and AO values are accepted as written.
 */
export function checkPageLink(href: string, names?: LinkNames): string | null {
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  let url: URL;
  try { url = new URL(href, BASE); } catch { return null; }
  if (url.origin !== BASE) return null;
  let path = url.pathname.replace(/\/+$/, "") || "/";
  let route = LINK_ROUTES[path];
  if (!route && path.startsWith("/eh-challenge/person/")) {
    let person: string;
    try { person = decodeURIComponent(path.slice("/eh-challenge/person/".length)); } catch { return null; }
    const name = names ? canonical(person, names.pax) : person.trim() || undefined;
    if (!name || name.includes("/")) return null;
    path = "/eh-challenge/person/" + encodeURIComponent(name);
    route = LINK_ROUTES["/eh-challenge/person/<PAX>"];
  }
  if (!route) return null;
  const out = new URLSearchParams();
  const counts = new Map<string, number>();
  for (const [key, raw] of url.searchParams) {
    const param = route.params[key];
    if (!param) return null;
    const count = (counts.get(key) ?? 0) + 1;
    if (count > (param.repeat ?? 1)) return null;
    counts.set(key, count);
    const value = checkValue(param.kind, raw, names);
    if (value === null) return null;
    out.append(key, value);
  }
  const section = decodeURIComponent(url.hash.slice(1));
  if (section && !(section in route.sections)) return null;
  const query = out.toString();
  return path + (query ? "?" + query : "") + (section ? "#" + section : "");
}

function checkValue(kind: Kind, raw: string, names?: LinkNames): string | null {
  if (kind === "text") return raw.trim() && raw.length <= 200 ? raw : null;
  if (kind === "pax" || kind === "ao") {
    if (!names) return raw.trim() ? raw : null;
    return canonical(raw, kind === "pax" ? names.pax : names.aos) ?? null;
  }
  if (Array.isArray(kind)) return kind.includes(raw) ? raw : null;
  return kind.test(raw) ? raw : null;
}

/** A readable button label for a lookup link, used when the answer itself names no page. */
export function pageLabel(href: string): string {
  const url = new URL(href, BASE);
  const q = url.searchParams;
  const ao = q.get("ao");
  if (url.pathname === "/data" && q.get("pax")) {
    const rel = q.get("rel");
    return `${q.get("pax")}'s ${rel === "by" ? "Qs received" : rel === "led" ? "Qs led" : rel === "with" ? "workout partners" : "profile"}`;
  }
  if (url.pathname === "/data" && q.get("view") === "raw") return q.get("site") ? `${q.get("site")} attendance records` : "Attendance records";
  if (url.pathname === "/data/aos" && ao) {
    if (q.get("vs")) return `${ao} vs ${q.get("vs")}`;
    if (q.get("chart") === "yoy") return `${ao} year over year`;
    const list = { qs: "top Qs", draw: "best-draw Qs", biggest: "biggest workouts", pax: "top PAX" }[q.get("list") ?? ""];
    return list ? `${ao} ${list}` : `${ao} AO page`;
  }
  if (url.pathname === "/data/trends" && q.getAll("ao").length) return `${q.getAll("ao").join(" vs ")} trends`;
  if (url.pathname.startsWith("/eh-challenge/person/"))
    return `${decodeURIComponent(url.pathname.split("/").pop() ?? "")}'s EH Challenge page`;
  const same = (p: PageLink) => {
    const u = new URL(p.href, BASE);
    return u.pathname === url.pathname && (q.get("view") ?? "") === (u.searchParams.get("view") ?? "")
      && (q.get("tab") ?? "") === (u.searchParams.get("tab") ?? "");
  };
  return DATA_PAGES.find(same)?.label ?? "Open page";
}

const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
/** Separators that can sit between links on a links-only last line. */
const JOINERS = /^[\s·•|,;:–—\-→>]*(?:and|or)?[\s·•|,;:–—\-→>]*$/i;
const MAX_PAGES = 3;

/**
 * Keeps in-app links that a lookup returned or that check out against LINK_ROUTES (in their working form),
 * and turns any other in-app link into plain text. A last line of nothing but links becomes the answer's
 * page buttons (outside links there are dropped); with none, the first lookup link is suggested.
 */
export function finalizeLinks(answer: string, toolLinks: string[], names?: LinkNames): { answer: string; pages: PageLink[] } {
  const trusted = new Set(toolLinks);
  const fix = (href: string) => (trusted.has(href) ? href : checkPageLink(href, names));
  const lines = answer.trimEnd().split("\n");
  let last = lines.length - 1;
  while (last >= 0 && !lines[last].trim()) last--;
  const tail = last >= 0 ? lines[last] : "";
  const tailLinks = [...tail.matchAll(LINK)];
  let pages: PageLink[] = [];
  let body = answer;
  if (last > 0 && tailLinks.length && JOINERS.test(tail.replace(LINK, " "))) {
    pages = tailLinks.flatMap((m) => {
      const href = fix(m[2]);
      return href ? [{ href, label: buttonLabel(m[1]) }] : [];
    });
    body = lines.slice(0, last).join("\n").replace(/\n+-{3,}\s*$/, "");
  }
  body = body.replace(LINK, (whole, text: string, href: string) => {
    if (!href.startsWith("/")) return whole;
    const fixed = fix(href);
    return fixed ? `[${text}](${fixed})` : text;
  }).trim();
  if (!pages.length && toolLinks.length) pages = [{ href: toolLinks[0], label: pageLabel(toolLinks[0]) }];
  const seen = new Set<string>();
  pages = pages.filter((p) => !seen.has(p.href) && seen.add(p.href)).slice(0, MAX_PAGES);
  return { answer: body, pages };
}

function buttonLabel(text: string) {
  const label = text.replace(/\*+/g, "").replace(/^(open|see|view|go to)\s+(the\s+)?/i, "").trim();
  return label ? label[0].toUpperCase() + label.slice(1) : "Open page";
}
