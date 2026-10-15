import { NextRequest, NextResponse } from "next/server";
import { fetchAttendance, fetchEhAttributions, fetchResurrectionAttributions } from "@/lib/sheet";
import { computeChallenge, parsePeriod } from "@/lib/ehChallenge";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const period = parsePeriod(req.nextUrl.searchParams.get("period"));
  try {
    const [rows, ehLog, resurrections] = await Promise.all([fetchAttendance(), fetchEhAttributions(), fetchResurrectionAttributions()]);
    return NextResponse.json(computeChallenge(rows, ehLog, period, resurrections));
  } catch (err) {
    console.error("[eh-challenge]", err);
    return NextResponse.json({ error: "Couldn't load the leaderboard. Try again in a moment." }, { status: 500 });
  }
}
