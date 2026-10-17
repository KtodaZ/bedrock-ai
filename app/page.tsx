"use client";

import { useState, useRef, useEffect, useSyncExternalStore } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { useQuery } from "@tanstack/react-query";
import EhChallenge from "./EhChallenge";
import DataExplorer from "./DataExplorer";

import Link from "next/link";
import { useChatSession } from "./ChatSessionProvider";
import type { Conversation } from "../lib/chatSession";

const AGENT_BANNER_DISMISSED_KEY = "bedrock-agent-banner-dismissed";
const SUGGESTIONS_KEY = "bedrock-suggestions";
const SUGGESTIONS_TTL = 24 * 60 * 60 * 1000;

const FALLBACK_SUGGESTIONS = [
  "Who is showing up the most in the last 30 days?",
  "Which site has the most posts this year?",
  "Who has led the most Qs overall?",
  "Give me the Kotter List",
  "How many FNGs have we had this month?",
  "Who needs a shout out to come back?",
];

function loadCachedSuggestions(): string[] {
  try {
    const raw = localStorage.getItem(SUGGESTIONS_KEY);
    if (!raw) return FALLBACK_SUGGESTIONS;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > SUGGESTIONS_TTL) return FALLBACK_SUGGESTIONS;
    return data;
  } catch {
    return FALLBACK_SUGGESTIONS;
  }
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
const desktopQuery = "(min-width: 768px)";
function subscribeViewport(listener: () => void) {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}


// Answers only link inside this app; anything else renders as plain text.
const MARKDOWN: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 last:mb-0 space-y-1 pl-1">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 last:mb-0 space-y-1 pl-1 list-decimal list-inside">{children}</ol>,
  li: ({ children }) => (
    <li className="flex gap-2 items-start">
      <span className="mt-1.5 w-1 h-1 rounded-full bg-violet-400/70 flex-shrink-0" />
      <span>{children}</span>
    </li>
  ),
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic text-white/60">{children}</em>,
  h1: ({ children }) => <h1 className="text-base font-bold text-white mt-3 mb-1.5 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-bold text-white/90 mt-3 mb-1.5 first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="text-xs font-semibold text-white/70 uppercase tracking-wide mt-3 mb-1.5 first:mt-0">{children}</h3>,
  code: ({ children }) => <code className="bg-white/10 rounded px-1 text-xs font-mono">{children}</code>,
  hr: () => <hr className="border-white/8 my-3" />,
  a: ({ href, children }) =>
    href && href.startsWith("/") && !href.startsWith("//") ? (
      <Link href={href} className="text-violet-300 underline underline-offset-2 hover:text-violet-200">
        {children}
      </Link>
    ) : (
      <>{children}</>
    ),
};

export default function Home() {
  const { session, messages, input, loading, phaseLabel, partialAnswer, conversations, activeId, reasoningLevel, ready, storageError } = useChatSession();
  const setInput = session.setInput;
  const setReasoningLevel = session.setReasoningLevel;
  const sendMessage = (question: string, options?: { retry?: boolean }) => session.sendMessage(question, options);
  const desktop = useSyncExternalStore(subscribeViewport, () => window.matchMedia(desktopQuery).matches, () => false);
  const [sidebarOverride, setSidebarOpen] = useState<boolean | null>(null);
  const sidebarOpen = sidebarOverride ?? desktop;
  const [tab, setTab] = useState<"chat" | "eh" | "data">("chat");
  useEffect(() => {
    const initialTab = new URLSearchParams(window.location.search).get("tab");
    if (initialTab === "data" || initialTab === "eh") setTab(initialTab);
  }, []);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [expandedQueries, setExpandedQueries] = useState<Set<number>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentBannerVisible, setAgentBannerVisible] = useState(false);
  useEffect(() => {
    try {
      setAgentBannerVisible(localStorage.getItem(AGENT_BANNER_DISMISSED_KEY) !== "true");
    } catch {
      setAgentBannerVisible(true);
    }
  }, []);

  function dismissAgentBanner() {
    setAgentBannerVisible(false);
    try {
      localStorage.setItem(AGENT_BANNER_DISMISSED_KEY, "true");
    } catch {}
  }
  const settingsRef = useRef<HTMLDivElement>(null);
  const [cachedSuggestions, setCachedSuggestions] = useState<string[]>(FALLBACK_SUGGESTIONS);
  useEffect(() => {
    setCachedSuggestions(loadCachedSuggestions());
  }, []);
  const { data: suggestions = cachedSuggestions } = useQuery({
    queryKey: ["suggestions"],
    queryFn: async () => {
      const res = await fetch("/api/suggestions");
      if (!res.ok) throw new Error("Failed to fetch suggestions");
      const { suggestions } = await res.json();
      try {
        localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify({ data: suggestions, ts: Date.now() }));
      } catch {}
      return suggestions as string[];
    },
    placeholderData: cachedSuggestions,
    staleTime: SUGGESTIONS_TTL,
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [settingsOpen]);


  // Scroll once when an answer starts streaming, not on every word.
  const streaming = Boolean(partialAnswer);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, streaming]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function startNewChat() {
    setTab("chat");
    window.history.replaceState(null, "", "/");
    session.startNewChat();
    if (window.innerWidth < 768) setSidebarOpen(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function restoreConversation(convo: Conversation) {
    setTab("chat");
    window.history.replaceState(null, "", "/");
    session.restoreConversation(convo.id);
    if (window.innerWidth < 768) setSidebarOpen(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  function stripMarkdown(md: string): string {
    return md
      .replace(/^#{1,6}\s+/gm, "")          // headings
      .replace(/\*\*(.+?)\*\*/g, "$1")       // bold
      .replace(/\*(.+?)\*/g, "$1")           // italic
      .replace(/`(.+?)`/g, "$1")             // inline code
      .replace(/^[-*]\s+/gm, "• ")           // unordered list bullets
      .replace(/^\d+\.\s+/gm, (m) => m)      // keep numbered list as-is
      .replace(/^-{3,}$/gm, "")              // horizontal rules
      .replace(/\[(.+?)\]\(.+?\)/g, "$1")    // links
      .replace(/\n{3,}/g, "\n\n")            // collapse excess blank lines
      .trim();
  }

  function copyMessage(content: string, index: number) {
    navigator.clipboard.writeText(stripMarkdown(content)).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  }

  function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    session.deleteConversation(id);
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
          <span className="text-sm font-semibold text-white/70 truncate">Bedrock Data</span>
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
                <p className="text-[10px] text-white/50 mt-0.5">{convo.pending ? "Working…" : formatDate(convo.updatedAt)}</p>
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
      <div className="flex-shrink-0 border-t border-white/10 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <Link
          href="/connect"
          className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-[#a78bfa]"
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 3v4m6-4v4M7 7h10v3a5 5 0 0 1-10 0V7Zm5 8v6" />
          </svg>
          Bring your own agent
        </Link>
        <a
          href="https://github.com/KtodaZ/bedrock-ai"
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-[#a78bfa]"
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-12-2 20" />
          </svg>
          View source on GitHub
        </a>
      </div>
    </>
  );

  return (
    <div className="flex h-dvh overflow-hidden" style={{ background: "#07070f" }}>
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
        {/* Bring-your-own-agent banner */}
        {agentBannerVisible && (
          <div
            className="flex-shrink-0 flex items-center text-xs border-b pl-4 pr-1"
            style={{
              background: "linear-gradient(90deg, rgba(124,58,237,0.14), rgba(37,99,235,0.14))",
              borderColor: "rgba(124,58,237,0.2)",
              color: "rgba(255,255,255,0.6)",
            }}
          >
            <Link href="/connect" className="group flex min-h-11 flex-1 items-center justify-center gap-2 py-2 focus-visible:outline-2 focus-visible:outline-[#a78bfa]">
              <span aria-hidden>🔌</span>
              <span>
                <span className="text-white/80 font-medium">Bring your own agent</span>
                <span className="hidden sm:inline"> — connect ChatGPT or Claude to your attendance data via MCP</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[#a78bfa] group-hover:gap-1.5 transition-all font-medium">
                Connect
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>
            </Link>
            <button
              type="button"
              onClick={dismissAgentBanner}
              aria-label="Dismiss bring your own agent banner"
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-white/60 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-[#a78bfa] cursor-pointer"
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        )}
        {/* Header */}
        <header className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-3">
            {/* Toggle button */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-white/30 hover:text-white/70 transition-colors cursor-pointer p-1 rounded-lg hover:bg-white/5"
              title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <span className="hidden sm:inline font-semibold text-white/80 tracking-tight text-sm">Bedrock Data</span>
            <div className="flex rounded-full p-0.5 border border-white/10" style={{ background: "rgba(255,255,255,0.03)" }}>
              {([["chat", "Chat"], ["eh", "EH Challenge"], ["data", "Data"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => {
                    setTab(value);
                    if (value !== "data") window.history.replaceState(null, "", value === "eh" ? "/?tab=eh" : "/");
                  }}
                  aria-pressed={tab === value}
                  className={`text-xs px-3 py-1 rounded-full transition-colors cursor-pointer ${
                    tab === value ? "text-white" : "text-white/40 hover:text-white/70"
                  }`}
                  style={tab === value ? { background: "linear-gradient(135deg, #7c3aed, #2563eb)" } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {tab === "chat" && messages.length > 0 && (
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
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="hidden sm:inline text-xs text-white/30">Live data</span>
            </div>
          </div>
        </header>

        {tab === "eh" && <EhChallenge />}
        {tab === "data" && <DataExplorer />}

        {/* Chat area */}
        <main className={`flex-1 min-h-0 overflow-hidden flex-col ${tab === "chat" ? "flex" : "hidden"}`}>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="min-h-full flex flex-col max-w-3xl w-full mx-auto px-4 py-1 sm:py-6">
              {messages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 sm:gap-8 sm:py-8">
                  <div className="text-center">
                    <h1
                      className="text-3xl sm:text-4xl font-bold mb-2 sm:mb-3 bg-clip-text text-transparent"
                      style={{ backgroundImage: "linear-gradient(135deg, #a78bfa, #60a5fa, #f0f0ff)" }}
                    >
                      Bedrock Data
                    </h1>
                    <p className="text-white/40 text-sm">
                      Ask about your F3 workout attendance
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
                    {(suggestions ?? FALLBACK_SUGGESTIONS).map((q) => (
                      <button
                        key={q}
                        onClick={() => sendMessage(q)}
                        className="min-h-11 text-left text-sm px-4 py-2 sm:py-3 rounded-xl border border-white/8 text-white/60 hover:text-white/90 hover:border-violet-500/40 hover:bg-violet-500/5 transition-all duration-200 cursor-pointer"
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
                            <ReactMarkdown components={MARKDOWN}>{msg.content}</ReactMarkdown>
                          ) : (
                            msg.content
                          )}
                        </div>
                        {msg.role === "assistant" && msg.pages && msg.pages.length > 0 && (
                          <div className="flex flex-wrap gap-1.5" aria-label="Pages with this data">
                            {msg.pages.map((p) => (
                              <Link
                                key={p.href}
                                href={p.href}
                                className="flex items-center gap-1.5 min-h-8 px-3 py-1.5 rounded-xl border border-violet-400/25 text-xs text-violet-200/90 hover:text-white hover:border-violet-400/50 hover:bg-violet-500/10 transition-all duration-150"
                                style={{ background: "rgba(124,58,237,0.08)" }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M3 3v18h18" />
                                  <path d="M7 15l4-4 3 3 5-6" />
                                </svg>
                                {p.label}
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="opacity-60">
                                  <path d="M5 12h14M13 6l6 6-6 6" />
                                </svg>
                              </Link>
                            ))}
                          </div>
                        )}
                        {msg.role === "assistant" && (
                          <div className="flex items-center gap-2">
                          {msg.reasoningUsed && !msg.isError && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ color: "rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.04)" }}>
                              {msg.reasoningUsed}
                            </span>
                          )}
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
                          </div>
                        )}
                        {msg.role === "assistant" && msg.isError && (
                          <button
                            onClick={() => {
                              const lastUserMsg = [...messages].slice(0, i).reverse().find((m) => m.role === "user");
                              if (lastUserMsg) sendMessage(lastUserMsg.content, { retry: i === messages.length - 1 });
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 transition-all cursor-pointer mt-1"
                            style={{ background: "rgba(255,255,255,0.03)" }}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="1 4 1 10 7 10" />
                              <path d="M3.51 15a9 9 0 1 0 .49-3.49" />
                            </svg>
                            Try again
                          </button>
                        )}
                        {msg.role === "assistant" && msg.queryLog && msg.queryLog.length > 0 && (
                          <div className="mt-1">
                            <button
                              onClick={() => setExpandedQueries((prev) => {
                                const next = new Set(prev);
                                next.has(i) ? next.delete(i) : next.add(i);
                                return next;
                              })}
                              className="flex items-center gap-1.5 text-[11px] transition-colors cursor-pointer"
                              style={{ color: "rgba(255,255,255,0.2)" }}
                            >
                              <svg
                                width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                style={{ transform: expandedQueries.has(i) ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
                              >
                                <polyline points="9 18 15 12 9 6" />
                              </svg>
                              {msg.queryLog.length} {msg.queryLog.length === 1 ? "lookup" : "lookups"}
                            </button>
                            {expandedQueries.has(i) && (
                              <div className="mt-2 flex flex-col gap-2">
                                {msg.queryLog.map((q) => (
                                  <div key={q.index} className="rounded-lg px-3 py-2.5 text-[11px] font-mono" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                                    {q.reason && (
                                      <p className="text-white/35 mb-1.5 font-sans text-[10px] uppercase tracking-wide">{q.reason}</p>
                                    )}
                                    <p className="text-violet-300/70 leading-relaxed whitespace-pre-wrap break-all">{q.sql}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
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
                        className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold mt-0.5"
                        style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)" }}
                      >
                        B
                      </div>
                      <div className="flex flex-col gap-1.5 max-w-[80%] min-w-0">
                        {partialAnswer ? (
                          <div
                            aria-live="polite"
                            className="rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed"
                            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.85)" }}
                          >
                            <ReactMarkdown components={MARKDOWN}>{partialAnswer}</ReactMarkdown>
                          </div>
                        ) : (
                        <>
                        {phaseLabel && (
                          <p className="text-xs text-white/35 italic pl-1">{phaseLabel}</p>
                        )}
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
                        </>
                        )}
                      </div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>
          </div>

          {/* Input */}
          <div
            className="flex-shrink-0 max-w-3xl w-full mx-auto px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-6"
            style={{ background: "linear-gradient(to top, #07070f 80%, transparent)" }}
          >
            {storageError && (
              <p role="status" className="mb-2 text-xs text-amber-200">
                Chats could not be saved in this browser. Keep this page open to retain your conversation.
              </p>
            )}
            <div className="relative">
              <div
                className="relative rounded-2xl p-px"
                style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.5), rgba(37,99,235,0.5))" }}
              >
                <div
                  className="relative rounded-2xl flex flex-col px-4 pt-3 pb-2"
                  style={{ background: "#0f0f1a" }}
                >
                  <textarea
                    maxLength={2000}
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about workouts, attendance, leaders..."
                    aria-label="Message"
                    rows={1}
                    className="flex-1 bg-transparent placeholder-white/20 text-base sm:text-sm resize-none outline-none leading-relaxed max-h-32 overflow-y-auto scrollbar-thin w-full"
                    style={{ minHeight: "24px", color: "rgba(255,255,255,0.9)" }}
                    onInput={(e) => {
                      const t = e.target as HTMLTextAreaElement;
                      t.style.height = "auto";
                      t.style.height = `${Math.min(t.scrollHeight, 128)}px`;
                    }}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <select
                      value={reasoningLevel}
                      onChange={(e) => setReasoningLevel(e.target.value as "auto" | "low" | "medium" | "high")}
                      className="text-xs rounded-lg px-2 py-1 border border-white/8 bg-transparent text-white/30 hover:text-white/50 hover:border-white/15 transition-colors cursor-pointer outline-none"
                      style={{ background: "rgba(255,255,255,0.03)" }}
                      title="Reasoning level"
                    >
                      <option value="auto" style={{ background: "#0f0f1a" }}>Auto</option>
                      <option value="low" style={{ background: "#0f0f1a" }}>Low</option>
                      <option value="medium" style={{ background: "#0f0f1a" }}>Medium</option>
                      <option value="high" style={{ background: "#0f0f1a" }}>High</option>
                    </select>
                    <button
                      aria-label="Send message"
                      onClick={() => sendMessage(input)}
                      disabled={!ready || !input.trim() || loading}
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
              </div>
            </div>
            <p className="text-center text-xs mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1" style={{ color: "rgba(255,255,255,0.15)" }}>
              <span className="hidden sm:inline">Queries your live attendance data · Press Enter to send</span>
              <span className="hidden sm:inline" style={{ color: "rgba(255,255,255,0.1)" }}>·</span>
              <Link
                href="/how-it-works"
                className="transition-colors hover:text-white/40 underline underline-offset-2"
                style={{ color: "rgba(255,255,255,0.2)", textDecorationColor: "rgba(255,255,255,0.1)" }}
              >
                How it works
              </Link>
            </p>
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
