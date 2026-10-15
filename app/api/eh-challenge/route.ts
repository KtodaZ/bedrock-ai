import { NextRequest, NextResponse } from "next/server";
import { fetchAttendance, fetchEhAttributions, fetchResurrectionAttributions } from "@/lib/sheet";
import { computeChallenge, type Period } from "@/lib/ehChallenge";

export const runtime = "nodejs";

const PERIODS: Period[] = ["month", "year", "all"];

export async function GET(req: NextRequest) {
  const param = req.nextUrl.searchParams.get("period") as Period | null;
  const period = param && PERIODS.includes(param) ? param : "year";
  try {
    const [rows, ehLog, resurrections] = await Promise.all([fetchAttendance(), fetchEhAttributions(), fetchResurrectionAttributions()]);
    return NextResponse.json(computeChallenge(rows, ehLog, period, resurrections));
  } catch (err) {
    console.error("[eh-challenge]", err);
    return NextResponse.json({ error: "Couldn't load the leaderboard. Try again in a moment." }, { status: 500 });
  }
}
