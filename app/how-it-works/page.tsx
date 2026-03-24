import Link from "next/link";

export const metadata = {
  title: "How It Works — Bedrock Data AI",
  description: "How Bedrock Data AI answers questions about F3 attendance",
};

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen" style={{ background: "#07070f", color: "rgba(255,255,255,0.85)" }}>
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, #7c3aed, transparent 70%)" }}
        />
        <div
          className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #2563eb, transparent 70%)" }}
        />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-6 py-12 pb-20">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm mb-10 transition-opacity hover:opacity-80"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Bedrock AI
        </Link>

        {/* Header */}
        <div className="mb-12">
          <div
            className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full mb-6"
            style={{ background: "rgba(124,58,237,0.15)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.3)" }}
          >
            Under the Hood
          </div>
          <h1
            className="text-3xl sm:text-4xl font-bold mb-4 bg-clip-text text-transparent leading-tight"
            style={{ backgroundImage: "linear-gradient(135deg, #a78bfa, #60a5fa, #f0f0ff)" }}
          >
            How Bedrock Data AI Works
          </h1>
          <p className="text-base leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
            You type a question in plain English. A few seconds later you get a precise, data-backed answer. Here&apos;s what happens in between.
          </p>
        </div>

        {/* Section: The Big Picture */}
        <Section title="The Big Picture">
          <p>
            Bedrock Data AI is not a search engine and it&apos;s not a chatbot pulling answers from general knowledge. It&apos;s a purpose-built system that connects natural language questions directly to your actual attendance data — and only answers from what it can prove.
          </p>
          <p>
            When you ask a question, the system fetches the latest data from the source Google Sheet, loads it into a temporary in-memory database, and hands it to an AI model that figures out how to query it. The model runs as many queries as it needs, checks its own work, and only then writes an answer.
          </p>
          <Diagram />
        </Section>

        {/* Section: Where the Data Comes From */}
        <Section title="Where the Data Comes From">
          <p>
            The single source of truth is the F3 attendance Google Sheet. Rather than syncing to a separate database, the system fetches it fresh on each request — exported as a plain spreadsheet file directly from Google. This means the data you see in answers is never more than a few minutes stale.
          </p>
          <p>
            Once fetched, the spreadsheet is loaded into a lightweight in-memory database that lives only for the duration of the session. It&apos;s discarded after 10 minutes and rebuilt fresh on the next request. There&apos;s no persistent copy of your data stored on any server.
          </p>
        </Section>

        {/* Section: How the AI Answers */}
        <Section title="How the AI Actually Answers">
          <p>
            Most AI assistants generate answers by predicting what sounds right based on training. Bedrock does the opposite — the model is not allowed to guess. Instead, it is given one capability: the ability to query the database directly.
          </p>
          <p>
            When you ask a question, the model figures out what queries would answer it, runs them, reads the real results, and decides if it has enough information. If not, it runs more queries. A typical question involves two to five round trips before the model is confident enough to write a response.
          </p>
          <p>
            This approach eliminates a whole class of AI errors. The model can&apos;t invent attendance numbers, fabricate names, or misremember dates — because it never relied on memory in the first place. Every sentence in the answer traces back to a real query result you can inspect.
          </p>
          <p>
            You can see this in action: each AI response shows the queries that were run underneath it.
          </p>
          <KeyValue items={[
            ["Step 1", "Model reads your question and plans an approach"],
            ["Step 2", "Model writes a database query and runs it"],
            ["Step 3", "Model reads the results and decides what to query next"],
            ["Step 4", "Model validates its answer with a cross-check query"],
            ["Step 5", "Model writes the final answer from confirmed results only"],
          ]} />
        </Section>

        {/* Section: Real-Time Progress */}
        <Section title="Real-Time Progress">
          <p>
            Because the process takes a few seconds, the UI streams status updates as work happens — &ldquo;Loading attendance data,&rdquo; &ldquo;Analyzing your question,&rdquo; &ldquo;Validating results&rdquo; — so you always know where things stand rather than staring at a spinner.
          </p>
          <p>
            The AI&apos;s response begins appearing as soon as it&apos;s ready, and follow-up question suggestions are generated in parallel so they&apos;re waiting for you the moment the answer lands.
          </p>
        </Section>

        {/* Section: Vercel Challenges */}
        <Section title="Running This on Serverless Infrastructure">
          <p>
            Bedrock is hosted on Vercel, which runs each API request inside a short-lived serverless function — a small isolated process that spins up, handles the request, and disappears. This is very cost-efficient, but it introduced some real engineering challenges.
          </p>

          <SubSection title="No persistent server">
            <p>
              Traditional servers stay running between requests, so you can keep a database loaded in memory. Serverless functions don&apos;t — each invocation may be a completely fresh process. The solution here is to cache the fetched spreadsheet and the in-memory database for 10 minutes within a warm instance. Requests that arrive within that window skip the fetch entirely. Cold instances rebuild it, which takes under a second.
            </p>
          </SubSection>

          <SubSection title="Running a real database engine inside a function">
            <p>
              The database engine used here (SQLite) is normally a native binary. To run it inside a serverless function without special infrastructure, it&apos;s compiled to WebAssembly — a portable binary format that runs anywhere JavaScript runs. Getting Vercel to correctly bundle and deploy that WebAssembly file alongside the function code required explicit configuration; Vercel&apos;s automatic bundler doesn&apos;t detect it on its own.
            </p>
          </SubSection>

          <SubSection title="Keeping a stream open across multiple AI round trips">
            <p>
              Streaming status updates to the browser while the AI loop is still running — potentially making four or five database calls in sequence — means the server needs to hold an open connection to the browser the entire time. Serverless functions are designed for quick request-response cycles, not long-lived streams. Getting this to work reliably required careful management of the response stream so it stays open across every AI iteration and only closes after the final answer is flushed.
            </p>
          </SubSection>

          <SubSection title="Function timeout pressure">
            <p>
              Serverless functions have hard time limits. On Vercel&apos;s free tier that&apos;s 10 seconds; on the paid tier, 60 seconds. Complex questions with the reasoning level turned up high can approach these limits. The default reasoning level is set to Low for this reason — it&apos;s significantly faster while still being accurate for most questions. High reasoning is there for edge cases where you need the model to think harder.
            </p>
          </SubSection>

          <SubSection title="Can&apos;t use the fastest global runtime">
            <p>
              Vercel offers an &ldquo;Edge&rdquo; runtime that runs functions at data centers closest to each user, with near-zero cold start times. The catch: it&apos;s a stripped-down environment that doesn&apos;t support all Node.js capabilities — including the WebAssembly database engine used here. The chat API has to run in the standard Node.js runtime instead, which means slightly slower cold starts (~0.5–1 second vs. ~50ms) but full compatibility with everything the system needs.
            </p>
          </SubSection>
        </Section>

        {/* Section: Auth */}
        <Section title="Access Control">
          <p>
            Every route is protected by a password gate. When you enter the correct password, the server issues a cryptographically signed token stored in a secure browser cookie that JavaScript cannot read or tamper with. The signature is verified on every request using a secret key that lives only in the server environment.
          </p>
          <p>
            There&apos;s no user database, no session store, and no third-party auth service — just a signed token and a secret. The password can be changed by updating a single environment variable and redeploying.
          </p>
        </Section>

        {/* Section: Conversation History */}
        <Section title="Your Conversation History">
          <p>
            Past conversations are saved in your browser&apos;s local storage — they never leave your device. The server is stateless and has no record of previous sessions. When you continue a conversation, your full message history is sent along with the new question so the AI has the context it needs.
          </p>
          <p>
            This keeps the architecture simple and avoids storing any personal data server-side, but it also means history is tied to the specific browser you used. Clearing your browser data will clear your conversation history.
          </p>
        </Section>

        {/* Footer */}
        <div className="mt-16 pt-8" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm transition-opacity hover:opacity-80"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to Bedrock AI
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-12">
      <h2
        className="text-lg font-semibold mb-4"
        style={{ color: "rgba(255,255,255,0.9)" }}
      >
        {title}
      </h2>
      <div className="space-y-4 text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
        {children}
      </div>
    </div>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h3
        className="text-sm font-semibold mb-3"
        style={{ color: "rgba(255,255,255,0.75)" }}
      >
        {title}
      </h3>
      <div className="space-y-3 text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
        {children}
      </div>
    </div>
  );
}

function KeyValue({ items }: { items: [string, string][] }) {
  return (
    <div
      className="rounded-xl overflow-hidden my-4"
      style={{ border: "1px solid rgba(255,255,255,0.07)" }}
    >
      {items.map(([key, value], i) => (
        <div
          key={key}
          className="flex gap-4 px-4 py-3 text-xs"
          style={{
            background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
            borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : undefined,
          }}
        >
          <span className="w-16 flex-shrink-0 font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>{key}</span>
          <span style={{ color: "rgba(255,255,255,0.65)" }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function Diagram() {
  const steps = [
    { label: "Google Sheet", sub: "live attendance data" },
    { label: "Data Loader", sub: "fetched & cached 10 min" },
    { label: "In-Memory DB", sub: "temporary, per-request" },
    { label: "AI Agent Loop", sub: "query → verify → repeat" },
    { label: "Streaming Response", sub: "live progress updates" },
    { label: "Chat UI", sub: "your browser" },
  ];

  return (
    <div className="my-6 flex flex-wrap gap-2 items-center">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center gap-2">
          <div
            className="px-3 py-2 rounded-lg text-xs"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <div style={{ color: "rgba(255,255,255,0.85)" }} className="font-medium">{step.label}</div>
            <div style={{ color: "rgba(255,255,255,0.3)" }} className="text-[10px] mt-0.5">{step.sub}</div>
          </div>
          {i < steps.length - 1 && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}
