import { NextResponse } from "next/server";
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

export async function GET() {
  try {
    const csv = await fetchCSV();

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are Bedrock, an AI assistant for an F3 Nation workout group. F3 terminology: PAX = members, Q = workout leader, FNG = first-timer, Site = workout location, Kotter = someone who hasn't posted in 30+ days, HIM = High Impact Man.`,
        },
        {
          role: "user",
          content: `Based on this F3 workout attendance data (focus on the last 3 months), generate exactly 6 suggested questions a site leader would actually ask.

Rules:
- Write them conversationally, like a person asking — not like a data analyst
- Keep them short and general (e.g. "Who's been showing up the most lately?" not "Which PAX had the highest post count between X and Y dates?")
- Cover a mix of: recent attendance, leadership/Q rotation, site activity, community health (kotters, FNGs, reach-outs)
- Do NOT include specific names, dates, or numbers in the questions
- Return ONLY a JSON array of 6 strings, no explanation, no markdown

Data:\n${csv}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "[]";
    // Strip markdown code fences if present
    const json = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const suggestions = JSON.parse(json) as string[];

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error(err);
    // Fallback to hardcoded if AI fails
    return NextResponse.json({
      suggestions: [
        "Who is showing up the most in the last 30 days?",
        "Which site has the most posts this year?",
        "Who has led the most Qs overall?",
        "Give me the Kotter List",
        "How many FNGs have we had this month?",
        "Who needs a shout out to come back?",
      ],
    });
  }
}
