import { NextRequest, NextResponse } from "next/server";
import { fetchAttendance, fetchEhLogCSV } from "@/lib/sheet";
import { computeChallenge, EH_LOG, type EhLogEntry, type Period } from "@/lib/ehChallenge";

export const runtime = "nodejs";

const PERIODS: Period[] = ["month", "year", "all"];

export async function GET(req: NextRequest) {
  const param = req.nextUrl.searchParams.get("period") as Period | null;
  const period = param && PERIODS.includes(param) ? param : "month";
  try {
    const [rows, sheetLog] = await Promise.all([fetchAttendance(), fetchEhLogCSV()]);
    const ehLog: EhLogEntry[] = [
      ...EH_LOG,
      ...sheetLog.map((r) => ({ pax: r["PAX Name"] ?? "", ehBy: r["EH'd By"] ?? "" })),
    ];
    return NextResponse.json(computeChallenge(rows, ehLog, period));
  } catch (err) {
    console.error("[eh-challenge]", err);
    return NextResponse.json({ error: "Couldn't load the leaderboard. Try again in a moment." }, { status: 500 });
  }
}
