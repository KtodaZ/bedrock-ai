"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { ChatSession, INITIAL_CHAT_STATE } from "../lib/chatSession";

const ChatContext = createContext<ChatSession | null>(null);
export default function ChatSessionProvider({ children }: { children: React.ReactNode }) {
  const [session] = useState(() => new ChatSession(() => window.localStorage));
  useEffect(() => { session.hydrate(); }, [session]);
  return <ChatContext.Provider value={session}>{children}</ChatContext.Provider>;
}

export function useChatSession() {
  const session = useContext(ChatContext);
  if (!session) throw new Error("ChatSessionProvider is required");
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, () => INITIAL_CHAT_STATE);
  const conversation = state.conversations.find(c => c.id === state.activeId);
  return { ...state, session, messages: conversation?.messages ?? [],
    input: state.drafts[state.activeId ?? "new"] ?? "",
    loading: Boolean(conversation?.pending), phaseLabel: state.phases[state.activeId ?? ""] ?? "" };
}
