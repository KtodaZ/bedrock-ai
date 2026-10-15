import type { ChallengeResult, Period } from "./ehChallenge";

export async function fetchChallenge(period: Period): Promise<ChallengeResult> {
  const res = await fetch(`/api/eh-challenge?period=${period}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to load");
  return data;
}
