"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchChallenge } from "@/lib/challenge-client";
import { buildPersonProfile, nextMilestone, personURL } from "@/lib/ehProfile";
import { formatDay, PERIODS, PERIOD_LABELS, type FngEntry, type Period } from "@/lib/ehChallenge";
import { useLinkedSection } from "@/lib/useLinkedSection";
import EhCorrectionForm from "./EhCorrectionForm";

const periodLabel = PERIOD_LABELS;
const focus = "rounded focus-visible:outline-2 focus-visible:outline-violet-400 focus-visible:outline-offset-4";

function Medal({ earned }: { earned: boolean }) {
  return <svg viewBox="0 0 24 28" fill="none" aria-hidden="true" className={`w-6 h-7 shrink-0 ${earned ? "text-violet-300" : "text-white/35"}`}><path d="m5 16-2 10 9-4 9 4-2-10" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><circle cx="12" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.5" /><path d={earned ? "m8 10 3 3 5-6" : "M9 10h6"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function Milestone({ fng, scoring }: { fng: FngEntry; scoring: boolean }) {
  const next = nextMilestone(fng.posts);
  return <div className="mt-2">
    <div className="flex gap-1" aria-label={`${fng.posts} workouts completed`}>
      {[1, 2, 3, 4, 5].map((n) => <span key={n} className={`flex-1 h-1.5 rounded-full ${fng.posts >= n ? "bg-violet-400" : "bg-white/10"}`} />)}
    </div>
    <p className="text-xs text-violet-100/75 mt-2">{next.remaining} workout{next.remaining === 1 ? "" : "s"} to #{next.workout}{scoring && <> · +{next.points} next</>}</p>
  </div>;
}

export default function PersonDetail({ name, period }: { name: string; period: Period }) {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["eh-challenge", period], queryFn: () => fetchChallenge(period), staleTime: 5 * 60 * 1000 });
  useLinkedSection(Boolean(data));
  const profile = data ? buildPersonProfile(data, name) : null;
  const scoring = period === "challenge";
  const back = <Link href={`/eh-challenge?period=${period}`} className={`inline-flex items-center min-h-11 text-sm text-violet-300 hover:text-violet-200 ${focus}`}>← Leaderboard</Link>;
  if (isLoading) return <main className="max-w-3xl mx-auto px-4 py-6">{back}<p role="status" className="text-white/70 mt-6">Loading person…</p></main>;
  if (error || !data) return <main className="max-w-3xl mx-auto px-4 py-6">{back}<p role="alert" className="mt-6 text-red-200">Couldn&apos;t load this person.</p><button onClick={() => refetch()} className={`text-violet-300 min-h-11 underline ${focus}`}>Try again</button></main>;
  if (!profile) return <main className="max-w-3xl mx-auto px-4 py-6">{back}<h1 className="text-2xl font-bold mt-6 break-words">{name}</h1><p className="text-white/70 mt-3">No EH Challenge activity for this person in this period.</p>{scoring && <Link href={personURL(name, "year")} className={`inline-flex items-center min-h-11 mt-4 text-violet-300 underline ${focus}`}>View This Year</Link>}</main>;
  const { standing, recruits, ownFng, badges, nextSteps } = profile;
  const earned = badges.filter((b) => b.earned);
  const breakdown = standing?.breakdown ?? { workouts: 0, referrals: 0, themes: 0 };

  return <main className="max-w-3xl w-full mx-auto px-4 py-5 sm:py-8">
    {back}
    <header className="mt-4 pb-6 border-b border-white/10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-3xl font-bold text-white break-words min-w-0">{profile.name}</h1>
        <nav aria-label="Person view period" className="flex flex-wrap gap-1">
          {PERIODS.map((p) => <Link key={p} href={personURL(profile.name, p)} aria-current={period === p ? "page" : undefined} className={`px-3 min-h-11 inline-flex items-center text-xs rounded-lg ${focus} ${period === p ? "bg-violet-500/20 text-violet-200" : "text-white/70 hover:bg-white/5"}`}>{periodLabel[p]}</Link>)}
        </nav>
      </div>
      <p className="text-sm text-white/65 mt-2">{formatDay(data.start)} – {formatDay(data.end)} · {periodLabel[period].toLowerCase()}</p>
      <dl className={`grid ${scoring ? "grid-cols-3" : "grid-cols-2"} gap-4 mt-6`}>
        {[...(scoring ? [{ label: "Points earned", value: standing?.total ?? 0 }] : []), { label: "FNGs invited", value: recruits.length }, { label: "Came back", value: profile.returned }].map((s) => <div key={s.label}><dt className="text-xs text-white/65">{s.label}</dt><dd className="text-3xl font-semibold tabular-nums text-white mt-1">{s.value}</dd></div>)}
      </dl>
      {scoring ? <p className="text-xs text-white/65 mt-4">{breakdown.workouts} workout pts · {breakdown.referrals} referral pts · {breakdown.themes} theme pts{standing?.week ? ` · +${standing.week} this week` : ""}</p> : <p className="text-xs text-white/65 mt-4">FNG stats only. Competition points appear in the 2026 Challenge view.</p>}
    </header>

    <div className="mt-5"><EhCorrectionForm pax={profile.name} /></div>

    <section aria-labelledby="next-steps-heading" className="mt-7">
      <h2 id="next-steps-heading" className="text-lg font-semibold text-white">Next steps</h2>
      <p className="text-sm text-white/65 mt-1">{scoring ? "Who to invite back and which workout earns points next." : "Who to invite back for the next workout milestone."}</p>
      <ul className="divide-y divide-white/10 mt-3">
        {nextSteps.slice(0, 3).map((fng) => {
          const next = nextMilestone(fng.posts);
          return <li key={fng.name} className="py-4 flex items-start gap-3"><svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-violet-300 shrink-0 mt-0.5" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg><div className="min-w-0"><p className="text-sm text-white/90">Invite <Link href={personURL(fng.name, period)} className={`text-violet-300 underline underline-offset-4 ${focus}`}>{fng.name}</Link> back for workout #{fng.posts + 1}.</p><p className="text-xs text-white/65 mt-1 leading-relaxed">{!scoring ? `Next milestone: workout #${next.workout}, after ${next.remaining} more workout${next.remaining === 1 ? "" : "s"}.` : next.remaining === 1 ? `That next workout earns ${profile.name} +${next.points} points.` : `After ${next.remaining} more workouts, #${next.workout} earns ${profile.name} +${next.points} points.`}{fng.lastPost ? ` Last post ${formatDay(fng.lastPost)}.` : ""}</p></div></li>;
        })}
        <li className="py-4 text-sm text-white/85">{recruits.length ? "Invite someone new to a Bedrock workout." : "Bring a new guy to a Bedrock workout."}<span className="block text-xs text-white/65 mt-1">{scoring && "A first workout earns +5. "}Make sure the Roster records the EH&apos;er.</span></li>
      </ul>
    </section>

    <section aria-labelledby="badges-heading" className="mt-7 border-t border-white/10 pt-6">
      <h2 id="badges-heading" className="text-lg font-semibold text-white">Badges <span className="text-sm font-normal text-white/65">{earned.length} / {badges.length}</span></h2>
      <p className="text-xs text-white/65 mt-1">Earned from the selected period&apos;s activity. Badges don&apos;t add points.</p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-4">
        {badges.map((badge) => <li key={badge.name} className="flex gap-3 py-3"><Medal earned={badge.earned} /><div><div className={`text-sm font-semibold ${badge.earned ? "text-violet-200" : "text-white/65"}`}>{badge.name}<span className="text-xs font-normal ml-2 text-white/65">{badge.earned ? "Earned" : "Not yet"}</span></div><p className="text-xs text-white/65 mt-1">{badge.description}</p></div></li>)}
      </ul>
    </section>

    {ownFng && <section aria-labelledby="own-workouts-heading" className="mt-7 border-t border-white/10 pt-6">
      <h2 id="own-workouts-heading" className="text-lg font-semibold text-white">First workouts in Bedrock</h2>
      <p className="text-sm text-white/80 mt-3">Joined {new Date(`${ownFng.firstPost}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} · {ownFng.posts} workouts{scoring && <> · {ownFng.points} workout points</>}{ownFng.ehBy ? <> · invited by <Link className={`text-violet-300 underline ${focus}`} href={personURL(ownFng.ehBy, period)}>{ownFng.ehBy}</Link></> : " awaiting an EH’er"}.</p>
      <Milestone fng={ownFng} scoring={scoring} />
      {!ownFng.ehBy && <p className="mt-3 text-sm text-amber-200">Know who invited him? Use “Suggest an EH correction” above to send the name for maintainer review.</p>}
    </section>}

    <section aria-labelledby="recruits-heading" className="mt-7 border-t border-white/10 pt-6">
      <h2 id="recruits-heading" className="text-lg font-semibold text-white">FNGs invited <span className="text-sm font-normal text-white/65">{recruits.length}</span></h2>
      {recruits.length ? <ul className="divide-y divide-white/10 mt-2">{recruits.map((fng) => <li key={fng.name} className="py-4"><div className="flex items-baseline justify-between gap-3"><Link href={personURL(fng.name, period)} className={`font-medium text-violet-200 hover:underline break-words ${focus}`}>{fng.name}</Link><span className="text-sm text-white/85 shrink-0 tabular-nums">{scoring ? `${fng.points} pts` : `${fng.posts} workout${fng.posts === 1 ? "" : "s"}`}</span></div><p className="text-xs text-white/65 mt-1">{fng.posts} workout{fng.posts === 1 ? "" : "s"} · first post {formatDay(fng.firstPost)}</p><Milestone fng={fng} scoring={scoring} /></li>)}</ul> : <p className="text-sm text-white/65 mt-3">No FNGs attributed to {profile.name} in this period.</p>}
    </section>
    <p className="text-xs text-white/65 mt-8 pt-5 border-t border-white/10">Based on recorded attendance and the existing Roster. Next steps are suggestions.{scoring && " Points are awarded when the workout is recorded within the challenge window."}</p>
  </main>;
}
