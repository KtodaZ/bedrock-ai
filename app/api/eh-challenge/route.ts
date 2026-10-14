import { NextRequest, NextResponse } from "next/server";
import { fetchAttendance, fetchEhAttributions } from "@/lib/sheet";
import { computeChallenge, type Period } from "@/lib/ehChallenge";

export const runtime = "nodejs";

const PERIODS: Period[] = ["month", "year", "all"];

export async function GET(req: NextRequest) {
  const param = req.nextUrl.searchParams.get("period") as Period | null;
  const period = param && PERIODS.includes(param) ? param : "year";
  try {
    const [rows, ehLog] = await Promise.all([fetchAttendance(), fetchEhAttributions()]);
    return NextResponse.json(computeChallenge(rows, ehLog, period));
  } catch (err) {
    console.error("[eh-challenge]", err);
    return NextResponse.json({ error: "Couldn't load the leaderboard. Try again in a moment." }, { status: 500 });
  }
}
