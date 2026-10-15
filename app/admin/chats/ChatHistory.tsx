"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import styles from "./history.module.css";

type Entry = {
  _id: string; conversationId: string; createdAt: string; updatedAt: string;
  question: string; answer?: string; error?: string; status: "pending" | "success" | "error";
  model: string; reasoningLevel: string; durationMs?: number; queries: { sql: string; reason: string }[];
};
type Result = { entries: Entry[]; total: number; page: number; pageSize: number };
const emptyFilters = { q: "", from: "", to: "", status: "", conversation: "" };
const dateTime = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export default function ChatHistory({ signedIn }: { signedIn: boolean }) {
  const [authenticated, setAuthenticated] = useState(signedIn);
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState("");
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const history = useQuery({
    queryKey: ["private-chat-history", filters, page], enabled: authenticated, retry: false,
    queryFn: async ({ signal }): Promise<Result> => {
      const params = new URLSearchParams({ ...filters, page: String(page) });
      const res = await fetch(`/api/admin/chats?${params}`, { cache: "no-store", signal });
      const body = await res.json();
      if (res.status === 401) setAuthenticated(false);
      if (!res.ok) throw new Error(body.error || "Couldn't load chat history. Try Refresh.");
      return body;
    },
  });
  // Clear the password after the session is established; never persist it in the browser.
  useEffect(() => { if (authenticated) setPassword(""); }, [authenticated]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault(); setSigningIn(true); setAuthError("");
    try {
      const res = await fetch("/api/admin/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setAuthenticated(true);
    } catch (err) { setAuthError(err instanceof Error ? err.message : "Couldn't sign in. Try again."); }
    finally { setSigningIn(false); }
  }

  async function signOut() {
    try {
      const res = await fetch("/api/admin/session", { method: "DELETE" });
      if (!res.ok) throw new Error();
      // A reload discards cached private results and closes expanded conversations.
      window.location.reload();
    } catch { setAuthError("Couldn't sign out. Try again."); }
  }

  function applyFilters(event: React.FormEvent) {
    event.preventDefault(); setFilters(draft); setPage(1); setSelected(null);
  }
  function conversation(id: string) {
    const next = { ...emptyFilters, conversation: id };
    setFilters(next); setDraft(next); setPage(1); setSelected(null);
  }

  const data = history.data;
  return <main className={styles.page}>
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>Bedrock <span>Data AI</span></Link>
      {authenticated && <button className={styles.quiet} onClick={signOut}>Sign out</button>}
    </header>
    <div className={styles.heading}>
      <h1>Chat history</h1>
      <p>See what people ask and how Bedrock answers.</p>
    </div>
    {!authenticated ? <form onSubmit={signIn} className={styles.login}>
      <h2>Private access</h2>
      <p>Sign in to review questions and conversations.</p>
      <label htmlFor="password">Admin password</label>
      <input id="password" type="password" autoComplete="current-password" required maxLength={512} value={password} onChange={e => setPassword(e.target.value)} />
      {authError && <p role="alert" className={styles.error}>{authError}</p>}
      <button className={styles.primary} disabled={signingIn}>{signingIn ? "Signing in…" : "Sign in"}</button>
    </form> : <>
      <form className={styles.filters} onSubmit={applyFilters}>
        <div className={styles.search}><label htmlFor="search">Search questions and answers</label><input id="search" type="search" placeholder="Try a name, site, or topic" value={draft.q} maxLength={200} onChange={e => setDraft({ ...draft, q: e.target.value })} /></div>
        <div><label htmlFor="from">From (UTC)</label><input id="from" type="date" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} /></div>
        <div><label htmlFor="to">Through (UTC)</label><input id="to" type="date" value={draft.to} min={draft.from} onChange={e => setDraft({ ...draft, to: e.target.value })} /></div>
        <div><label htmlFor="status">Status</label><select id="status" value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}><option value="">All statuses</option><option value="success">Answered</option><option value="error">Failed</option><option value="pending">Started</option></select></div>
        <button className={styles.primary}>Search</button>
      </form>
      {filters.conversation && <div className={styles.conversation}>Viewing one conversation <button className={styles.quiet} onClick={() => { setFilters(emptyFilters); setDraft(emptyFilters); setPage(1); setSelected(null); }}>Show all questions</button></div>}
      <div className={styles.toolbar}>
        <p aria-live="polite">{data ? `${data.total.toLocaleString()} ${data.total === 1 ? "question" : "questions"}${Object.values(filters).some(Boolean) ? " matching filters" : " logged"}` : "Question log"}</p>
        <button className={styles.quiet} disabled={history.isFetching} onClick={() => history.refetch()}>{history.isFetching ? "Refreshing…" : "Refresh"}</button>
      </div>
      {authError && <p role="alert" className={styles.error}>{authError}</p>}
      {history.isPending && <p role="status" className={styles.empty}>Loading conversations…</p>}
      {history.error && <p role="alert" className={styles.error}>{history.error.message}</p>}
      {data && !history.error && data.entries.length === 0 && <div className={styles.empty}><h2>{Object.values(filters).some(Boolean) ? "No matching questions" : "Ready for the first question"}</h2><p>{Object.values(filters).some(Boolean) ? "Try another search or a wider date range." : "New questions and full answers will appear here. Older browser chats are not imported automatically."}</p></div>}
      {data && !history.error && <div className={styles.entries}>{data.entries.map(entry => <article key={entry._id} className={styles.entry}>
        <button className={styles.entryToggle} aria-expanded={selected === entry._id} aria-controls={`answer-${entry._id}`} onClick={() => setSelected(selected === entry._id ? null : entry._id)}>
          <span className={styles.entryMeta}><time dateTime={entry.createdAt}>{dateTime(entry.createdAt)}</time><span className={entry.status === "error" ? styles.failed : entry.status === "pending" ? styles.pending : styles.success}>{entry.status === "success" ? "Answered" : entry.status === "error" ? "Failed" : "Started"}</span></span>
          <span className={styles.question}>{entry.question}</span>
          <span className={styles.preview}>{selected === entry._id ? "Hide answer" : entry.answer ? entry.answer.replace(/[#*`]/g, "").slice(0, 180) : entry.error || "No completed answer recorded. Refresh to check progress."}</span>
          <span className={styles.expand}>{selected === entry._id ? "−" : "+"}</span>
        </button>
        {selected === entry._id && <div id={`answer-${entry._id}`} className={styles.answer}>
          <div className={styles.answerBody}>{entry.answer ? <ReactMarkdown>{entry.answer}</ReactMarkdown> : <p>{entry.error || "No completed answer recorded. This request may still be running or may have been interrupted."}</p>}</div>
          <div className={styles.details}><span>{entry.model} · {entry.reasoningLevel} reasoning{entry.durationMs !== undefined ? ` · ${(entry.durationMs / 1000).toFixed(1)}s` : ""}</span><button className={styles.quiet} onClick={() => conversation(entry.conversationId)}>View conversation</button></div>
          {entry.queries.length > 0 && <details className={styles.sql}><summary>{entry.queries.length} SQL {entry.queries.length === 1 ? "query" : "queries"}</summary>{entry.queries.map((q, i) => <div key={i}><p>{q.reason}</p><pre>{q.sql}</pre></div>)}</details>}
        </div>}
      </article>)}</div>}
      {data && data.total > data.pageSize && <nav aria-label="History pages" className={styles.pagination}>
        <button className={styles.quiet} disabled={page === 1 || history.isFetching} onClick={() => { setPage(page - 1); setSelected(null); }}>Previous</button>
        <span>Page {page} of {Math.ceil(data.total / data.pageSize)}</span>
        <button className={styles.quiet} disabled={page * data.pageSize >= data.total || page >= 1000 || history.isFetching} onClick={() => { setPage(page + 1); setSelected(null); }}>Next</button>
      </nav>}
      <footer className={styles.footer}>Private history · Dates are filtered in UTC and displayed in your local time. Started requests without an answer may have been interrupted.</footer>
    </>}
  </main>;
}
