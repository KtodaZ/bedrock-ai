import {
  daysBetween,
  isPublicDataName,
  normalizeDataName,
  type ExplorerData,
} from "./dataExplorer";

/** "major" is 100, 500, then every 500 (1,000, 1,500, 2,000…). */
export type MilestoneStep = "major" | 100 | 500 | 1000;
export type MilestoneTier = "hundred" | "five-hundred" | "thousand";
export interface MilestoneForecast {
  name: string;
  region: string;
  posts: number;
  target: number;
  remaining: number;
  firstPost: string;
  lastPost: string;
  recentPosts: number;
  postsPerWeek: number;
  projected: string | null;
  earliest: string | null;
  latest: string | null;
  reason: string | null;
  tier: MilestoneTier;
}
export interface ReachedMilestone {
  name: string;
  region: string;
  target: number;
  date: string;
  tier: MilestoneTier;
}
export function nextPostMilestone(posts: number, step: MilestoneStep = 100) {
  const n = Math.max(0, posts);
  if (step === "major")
    return n < 100 ? 100 : n < 500 ? 500 : (Math.floor(n / 500) + 1) * 500;
  return (Math.floor(n / step) + 1) * step;
}
export function milestoneTier(target: number): MilestoneTier {
  return target % 1000 === 0
    ? "thousand"
    : target % 500 === 0
      ? "five-hundred"
      : "hundred";
}
export function addDataDays(date: string, days: number) {
  return new Date(Date.parse(date) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function mondayOf(date: string) {
  const day = new Date(date + "T00:00:00Z").getUTCDay();
  return addDataDays(date, -(day + 6) % 7);
}

/** Deterministic pace projection; never calls AI or changes milestone scoring. */
export function buildMilestones(data: ExplorerData, step: MilestoneStep = 100) {
  const groups = new Map<string, string[]>();
  const names = new Map(data.people.map((p) => [normalizeDataName(p.name), p]));
  const spelling = new Map<string, string>();
  for (const row of data.rows) {
    if (!row.post || !isPublicDataName(row.pax) || row.date > data.asOf)
      continue;
    const key = normalizeDataName(row.pax),
      dates = groups.get(key) ?? [];
    dates.push(row.date);
    groups.set(key, dates);
    if (!spelling.has(key)) spelling.set(key, row.pax);
  }
  const forecasts: MilestoneForecast[] = [],
    reached: ReachedMilestone[] = [];
  const start90 = addDataDays(data.asOf, -89),
    start30 = addDataDays(data.asOf, -29);
  for (const [key, dates] of groups) {
    dates.sort();
    const person = names.get(key),
      name = person?.name ?? spelling.get(key)!,
      region = person?.region ?? "";
    const posts = dates.length,
      target = nextPostMilestone(posts, step),
      remaining = target - posts;
    const firstPost = dates[0],
      lastPost = dates.at(-1)!;
    const observationDays = Math.min(90, daysBetween(firstPost, data.asOf) + 1);
    const count90 = dates.filter((d) => d >= start90).length,
      count30 = dates.filter((d) => d >= start30).length;
    const pace90 = count90 / observationDays,
      pace30 = count30 / Math.min(30, observationDays);
    const reason =
      observationDays < 14
        ? "Less than 14 days of recorded history"
        : count90 < 4
          ? "Fewer than 4 posts in the last 90 days"
          : lastPost < start30
            ? "No posts in the last 30 days"
            : null;
    const dateAt = (rate: number) =>
      addDataDays(data.asOf, Math.ceil(remaining / rate));
    forecasts.push({
      name,
      region,
      posts,
      target,
      remaining,
      firstPost,
      lastPost,
      recentPosts: count90,
      postsPerWeek: pace90 * 7,
      projected: reason ? null : dateAt(pace90),
      earliest: reason ? null : dateAt(Math.max(pace30, pace90)),
      latest: reason ? null : dateAt(Math.min(pace30, pace90)),
      reason,
      tier: milestoneTier(target),
    });
    for (
      let milestone = nextPostMilestone(0, step);
      milestone <= posts;
      milestone = nextPostMilestone(milestone, step)
    )
      reached.push({
        name,
        region,
        target: milestone,
        date: dates[milestone - 1],
        tier: milestoneTier(milestone),
      });
  }
  forecasts.sort(
    (a, b) =>
      (a.projected ?? "9999").localeCompare(b.projected ?? "9999") ||
      a.remaining - b.remaining ||
      a.name.localeCompare(b.name),
  );
  reached.sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      b.target - a.target ||
      a.name.localeCompare(b.name),
  );
  return { forecasts, reached };
}
export interface MilestoneWeek {
  week: string;
  total: number;
  hundreds: number;
  fiveHundreds: number;
  thousands: number;
}
export function milestoneWeeks(
  forecasts: MilestoneForecast[],
  asOf: string,
  days: number,
): MilestoneWeek[] {
  const first = mondayOf(asOf),
    end = addDataDays(asOf, days);
  const weeks: MilestoneWeek[] = [];
  for (let week = first; week <= end; week = addDataDays(week, 7)) {
    const matching = forecasts.filter(
      (f) =>
        f.projected && f.projected <= end && mondayOf(f.projected) === week,
    );
    weeks.push({
      week,
      total: matching.length,
      hundreds: matching.filter((f) => f.tier === "hundred").length,
      fiveHundreds: matching.filter((f) => f.tier === "five-hundred").length,
      thousands: matching.filter((f) => f.tier === "thousand").length,
    });
  }
  return weeks;
}
