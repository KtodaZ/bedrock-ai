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
          content: `Generate 6 questions an F3 site leader would type into Bedrock Data AI — an AI tool that analyzes F3 workout attendance data.

F3 terms: PAX = members, Q = workout leader, FNG = first-timer, AO = workout location, Kotter List = PAX who haven't posted in 30+ days.

The best questions surface actionable insights — trends, drops, who needs outreach, whether leadership is concentrated, which PAX are slipping away, how retention looks over time.

Rules:
- Conversational but insightful — the kind of question a sharp leader actually wants answered
- Under 15 words, one focused question per item
- No placeholder text like [name] or [date]
- Varied topics: mix retention, Q depth, FNG conversion, AO health, Kotter trends, attendance patterns
- Return ONLY a JSON array of 6 strings, nothing else`,
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
        "Who's been showing up the most lately?",
        "Which site is most active this year?",
        "Who's led the most Qs?",
        "Give me the Kotter List",
        "How many FNGs this month?",
        "Who needs a shout out?",
      ],
    });
  }
}
