// Pages the chat can suggest, and the check that keeps answers to real in-app links.

export interface PageLink {
  href: string;
  label: string;
}

/** General pages the chat may suggest without a lookup; specific PAX/AO links come from tool results. */
export const DATA_PAGES: (PageLink & { about: string })[] = [
  { href: "/data?period=all", label: "PAX stats", about: "every PAX's posts, Qs, and first and last post; tap a name for a profile" },
  { href: "/data?view=kotter&period=all", label: "Kotter List", about: "PAX who haven't posted in 15–364 days" },
  { href: "/data?view=qkotter&period=all", label: "Q Kotter List", about: "PAX who haven't Q'd in a while" },
  { href: "/data?view=qsource&period=all", label: "Qsource", about: "Qsource posts and Qs" },
  { href: "/data?view=aos", label: "Monthly AO totals", about: "posts per AO by month" },
  { href: "/data/trends", label: "Attendance trends", about: "region graphs, AO comparisons, and the weekday heatmap" },
  { href: "/data/aos", label: "AO pages", about: "one AO's trend, top PAX, Qs, growth, and year over year" },
  { href: "/data/community", label: "FNG follow-through", about: "how each month's FNGs came back" },
  { href: "/data/community?tab=q", label: "Q leaders", about: "Q counts, first-Q candidates, and run vs beatdown Qs" },
  { href: "/data/community?tab=tree", label: "EH family tree", about: "who EH'd whom, from the Roster" },
  { href: "/data/milestones", label: "Milestones", about: "post milestone forecasts and milestones reached" },
  { href: "/eh-challenge", label: "EH Challenge standings", about: "leaderboard points and FNGs" },
  { href: "/eh-challenge/points", label: "EH Challenge points guide", about: "how points are earned" },
];

export const PAGES_PROMPT = DATA_PAGES.map((p) => `- ${p.href} — ${p.label}: ${p.about}`).join("\n");

/** A readable button label for a tool link, used when the answer itself names no page. */
export function pageLabel(href: string): string {
  const url = new URL(href, "https://bedrock.local");
  const q = url.searchParams;
  if (url.pathname === "/data" && q.get("pax")) return `${q.get("pax")}'s profile`;
  if (url.pathname === "/data" && q.get("view") === "raw") return q.get("site") ? `${q.get("site")} attendance records` : "Attendance records";
  if (url.pathname === "/data/aos" && q.get("ao")) return q.get("vs") ? `${q.get("ao")} vs ${q.get("vs")}` : `${q.get("ao")} AO page`;
  if (url.pathname.startsWith("/eh-challenge/person/"))
    return `${decodeURIComponent(url.pathname.split("/").pop() ?? "")}'s EH Challenge page`;
  const match = DATA_PAGES.find((p) => p.href === href)
    ?? DATA_PAGES.find((p) => new URL(p.href, "https://bedrock.local").pathname === url.pathname
      && (q.get("view") ?? "") === (new URL(p.href, "https://bedrock.local").searchParams.get("view") ?? "")
      && (q.get("tab") ?? "") === (new URL(p.href, "https://bedrock.local").searchParams.get("tab") ?? ""));
  return match?.label ?? "Open page";
}

const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
/** Separators that can sit between links on a links-only last line. */
const JOINERS = /^[\s·•|,;:–—\-→>]*(?:and|or)?[\s·•|,;:–—\-→>]*$/i;
const MAX_PAGES = 3;

/**
 * Keeps only in-app links a lookup returned or the page directory lists, turning any other link into plain text.
 * A last line of nothing but links becomes the answer's page buttons (outside links there are dropped);
 * with none, the first lookup link is suggested.
 */
export function finalizeLinks(answer: string, toolLinks: string[]): { answer: string; pages: PageLink[] } {
  const allowed = new Set([...toolLinks, ...DATA_PAGES.map((p) => p.href)]);
  const lines = answer.trimEnd().split("\n");
  let last = lines.length - 1;
  while (last >= 0 && !lines[last].trim()) last--;
  const tail = last >= 0 ? lines[last] : "";
  const tailLinks = [...tail.matchAll(LINK)];
  let pages: PageLink[] = [];
  let body = answer;
  if (last > 0 && tailLinks.length && JOINERS.test(tail.replace(LINK, " "))) {
    pages = tailLinks.filter((m) => allowed.has(m[2])).map((m) => ({ href: m[2], label: buttonLabel(m[1]) }));
    body = lines.slice(0, last).join("\n").replace(/\n+-{3,}\s*$/, "");
  }
  body = body.replace(LINK, (whole, text: string, href: string) => (href.startsWith("/") && !allowed.has(href) ? text : whole)).trim();
  if (!pages.length && toolLinks.length) pages = [{ href: toolLinks[0], label: pageLabel(toolLinks[0]) }];
  const seen = new Set<string>();
  pages = pages.filter((p) => !seen.has(p.href) && seen.add(p.href)).slice(0, MAX_PAGES);
  return { answer: body, pages };
}

function buttonLabel(text: string) {
  const label = text.replace(/\*+/g, "").replace(/^(open|see|view|go to)\s+(the\s+)?/i, "").trim();
  return label ? label[0].toUpperCase() + label.slice(1) : "Open page";
}
