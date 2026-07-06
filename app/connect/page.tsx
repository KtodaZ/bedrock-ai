import Link from "next/link";
import { headers } from "next/headers";
import CopyButton from "./CopyButton";

export const metadata = {
  title: "Bring Your Own Agent — Bedrock Data AI",
  description: "Connect ChatGPT or Claude to your F3 attendance data via MCP",
};

export default async function ConnectPage() {
  const h = await headers();
  const host = h.get("host") ?? "your-app.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const token = process.env.MCP_TOKEN ?? "";
  const configured = token.length > 0;
  const mcpUrl = `${origin}/api/mcp`;
  const mcpUrlWithKey = configured ? `${mcpUrl}?key=${token}` : mcpUrl;

  const claudeJson = `{
  "mcpServers": {
    "bedrock-data-ai": {
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer ${configured ? token : "<MCP_TOKEN>"}"
      }
    }
  }
}`;

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
            🔌 Bring Your Own Agent
          </div>
          <h1
            className="text-3xl sm:text-4xl font-bold mb-4 bg-clip-text text-transparent leading-tight"
            style={{ backgroundImage: "linear-gradient(135deg, #a78bfa, #60a5fa, #f0f0ff)" }}
          >
            Connect ChatGPT or Claude to your crew&apos;s data
          </h1>
          <p className="text-base leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
            Bedrock exposes your attendance data as an <strong className="text-white/70">MCP server</strong> — the
            open standard both Claude and ChatGPT use to plug into outside tools. Add one URL as a connector and your
            own AI can query the exact same data this app runs on. No install, no code.
          </p>
        </div>

        {/* Connection details */}
        <Section title="Your connection">
          {!configured && (
            <div
              className="rounded-xl p-4 mb-5 text-sm"
              style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.25)", color: "#fcd34d" }}
            >
              <strong>Not enabled yet.</strong> An admin needs to set the{" "}
              <code className="px-1 py-0.5 rounded bg-white/10">MCP_TOKEN</code> environment variable (any long random
              string) and redeploy. Once set, the connection URL and token appear here automatically.
            </div>
          )}

          <Field label="Server URL" value={mcpUrl} />
          <Field label="Access token" value={configured ? token : "<set MCP_TOKEN to generate>"} mono blur={configured} copyable={configured} />

          <p className="text-sm mt-5 mb-2" style={{ color: "rgba(255,255,255,0.45)" }}>
            Easiest option — a single URL with the token built in, for connector fields that only accept a URL:
          </p>
          <Field label="URL with token" value={mcpUrlWithKey} mono blur={configured} copyable={configured} />
          <p className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.3)" }}>
            Treat this like a password — anyone with it can read your attendance data. Share it only with people you
            trust.
          </p>
        </Section>

        {/* Claude */}
        <Section title="Add it to Claude">
          <Steps
            steps={[
              "Open Claude (claude.ai or the desktop app) → Settings → Connectors.",
              "Click “Add custom connector”.",
              "Paste the URL with token above as the server URL, and give it a name like “Bedrock Data”.",
              "Save. In any chat, enable the connector and ask questions like “Who’s on the Kotter List?”",
            ]}
          />
        </Section>

        {/* ChatGPT */}
        <Section title="Add it to ChatGPT">
          <Steps
            steps={[
              "Open ChatGPT → Settings → Connectors (requires a plan with custom connectors / developer mode).",
              "Click “Create” / “Add connector” and choose an MCP server.",
              "Paste the URL with token above as the MCP server URL and name it “Bedrock Data”.",
              "Save, then turn the connector on for a chat and ask away.",
            ]}
          />
        </Section>

        {/* JSON config */}
        <Section title="Config-file clients (Claude Desktop, Cursor, Claude Code, …)">
          <p className="text-sm mb-3" style={{ color: "rgba(255,255,255,0.45)" }}>
            For clients configured with a JSON file, add this server. It sends the token as a bearer header instead of
            in the URL:
          </p>
          <div className="relative rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center justify-between px-4 py-2" style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>mcp.json</span>
              {configured && <CopyButton text={claudeJson} />}
            </div>
            <pre className="p-4 text-xs overflow-x-auto" style={{ color: "rgba(255,255,255,0.7)" }}>
              <code>{claudeJson}</code>
            </pre>
          </div>
        </Section>

        {/* What it can do */}
        <Section title="What your agent can do">
          <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,0.45)" }}>
            The connector gives your agent three read-only tools. Your own AI does the reasoning — it just queries the
            live data directly, so answers stay grounded in the real records.
          </p>
          <Tool name="get_schema" desc="Learn the table columns, F3 terminology (PAX, Q, FNG, AO, Kotter List), and the analytical rules." />
          <Tool name="run_sql" desc="Run a read-only SELECT against the attendance table and get exact rows back. Writes are blocked." />
          <Tool name="search_pax" desc="Fuzzy-find a member's exact stored name before pulling their stats." />
          <p className="text-xs mt-4" style={{ color: "rgba(255,255,255,0.3)" }}>
            Read-only by design: only SELECT queries run, against an in-memory copy of the sheet refreshed every 10
            minutes. Your agent can read the data but never change it.
          </p>
        </Section>

        <p className="text-center text-xs mt-4" style={{ color: "rgba(255,255,255,0.2)" }}>
          Prefer the built-in assistant?{" "}
          <Link href="/" className="underline underline-offset-2 hover:text-white/40">
            Back to Bedrock AI
          </Link>
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-12">
      <h2 className="text-lg font-semibold mb-4 text-white/85">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  blur,
  copyable = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
  blur?: boolean;
  copyable?: boolean;
}) {
  return (
    <div className="mb-3">
      <div className="text-xs mb-1.5" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</div>
      <div className="flex items-center gap-2">
        <div
          className={`flex-1 min-w-0 px-3 py-2 rounded-lg text-sm overflow-x-auto whitespace-nowrap ${mono ? "font-mono" : ""} ${blur ? "select-all" : ""}`}
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.75)" }}
        >
          {value}
        </div>
        {copyable && <CopyButton text={value} />}
      </div>
    </div>
  );
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3 text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
          <span
            className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-semibold"
            style={{ background: "rgba(124,58,237,0.2)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.3)" }}
          >
            {i + 1}
          </span>
          <span className="leading-relaxed">{s}</span>
        </li>
      ))}
    </ol>
  );
}

function Tool({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="flex gap-3 items-start py-2">
      <code
        className="flex-shrink-0 text-xs px-2 py-1 rounded-md font-mono"
        style={{ background: "rgba(37,99,235,0.15)", color: "#93c5fd", border: "1px solid rgba(37,99,235,0.25)" }}
      >
        {name}
      </code>
      <span className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>{desc}</span>
    </div>
  );
}
