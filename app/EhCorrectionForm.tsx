"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { EhRosterPerson } from "@/lib/sheet";
import type { EhCorrectionInput } from "@/lib/ehCorrections";

const inputClass = "w-full min-h-11 rounded-lg border border-white/20 bg-[#0f0f1a] px-3 py-2 text-sm text-white placeholder:text-white/60 focus:outline-2 focus:outline-violet-400";

function CorrectionFields({ pax }: { pax?: string }) {
  const formId = useId();
  const [person, setPerson] = useState(pax ?? "");
  const [ehBy, setEhBy] = useState("");
  const [submittedBy, setSubmittedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ id: string; notification: "sent" | "pending" } | null>(null);
  const pending = useRef<(EhCorrectionInput & { website: string }) | null>(null);
  const { data, isLoading, error: loadError, refetch } = useQuery<{ people: EhRosterPerson[] }>({
    queryKey: ["eh-correction-roster"],
    queryFn: async () => { const response = await fetch("/api/eh-corrections"); const body = await response.json(); if (!response.ok) throw new Error(body.error); return body; },
    staleTime: 60_000,
  });
  const current = data?.people.find((p) => p.name.toLowerCase().trim() === person.toLowerCase().trim());
  function edit() { pending.current = null; setError(""); }

  async function send(payload: EhCorrectionInput & { website: string }) {
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/eh-corrections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Couldn't save this correction. Try again.");
      setPerson(body.pax);
      setEhBy(body.ehBy);
      setResult({ id: body.id, notification: body.notification });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save this correction. Try again.");
    } finally { setSubmitting(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    pending.current ??= { requestId: crypto.randomUUID(), pax: person, ehBy, submittedBy, notes, website: String(new FormData(event.currentTarget).get("website") ?? "") };
    void send(pending.current);
  }

  if (isLoading) return <p role="status" className="py-4 text-sm text-white/70">Loading Roster names…</p>;
  if (loadError || !data) return <div className="py-4"><p role="alert" className="text-sm text-red-200">Couldn&apos;t load the Roster names.</p><button onClick={() => refetch()} className="min-h-11 text-sm text-violet-300 underline cursor-pointer">Try again</button></div>;
  if (result) return <div className="py-4 text-sm">
    <p role="status" className="font-semibold text-emerald-300">Saved for review</p>
    <p className="text-white/80 mt-2">{person} → EH&apos;d by {ehBy}. The sheet maintainer can review this before changing the Roster.</p>
    <p className="text-white/70 mt-2">{result.notification === "sent" ? "Posted to Discord. Standings are unchanged." : "Your correction is saved. The Discord alert is still pending."}</p>
    {result.notification === "pending" && <button disabled={submitting} onClick={() => pending.current && send(pending.current)} className="min-h-11 text-violet-300 underline disabled:opacity-50 cursor-pointer">{submitting ? "Retrying…" : "Retry Discord alert"}</button>}
    {error && <p role="alert" className="text-red-200 mt-2">{error}</p>}
    <Link href={`/eh-challenge/corrections#${result.id}`} className="inline-flex items-center min-h-11 mt-2 text-violet-300 underline underline-offset-4 rounded focus-visible:outline-2 focus-visible:outline-violet-400">View correction history</Link>
  </div>;

  return <form onSubmit={submit} className="py-4 space-y-4">
    <p className="text-sm text-white/75">Send a correction to the sheet maintainer and Discord. Standings change after the Roster is updated.</p>
    <datalist id={`${formId}-names`}>{data.people.map((p) => <option key={p.name} value={p.name} />)}</datalist>
    <div>
      <label htmlFor={`${formId}-person`} className="block text-sm text-white/85 mb-2">Person whose EH credit needs fixing</label>
      <input id={`${formId}-person`} disabled={submitting} value={person} onChange={(e) => { setPerson(e.target.value); edit(); }} readOnly={!!pax} list={`${formId}-names`} maxLength={100} required autoComplete="off" className={inputClass} placeholder="F3 name" />
      {current && <p className="text-xs text-white/65 mt-2">Currently recorded: {current.ehBy ?? "No EH’er"}</p>}
    </div>
    <div>
      <label htmlFor={`${formId}-ehby`} className="block text-sm text-white/85 mb-2">Who EH&apos;d him?</label>
      <input id={`${formId}-ehby`} disabled={submitting} value={ehBy} onChange={(e) => { setEhBy(e.target.value); edit(); }} list={`${formId}-names`} maxLength={100} required autoComplete="off" className={inputClass} placeholder="Choose the EH’er’s F3 name" />
    </div>
    <div>
      <label htmlFor={`${formId}-submitter`} className="block text-sm text-white/85 mb-2">Your F3 name</label>
      <input id={`${formId}-submitter`} disabled={submitting} value={submittedBy} onChange={(e) => { setSubmittedBy(e.target.value); edit(); }} list={`${formId}-names`} maxLength={100} required autoComplete="off" className={inputClass} placeholder="So the maintainer can follow up" />
    </div>
    <p className="text-xs text-white/65">Choose existing Roster names to avoid typos. Missing someone? Ask the sheet maintainer to add his name first.</p>
    <div>
      <label htmlFor={`${formId}-notes`} className="block text-sm text-white/85 mb-2">Context <span className="text-white/65">(optional)</span></label>
      <textarea id={`${formId}-notes`} disabled={submitting} value={notes} onChange={(e) => { setNotes(e.target.value); edit(); }} maxLength={400} rows={3} className={`${inputClass} resize-y`} placeholder="How do you know who invited him?" />
      <p className="text-xs text-white/65 mt-1">Included in the correction history and Discord post.</p>
    </div>
    <div className="hidden" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    {error && <p role="alert" className="text-sm text-red-200">{error}</p>}
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <button disabled={submitting} type="submit" className="min-h-11 rounded-lg bg-violet-600 hover:bg-violet-500 px-4 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-wait cursor-pointer focus-visible:outline-2 focus-visible:outline-violet-300 focus-visible:outline-offset-2">{submitting ? "Saving…" : "Send correction for review"}</button>
      <Link href="/eh-challenge/corrections" className="inline-flex min-h-11 items-center text-sm text-violet-300 underline underline-offset-4 rounded focus-visible:outline-2 focus-visible:outline-violet-400">Correction history</Link>
    </div>
  </form>;
}

export default function EhCorrectionForm({ pax }: { pax?: string }) {
  const [open, setOpen] = useState(false);
  return <details onToggle={(event) => setOpen(event.currentTarget.open)} className="group rounded-xl border border-white/15 px-4">
    <summary className="flex min-h-12 items-center justify-between gap-3 text-sm text-violet-200 cursor-pointer list-none [&::-webkit-details-marker]:hidden rounded focus-visible:outline-2 focus-visible:outline-violet-400">
      Suggest an EH correction
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="w-5 h-5 shrink-0 group-open:rotate-180"><path d="m5 7 5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </summary>
    {open && <CorrectionFields pax={pax} />}
  </details>;
}
