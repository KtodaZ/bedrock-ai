import { NextRequest, NextResponse } from "next/server";
import { readChatResult, REQUEST_ID } from "@/lib/chatLogStore";

export const dynamic = "force-dynamic";

// Lets a browser whose answer stream dropped read the saved answer. No AI call, no quota.
export async function GET(req: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!REQUEST_ID.test(id)) return NextResponse.json({ error: "Invalid request ID." }, { status: 400, headers });
  if (!process.env.MONGODB_URI) return NextResponse.json({ error: "Answer recovery is unavailable." }, { status: 503, headers });
  try {
    const result = await readChatResult(id);
    if (!result) return NextResponse.json({ error: "No saved answer for this request." }, { status: 404, headers });
    return NextResponse.json(result, { headers });
  } catch {
    console.error(`[chat-result] read failed request=${id}`);
    // Temporary storage trouble: the browser keeps trying.
    return NextResponse.json({ error: "Could not check for the answer." }, { status: 500, headers });
  }
}
