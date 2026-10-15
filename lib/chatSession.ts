export interface QueryLogEntry {
  index: number;
  reason: string;
  sql: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  suggestions?: string[];
  queryLog?: QueryLogEntry[];
  reasoningUsed?: string;
  isError?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  pending?: boolean;
}

type Reasoning = "auto" | "low" | "medium" | "high";
interface SessionState {
  conversations: Conversation[];
  activeId: string | null;
  drafts: Record<string, string>;
  reasoningLevel: Reasoning;
  phases: Record<string, string>;
  ready: boolean;
  storageError: boolean;
}
const HISTORY_KEY = "bedrock-conversations";
const SESSION_KEY = "bedrock-chat-session";
const NEW_DRAFT = "new";
export const INITIAL_CHAT_STATE: SessionState = {
  conversations: [], activeId: null, drafts: {}, reasoningLevel: "auto",
  phases: {}, ready: false, storageError: false,
};
const interruptedMessage: Message = {
  role: "assistant", isError: true,
  content: "This request was interrupted before an answer was saved. Your question is saved; send it again to try again.",
};

function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") return false;
  const m = value as Message;
  return (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
    && (m.suggestions === undefined || (Array.isArray(m.suggestions) && m.suggestions.every(s => typeof s === "string")))
    && (m.queryLog === undefined || (Array.isArray(m.queryLog) && m.queryLog.every(q => q && typeof q.index === "number" && typeof q.sql === "string" && typeof q.reason === "string")));
}
function isConversation(value: unknown): value is Conversation {
  if (!value || typeof value !== "object") return false;
  const c = value as Conversation;
  return typeof c.id === "string" && typeof c.title === "string"
    && Number.isFinite(c.createdAt) && Number.isFinite(c.updatedAt)
    && Array.isArray(c.messages) && c.messages.every(isMessage);
}

// Owned by the root provider, so route changes never own or cancel requests.
export class ChatSession {
  private state = INITIAL_CHAT_STATE;
  private listeners = new Set<() => void>();
  private requests = new Map<string, AbortController>();
  constructor(private storage: () => Storage, private request: typeof fetch = (...args) => fetch(...args)) {}
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
      if (Array.isArray(raw)) conversations = raw.filter(isConversation).map(c => c.pending
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
    delete drafts[id];
    delete phases[id];
    this.commit({ conversations: this.state.conversations.filter(c => c.id !== id), drafts, phases,
      activeId: this.state.activeId === id ? null : this.state.activeId });
  };

  async sendMessage(question: string) {
    if (!this.state.ready || !question.trim() || question.length > 2000) return;
    const id = this.state.activeId ?? crypto.randomUUID();
    if (this.requests.has(id)) return;
    const controller = new AbortController();
    this.requests.set(id, controller);
    const previous = this.state.conversations.find(c => c.id === id);
    const history = previous?.messages ?? [];
    const messages: Message[] = [...history, { role: "user", content: question }];
    const now = Date.now();
    const conversation: Conversation = { id, title: previous?.title ?? question.slice(0, 60),
      createdAt: previous?.createdAt ?? now, updatedAt: now, messages, pending: true };
    this.commit({ activeId: id, conversations: [conversation, ...this.state.conversations.filter(c => c.id !== id)],
      drafts: { ...this.state.drafts, [this.state.activeId ?? NEW_DRAFT]: "", [id]: "" },
      phases: { ...this.state.phases, [id]: "Starting..." } });
    const queryLog: QueryLogEntry[] = [];
    const isCurrent = () => this.requests.get(id) === controller;
    const finish = (message: Message) => {
      if (!isCurrent()) return;
      const phases = { ...this.state.phases };
      delete phases[id];
      this.commit({ phases, conversations: this.state.conversations.map(c => c.id === id
        ? { ...c, messages: [...messages, message], pending: false, updatedAt: Date.now() } : c) });
    };
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const res = await this.request("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ question, conversationId: id, reasoningLevel: this.state.reasoningLevel,
          history: history.filter(m => !m.isError).map(m => ({ role: m.role, content: m.content })) }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error ?? (res.status === 429 ? "Too many requests. Please try again in a minute." : "AI questions are temporarily unavailable."));
      }
      if (!res.body) throw new Error("The server returned an empty response. Please try again.");
      reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (isCurrent()) {
        const { done, value } = await reader.read();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() ?? "";
        if (done && buffer.trim()) parts.push(buffer);
        for (const part of parts) {
          const line = part.split(/\r?\n/).find(l => l.startsWith("data: "));
          if (!line) continue;
          let event;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }
          if (!isCurrent()) return;
          if (event.type === "phase" && typeof event.label === "string") {
            this.commit({ phases: { ...this.state.phases, [id]: event.label } }, false);
          } else if (event.type === "query") {
            queryLog.push({ index: event.index, reason: event.reason, sql: event.sql });
          } else if (event.type === "done") {
            finish({ role: "assistant", content: event.answer ?? "No answer returned.", suggestions: event.suggestions ?? [], queryLog, reasoningUsed: event.reasoningLevel });
            return;
          } else if (event.type === "error") {
            throw new Error(event.message ?? "Something went wrong. Please try again.");
          }
        }
        if (done) throw new Error("The connection ended before an answer arrived. Your question is saved; send it again to try again.");
      }
    } catch (error) {
      finish({ role: "assistant", content: error instanceof Error ? error.message : "Failed to reach the server.", isError: true });
    } finally {
      if (isCurrent()) this.requests.delete(id);
      await reader?.cancel().catch(() => {});
    }
  }
}
