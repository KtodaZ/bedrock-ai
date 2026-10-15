import type { Metadata } from "next";
import Link from "next/link";
import EhChallenge from "../EhChallenge";

export const metadata: Metadata = {
  title: "EH Challenge · Bedrock",
  description: "Follow the Bedrock EH Challenge standings, FNG milestones, and weekly themes.",
};

export default function EhChallengePage() {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-white/10 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <span className="font-semibold text-sm text-white/80">Bedrock Data AI</span>
          <nav aria-label="Main navigation" className="flex items-center gap-1 text-xs">
            <Link href="/" className="text-white/60 hover:text-white rounded-full px-3 py-2 focus-visible:outline-2 focus-visible:outline-violet-400">AI Chat</Link>
            <Link href="/data" className="text-white/60 hover:text-white rounded-full px-3 py-2 focus-visible:outline-2 focus-visible:outline-violet-400">Data</Link>
            <span aria-current="page" className="text-white bg-violet-600 rounded-full px-3 py-2">EH Challenge</span>
          </nav>
        </div>
      </header>
      <EhChallenge />
    </div>
  );
}
