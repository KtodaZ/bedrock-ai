import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function GET() {
  try {
    const response = await openai.responses.create({
      model: "gpt-5-mini",
      input: [
        {
          role: "user",
          content: `You are generating starter questions for Bedrock Data AI — an AI assistant for an F3 Nation workout group. F3 terminology: PAX = members, Q = workout leader, FNG = first-timer, Site = workout location, Kotter = someone who hasn't posted in 30+ days.

Generate exactly 6 suggested questions a site leader would actually ask about their group's attendance data.

Rules:
- Write them conversationally, like a person asking — not like a data analyst
- Keep them short and general (e.g. "Who's been showing up the most lately?" not "Which PAX had the highest post count?")
- Cover a mix of: recent attendance, leadership/Q rotation, site activity, community health (Kotter List, FNGs, reach-outs)
- Do NOT include specific names, dates, or numbers
- Return ONLY a JSON array of 6 strings, no explanation, no markdown`,
        },
      ],
    });

    const raw = response.output_text?.trim() ?? "[]";
    const json = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const suggestions = JSON.parse(json) as string[];

    return NextResponse.json({ suggestions }, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" },
    });
  } catch (err) {
    console.error(err);
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
