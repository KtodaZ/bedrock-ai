import Link from "next/link";

export const metadata = {
  title: "How It Works — Bedrock Data",
  description: "How Bedrock Data answers questions about F3 attendance",
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
            How it works
          </div>
          <h1
            className="text-3xl sm:text-4xl font-bold mb-4 bg-clip-text text-transparent leading-tight"
            style={{ backgroundImage: "linear-gradient(135deg, #a78bfa, #60a5fa, #f0f0ff)" }}
          >
            How Bedrock Data Works
          </h1>
          <p className="text-base leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
            Ask about F3 attendance in plain English. Bedrock looks up the attendance sheet and shows what it checked under each answer.
          </p>
        </div>

        <Section title="From question to answer">
          <p>
            Bedrock loads attendance, Roster, and Sites records from Google Sheets. The AI first uses lookups built on the
            same code as the Data, AO, Community, Milestones, and EH Challenge pages, so its numbers match those pages, and
            offers buttons to the Data pages that show the answer. For anything else it writes a read-only SQL query against an in-memory SQLite copy.
            You can inspect every lookup and query below each response.
          </p>
          <Diagram />
          <p>
            The main model is gpt-6.1-sol. In Auto mode, a smaller model selects the reasoning level for your question.
            You can also choose Low, Medium, or High yourself.
          </p>
          <KeyValue items={[
            ["Step 1", "Load the attendance records"],
            ["Step 2", "Run page lookups or a read-only SQL query"],
            ["Step 3", "Read the results and look up more if needed"],
            ["Step 4", "Write the answer as you watch, with buttons to matching pages"],
          ]} />
          <p>
            Lookup and query results give the model records to work from, but it can still make mistakes. Check the
            linked page, the queries, and the source sheet when a number looks wrong or an answer matters.
          </p>
        </Section>

        <Section title="Where the data comes from">
          <p>
            The existing F3 Bedrock Google Sheet is the source for attendance and EH credit. Attendance records and
            the SQLite database are cached for up to 10 minutes in each running server instance. Roster data is cached
            for one minute. A new server instance loads its own copy.
          </p>
          <p>
            The app does not keep a separate permanent attendance database. Corrections and AI usage counts are
            stored separately so review history and request limits survive server restarts.
          </p>
        </Section>

        <Section title="What you see while it works">
          <p>
            Status updates show when the app is loading data or looking things up. The answer appears as it is written,
            followed by the lookups and queries it used and suggested follow-up questions.
          </p>
          <p>
            Each question allows up to six model rounds. If it cannot finish within that limit, the app asks you to
            narrow the question.
          </p>
        </Section>

        <Section title="EH Challenge">
          <p>
            The leaderboard calculates points from recorded workouts and the EH&apos;er listed in the Roster. An FNG
            counts only when attendance marks him as an FNG and his Roster region is Bedrock. The leaderboard opens
            to 2026 Challenge, which scores FNGs joining Oct 15–Dec 31 toward a 50-FNG goal, with workouts counted
            through Dec 31. This Year shows annual invitation stats and a 100-FNG goal without competition points. You can sort challenge standings
            by points or FNGs and search for a person.
          </p>
          <p>
            Open a person&apos;s page for workout milestones, badges, and suggested next invitations. The EH Challenge&apos;s
            &ldquo;How it works&rdquo; section explains the point values and referral bonus. Badges do not add points.
          </p>
          <p>
            EH corrections are saved for maintainer review and posted to Discord. Names and notes appear in the
            public correction history. A submission does not change standings; the maintainer must update the Roster.
          </p>
        </Section>

        <Section title="Access and AI limits">
          <p>
            The app and leaderboard are open without a password. AI questions are limited to 5 per minute per IP
            address and 100 per day across the site, resetting at midnight UTC. Homepage visits, suggested questions,
            and leaderboard views do not make paid AI requests.
          </p>
          <p>
            Usage counts are shared across servers. If usage tracking is unavailable, AI questions pause until it
            recovers. Model rounds and output lengths are also capped to limit the cost of each question.
          </p>
        </Section>

        <Section title="Your conversation history">
          <p>
            Chats and drafts save in this browser and reopen when you return. Questions keep running while you visit other pages through the app&apos;s links. If your connection drops or you reload while an answer is in progress, the page uses a random request ID to fetch the saved answer when it finishes; if it can&apos;t, your question stays saved to try again. Clearing browser data removes local chats. When you ask a
            follow-up, up to 12 recent messages are sent to the server and OpenAI for context, within a size limit.
          </p>
          <p>
            Questions, full answers, recent conversation context, and diagnostic details are stored privately for
            the site maintainer to review and improve Bedrock. Clearing your browser history does not remove these
            server records. When Discord notifications are configured, the question and a short answer excerpt are
            also posted there. Correction submissions are stored separately.
          </p>
        </Section>

        <Section title="Bring your own agent">
          <p>
            Connect ChatGPT, Claude, or another MCP client to query the same attendance data. The connector provides
            read-only tools for table information, SQL queries, and name searches. It requires a private key from the
            site maintainer. Your chosen AI service handles the reasoning and its own charges.
          </p>
          <Link href="/connect" className="inline-flex min-h-11 items-center text-violet-300 underline underline-offset-4">
            Set up your agent
          </Link>
        </Section>

        <Section title="Hosting">
          <p>
            The app runs on Vercel using the Node.js runtime. SQLite runs through sql.js, which compiles the database
            engine to WebAssembly. Warm server instances reuse cached data; cold instances load it again.
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
    { label: "In-Memory DB", sub: "cached up to 10 min" },
    { label: "AI Agent Loop", sub: "look up → read → repeat" },
    { label: "Response stream", sub: "progress and answer text" },
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
