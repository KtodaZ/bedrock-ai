import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { fetchCSV, getDatabase, isReadOnlySelect, runSQL } from "@/lib/attendance-db";
import { loadExplorerData } from "@/lib/dataExplorerSource";
import { attendanceWorkouts } from "@/lib/attendanceTrends";
import { CHAT_TOOLS, chatDataFacts, isChatTool, runChatTool, type ChatToolContext } from "@/lib/chatTools";
import { computeChallenge, type ChallengeResult, type Period } from "@/lib/ehChallenge";
import { fetchAttendance, fetchEhAttributions, fetchResurrectionAttributions } from "@/lib/sheet";

import { randomUUID } from "node:crypto";
import { claimChatLog, REQUEST_ID, saveChatLog, type ChatLog } from "@/lib/chatLogStore";
import { reserveAiRequest } from "@/lib/aiRateLimit";
// Answer recovery in lib/chatSession.ts keeps checking a little past this limit.
export const maxDuration = 300;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 60_000 });

type HistoryMessage = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `You are Bedrock Data — an expert data analyst for F3 Bedrock, an F3 Nation region. You answer questions about recorded workout attendance using lookup tools and, when needed, SQL against an in-memory SQLite copy of the attendance sheet.

TOOLS — prefer the lookup tools. They use the same rules as the Data pages and EH Challenge page, so answers match what PAX see there, and each resolves misspelled names and AOs itself:
- pax_profile — anything about one PAX (posts, Qs, streak, AOs, monthly history, EH'er, milestones, who he posts with). Pass from/to for a date range.
- ao_profile — one AO's turnout, regulars, Qs, best draw, biggest workouts, weekday turnout, and growth; optionally vs another AO.
- year_over_year — this year vs last year for an AO or the whole region.
- ao_rankings — every AO side by side and growth over recent weeks or year to date ("this year"); also the last 7 days.
- period_summary — totals, top posters, top Qs, FNGs, and AO breakdown for any date range.
- pax_list — Kotter, Q Kotter, Qsource, first-Q candidates, Q ratio among regulars, run-site vs beatdown Qs.
- fng_follow_through — how each month's Bedrock FNGs came back.
- family_tree — Roster EH links (who EH'd whom).
- milestones — post milestone forecasts and recent milestones.
- eh_challenge — leaderboard points, FNGs, and a PAX's EH standing.
- run_sql — only when no tool answers the question (custom cross-tabs, specific dates, unusual comparisons).
Call independent tools together in one round. Use the fewest calls that answer precisely. Tool results are already validated; re-check with SQL only if two results conflict. If a tool returns "closest" names, pick the clearly intended one and call again, or list them and ask.

LINKS — tool results include a "link" to the page showing the same numbers. End the answer with one line holding up to two of them as Markdown links, e.g. [Open Clove's profile](/data?period=all&pax=Clove). Copy links exactly from tool results; never write a link a tool didn't return.

SQL TABLE (run_sql) — Table: attendance
- "PAX Name" TEXT — participant name (under-18 and archived names are already excluded)
- "Site Name" TEXT — the AO
- "FNG" INTEGER — 1 if the row is flagged FNG (the table has no Roster region, so SQL FNG counts include visitors from other regions; use the tools for Bedrock FNGs)
- "Post" INTEGER — 1 if he posted (always filter WHERE "Post" = 1 for attendance)
- "Q" INTEGER — 1 if he Q'd
- "QS" INTEGER — Qsource post; "QS-Q" INTEGER — Qsource Q
- "Date" TEXT — ISO YYYY-MM-DD
- "Month" INTEGER, "Year" INTEGER, "Month_1" TEXT (month name), "Day of the Week" TEXT, "City" TEXT
SQL tips: date("Date", '-30 days') and strftime() for date math; ISO strings compare correctly; count a PAX's posts as distinct dates with Post = 1. Names have mixed casing: match with LOWER(...) LIKE LOWER('%name%').

F3 TERMINOLOGY:
- PAX = participants; HIM = how F3 refers to members
- Q = the workout leader; Site Q = the ongoing leader of an AO
- FNG = First 'N' Guy. A Bedrock FNG has an FNG-flagged attendance row and Roster region Bedrock.
- Post = attending a workout
- Kotter List = Bedrock PAX whose last post was 15–364 days ago (pax_list kotter)
- EH = inviting someone new; the Roster EH'er column records who EH'd each PAX

ANALYTICAL RULES:
- "Today" means the latest attendance date given below, not the calendar date. "Last X days" ends there.
- For rankings, always include the exact count (e.g., "12 posts").
- State the date range the answer covers once, at the top.
- If the data doesn't cover the full requested window, say so.
- When the user gives new facts (e.g. "he posted Mar 8 at Spartan"), treat them as true without re-querying.
- Resolve pronouns and "same AO" from earlier messages before calling tools.
- Records show what happened, not why. Don't invent reasons such as injuries or travel; suggest a check-in instead.

RESPONSE FORMATTING RULES:
- Never mention SQL, databases, queries, tools, or JSON
- Lead with the direct answer — no preamble
- State the date range once, briefly, at the top (e.g. "**Jan 1 – Mar 7, 2026**")
- Use **bold** for PAX names
- Use ### headers to separate distinct sections
- Use bullet lists for people or data; each bullet: name + key stat + one short detail (e.g. "- **Clove** — 18 posts, last on Mar 5")
- Always show the numbers behind the answer; never a bare conclusion
- Never use markdown tables; they don't render. Use bullets instead
- For long lists, show the top 15 and give the total plus the page link for the rest
- Use --- only when the response has 3+ distinct sections
- One sentence of context per section max
- Be encouraging and community-focused, but brief

DATE RULES:
- Include first post dates for PAX histories, last post dates for Kotter/reach-out lists, and exact dates for superlatives and "most recent" events
- When projecting milestones, give the projected date and the pace assumption (e.g. "at 3.2 posts/week over the last 90 days")
- Format dates as "Mar 7, 2026", never "2026-03-07"

NAMES:
- If a tool says "Showing results for X", start the answer with that note.
- Treat name variants (e.g. "Peekaboo" vs "Peekaboo 2.0") as different PAX unless the user says otherwise.
- Never return a silent zero; if nothing matches, say so and offer the closest names.

F3 LANGUAGE — "AO" not site/location, "Q" not leader/instructor, "PAX" not member/attendee, "post" not attend/show up, "FNG" not new member, "EH" for inviting someone new.

OFF-TOPIC HANDLING:
If asked about anything unrelated to F3 attendance data (contact info, workout planning, nutrition, general fitness), respond:
"I'm Bedrock Data — I answer questions about F3 Bedrock attendance: posts, Qs, FNGs, AO trends, the Kotter List, milestones, and the EH Challenge. What would you like to know about your crew?"`;

const RUN_SQL_TOOL: OpenAI.Responses.Tool = {
  type: "function",
  name: "run_sql",
  description:
    "Run one read-only SQL SELECT against the attendance table. Use only when no lookup tool answers the question. Returns rows as a table.",
  parameters: {
    type: "object" as const,
    properties: {
      sql: {
        type: "string",
        description: "The SQL SELECT query to execute against the attendance table.",
      },
      reason: {
        type: "string",
        description: "Brief description of what data this query retrieves and why.",
      },
    },
    required: ["sql", "reason"],
    additionalProperties: false,
  },
  strict: true,
};

async function classifyReasoning(question: string): Promise<"low" | "medium" | "high"> {
  try {
    const res = await openai.responses.create({
      model: "gpt-5-nano",
      max_output_tokens: 512,
      input: [
        {
          role: "user",
          content: `Classify the reasoning complexity needed to answer this F3 workout attendance question. Reply with exactly one word: low, medium, or high.

low = simple lookup (counts, recent posts, who showed up, FNG count)
medium = rankings, trends, comparisons, site breakdowns, last N days
high = Kotter list, reach-out list, multi-condition analysis, long-term patterns, who stopped coming

Question: "${question}"`,
        },
      ],
    });
    const level = res.output_text?.trim().toLowerCase();
    if (level === "low" || level === "medium" || level === "high") return level;
  } catch {}
  return "medium"; // safe default on failure
}

function responseText(response: OpenAI.Responses.Response) {
  return response.output
    .flatMap((item) => (item.type === "message" ? item.content : []))
    .map((part) => (part.type === "output_text" ? part.text : ""))
    .join("");
}

const TOOL_LABELS: Record<string, string> = {
  pax_profile: "PAX profile",
  ao_profile: "AO profile",
  year_over_year: "Year over year",
  ao_rankings: "AO rankings",
  period_summary: "Date range summary",
  pax_list: "PAX list",
  fng_follow_through: "FNG follow-through",
  family_tree: "EH family tree",
  milestones: "Milestones",
  eh_challenge: "EH Challenge standings",
};

async function suggestFollowUps(question: string, answer: string): Promise<string[]> {
  try {
    const res = await openai.responses.create({
      model: "gpt-5-mini",
      max_output_tokens: 1024,
      reasoning: { effort: "low" },
      input: [
        {
          role: "user",
          content: `Bedrock Data answers questions about F3 Bedrock workout attendance: PAX histories, post and Q counts, AO turnout and growth, year-over-year comparisons, FNG follow-through, the Kotter List, first-Q candidates, milestones, the EH family tree, and EH Challenge standings.

A leader asked: "${question}"
The answer began: """${answer.slice(0, 1200)}"""

Generate exactly 3 natural follow-up questions they might ask next. Rules:
- Answerable from attendance data — no contact info, waivers, scheduling, or off-topic
- Complete and self-contained, naming the PAX or AO when relevant — no placeholders like [name]
- Conversational, varied, and not already answered above
- Short (under 12 words) and in F3 terms: "post" not attend, "Q" or "Q'd" not lead/served as Q, "AO" not location/site, "PAX" not members

Return ONLY a JSON array of 3 strings, no explanation.`,
        },
      ],
    });
    const raw = res.output_text?.trim() ?? "[]";
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim());
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string").slice(0, 3) : [];
  } catch {
    return [];
  }
}

// Discord webhook queue — retries with exponential backoff, never blocks requests
const discordQueue: string[] = [];
let discordFlushing = false;

async function flushDiscordQueue() {
  if (discordFlushing) return;
  discordFlushing = true;
  const url = process.env.DISCORD_WEBHOOK_URL;
  while (discordQueue.length > 0) {
    const content = discordQueue[0];
    let sent = false;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(url!, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        if (res.ok || res.status === 400) { // 400 = bad payload, don't retry
          sent = true;
          break;
        }
        // 429 rate limit or 5xx — wait and retry
        const retryAfter = res.status === 429
          ? parseInt(res.headers.get("retry-after") ?? "1", 10) * 1000
          : Math.min(1000 * 2 ** attempt, 8000);
        await new Promise((r) => setTimeout(r, retryAfter));
      } catch {
        await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 8000)));
      }
    }
    if (sent || discordQueue[0] === content) discordQueue.shift(); // remove whether sent or exhausted
  }
  discordFlushing = false;
}

function notifyDiscord(content: string) {
  if (!process.env.DISCORD_WEBHOOK_URL) return;
  discordQueue.push(content);
  flushDiscordQueue(); // fire-and-forget flush
}

export async function POST(req: NextRequest) {
  if (Number(req.headers.get("content-length")) > 32_000) return NextResponse.json({ error: "Question is too long." }, { status: 413 });
  let body;
  try {
    const raw = await req.text();
    if (raw.length > 32_000) return NextResponse.json({ error: "Question is too long." }, { status: 413 });
    body = JSON.parse(raw);
  } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!body || typeof body.question !== "string" || !body.question.trim() || body.question.length > 2000 || (body.history !== undefined && !Array.isArray(body.history))) {
    return NextResponse.json({ error: "Enter a question of up to 2,000 characters." }, { status: 400 });
  }
  const question: string = body.question.trim();
  const history: HistoryMessage[] = (body.history ?? []).slice(-12);
  if (history.some((m: HistoryMessage) => !m || !["user", "assistant"].includes(m.role) || typeof m.content !== "string") || history.reduce((n, m) => n + m.content.length, 0) > 16000) {
    return NextResponse.json({ error: "This conversation is too long. Please start a new chat." }, { status: 400 });
  }
  if (body.conversationId !== undefined && (typeof body.conversationId !== "string" || !/^[a-zA-Z0-9-]{1,100}$/.test(body.conversationId))) {
    return NextResponse.json({ error: "Invalid conversation ID." }, { status: 400 });
  }
  if (body.requestId !== undefined && (typeof body.requestId !== "string" || !REQUEST_ID.test(body.requestId))) {
    return NextResponse.json({ error: "Invalid request ID." }, { status: 400 });
  }
  const clientLevel: "auto" | "low" | "medium" | "high" = ["low", "medium", "high"].includes(body.reasoningLevel) ? body.reasoningLevel : "auto";
  const limit = await reserveAiRequest(req.headers);
  if (!limit.allowed) return NextResponse.json({ error: limit.message }, { status: limit.status, headers: { "Retry-After": String(limit.retryAfter), "Cache-Control": "no-store" } });
  const started = Date.now();
  const log: ChatLog = {
    _id: body.requestId || randomUUID(), conversationId: body.conversationId || randomUUID(),
    createdAt: new Date(started), updatedAt: new Date(started), question, history,
    model: "gpt-6.1-sol", reasoningLevel: clientLevel, status: "pending", queries: [],
  };
  // Each request ID belongs to one question; a repeat (even a simultaneous one) must not overwrite or rerun it.
  // The browser never resends an ID, so the quota already reserved for a duplicate only affects a misbehaving client.
  const claim = await claimChatLog(log);
  if (claim === "duplicate") return NextResponse.json({ error: "This question was already sent." }, { status: 409 });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: object) {
        // Finish storing the result even if the browser disconnects mid-answer.
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); } catch {}
      }

      // Comments keep mobile networks and proxies from closing a quiet connection during long lookups.
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(": ping\n\n")); } catch {}
      }, 15_000);
      try {
        if (claim !== "claimed") await saveChatLog(log);
        send({ type: "phase", label: "Loading attendance data..." });
        // The classifier, sheet reads, and SQL setup don't depend on each other.
        const [reasoningLevel, data, db] = await Promise.all([
          clientLevel === "auto" ? classifyReasoning(question) : Promise.resolve(clientLevel),
          loadExplorerData(),
          fetchCSV().then(getDatabase),
        ]);
        log.reasoningLevel = reasoningLevel;
        const startTime = Date.now();
        console.log(`[chat] question="${question}" reasoning=${reasoningLevel} historyLen=${history.length}`);
        notifyDiscord(`❓ **${question}** _(${reasoningLevel} reasoning)_`);

        const workouts = attendanceWorkouts(data);
        const challenges = new Map<Period, Promise<ChallengeResult>>();
        const ctx: ChatToolContext = {
          data,
          workouts,
          challenge: (period) => {
            if (!challenges.has(period))
              challenges.set(period, Promise.all([fetchAttendance(), fetchEhAttributions(), fetchResurrectionAttributions()])
                .then(([rows, ehLog, resurrections]) => computeChallenge(rows, ehLog, period, resurrections)));
            return challenges.get(period)!;
          },
        };

        send({ type: "phase", label: "Analyzing your question..." });
        const systemWithFacts = `${SYSTEM_PROMPT}\n\nDATA FACTS:\n${chatDataFacts(data, workouts)}`;
        const input: OpenAI.Responses.ResponseInput = [
          { role: "system", content: systemWithFacts },
          ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
          { role: "user", content: question },
        ];

        let finalAnswer = "";
        let queryBatch = 0;
        let queryIndex = 0;

        // Bound paid work, even if the model keeps requesting tools.
        for (let round = 0; round < 6; round++) {
          const stream = await openai.responses.create({
            model: "gpt-6.1-sol",
            max_output_tokens: 6000,
            reasoning: { effort: reasoningLevel },
            input,
            tools: [RUN_SQL_TOOL, ...(CHAT_TOOLS as OpenAI.Responses.Tool[])],
            parallel_tool_calls: true,
            stream: true,
            ...(round === 5 ? { tool_choice: "none" as const } : {}),
          });
          let response: OpenAI.Responses.Response | undefined;
          let streamedText = "";
          for await (const event of stream) {
            if (event.type === "response.output_text.delta") {
              streamedText += event.delta;
              send({ type: "delta", text: event.delta });
            } else if (event.type === "response.completed" || event.type === "response.incomplete") {
              response = event.response;
            } else if (event.type === "response.failed") {
              throw new Error(event.response.error?.message ?? "The answer could not be completed.");
            } else if (event.type === "error") {
              throw new Error(event.message);
            }
          }
          if (!response) throw new Error("The answer stream ended early. Please try again.");

          const toolCalls = response.output.filter((o) => o.type === "function_call") as OpenAI.Responses.ResponseFunctionToolCallItem[];

          if (toolCalls.length === 0) {
            // Streamed responses don't carry the SDK's output_text shortcut.
            finalAnswer = responseText(response) || streamedText;
            break;
          }
          // Text written alongside tool calls is a draft; the next round replaces it.
          if (streamedText) send({ type: "reset" });

          queryBatch++;
          send({ type: "phase", label: queryBatch === 1 ? "Looking up attendance..." : `Checking more details (${queryBatch})...` });

          input.push(...(response.output as OpenAI.Responses.ResponseInput));

          const outputs = await Promise.all(toolCalls.map(async (call) => {
            let args: Record<string, unknown>;
            try {
              args = JSON.parse(call.arguments);
            } catch {
              args = { sql: call.arguments, reason: "" };
            }
            let output: string;
            let sql: string;
            let reason: string;
            if (call.name === "run_sql") {
              sql = String(args.sql ?? "").trim();
              reason = String(args.reason ?? "");
              // The SQL copy is shared across requests, so never let a question change it.
              output = isReadOnlySelect(sql) ? runSQL(db, sql) : "SQL Error: only a single read-only SELECT or WITH query is allowed.";
            } else {
              sql = `${call.name}(${JSON.stringify(args)})`;
              reason = TOOL_LABELS[call.name] ?? "Lookup";
              output = isChatTool(call.name) ? (await runChatTool(ctx, call.name, args)).output : JSON.stringify({ error: `Unknown tool ${call.name}.` });
            }
            return { call, sql, reason, output };
          }));
          for (const { call, sql, reason, output } of outputs) {
            queryIndex++;
            console.log(`[chat] call=${queryIndex} round=${queryBatch} reason="${reason}" call="${sql.replace(/\s+/g, " ").slice(0, 500)}"`);
            send({ type: "query", index: queryIndex, reason, sql });
            log.queries.push({ sql, reason });
            input.push({
              type: "function_call_output",
              call_id: call.call_id,
              output: output.slice(0, 24000),
            } as OpenAI.Responses.ResponseInputItem.FunctionCallOutput);
          }
        }

        if (!finalAnswer) throw new Error("This question needs more analysis than one request allows. Try a narrower question.");

        const ms = Date.now() - startTime;
        console.log(`[chat] done rounds=${queryBatch} calls=${queryIndex} ms=${ms} answerLen=${finalAnswer.length}`);
        const plainAnswer = finalAnswer
          .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
          .replace(/^#{1,6}\s+/gm, "")
          .replace(/\*\*(.+?)\*\*/g, "$1")
          .replace(/\*(.+?)\*/g, "$1")
          .replace(/^[-*]\s+/gm, "• ")
          .replace(/`(.+?)`/g, "$1")
          .replace(/^-{3,}$/gm, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        notifyDiscord(`✅ Done — ${queryIndex} lookup${queryIndex === 1 ? "" : "s"} in ${(ms / 1000).toFixed(1)}s\n\`\`\`\n${plainAnswer.slice(0, 500)}${plainAnswer.length > 500 ? "…" : ""}\n\`\`\``);
        Object.assign(log, { status: "success", answer: finalAnswer, durationMs: Date.now() - started, updatedAt: new Date() });
        await saveChatLog(log);
        // Show the answer now; follow-up suggestions arrive after it.
        send({ type: "done", answer: finalAnswer, suggestions: [], reasoningLevel });
        const suggestions = await suggestFollowUps(question, finalAnswer);
        if (suggestions.length) {
          send({ type: "suggestions", suggestions });
          // A browser recovering a dropped answer gets these too.
          log.suggestions = suggestions;
          await saveChatLog(log);
        }
      } catch (err) {
        Object.assign(log, { status: "error", error: String(err).slice(0, 2000), durationMs: Date.now() - started, updatedAt: new Date() });
        await saveChatLog(log);
        console.error(`[chat] error: ${String(err)}`);
        notifyDiscord(`⚠️ Error: ${String(err).slice(0, 300)}`);
        send({ type: "error", message: String(err) });
      } finally {
        clearInterval(heartbeat);
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
