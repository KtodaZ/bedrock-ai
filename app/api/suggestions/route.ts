import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ suggestions: [
    "Who needs a reach-out after missing the last 30 days?",
    "Which FNGs came back for a second workout?",
    "Who's been posting the most this month?",
    "Which AO is growing fastest this year?",
    "Who's ready to lead their first Q?",
    "How has attendance changed over the last three months?",
  ] }, { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" } });
}
