import { POINTS, pointsForPosts } from "@/lib/ehChallenge";

function Person({ className = "" }: { className?: string }) {
  return <svg viewBox="0 0 48 56" fill="none" aria-hidden="true" className={className}><circle cx="24" cy="13" r="8" fill="currentColor" /><path d="M9 49V35a15 15 0 0 1 30 0v14" stroke="currentColor" strokeWidth="6" strokeLinecap="round" /></svg>;
}

const milestones = [
  { workout: "1", title: "Show up", points: POINTS.firstPost, total: pointsForPosts(1) },
  { workout: "2", title: "Come back", points: POINTS.secondPost, total: pointsForPosts(2) },
  { workout: "3–4", title: "Build the habit", points: 0, total: pointsForPosts(4) },
  { workout: "5", title: "Find your stride", points: POINTS.fifthPost, total: pointsForPosts(5) },
  { workout: "6+", title: "Keep it going", points: POINTS.afterFifth, total: null },
];

export default function PointsGuide() {
  return (
    <article className="rounded-3xl border border-violet-300/20 bg-[#101023] px-5 py-7 sm:px-10 sm:py-10 overflow-hidden">
      <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white text-balance">Bring a guy.<br /><span className="text-violet-300">Build a habit.</span></h1>
      <p className="text-sm sm:text-base text-violet-100/80 mt-4 max-w-lg">Your FNG&apos;s workouts earn you points. Here&apos;s what each workout is worth.</p>

      <section aria-labelledby="milestones-title" className="mt-8">
        <h2 id="milestones-title" className="text-lg font-semibold text-white">The road from FNG to regular</h2>
        <ol className="mt-5">
          {milestones.map((m, i) => (
            <li key={m.workout} className="relative grid grid-cols-[48px_1fr_auto] sm:grid-cols-[56px_1fr_auto] gap-4 min-h-20">
              {i < milestones.length - 1 && <span aria-hidden="true" className="absolute left-[23px] sm:left-[27px] top-12 bottom-0 w-0.5 bg-violet-400/35" />}
              <span className={`relative z-10 h-12 sm:h-14 rounded-full flex items-center justify-center font-bold text-base ${m.points ? "bg-violet-300 text-[#16102e]" : "border-2 border-violet-300/40 text-violet-200"}`} aria-label={`Workout ${m.workout}`}>{m.workout}</span>
              <div className="pt-1"><div className="font-semibold text-white">{m.title}</div><div className="text-xs sm:text-sm text-violet-100/75 mt-1">{m.total === null ? "Every workout after #5" : `${m.total} points earned so far`}</div></div>
              <div className="text-2xl sm:text-3xl font-bold text-violet-300 pt-1 tabular-nums">+{m.points}{m.total === null && <span className="block text-xs font-normal text-right text-violet-100/75">each</span>}</div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="retention-title" className="border-t border-violet-300/20 pt-7 mt-2">
        <h2 id="retention-title" className="text-xl sm:text-2xl font-semibold text-white">The return visit matters.</h2>
        <div className="mt-5 grid grid-cols-[48px_1fr] gap-x-4 gap-y-5 items-center">
          <Person className="w-10 h-12 text-violet-300" />
          <div><div className="text-sm text-violet-100 mb-2">1 FNG · 10 workouts</div><div className="h-10 bg-violet-400 rounded-r-full flex items-center px-3 text-[#16102e] font-bold">{pointsForPosts(10)} points</div></div>
          <div className="flex -space-x-3"><Person className="w-7 h-10 text-sky-300" /><Person className="w-7 h-10 text-sky-300" /><Person className="w-7 h-10 text-sky-300" /></div>
          <div><div className="text-sm text-violet-100 mb-2">3 FNGs · 1 workout each</div><div style={{ width: `${3 * POINTS.firstPost / pointsForPosts(10) * 100}%` }} className="h-10 bg-sky-300 rounded-r-full flex items-center px-3 text-[#111d2d] font-bold">{3 * POINTS.firstPost} points</div></div>
        </div>
      </section>

      <section aria-labelledby="referral-title" className="border-t border-violet-300/20 mt-8 pt-7">
        <h2 id="referral-title" className="text-xl sm:text-2xl font-semibold text-white">When your FNG invites someone</h2>
        <div className="grid grid-cols-[1fr_24px_1fr_24px_1fr] gap-1 items-start text-center mt-6">
          {["You", "Alex", "Ben"].map((name, i) => <div key={name} className="contents"><div><Person className={`h-14 w-12 mx-auto ${i === 2 ? "text-sky-300" : "text-violet-300"}`} /><div className="font-semibold text-white mt-2">{name}</div><div className="text-xs text-violet-100/75 mt-1">{i === 0 ? `+${POINTS.referral} bonus` : i === 1 ? "Ben’s workout points" : "New FNG"}</div></div>{i < 2 && <svg viewBox="0 0 24 24" className="w-6 h-6 mt-4 text-violet-300" fill="none" aria-label="invites"><path d="M2 12h18m-7-7 7 7-7 7" stroke="currentColor" strokeWidth="2" /></svg>}</div>)}
        </div>
        <p className="text-sm leading-relaxed text-violet-100/80 mt-5">You invite Alex. Alex invites Ben. You earn a one-time +{POINTS.referral}; Alex earns Ben&apos;s workout points. Alex and Ben must both join during the Oct 15–Dec 31, 2026 challenge.</p>
      </section>

      <section aria-labelledby="double-down-title" className="border-t border-violet-300/20 mt-8 pt-7">
        <h2 id="double-down-title" className="text-xl sm:text-2xl font-semibold text-white">Double Down</h2>
        <p className="text-sm leading-relaxed text-violet-100/80 mt-3">During Double Down Week (Nov 1–7), each FNG&apos;s first post earns a +5 bonus on top of the regular 5. Two FNGs&apos; first posts earn 20 points.</p>
      </section>

      <footer className="border-t border-violet-300/20 mt-7 pt-5 text-sm text-violet-100/80 leading-relaxed">
        <p><strong className="text-white">Bedrock FNGs only.</strong> An FNG-marked attendance entry must match a Roster entry with Region set to Bedrock. Credit goes to the recorded EH&apos;er.</p>
        <p className="mt-3">Challenge points count FNGs joining Oct 15–Dec 31, 2026, with workouts counted through Dec 31. This Year shows FNG stats without competition points. Themed events can add the listed bonus.</p>
      </footer>
    </article>
  );
}
