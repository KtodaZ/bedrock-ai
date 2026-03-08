import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SHEET_ID = "11fIBnwzcVU2F-OZu7zECq8xROJC6hMY4MryHR4KbUj0";
const GID = "729344821";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
const CACHE_TTL_MS = 10 * 60 * 1000;

let csvCache: { data: string; fetchedAt: number } | null = null;

async function fetchCSV(): Promise<string> {
  if (csvCache && Date.now() - csvCache.fetchedAt < CACHE_TTL_MS) {
    return csvCache.data;
  }
  const res = await fetch(CSV_URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status}`);
  const data = await res.text();
  csvCache = { data, fetchedAt: Date.now() };
  return data;
}

type HistoryMessage = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `You are Bedrock, an AI assistant for an F3 Nation workout group. You have deep knowledge of F3 culture and terminology.

F3 terminology:
- PAX = participants/members
- Q = the workout leader for a given session
- FNG = First 'N' Guy, a first-time attendee (value "1" in the FNG column)
- Post = showing up to a workout (value "1" in the Post column)
- Site = a named workout location
- HIM = High Impact Man (how F3 refers to its members)
- EH = Emotional Headlock, recruiting someone new

Your job is to answer questions about attendance, participation, and engagement based on the workout data provided.

Important reasoning rules:
- "Last X days" means relative to the MOST RECENT date in the dataset, not today's calendar date
- "Kotter List" is an F3 concept: PAX who have posted at least once historically but have NOT posted in the last 30 days (relative to the most recent date in the dataset). Only list PAX who qualify — do NOT mention or list people who don't qualify.
- "Who stopped showing up" or "who needs a reach-out" means PAX who were posting REGULARLY but have gone silent for a meaningful gap (60+ days of silence after a history of regular attendance). Only list qualifying PAX.
- Never narrate your reasoning process or list people who don't qualify. Just return the clean result.
- Always be encouraging, energetic, and community-focused in tone
- Be concise — avoid long preambles, get to the answer quickly
- Use markdown formatting: bold names, bullet lists for rankings, etc.
- After every response, always call the suggest_followups function with 3 short, relevant follow-up questions the user might want to ask next.`;

export async function POST(req: NextRequest) {
  try {
    const { question, history = [] }: { question: string; history: HistoryMessage[] } = await req.json();
    if (!question?.trim()) {
      return NextResponse.json({ error: "No question provided" }, { status: 400 });
    }

    const csv = await fetchCSV();

    const input: OpenAI.Responses.ResponseInput = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: `${question}\n\nAttendance data (CSV):\n${csv}` },
    ];

    const response = await openai.responses.create({
      model: "gpt-5.4",
      reasoning: { effort: "high" },
      input,
      tools: [
        {
          type: "function",
          name: "suggest_followups",
          description: "REQUIRED: You MUST call this after every response. Provide 3 short, natural follow-up questions the user might want to ask next.",
          parameters: {
            type: "object",
            properties: {
              questions: {
                type: "array",
                items: { type: "string" },
                description: "3 concise follow-up questions phrased conversationally",
              },
            },
            required: ["questions"],
          },
          strict: false,
        },
      ],
      tool_choice: "auto",
    });

    console.log("OUTPUT TYPES:", response.output?.map(o => o.type));
    console.log("OUTPUT_TEXT:", response.output_text?.slice(0, 100));

    // output_text may miss text when tools are present — extract manually
    const textItem = response.output?.find((o) => o.type === "message");
    let answer = response.output_text ?? "";
    if (!answer && textItem && textItem.type === "message") {
      const content = textItem.content;
      if (Array.isArray(content)) {
        answer = content.filter((c: {type: string}) => c.type === "output_text").map((c: {text: string}) => c.text).join("") ?? "";
      }
    }

    const toolCall = response.output?.find((o) => o.type === "function_call");
    let suggestions: string[] = [];
    if (toolCall && toolCall.type === "function_call") {
      try {
        suggestions = JSON.parse(toolCall.arguments ?? "{}").questions ?? [];
      } catch {}
    }

    return NextResponse.json({ answer, suggestions });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
