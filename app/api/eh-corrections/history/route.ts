import { NextResponse } from "next/server";
import { correctionHistory } from "@/lib/ehCorrectionStore";
import { fetchEhRoster } from "@/lib/sheet";

export const runtime = "nodejs";
export async function GET() {
  try {
    const [records, people] = await Promise.all([correctionHistory(), fetchEhRoster()]);
    const current = new Map(people.map((p) => [p.name, p.ehBy]));
    return NextResponse.json({ corrections: [...records].reverse().map((record) => ({ ...record, notification: { status: record.notification.status }, reflectedInRoster: current.get(record.pax) === record.ehBy })) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Couldn't load correction history. Try again." }, { status: 503 });
  }
}
