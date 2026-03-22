import Link from "next/link";

export const metadata = {
  title: "How It Works — Bedrock Data AI",
  description: "Technical deep dive into the Bedrock Data AI architecture",
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
            Technical Deep Dive
          </div>
          <h1
            className="text-3xl sm:text-4xl font-bold mb-4 bg-clip-text text-transparent leading-tight"
            style={{ backgroundImage: "linear-gradient(135deg, #a78bfa, #60a5fa, #f0f0ff)" }}
          >
            How Bedrock Data AI Works
          </h1>
          <p className="text-base leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
            A natural language interface over F3 workout attendance data — built on an agentic SQL loop, streaming SSE, and an in-memory SQLite database running inside a serverless function.
          </p>
        </div>

        {/* Section: Architecture Overview */}
        <Section title="Architecture Overview">
          <p>
            Bedrock Data AI has no traditional backend service. Every query flows through a single Next.js API route deployed as a Vercel serverless function. That function fetches a Google Sheet CSV, loads it into an in-memory SQLite database, and runs an agentic loop where an AI model writes and executes SQL until it has a confident answer.
          </p>
          <Diagram />
        </Section>

        {/* Section: Data Pipeline */}
        <Section title="Data Pipeline: Google Sheet → SQLite">
          <p>
            The source of truth is a public Google Sheet with F3 workout attendance records. Rather than hitting the Sheets API, the function exports it as a plain CSV via Google&apos;s export URL. This is parsed with a custom CSV parser (to handle quoted fields and embedded commas) and loaded into a sql.js in-memory SQLite table called <Code>attendance</Code>.
          </p>
          <p>
            The CSV has a quirk: two columns are both named &ldquo;Month&rdquo;. The loader auto-deduplicates headers, renaming the second to <Code>Month_1</Code>, so SQL queries always target a stable schema.
          </p>
          <p>
            Both the raw CSV and the compiled SQLite database are cached in server memory for 10 minutes. Within that window, all concurrent requests share the same database object — no re-parsing, no re-compiling.
          </p>
          <KeyValue items={[
            ["Source", "Google Sheets public CSV export"],
            ["SQL engine", "sql.js (SQLite compiled to WebAssembly)"],
            ["Cache TTL", "10 minutes (in-memory, per serverless instance)"],
            ["Table", "attendance — ~15 columns, one row per PAX per workout"],
          ]} />
        </Section>

        {/* Section: Agentic SQL Loop */}
        <Section title="The Agentic SQL Loop">
          <p>
            The AI doesn&apos;t generate an answer from the question directly — it generates SQL, executes it, reads the results, and decides whether to keep querying or synthesize a final answer. This loop is the core of the system.
          </p>
          <p>
            The model is given a single tool: <Code>run_sql</Code>. It can call this tool as many times as needed. Typical questions require 2–5 round trips:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
            <li>An exploratory query to understand the data shape (e.g. distinct site names, date range)</li>
            <li>A targeted query to answer the question</li>
            <li>A validation query to cross-check the result</li>
            <li>Optional follow-up queries for edge cases or totals</li>
          </ol>
          <p>
            Because the model only sees actual SQL results — never the raw CSV — it can&apos;t hallucinate attendance numbers or fabricate names. Every claim in the answer is traceable to a real query result. Each SQL call is logged and shown in the UI under the assistant message.
          </p>
          <KeyValue items={[
            ["Model", "gpt-5-mini (OpenAI Responses API)"],
            ["Tool", "run_sql — executes arbitrary SELECT against the in-memory DB"],
            ["Avg queries/question", "2–5 tool calls"],
            ["Reasoning effort", "Configurable (Low / Medium / High) from the header dropdown"],
          ]} />
        </Section>

        {/* Section: Streaming */}
        <Section title="Streaming with Server-Sent Events">
          <p>
            Because the agentic loop takes several seconds, the API streams progress back to the client in real time using Server-Sent Events (SSE). The <Code>/api/chat</Code> route returns a <Code>ReadableStream</Code> and the frontend reads it incrementally.
          </p>
          <p>
            Each event is a JSON object on a single line. The frontend parses these as they arrive and updates the UI — showing a phase label above the typing indicator during processing:
          </p>
          <CodeBlock>{`{ "type": "phase", "label": "Loading attendance data..." }
{ "type": "phase", "label": "Analyzing your question..." }
{ "type": "query", "index": 1, "reason": "...", "sql": "SELECT ..." }
{ "type": "phase", "label": "Validating results..." }
{ "type": "done", "answer": "...", "suggestions": [...] }`}</CodeBlock>
          <p>
            The <Code>query</Code> events are what populate the expandable SQL log under each assistant message. The <Code>done</Code> event carries both the final answer and three follow-up suggestion strings.
          </p>
        </Section>

        {/* Section: Vercel Serverless Challenges */}
        <Section title="Vercel Serverless: Challenges & Solutions">
          <p>
            Running this on Vercel serverless functions introduced several non-obvious constraints that shaped the architecture.
          </p>

          <SubSection title="1. Bundling a WebAssembly binary">
            <p>
              sql.js ships a <Code>.wasm</Code> file that must be present at runtime. Vercel&apos;s output file tracing doesn&apos;t automatically detect WASM files loaded via <Code>locateFile</Code> — they&apos;re invisible to static analysis. Without intervention, the function deploys without the binary and crashes at cold start.
            </p>
            <p>
              The fix is an explicit opt-in in <Code>next.config.ts</Code>:
            </p>
            <CodeBlock>{`outputFileTracingIncludes: {
  "/api/chat": ["./node_modules/sql.js/dist/**"],
}`}</CodeBlock>
            <p>
              This tells Vercel&apos;s bundler to include everything in <Code>node_modules/sql.js/dist/</Code> in the deployment artifact for that route, regardless of whether it can statically trace the import.
            </p>
          </SubSection>

          <SubSection title="2. No persistent memory between invocations">
            <p>
              Serverless functions are stateless by design — each cold start is a fresh process. The 10-minute in-memory CSV and DB cache only works within a single warm instance. Under load, multiple instances may run simultaneously and each will independently fetch and parse the CSV.
            </p>
            <p>
              This is an accepted trade-off: the Google Sheet is small (~a few thousand rows), the CSV fetch is fast, and the 10-minute TTL means any warm instance avoids redundant work. A production-scale version could use Vercel KV or an edge cache to share state across instances.
            </p>
          </SubSection>

          <SubSection title="3. Streaming from a serverless function">
            <p>
              Node.js serverless functions on Vercel support <Code>ReadableStream</Code> responses, but there are subtleties. The stream must be kept alive across multiple async tool calls during the agentic loop — each SQL result from the model triggers a new write to the stream, and the stream must not close until the model signals it&apos;s done.
            </p>
            <p>
              The implementation uses a <Code>TransformStream</Code> with a writer that stays open across all tool call iterations, only closing after the final <Code>done</Code> event is flushed.
            </p>
          </SubSection>

          <SubSection title="4. Function timeout limits">
            <p>
              Vercel&apos;s default serverless function timeout is 10 seconds (Hobby plan) or 60 seconds (Pro). Complex questions with high reasoning effort can approach this limit — each LLM call plus SQL round trip takes 2–8 seconds, and 4–5 iterations can add up.
            </p>
            <p>
              Mitigation: Low reasoning mode is the default, which reduces per-call latency significantly. The model is also instructed to be efficient with its queries and avoid redundant tool calls.
            </p>
          </SubSection>

          <SubSection title="5. Edge runtime vs. Node.js runtime">
            <p>
              Vercel offers an Edge runtime that is faster to cold-start and globally distributed — but it runs a restricted V8 isolate without Node.js APIs. sql.js requires Node.js (<Code>fs</Code>, <Code>Buffer</Code>, native WASM loading), so the chat route must explicitly opt into the Node.js runtime:
            </p>
            <CodeBlock>{`export const runtime = "nodejs";`}</CodeBlock>
            <p>
              This means the chat API runs in a standard Node.js Lambda, not at the edge. Cold starts are ~500ms–1s rather than ~50ms, but there&apos;s no alternative when you need WASM + filesystem access.
            </p>
          </SubSection>
        </Section>

        {/* Section: Auth */}
        <Section title="Authentication">
          <p>
            A lightweight password gate protects all routes via Next.js edge middleware. The correct password generates an HMAC-SHA256 signed token stored in an httpOnly cookie. The middleware verifies the signature on every request — no session store, no database, no JWTs.
          </p>
          <KeyValue items={[
            ["Algorithm", "HMAC-SHA256 (Web Crypto API)"],
            ["Storage", "httpOnly cookie — not accessible to JavaScript"],
            ["TTL", "1 year"],
            ["Change password", "Update AUTH_PASSWORD env var and redeploy"],
          ]} />
        </Section>

        {/* Section: Conversation History */}
        <Section title="Conversation History">
          <p>
            Chat history is stored entirely in <Code>localStorage</Code> under <Code>bedrock-conversations</Code>. There is no server-side persistence — the backend is stateless and receives full conversation history with each request so the model has context for follow-up questions.
          </p>
          <p>
            This keeps infrastructure simple and free, but means history is device-local and cleared if the user clears browser storage.
          </p>
        </Section>

        {/* Section: Stack Summary */}
        <Section title="Stack at a Glance">
          <KeyValue items={[
            ["Framework", "Next.js 16 (App Router, TypeScript)"],
            ["Hosting", "Vercel (Node.js serverless functions)"],
            ["AI — chat", "gpt-5-mini via OpenAI Responses API (tool use)"],
            ["AI — suggestions", "gpt-4o-mini via OpenAI Chat Completions"],
            ["SQL engine", "sql.js (SQLite compiled to WASM, server-side)"],
            ["Data source", "Google Sheets public CSV export"],
            ["Styling", "Tailwind CSS v4 + inline styles"],
            ["State", "React useState + localStorage (client), in-memory cache (server)"],
            ["Data fetching", "TanStack React Query (suggestions only)"],
            ["Auth", "HMAC-SHA256 cookie via Next.js edge middleware"],
          ]} />
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
      <div className="space-y-3">
        {children}
      </div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="text-xs px-1.5 py-0.5 rounded font-mono"
      style={{ background: "rgba(124,58,237,0.15)", color: "#c4b5fd", border: "1px solid rgba(124,58,237,0.2)" }}
    >
      {children}
    </code>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre
      className="text-xs rounded-xl p-4 overflow-x-auto font-mono leading-relaxed my-4"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        color: "#a5b4fc",
      }}
    >
      {children}
    </pre>
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
          className="flex gap-4 px-4 py-2.5 text-xs"
          style={{
            background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
            borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : undefined,
          }}
        >
          <span className="w-36 flex-shrink-0 font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>{key}</span>
          <span style={{ color: "rgba(255,255,255,0.7)" }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

function Diagram() {
  const steps = [
    { label: "Google Sheet", sub: "public CSV export" },
    { label: "CSV Parser", sub: "server-side, 10 min cache" },
    { label: "sql.js (SQLite)", sub: "in-memory WASM DB" },
    { label: "AI Agent Loop", sub: "gpt-5-mini + run_sql tool" },
    { label: "Streaming SSE", sub: "phase → query → done events" },
    { label: "Chat UI", sub: "Next.js frontend" },
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
