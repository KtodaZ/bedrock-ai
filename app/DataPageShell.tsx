import Link from "next/link";
import type { ReactNode } from "react";

export default function DataPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-[#07070f] text-[#f0f0ff]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-8">
        <Link href="/" className="text-sm font-semibold text-white/80">
          Bedrock Data AI
        </Link>
        <nav
          aria-label="App navigation"
          className="flex items-center gap-1 text-xs text-white/70"
        >
          <Link
            className="rounded-full px-3 py-2 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-violet-400"
            href="/"
          >
            Chat
          </Link>
          <Link
            className="rounded-full px-3 py-2 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-violet-400"
            href="/eh-challenge"
          >
            EH Challenge
          </Link>
          <Link
            className="rounded-full bg-violet-900/60 px-3 py-2 text-white focus-visible:outline-2 focus-visible:outline-violet-400"
            href="/data"
            aria-current="location"
          >
            Data
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
