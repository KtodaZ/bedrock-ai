"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { useQuery } from "@tanstack/react-query";

interface Message {
  role: "user" | "assistant";
  content: string;
  suggestions?: string[];
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "bedrock-conversations";

const FALLBACK_SUGGESTIONS = [
  "Who is showing up the most in the last 30 days?",
  "Which site has the most posts this year?",
  "Who has led the most Qs overall?",
  "Give me the Kotter List",
  "How many FNGs have we had this month?",
  "Who needs a shout out to come back?",
];

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConversations(convos: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convos));
  } catch {}
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const SIDEBAR_WIDTH = 260;

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { data: suggestionsData, isLoading: suggestionsLoading } = useQuery({
    queryKey: ["suggestions"],
    queryFn: async () => {
      const res = await fetch("/api/suggestions");
      if (!res.ok) throw new Error("Failed to fetch suggestions");
      const { suggestions } = await res.json();
      return suggestions as string[];
    },
    placeholderData: FALLBACK_SUGGESTIONS,
  });
  const suggestions = suggestionsData ?? FALLBACK_SUGGESTIONS;
  const [reasoningLevel, setReasoningLevel] = useState<"low" | "medium" | "high">("low");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setConversations(loadConversations());
  }, []);


  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const persistConversation = useCallback((id: string, msgs: Message[]) => {
    setConversations((prev) => {
      const existing = prev.find((c) => c.id === id);
      let updated: Conversation[];
      if (existing) {
        updated = prev.map((c) =>
          c.id === id ? { ...c, messages: msgs, updatedAt: Date.now() } : c
        );
      } else {
        const title =
          msgs.find((m) => m.role === "user")?.content.slice(0, 60) ??
          "New conversation";
        updated = [{ id, title, messages: msgs, createdAt: Date.now(), updatedAt: Date.now() }, ...prev];
      }
      saveConversations(updated);
      return updated;
    });
  }, []);

  async function sendMessage(question: string) {
    if (!question.trim() || loading) return;

    const currentId = activeId ?? crypto.randomUUID();
    if (!activeId) setActiveId(currentId);

    const userMsg: Message = { role: "user", content: question };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
          reasoningLevel,
        }),
      });
      const data = await res.json();
      const assistantMsg: Message = {
        role: "assistant",
        content: data.answer ?? data.error ?? "Something went wrong.",
        suggestions: data.suggestions ?? [],
      };
      const finalMessages = [...nextMessages, assistantMsg];
      setMessages(finalMessages);
      persistConversation(currentId, finalMessages);
    } catch {
      const errMsg: Message = { role: "assistant", content: "Failed to reach the server. Try again." };
      const finalMessages = [...nextMessages, errMsg];
      setMessages(finalMessages);
      persistConversation(currentId, finalMessages);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function startNewChat() {
    setMessages([]);
    setActiveId(null);
    setInput("");
    if (window.innerWidth < 768) setSidebarOpen(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function restoreConversation(convo: Conversation) {
    setMessages(convo.messages);
    setActiveId(convo.id);
    if (window.innerWidth < 768) setSidebarOpen(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  function copyMessage(content: string, index: number) {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  }

  function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setConversations((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      saveConversations(updated);
      return updated;
    });
    if (activeId === id) {
      setMessages([]);
      setActiveId(null);
    }
  }

  const sidebarContent = (
    <>
      {/* Sidebar header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)" }}
          >
            B
          </div>
          <span className="text-sm font-semibold text-white/70 truncate">Bedrock AI</span>
        </div>
        <button
          onClick={() => setSidebarOpen(false)}
          className="text-white/25 hover:text-white/60 transition-colors cursor-pointer p-1 rounded-lg hover:bg-white/5 flex-shrink-0"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* New chat button */}
      <div className="px-2 pt-2">
        <button
          onClick={startNewChat}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/50 hover:text-white/80 hover:bg-white/5 transition-all duration-150 cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New chat
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto py-1 scrollbar-thin">
        {conversations.length === 0 ? (
          <p className="text-xs text-white/20 text-center mt-8 px-4">No conversations yet</p>
        ) : (
          conversations.map((convo) => (
            <div
              key={convo.id}
              onClick={() => restoreConversation(convo)}
              className="mx-2 my-0.5 px-3 py-2 rounded-lg flex items-start gap-2 group transition-colors duration-100 cursor-pointer"
              style={activeId === convo.id
                ? { background: "rgba(124,58,237,0.15)" }
                : { background: "transparent" }
              }
              onMouseEnter={(e) => {
                if (activeId !== convo.id) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
              }}
              onMouseLeave={(e) => {
                if (activeId !== convo.id) (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs text-white/60 truncate leading-snug">{convo.title}</p>
                <p className="text-[10px] text-white/25 mt-0.5">{formatDate(convo.updatedAt)}</p>
              </div>
              <button
                onClick={(e) => deleteConversation(convo.id, e)}
                className="opacity-0 group-hover:opacity-100 text-white/25 hover:text-white/60 transition-all flex-shrink-0 cursor-pointer p-0.5 mt-0.5"
                title="Delete"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#07070f" }}>
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #7c3aed, transparent 70%)" }} />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, #2563eb, transparent 70%)" }} />
      </div>

      {/* ── DESKTOP sidebar: part of flex flow, pushes content ── */}
      <aside
        className="hidden md:flex flex-col flex-shrink-0 overflow-hidden transition-all duration-300 relative z-10"
        style={{
          width: sidebarOpen ? SIDEBAR_WIDTH : 0,
          background: "#0b0b17",
          borderRight: sidebarOpen ? "1px solid rgba(255,255,255,0.06)" : "none",
        }}
      >
        <div style={{ width: SIDEBAR_WIDTH, minWidth: SIDEBAR_WIDTH }} className="flex flex-col h-full">
          {sidebarContent}
        </div>
      </aside>

      {/* ── MOBILE sidebar: fixed overlay ── */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-20 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className="md:hidden fixed inset-y-0 left-0 z-30 flex flex-col transition-transform duration-300"
        style={{
          width: "min(260px, 85vw)",
          background: "#0b0b17",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
        }}
      >
        {sidebarContent}
      </aside>

      {/* ── Main content ── */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden relative z-10">
        {/* Header */}
        <header className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-3">
            {/* Toggle button */}
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              className="text-white/30 hover:text-white/70 transition-colors cursor-pointer p-1 rounded-lg hover:bg-white/5"
              title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <span className="font-semibold text-white/80 tracking-tight text-sm">Bedrock AI</span>
            <span className="hidden sm:inline text-xs text-white/25 border border-white/10 rounded-full px-2 py-0.5">
              F3 Intelligence
            </span>
          </div>
          <div className="flex items-center gap-3">
            {messages.length > 0 && (
              <button
                onClick={startNewChat}
                className="text-white/30 hover:text-white/60 transition-colors border border-white/10 rounded-full px-3 py-1.5 hover:border-white/20 cursor-pointer flex items-center gap-1.5"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span className="hidden sm:inline text-xs">New chat</span>
              </button>
            )}
            <select
              value={reasoningLevel}
              onChange={(e) => setReasoningLevel(e.target.value as "low" | "medium" | "high")}
              className="text-xs rounded-lg px-2 py-1.5 border border-white/10 bg-transparent text-white/40 hover:text-white/60 hover:border-white/20 transition-colors cursor-pointer outline-none"
              style={{ background: "rgba(255,255,255,0.03)" }}
              title="Reasoning level"
            >
              <option value="low" style={{ background: "#0f0f1a" }}>Low Reasoning</option>
              <option value="medium" style={{ background: "#0f0f1a" }}>Medium Reasoning</option>
              <option value="high" style={{ background: "#0f0f1a" }}>High Reasoning</option>
            </select>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-white/30">Live data</span>
            </div>
          </div>
        </header>

        {/* Chat area */}
        <main className="flex-1 overflow-y-auto flex flex-col">
          <div className="flex-1 flex flex-col max-w-3xl w-full mx-auto px-4 py-6 gap-6">
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-8 py-16">
                <div className="text-center">
                  <h1
                    className="text-4xl font-bold mb-3 bg-clip-text text-transparent"
                    style={{ backgroundImage: "linear-gradient(135deg, #a78bfa, #60a5fa, #f0f0ff)" }}
                  >
                    Ask anything about Bedrock
                  </h1>
                  <p className="text-white/40 text-sm">
                    Real-time answers from your workout attendance data
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
                  {suggestionsLoading
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <div
                          key={i}
                          className="h-12 rounded-xl border border-white/5"
                          style={{ background: "rgba(255,255,255,0.02)", animation: `pulse 1.5s ease-in-out ${i * 0.1}s infinite` }}
                        />
                      ))
                    : suggestions.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="text-left text-sm px-4 py-3 rounded-xl border border-white/8 text-white/60 hover:text-white/90 hover:border-violet-500/40 hover:bg-violet-500/5 transition-all duration-200 cursor-pointer"
                      style={{ background: "rgba(255,255,255,0.02)" }}
                    >
                      {q}
                    </button>
                  ))}
                </div>

              </div>
            ) : (
              <div className="flex flex-col gap-4 pb-2">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && (
                      <div
                        className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold mt-0.5"
                        style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)" }}
                      >
                        B
                      </div>
                    )}
                    <div className={`max-w-[80%] flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                      <div
                        className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          msg.role === "user" ? "rounded-tr-sm" : "rounded-tl-sm"
                        }`}
                        style={
                          msg.role === "user"
                            ? { background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "white" }
                            : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.85)" }
                        }
                      >
                        {msg.role === "assistant" ? (
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                              ul: ({ children }) => <ul className="list-disc list-inside mb-1 space-y-0.5">{children}</ul>,
                              ol: ({ children }) => <ol className="list-decimal list-inside mb-1 space-y-0.5">{children}</ol>,
                              li: ({ children }) => <li>{children}</li>,
                              strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                              em: ({ children }) => <em className="italic">{children}</em>,
                              h1: ({ children }) => <h1 className="text-base font-bold mb-1">{children}</h1>,
                              h2: ({ children }) => <h2 className="text-sm font-bold mb-1">{children}</h2>,
                              h3: ({ children }) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
                              code: ({ children }) => <code className="bg-white/10 rounded px-1 text-xs font-mono">{children}</code>,
                              hr: () => <hr className="border-white/10 my-2" />,
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        ) : (
                          msg.content
                        )}
                      </div>
                      {msg.role === "assistant" && (
                        <button
                          onClick={() => copyMessage(msg.content, i)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all duration-150 cursor-pointer"
                          style={{ color: copiedIndex === i ? "rgba(52,211,153,0.8)" : "rgba(255,255,255,0.2)" }}
                          title="Copy response"
                        >
                          {copiedIndex === i ? (
                            <>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              Copied
                            </>
                          ) : (
                            <>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                              Copy
                            </>
                          )}
                        </button>
                      )}
                      {msg.role === "assistant" && msg.suggestions && msg.suggestions.length > 0 && i === messages.length - 1 && (
                        <div className="flex flex-col gap-1.5 mt-1">
                          {msg.suggestions.map((s) => (
                            <button
                              key={s}
                              onClick={() => sendMessage(s)}
                              className="text-left text-xs px-3 py-2 rounded-xl border border-white/8 text-white/50 hover:text-white/80 hover:border-violet-500/30 hover:bg-violet-500/5 transition-all duration-150 cursor-pointer"
                              style={{ background: "rgba(255,255,255,0.02)" }}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex gap-3 justify-start">
                    <div
                      className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold"
                      style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)" }}
                    >
                      B
                    </div>
                    <div
                      className="rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                    >
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full bg-violet-400"
                          style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}

            {/* Input */}
            <div
              className="sticky bottom-0 pb-4 pt-2"
              style={{ background: "linear-gradient(to top, #07070f 80%, transparent)" }}
            >
              <div
                className="relative rounded-2xl p-px"
                style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.5), rgba(37,99,235,0.5))" }}
              >
                <div
                  className="relative rounded-2xl flex items-end gap-3 px-4 py-3"
                  style={{ background: "#0f0f1a" }}
                >
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about workouts, attendance, leaders..."
                    rows={1}
                    className="flex-1 bg-transparent placeholder-white/20 text-sm resize-none outline-none leading-relaxed max-h-32 overflow-y-auto scrollbar-thin"
                    style={{ minHeight: "24px", color: "rgba(255,255,255,0.9)" }}
                    onInput={(e) => {
                      const t = e.target as HTMLTextAreaElement;
                      t.style.height = "auto";
                      t.style.height = `${Math.min(t.scrollHeight, 128)}px`;
                    }}
                  />
                  <button
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() || loading}
                    className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 active:scale-95 cursor-pointer"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)" }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              </div>
              <p className="text-center text-xs mt-2" style={{ color: "rgba(255,255,255,0.15)" }}>
                Data refreshes every 10 minutes · Press Enter to send
              </p>
            </div>
          </div>
        </main>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
