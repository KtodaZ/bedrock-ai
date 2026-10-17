export interface QueryLogEntry {
  index: number;
  reason: string;
  sql: string;
}

export interface PageLink {
  href: string;
  label: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  suggestions?: string[];
  /** In-app pages that show the answer, offered as buttons. */
  pages?: PageLink[];
  queryLog?: QueryLogEntry[];
  reasoningUsed?: string;
  isError?: boolean;
  /** On a failed answer that may still finish on the server: where to look for it, and when it was asked. */
  requestId?: string;
  sentAt?: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  pending?: boolean;
  /** ID of the in-flight request, so a dropped connection or reload can fetch the saved answer. */
  requestId?: string;
  pendingSince?: number;
}

type Reasoning = "auto" | "low" | "medium" | "high";
interface SessionState {
  conversations: Conversation[];
  activeId: string | null;
  drafts: Record<string, string>;
  reasoningLevel: Reasoning;
  phases: Record<string, string>;
  /** Answer text received so far for each in-flight conversation; never persisted. */
  partials: Record<string, string>;
  ready: boolean;
  storageError: boolean;
}
const HISTORY_KEY = "bedrock-conversations";
const SESSION_KEY = "bedrock-chat-session";
const NEW_DRAFT = "new";
export const INITIAL_CHAT_STATE: SessionState = {
  conversations: [], activeId: null, drafts: {}, reasoningLevel: "auto",
  phases: {}, partials: {}, ready: false, storageError: false,
};
const interruptedMessage: Message = {
  role: "assistant", isError: true,
  content: "This request was interrupted before an answer was saved. Your question is saved; send it again to try again.",
};
const lostMessage = "The connection dropped and the answer couldn't be recovered. Your question is saved; tap Try again.";
/** How long to keep checking for a saved answer: the server stops a request after 5 minutes. */
const RECOVERY_MS = 6 * 60_000;
const POLL_MS = 3_000;
/** The server pings every 15 seconds, so this much silence means the connection is gone. */
const STALL_MS = 45_000;
/** Limits for a response to start and for one saved-answer check. */
const HEADER_MS = 30_000;
const CHECK_MS = 10_000;
/** The server keeps saved answers readable this long. */
const SAVED_MS = 24 * 60 * 60_000;
/** Errors the server reported itself; anything else may be a dropped connection worth recovering. */
class ServerError extends Error {}
interface SavedResult {
  status?: string;
  answer?: string;
  error?: string;
  queries?: { sql?: string; reason?: string }[];
  suggestions?: unknown;
  pages?: unknown;
  reasoningLevel?: string;
}

function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") return false;
  const m = value as Message;
  return (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
    && (m.suggestions === undefined || (Array.isArray(m.suggestions) && m.suggestions.every(s => typeof s === "string")))
    && (m.queryLog === undefined || (Array.isArray(m.queryLog) && m.queryLog.every(q => q && typeof q.index === "number" && typeof q.sql === "string" && typeof q.reason === "string")))
    && (m.requestId === undefined || typeof m.requestId === "string")
    && (m.pages === undefined || (Array.isArray(m.pages) && m.pages.every(p => p && typeof p.href === "string" && typeof p.label === "string")));
}
function isConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== "object") return false;
  const c = value as Conversation;
  return typeof c.id === "string" && typeof c.title === "string"
    && Number.isFinite(c.createdAt) && Number.isFinite(c.updatedAt)
    && Array.isArray(c.messages) && c.messages.every(isMessage)
    && (c.requestId === undefined || typeof c.requestId === "string");
}

// Owned by the root provider, so route changes never own or cancel requests.
export class ChatSession {
  private state = INITIAL_CHAT_STATE;
  private listeners = new Set<() => void>();
  private requests = new Map<string, AbortController>();
  constructor(private storage: () => Storage, private request: typeof fetch = (...args) => fetch(...args),
    private timing = { recoveryMs: RECOVERY_MS, pollMs: POLL_MS, stallMs: STALL_MS, headerMs: HEADER_MS, checkMs: CHECK_MS }) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  hydrate() {
    if (this.state.ready) return;
    let conversations: Conversation[] = [];
    let session: Partial<SessionState> = {};
    let storageError = false;
    try {
      const raw = JSON.parse(this.storage().getItem(HISTORY_KEY) ?? "[]");
      // Pending chats with a request ID check the server for their saved answer below.
      if (Array.isArray(raw)) conversations = raw.filter(isConversation).map(c => c.pending && !c.requestId
        ? { ...c, pending: false, messages: [...c.messages, interruptedMessage] } : c);
      else storageError = true;
    } catch { storageError = true; }
    try {
      const raw = JSON.parse(this.storage().getItem(SESSION_KEY) ?? "{}");
      if (raw && typeof raw === "object") session = raw;
    } catch { storageError = true; }
    const activeId = typeof session.activeId === "string" && conversations.some(c => c.id === session.activeId)
      ? session.activeId : !("activeId" in session)
        ? [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id ?? null : null;
    const drafts = session.drafts && typeof session.drafts === "object"
      ? Object.fromEntries(Object.entries(session.drafts).filter(([, value]) => typeof value === "string")) : {};
    this.state = { ...INITIAL_CHAT_STATE, conversations, activeId, drafts,
      reasoningLevel: ["auto", "low", "medium", "high"].includes(session.reasoningLevel ?? "") ? session.reasoningLevel! : "auto",
      ready: true, storageError };
    this.listeners.forEach(l => l());
    for (const c of conversations) {
      if (!c.pending || !c.requestId) continue;
      const controller = new AbortController();
      this.requests.set(c.id, controller);
      void this.resume(c.id, c.requestId, Number.isFinite(c.pendingSince) ? c.pendingSince! : c.updatedAt, c.messages, controller);
    }
    this.recheckLost();
  }

  /** Looks again for answers that finished after recovery gave up, e.g. once the phone is back online. */
  recheckLost = () => {
    for (const c of this.state.conversations) void this.reclaim(c.id);
  };

  /** Replaces a chat's last failed answer with the server's saved answer, if one exists now. No quota. */
  private async reclaim(id: string, owner?: AbortController): Promise<boolean> {
    const before = this.state.conversations.find(c => c.id === id);
    const failed = before?.messages.at(-1);
    if (!before || (before.pending && !owner) || (!owner && this.requests.has(id)) || !failed?.isError || !failed.requestId
      || !(Date.now() - (failed.sentAt ?? 0) < SAVED_MS)) return false;
    const check = await this.checkSaved(failed.requestId, owner?.signal);
    const result = check.result;
    if (result?.status !== "success" && result?.status !== "error") return false;
    const now = this.state.conversations.find(c => c.id === id);
    if (!now || now.messages.at(-1) !== failed || (owner ? this.requests.get(id) !== owner : now.pending || this.requests.has(id))) return false;
    this.commit({ conversations: this.state.conversations.map(c => c.id === id
      ? { ...c, messages: [...c.messages.slice(0, -1), savedMessage(result, [])], updatedAt: Date.now() } : c) });
    return true;
  }

  /** Waits for the server's saved answer after the stream is lost, then completes the chat. */
  private async resume(id: string, requestId: string, since: number, messages: Message[], controller: AbortController, queryLog: QueryLogEntry[] = []) {
    const partials = { ...this.state.partials };
    delete partials[id];
    this.commit({ partials, phases: { ...this.state.phases, [id]: "Reconnecting to get your answer..." } }, false);
    const result = await this.fetchSaved(requestId, since, controller.signal);
    // Keep the request ID on an inconclusive failure so a later check or Try again can still find the answer.
    const message = result ? savedMessage(result, queryLog)
      : { role: "assistant" as const, isError: true, content: lostMessage, requestId, sentAt: since };
    this.complete(id, controller, messages, message);
  }

  /** One bounded check of the saved-answer endpoint. */
  private async checkSaved(requestId: string, signal?: AbortSignal): Promise<{ result?: SavedResult; missing?: boolean; stop?: boolean }> {
    try {
      return await within(this.timing.checkMs, signal, async attempt => {
        const res = await this.request(`/api/chat/result?id=${encodeURIComponent(requestId)}`, { cache: "no-store", signal: attempt });
        if (res.ok) return { result: await res.json() as SavedResult };
        if (res.status === 404) return { missing: true };
        return { stop: res.status === 400 || res.status === 503 };
      });
    } catch {
      return {}; // Offline or timed out; try again later.
    }
  }

  /** Polls for the saved result until it finishes, the server lost it, or the request's time ran out. */
  private async fetchSaved(requestId: string, since: number, signal: AbortSignal): Promise<SavedResult | null> {
    let missing = 0;
    for (;;) {
      if (signal.aborted) return null;
      const check = await this.checkSaved(requestId, signal);
      if (check.result?.status === "success" || check.result?.status === "error") return check.result;
      if (check.stop) return null;
      // Repeated "not found" means the question never reached the server.
      if (check.missing && ++missing >= 5) return null;
      if (Date.now() - since > this.timing.recoveryMs) return null;
      await wait(this.timing.pollMs, signal);
    }
  }

  private complete(id: string, controller: AbortController, messages: Message[], message: Message) {
    if (this.requests.get(id) !== controller) return false;
    const phases = { ...this.state.phases };
    const partials = { ...this.state.partials };
    delete phases[id];
    delete partials[id];
    this.commit({ phases, partials, conversations: this.state.conversations.map(c => c.id === id
      ? { ...c, messages: [...messages, message], pending: false, requestId: undefined, pendingSince: undefined, updatedAt: Date.now() } : c) });
    // The chat is free for the next question while late suggestions finish streaming.
    this.requests.delete(id);
    return true;
  }

  private commit(patch: Partial<SessionState>, persist = true) {
    this.state = { ...this.state, ...patch };
    if (persist) {
      try {
        this.storage().setItem(HISTORY_KEY, JSON.stringify(this.state.conversations));
        this.storage().setItem(SESSION_KEY, JSON.stringify({ activeId: this.state.activeId, drafts: this.state.drafts, reasoningLevel: this.state.reasoningLevel }));
        this.state = { ...this.state, storageError: false };
      } catch { this.state = { ...this.state, storageError: true }; }
    }
    this.listeners.forEach(l => l());
  }
  setInput = (input: string) => this.commit({ drafts: { ...this.state.drafts, [this.state.activeId ?? NEW_DRAFT]: input } });
  setReasoningLevel = (reasoningLevel: Reasoning) => this.commit({ reasoningLevel });
  startNewChat = () => this.commit({ activeId: null });
  restoreConversation = (id: string) => {
    if (this.state.conversations.some(c => c.id === id)) this.commit({ activeId: id });
  };
  deleteConversation = (id: string) => {
    const controller = this.requests.get(id);
    this.requests.delete(id);
    controller?.abort();
    const drafts = { ...this.state.drafts };
    const phases = { ...this.state.phases };
    const partials = { ...this.state.partials };
    delete drafts[id];
    delete phases[id];
    delete partials[id];
    this.commit({ conversations: this.state.conversations.filter(c => c.id !== id), drafts, phases, partials,
      activeId: this.state.activeId === id ? null : this.state.activeId });
  };

  /** Sends a question. With retry, a failed copy of the same question at the end is replaced, not repeated. */
  async sendMessage(question: string, { retry = false }: { retry?: boolean } = {}) {
    if (!this.state.ready || !question.trim() || question.length > 2000) return;
    const id = this.state.activeId ?? crypto.randomUUID();
    if (this.requests.has(id)) return;
    const controller = new AbortController();
    this.requests.set(id, controller);
    const previous = this.state.conversations.find(c => c.id === id);
    let history = previous?.messages ?? [];
    const [asked, failed] = history.slice(-2);
    const replacing = retry && failed?.isError && asked?.role === "user" && asked.content === question;
    // The earlier attempt may have finished after all; use it instead of asking (and paying) again.
    if (replacing && failed.requestId) {
      const found = await this.reclaim(id, controller);
      if (this.requests.get(id) !== controller) return;
      if (found) { this.requests.delete(id); return; }
    }
    if (replacing) history = history.slice(0, -2);
    const messages: Message[] = [...history, { role: "user", content: question }];
    const now = Date.now();
    const requestId = crypto.randomUUID();
    const conversation: Conversation = { id, title: previous?.title ?? question.slice(0, 60),
      createdAt: previous?.createdAt ?? now, updatedAt: now, messages, pending: true, requestId, pendingSince: now };
    this.commit({ activeId: id, conversations: [conversation, ...this.state.conversations.filter(c => c.id !== id)],
      drafts: { ...this.state.drafts, [this.state.activeId ?? NEW_DRAFT]: "", [id]: "" },
      phases: { ...this.state.phases, [id]: "Starting..." } });
    const queryLog: QueryLogEntry[] = [];
    const isCurrent = () => this.requests.get(id) === controller;
    let finished = false;
    const finish = (message: Message) => {
      if (finished) return;
      finished = this.complete(id, controller, messages, message);
    };
    // Suggestions can arrive after the answer; attach them to that answer.
    const addSuggestions = (suggestions: string[]) => {
      this.commit({ conversations: this.state.conversations.map(c => {
        const last = c.messages.at(-1);
        return c.id === id && last?.role === "assistant" && !last.isError && c.messages.length === messages.length + 1
          ? { ...c, messages: [...c.messages.slice(0, -1), { ...last, suggestions }] } : c;
      }) });
    };
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      // Its own signal, so a response that never starts can be abandoned and recovered like a dropped one.
      const attempt = new AbortController();
      controller.signal.addEventListener("abort", () => attempt.abort(), { once: true });
      const headerTimer = setTimeout(() => attempt.abort(), this.timing.headerMs);
      const res = await this.request("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: attempt.signal,
        body: JSON.stringify({ question, conversationId: id, requestId, reasoningLevel: this.state.reasoningLevel,
          history: history.filter(m => !m.isError).map(m => ({ role: m.role, content: m.content })) }),
      }).finally(() => clearTimeout(headerTimer));
      if (!res.ok) {
        // A gateway timeout may still have a saved answer behind it.
        if (res.status === 502 || res.status === 504) throw new Error("Gateway error");
        const error = await res.json().catch(() => null);
        throw new ServerError(error?.error ?? (res.status === 429 ? "Too many requests. Please try again in a minute." : "AI questions are temporarily unavailable."));
      }
      if (!res.body) throw new Error("The server returned an empty response. Please try again.");
      reader = res.body.getReader();
      const active = reader;
      const decoder = new TextDecoder();
      let buffer = "";
      while (isCurrent()) {
        const { done, value } = await readWithin(active, this.timing.stallMs);
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() ?? "";
        if (done && buffer.trim()) parts.push(buffer);
        let partial = this.state.partials[id] ?? "";
        const partialBefore = partial;
        for (const part of parts) {
          const event = parseEvent(part);
          if (!event) continue;
          if (finished) {
            if (event.type === "suggestions") addSuggestions(suggestionList(event.suggestions));
            continue;
          }
          if (!isCurrent()) return;
          if (event.type === "delta" && typeof event.text === "string") {
            partial += event.text;
          } else if (event.type === "reset") {
            partial = "";
          } else if (event.type === "phase" && typeof event.label === "string") {
            this.commit({ phases: { ...this.state.phases, [id]: event.label } }, false);
          } else if (event.type === "query") {
            queryLog.push({ index: event.index ?? queryLog.length + 1, reason: event.reason ?? "", sql: event.sql ?? "" });
          } else if (event.type === "done") {
            finish({ role: "assistant", content: event.answer ?? "No answer returned.", suggestions: suggestionList(event.suggestions), pages: pageList(event.pages), queryLog, reasoningUsed: event.reasoningLevel });
          } else if (event.type === "error") {
            throw new ServerError(event.message ?? "Something went wrong. Please try again.");
          }
        }
        if (finished) {
          // Resolve now; keep reading in the background for follow-up suggestions.
          if (!done) { void drainLate(reader, decoder, buffer, addSuggestions); reader = undefined; }
          return;
        }
        if (partial !== partialBefore)
          this.commit({ partials: { ...this.state.partials, [id]: partial } }, false);
        if (done) throw new Error("The connection ended before an answer arrived.");
      }
    } catch (error) {
      if (finished || !isCurrent()) return;
      if (error instanceof ServerError) finish({ role: "assistant", content: error.message, isError: true });
      else {
        // The server keeps working and saves the answer; fetch it instead of losing the chat.
        await reader?.cancel().catch(() => {});
        reader = undefined;
        await this.resume(id, requestId, now, messages, controller, queryLog);
        finished = true;
      }
    } finally {
      if (isCurrent()) this.requests.delete(id);
      await reader?.cancel().catch(() => {});
    }
  }
}

interface StreamEvent {
  type?: string;
  text?: string;
  label?: string;
  index?: number;
  reason?: string;
  sql?: string;
  answer?: string;
  message?: string;
  reasoningLevel?: string;
  suggestions?: unknown;
  pages?: unknown;
}
function parseEvent(part: string): StreamEvent | null {
  const line = part.split(/\r?\n/).find(l => l.startsWith("data: "));
  if (!line) return null;
  try { return JSON.parse(line.slice(6)); } catch { return null; }
}
/** Reads the next chunk, treating a silent connection as dropped. */
function readWithin(reader: ReadableStreamDefaultReader<Uint8Array>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stalled = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("The connection stalled.")), ms);
  });
  return Promise.race([reader.read(), stalled]).finally(() => clearTimeout(timer));
}
/** Runs one request under a time limit, also stopping if the parent signal aborts. */
async function within<T>(ms: number, parent: AbortSignal | undefined, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const attempt = new AbortController();
  const stop = () => attempt.abort();
  parent?.addEventListener("abort", stop, { once: true });
  const timer = setTimeout(stop, ms);
  try { return await run(attempt.signal); } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", stop);
  }
}
function savedMessage(result: SavedResult, queryLog: QueryLogEntry[]): Message {
  if (result.status !== "success" || typeof result.answer !== "string")
    return { role: "assistant", isError: true, content: result.error || "Something went wrong. Please try again." };
  const queries = Array.isArray(result.queries) ? result.queries : [];
  return { role: "assistant", content: result.answer, suggestions: suggestionList(result.suggestions),
    queryLog: queries.length ? queries.map((q, i) => ({ index: i + 1, reason: String(q?.reason ?? ""), sql: String(q?.sql ?? "") })) : queryLog,
    pages: pageList(result.pages), reasoningUsed: result.reasoningLevel };
}
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>(resolve => {
    const timer = setTimeout(done, ms);
    function done() { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); }
    signal.addEventListener("abort", done);
  });
}
/** Only in-app paths, so a saved or streamed value can never become an outside link. */
const pageList = (value: unknown): PageLink[] =>
  Array.isArray(value) ? value.filter((p): p is PageLink => Boolean(p) && typeof p.label === "string"
    && typeof p.href === "string" && p.href.startsWith("/") && !p.href.startsWith("//")).slice(0, 3) : [];
const suggestionList = (value: unknown) =>
  Array.isArray(value) ? value.filter((s): s is string => typeof s === "string").slice(0, 3) : [];
/** Reads events after the answer (just suggestions), giving up after 30 seconds. */
async function drainLate(reader: ReadableStreamDefaultReader<Uint8Array>, decoder: TextDecoder, buffer: string, onSuggestions: (s: string[]) => void) {
  const timer = setTimeout(() => { reader.cancel().catch(() => {}); }, 30_000);
  // Don't hold a Node test process open; browsers ignore this.
  (timer as unknown as { unref?: () => void }).unref?.();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() ?? "";
      if (done && buffer.trim()) parts.push(buffer);
      for (const part of parts) {
        const event = parseEvent(part);
        if (event?.type === "suggestions") onSuggestions(suggestionList(event.suggestions));
      }
      if (done) return;
    }
  } catch {} finally {
    clearTimeout(timer);
    reader.cancel().catch(() => {});
  }
}
