"use client";

import { useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { attendanceIsBehindToday, buildBandText, formatDay, sortLeaderboard, type LeaderboardSort, type Period, PERIODS, PERIOD_LABELS, parsePeriod } from "@/lib/ehChallenge";
import { fetchChallenge } from "@/lib/challenge-client";
import { matchesPerson, normalizePerson, personURL } from "@/lib/ehProfile";
import PointsGuide from "./PointsGuide";
import { useLinkedSection } from "@/lib/useLinkedSection";
import EhCorrectionForm from "./EhCorrectionForm";

const PERIOD_OPTIONS = PERIODS.map((value) => ({ value, label: PERIOD_LABELS[value] }));

// Reset the former annual default once; keep explicit links and new choices.
const PERIOD_KEY = "bedrock-eh-period-v3";
const PERIOD_EVENT = "bedrock-eh-period-change";

function subscribePeriod(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(PERIOD_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PERIOD_EVENT, onChange);
  };
}

function linkedParam(name: string) {
  return typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get(name) ?? "";
}

function readPeriod(): Period {
  try {
    const linked = new URLSearchParams(window.location.search).get("period");
    if (linked) return parsePeriod(linked);
    return parsePeriod(localStorage.getItem(PERIOD_KEY));
  } catch {
    return "challenge";
  }
}
const FNG_PREVIEW = 10;

const card = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" };

export default function EhChallenge() {
  const savedPeriod = useSyncExternalStore(subscribePeriod, readPeriod, () => "challenge" as Period);
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const period = selectedPeriod ?? savedPeriod;
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [showAllFngs, setShowAllFngs] = useState(false);
  // Links can open the leaderboard sorted or searched; this content renders only in the browser, after data loads.
  const [sort, setSort] = useState<LeaderboardSort>(() => linkedParam("sort") === "fngs" ? "fngs" : "points");
  const [search, setSearch] = useState(() => linkedParam("search").slice(0, 200));

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["eh-challenge", period],
    queryFn: () => fetchChallenge(period),
    staleTime: 5 * 60 * 1000,
  });
  useLinkedSection(Boolean(data));

  function choosePeriod(p: Period) {
    setSelectedPeriod(p);
    setShowAllFngs(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("period", p);
      window.history.replaceState(null, "", url);
      localStorage.setItem(PERIOD_KEY, p);
      window.dispatchEvent(new Event(PERIOD_EVENT));
    } catch {
      // The period still works when browser storage is unavailable.
    }
  }

  async function copyForBand() {
    if (!data) return;
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(buildBandText(data, period === "challenge" ? sort : "fngs"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
    }
  }

  const theme = data?.themes.find((t) => t.status === "active") ?? data?.themes.find((t) => t.status === "upcoming");
  const goalPct = data?.goal ? Math.min(100, (data.regionFngs / data.goal) * 100) : 0;
  const scoring = period === "challenge";
  const effectiveSort = scoring ? sort : "fngs";
  const unassigned = data?.fngs.filter((f) => !f.ehBy).length ?? 0;
  const leaderboard = sortLeaderboard(data?.leaderboard ?? [], effectiveSort)
    .map((entry, i) => ({ ...entry, rank: i + 1 }))
    .filter((entry) => normalizePerson(entry.name).includes(normalizePerson(search)));
  const fngs = data?.fngs.filter((fng) => matchesPerson(fng, search)) ?? [];

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-3xl w-full mx-auto px-4 py-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1
              className="text-2xl font-bold bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #a78bfa, #60a5fa, #f0f0ff)" }}
            >
              EH Challenge
            </h1>
            <p className="text-xs text-white/35 mt-1">
              {data ? `${formatDay(data.start)} – ${formatDay(data.end)} · latest data ${formatDay(data.sourceAsOf)}` : "Loading…"}
            </p>
          </div>
          <div className="flex flex-wrap rounded-xl p-0.5 border border-white/10" style={{ background: "rgba(255,255,255,0.03)" }}>
            {PERIOD_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => choosePeriod(o.value)}
                aria-pressed={period === o.value}
                className={`text-xs min-h-11 px-3 py-1.5 rounded-lg transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-violet-400 ${
                  period === o.value ? "text-white" : "text-white/40 hover:text-white/70"
                }`}
                style={period === o.value ? { background: "linear-gradient(135deg, #7c3aed, #2563eb)" } : undefined}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {error && !data && (
          <div className="rounded-2xl p-4 text-sm text-red-300/80 flex items-center justify-between" style={card}>
            {(error as Error).message}
            <button onClick={() => refetch()} className="text-xs underline cursor-pointer">Retry</button>
          </div>
        )}

        {isLoading && !data && (
          <div className="rounded-2xl h-40 animate-pulse" style={card} />
        )}

        {data && (
          <>
            <p className="text-sm text-white/75 leading-relaxed">
              {scoring ? "Challenge points count FNGs joining Oct 15–Dec 31, 2026, and their workouts through Dec 31. Earlier FNGs stay in the stats views." : "FNG stats show who invited whom. Competition points are kept in the 2026 Challenge view."}
            </p>
            {attendanceIsBehindToday(data.sourceAsOf) && <p role="status" className="text-sm text-violet-200">Today&apos;s data has not been logged by Commz Q</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl p-4" style={card}>
                <div className="text-xs text-white/65">{scoring ? "Challenge FNGs" : period === "year" ? "Annual FNG goal" : "Region FNGs"}</div>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-3xl font-bold text-white/90">{data.regionFngs}</span>
                  {data.goal && <span className="text-sm text-white/65">/ {data.goal} goal</span>}
                </div>
                {data.goal && <div className="h-1.5 rounded-full mt-3 overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${goalPct}%`, background: "linear-gradient(90deg, #7c3aed, #2563eb)" }}
                  />
                </div>}
              </div>
              <div className="rounded-2xl p-4" style={card}>
                {!scoring ? <><div className="text-xs text-white/65">2026 EH Challenge</div><p className="text-sm text-white/85 mt-2">Oct 15–Dec 31 · 50 FNG goal</p><button onClick={() => choosePeriod("challenge")} className="text-sm text-violet-200 underline underline-offset-4 min-h-11 cursor-pointer focus-visible:outline-2 focus-visible:outline-violet-400">View challenge standings →</button></> : theme ? (
                  <>
                    <div className="text-xs text-white/65">
                      {theme.status === "active" ? "This week's theme" : "Next theme"} · {formatDay(theme.start)} – {formatDay(theme.end)}
                    </div>
                    <div className="text-base font-semibold text-white/90 mt-1">{theme.name}</div>
                    <div className="text-xs text-white/50 mt-1">
                      {theme.description} · <span className="text-violet-300/80">{theme.bonus ? `+${theme.bonus} pts` : "Regular EH scoring"}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-white/40">No themed weeks scheduled</div>
                )}
              </div>
            </div>

            <details className="group">
              <summary className="flex items-center justify-between min-h-11 px-4 py-2 rounded-xl border border-white/10 text-sm text-violet-200 cursor-pointer hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-violet-400 list-none [&::-webkit-details-marker]:hidden">
                How it works
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="w-5 h-5 group-open:rotate-180"><path d="m5 7 5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </summary>
              <div className="mt-3"><PointsGuide /></div>
            </details>

            <div>
              <label htmlFor="eh-person-search" className="block text-sm font-medium text-white/85 mb-2">Find a person</label>
              <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-3 focus-within:border-violet-400">
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="w-5 h-5 text-white/65 shrink-0"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5" /><path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                <input id="eh-person-search" type="search" value={search} onChange={(e) => { setSearch(e.target.value); setShowAllFngs(false); }} placeholder="PAX name or EH’er" aria-describedby="eh-search-help" className="w-full min-w-0 min-h-12 bg-transparent text-sm text-white placeholder:text-white/60 outline-none caret-violet-300" />
                {search && <button onClick={() => setSearch("")} className="min-h-11 text-xs text-violet-200 px-2 rounded focus-visible:outline-2 focus-visible:outline-violet-400 cursor-pointer">Clear</button>}
              </div>
              <p id="eh-search-help" className="text-xs text-white/65 mt-2" aria-live="polite">{search.trim() ? `${leaderboard.length} EH’er${leaderboard.length === 1 ? "" : "s"} · ${fngs.length} FNG${fngs.length === 1 ? "" : "s"} match in this period.` : "Tap a name to see milestones, badges, and next steps."}</p>
            </div>

            <EhCorrectionForm />

            <section className="rounded-2xl overflow-hidden" style={card}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <h2 id="eh-standings-heading" className="text-sm font-semibold text-white/80">{scoring ? "Challenge standings" : "FNGs invited"}</h2>
                <button
                  onClick={copyForBand}
                  className="text-xs text-white/50 hover:text-white/90 border border-white/10 hover:border-white/25 rounded-full px-3 py-1 transition-colors cursor-pointer"
                >
                  {copied ? "Copied!" : copyFailed ? "Retry copy" : "Copy for Band"}
                </button>
              </div>
              {scoring && <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5">
                <span className="text-xs text-white/65">Sort by</span>
                <div className="flex gap-1" role="group" aria-label="Leaderboard sort">
                  {([["points", "Points"], ["fngs", "FNGs"]] as const).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => { setSort(value); setCopied(false); }}
                      aria-pressed={sort === value}
                      className={`min-h-10 px-4 rounded-lg text-xs font-medium cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-violet-400 ${sort === value ? "bg-violet-500/20 text-violet-200" : "text-white/65 hover:bg-white/5 hover:text-white"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>}
              {leaderboard.length === 0 ? (
                <p className="px-4 py-6 text-sm text-white/40 text-center">
                  {search.trim() ? "No EH’ers match this search. Try another name or clear the search." : scoring ? "No challenge points yet. Eligible FNGs need a recorded workout and an EH’er in the Roster." : "No EH’ers recorded for this period yet."}
                </p>
              ) : (
                <ol>
                  {leaderboard.map((e) => (
                    <li key={e.name} className="relative flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-0">
                      <span
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={
                          e.rank <= 3
                            ? { background: "linear-gradient(135deg, #7c3aed, #2563eb)", color: "white" }
                            : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)" }
                        }
                      >
                        {e.rank}
                      </span>
                      <div className="flex-1 min-w-0">
                        <Link href={personURL(e.name, period)} className="block text-sm text-violet-200 hover:underline underline-offset-4 rounded after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-violet-400" aria-label={`View ${e.name}`}><span className="block truncate">{e.name}</span></Link>
                        <div className="text-xs text-white/50">{effectiveSort === "points" ? `${e.fngs} FNG${e.fngs === 1 ? "" : "s"}` : scoring ? `${e.total} pts` : "View invited FNGs →"}</div>
                      </div>
                      {e.week > 0 && <span className="text-xs text-emerald-400/80">+{e.week} this week</span>}
                      <span className="text-sm font-semibold text-white/90 w-16 text-right tabular-nums">{effectiveSort === "points" ? `${e.total} pts` : `${e.fngs} FNG${e.fngs === 1 ? "" : "s"}`}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="rounded-2xl overflow-hidden" style={card}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <h2 id="eh-fngs-heading" className="text-sm font-semibold text-white/80">FNGs</h2>
                {unassigned > 0 && (
                  <span className="text-xs text-amber-300/80">
                    {unassigned} need an EH&apos;er{scoring && <> · {data.unassignedPoints} pts unclaimed</>}
                  </span>
                )}
              </div>
              {fngs.length === 0 ? (
                <p className="px-4 py-6 text-sm text-white/65 text-center">{search.trim() ? "No FNGs match this search. Try another name or clear the search." : "No FNGs in this period yet."}</p>
              ) : (
                <ul>
                  {(showAllFngs ? fngs : fngs.slice(0, FNG_PREVIEW)).map((f) => (
                    <li key={f.name} className="relative flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-0">
                      <div className="flex-1 min-w-0">
                        <Link href={personURL(f.name, period)} className="block text-sm text-violet-200 hover:underline underline-offset-4 rounded after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-violet-400" aria-label={`View ${f.name}`}><span className="block truncate">{f.name}</span></Link>
                        <div className="text-xs text-white/35">
                          First post {formatDay(f.firstPost)} · {f.posts} post{f.posts === 1 ? "" : "s"}
                        </div>
                      </div>
                      {f.ehBy ? (
                        <span className="text-xs text-white/50 truncate max-w-[35%]">EH&apos;d by {f.ehBy}</span>
                      ) : (
                        <span className="text-xs text-amber-300/70 border border-amber-300/20 rounded-full px-2 py-0.5">
                          Needs EH&apos;er
                        </span>
                      )}
                      <span className="text-sm text-white/70 w-20 text-right">{scoring ? `${f.points} pts` : `${f.posts} workout${f.posts === 1 ? "" : "s"}`}</span>
                    </li>
                  ))}
                  {fngs.length > FNG_PREVIEW && (
                    <li>
                      <button
                        onClick={() => setShowAllFngs((v) => !v)}
                        className="w-full text-xs text-white/45 hover:text-white/80 py-2.5 cursor-pointer"
                      >
                        {showAllFngs ? "Show less" : `Show all ${fngs.length}`}
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </section>

          </>
        )}
      </div>
    </main>
  );
}
