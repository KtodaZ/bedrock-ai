import { NextResponse } from "next/server";
import { loadExplorerData } from "../../../lib/dataExplorerSource";

export const runtime = "nodejs";
export async function GET() {
  try {
    return NextResponse.json(await loadExplorerData(), {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
    });
  } catch {
    return NextResponse.json(
      { error: "Attendance data could not be loaded. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
