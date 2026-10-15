import { NextRequest, NextResponse } from "next/server";
import { fetchEhRoster } from "@/lib/sheet";
import { CorrectionInputError, validateCorrection } from "@/lib/ehCorrections";
import { notifyCorrection, saveCorrection } from "@/lib/ehCorrectionStore";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json({ people: await fetchEhRoster() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Couldn't load the Roster names. Try again." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") && request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Submit the correction from the Bedrock site." }, { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 4096) return NextResponse.json({ error: "Keep the correction short." }, { status: 413 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Enter the correction and try again." }, { status: 400 }); }
  try {
    const people = await fetchEhRoster();
    const input = validateCorrection(body, people);
    const current = people.find((p) => p.name === input.pax)!;
    const record = await saveCorrection(input, current.ehBy);
    let notification: "sent" | "pending" = "pending";
    try { notification = await notifyCorrection(record.requestId); } catch { /* The durable record already exists; retrying this request is safe. */ }
    return NextResponse.json({ id: record.requestId, pax: record.pax, ehBy: record.ehBy, saved: true, notification }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof CorrectionInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[eh-corrections] Couldn't save submission");
    return NextResponse.json({ error: "Couldn't save this correction. Your entry is still here; try again." }, { status: 503 });
  }
}
