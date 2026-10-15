import { POINTS, type ChallengeResult, type FngEntry, type Period } from "./ehChallenge";

export const normalizePerson = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

export function personURL(name: string, period: Period): string {
  return `/eh-challenge/person/${encodeURIComponent(name)}?period=${period}`;
}

export function nextMilestone(posts: number) {
  const workout = posts < 1 ? 1 : posts < 2 ? 2 : posts < 5 ? 5 : posts + 1;
  const points = workout === 1 ? POINTS.firstPost : workout === 2 ? POINTS.secondPost : workout === 5 ? POINTS.fifthPost : POINTS.afterFifth;
  return { workout, points, remaining: workout - posts };
}

export function buildPersonProfile(data: ChallengeResult, name: string) {
  const key = normalizePerson(name);
  const standing = data.leaderboard.find((p) => normalizePerson(p.name) === key);
  const ownFng = data.fngs.find((p) => normalizePerson(p.name) === key);
  if (!standing && !ownFng) return null;
  const recruits = data.fngs.filter((p) => p.ehBy && normalizePerson(p.ehBy) === key);
  const returned = recruits.filter((p) => p.posts >= 2).length;
  const regulars = recruits.filter((p) => p.posts >= 5).length;
  const referralPoints = standing?.breakdown?.referrals ?? 0;
  const badges = [
    ...(ownFng ? [
      { name: "First workout", description: "Posted a first Bedrock workout", earned: ownFng.posts >= 1 },
      { name: "Five and counting", description: "Reached 5 workouts as an FNG", earned: ownFng.posts >= 5 },
    ] : []),
    { name: "First EH", description: "Invited at least 1 FNG", earned: recruits.length >= 1 },
    { name: "Crew builder", description: "Invited at least 3 FNGs", earned: recruits.length >= 3 },
    { name: "Back for more", description: "An invited FNG posted twice", earned: returned >= 1 },
    { name: "Habit builder", description: "An invited FNG reached 5 workouts", earned: regulars >= 1 },
    ...(data.scoringEnabled ? [
      { name: "Ripple effect", description: "Earned a referral bonus", earned: referralPoints > 0 },
      { name: "Century club", description: "Earned at least 100 points", earned: (standing?.total ?? 0) >= 100 },
    ] : []),
  ];
  return {
    name: standing?.name ?? ownFng!.name,
    standing,
    ownFng,
    recruits,
    returned,
    regulars,
    badges,
    // Put the shortest path to the next points milestone first.
    nextSteps: [...recruits].sort((a, b) => nextMilestone(a.posts).remaining - nextMilestone(b.posts).remaining || a.posts - b.posts || a.name.localeCompare(b.name)),
  };
}

export function matchesPerson(person: Pick<FngEntry, "name" | "ehBy">, query: string): boolean {
  const needle = normalizePerson(query);
  return normalizePerson(person.name).includes(needle) || (person.ehBy ? normalizePerson(person.ehBy).includes(needle) : false);
}
