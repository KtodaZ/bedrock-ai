"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { personURL } from "@/lib/ehProfile";
import type { EhCorrection } from "@/lib/ehCorrections";

type RecordView = Omit<EhCorrection, "notification"> & { notification: { status: string }; reflectedInRoster: boolean };

export default function EhCorrectionHistory() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<{ corrections: RecordView[] }>({
    queryKey: ["eh-correction-history"],
    queryFn: async () => { const response = await fetch("/api/eh-corrections/history"); const body = await response.json(); if (!response.ok) throw new Error(body.error); return body; },
    staleTime: 30_000,
  });
  return <main className="max-w-3xl w-full mx-auto px-4 py-6">
    <Link href="/eh-challenge" className="inline-flex items-center min-h-11 text-sm text-violet-300 hover:underline rounded focus-visible:outline-2 focus-visible:outline-violet-400">← Leaderboard</Link>
    <div className="flex items-center justify-between gap-4 mt-5"><h1 className="text-2xl font-bold text-white">EH correction history</h1><button onClick={() => refetch()} disabled={isFetching} className="text-sm text-violet-300 min-h-11 px-3 rounded hover:bg-white/5 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-violet-400 cursor-pointer">{isFetching ? "Refreshing…" : "Refresh"}</button></div>
    <p className="text-sm text-white/70 mt-3 max-w-xl">Community suggestions for the sheet maintainer. The Roster remains the source for standings; a submission alone doesn&apos;t change credit.</p>
    {isLoading && <p role="status" className="mt-8 text-white/70 text-sm">Loading correction history…</p>}
    {error && <p role="alert" className="mt-8 text-red-200 text-sm">Couldn&apos;t load correction history. Use Refresh to try again.</p>}
    {data?.corrections.length === 0 && <p className="text-white/70 mt-8 text-sm">No corrections submitted yet. Open a person&apos;s page to suggest an EH&apos;er.</p>}
    <ol className="mt-6 divide-y divide-white/10">
      {data?.corrections.map((r) => <li id={r.requestId} key={r.requestId} className="py-5 scroll-mt-6 target:bg-violet-400/5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-white"><Link href={personURL(r.pax, "all")} className="text-violet-200 hover:underline rounded focus-visible:outline-2 focus-visible:outline-violet-400">{r.pax}</Link></h2><span className={`text-xs font-medium ${r.reflectedInRoster ? "text-emerald-300" : "text-amber-200"}`}>{r.reflectedInRoster ? "Matches current Roster" : "For maintainer review"}</span></div>
        <dl className="grid sm:grid-cols-2 gap-3 mt-4 text-sm"><div><dt className="text-xs text-white/65">Recorded when submitted</dt><dd className="text-white/85 mt-1">{r.previousEhBy || "No EH’er recorded"}</dd></div><div><dt className="text-xs text-white/65">Proposed EH&apos;er</dt><dd className="text-violet-200 mt-1">{r.ehBy}</dd></div></dl>
        {r.notes && <p className="text-sm text-white/80 mt-4 whitespace-pre-wrap break-words">{r.notes}</p>}
        <p className="text-xs text-white/65 mt-4">Submitted by {r.submittedBy} (self-reported) · {new Date(r.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" })} Pacific</p>
        <p className="text-xs text-white/65 mt-2">{r.notification.status === "sent" ? "Posted to Discord" : "Discord alert pending"}</p>
      </li>)}
    </ol>
  </main>;
}
