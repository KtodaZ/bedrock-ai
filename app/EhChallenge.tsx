"use client";

import { useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { buildBandText, formatDay, sortLeaderboard, type ChallengeResult, type LeaderboardSort, type Period } from "@/lib/ehChallenge";
import PointsGuide from "./PointsGuide";

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
];

const PERIOD_KEY = "bedrock-eh-period-v2";
const PERIOD_EVENT = "bedrock-eh-period-change";

function subscribePeriod(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(PERIOD_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(PERIOD_EVENT, onChange);
  };
}

function readPeriod(): Period {
  try {
    const saved = localStorage.getItem(PERIOD_KEY);
    return saved === "month" || saved === "all" ? saved : "year";
  } catch {
    return "year";
  }
}
const FNG_PREVIEW = 10;

const card = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" };

async function fetchChallenge(period: Period): Promise<ChallengeResult> {
  const res = await fetch(`/api/eh-challenge?period=${period}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to load");
  return data;
}

export default function EhChallenge() {
  const savedPeriod = useSyncExternalStore(subscribePeriod, readPeriod, () => "year" as Period);
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const period = selectedPeriod ?? savedPeriod;
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [showAllFngs, setShowAllFngs] = useState(false);
  const [sort, setSort] = useState<LeaderboardSort>("points");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["eh-challenge", period],
    queryFn: () => fetchChallenge(period),
    staleTime: 5 * 60 * 1000,
  });

  function choosePeriod(p: Period) {
    setSelectedPeriod(p);
    setShowAllFngs(false);
    try {
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
      await navigator.clipboard.writeText(buildBandText(data, sort));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
    }
  }

  const theme = data?.themes.find((t) => t.status === "active") ?? data?.themes.find((t) => t.status === "upcoming");
  const goalPct = data ? Math.min(100, (data.regionFngs / data.goal) * 100) : 0;
  const unassigned = data?.fngs.filter((f) => !f.ehBy).length ?? 0;
  const leaderboard = sortLeaderboard(data?.leaderboard ?? [], sort);

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
              {data ? `${formatDay(data.start)} – ${formatDay(data.asOf)} · latest data ${formatDay(data.asOf)}` : "Loading…"}
            </p>
          </div>
          <div className="flex rounded-xl p-0.5 border border-white/10" style={{ background: "rgba(255,255,255,0.03)" }}>
            {PERIOD_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => choosePeriod(o.value)}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl p-4" style={card}>
                <div className="text-xs text-white/40">Region FNGs</div>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-3xl font-bold text-white/90">{data.regionFngs}</span>
                  <span className="text-sm text-white/35">/ {data.goal} goal</span>
                </div>
                <div className="h-1.5 rounded-full mt-3 overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${goalPct}%`, background: "linear-gradient(90deg, #7c3aed, #2563eb)" }}
                  />
                </div>
              </div>
              <div className="rounded-2xl p-4" style={card}>
                {theme ? (
                  <>
                    <div className="text-xs text-white/40">
                      {theme.status === "active" ? "This week's theme" : "Next theme"} · {formatDay(theme.start)} – {formatDay(theme.end)}
                    </div>
                    <div className="text-base font-semibold text-white/90 mt-1">{theme.name}</div>
                    <div className="text-xs text-white/50 mt-1">
                      {theme.description} · <span className="text-violet-300/80">+{theme.bonus} pts</span>
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

            <section className="rounded-2xl overflow-hidden" style={card}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <h2 className="text-sm font-semibold text-white/80">Leaderboard</h2>
                <button
                  onClick={copyForBand}
                  className="text-xs text-white/50 hover:text-white/90 border border-white/10 hover:border-white/25 rounded-full px-3 py-1 transition-colors cursor-pointer"
                >
                  {copied ? "Copied!" : copyFailed ? "Retry copy" : "Copy for Band"}
                </button>
              </div>
              <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5">
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
              </div>
              {data.leaderboard.length === 0 ? (
                <p className="px-4 py-6 text-sm text-white/40 text-center">
                  No EH points yet. Points show up once FNGs have their EH&apos;er logged.
                </p>
              ) : (
                <ol>
                  {leaderboard.map((e, i) => (
                    <li key={e.name} className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-0">
                      <span
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={
                          i < 3
                            ? { background: "linear-gradient(135deg, #7c3aed, #2563eb)", color: "white" }
                            : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)" }
                        }
                      >
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white/85 truncate">{e.name}</div>
                        <div className="text-xs text-white/50">{sort === "points" ? `${e.fngs} FNG${e.fngs === 1 ? "" : "s"}` : `${e.total} pts`}</div>
                      </div>
                      {e.week > 0 && <span className="text-xs text-emerald-400/80">+{e.week} this week</span>}
                      <span className="text-sm font-semibold text-white/90 w-16 text-right tabular-nums">{sort === "points" ? `${e.total} pts` : `${e.fngs} FNG${e.fngs === 1 ? "" : "s"}`}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="rounded-2xl overflow-hidden" style={card}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <h2 className="text-sm font-semibold text-white/80">FNGs</h2>
                {unassigned > 0 && (
                  <span className="text-xs text-amber-300/80">
                    {unassigned} need an EH&apos;er · {data.unassignedPoints} pts unclaimed
                  </span>
                )}
              </div>
              {data.fngs.length === 0 ? (
                <p className="px-4 py-6 text-sm text-white/40 text-center">No FNGs in this period yet.</p>
              ) : (
                <ul>
                  {(showAllFngs ? data.fngs : data.fngs.slice(0, FNG_PREVIEW)).map((f) => (
                    <li key={f.name} className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white/85 truncate">{f.name}</div>
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
                      <span className="text-sm text-white/70 w-14 text-right">{f.points} pts</span>
                    </li>
                  ))}
                  {data.fngs.length > FNG_PREVIEW && (
                    <li>
                      <button
                        onClick={() => setShowAllFngs((v) => !v)}
                        className="w-full text-xs text-white/45 hover:text-white/80 py-2.5 cursor-pointer"
                      >
                        {showAllFngs ? "Show less" : `Show all ${data.fngs.length}`}
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
