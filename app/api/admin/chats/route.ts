import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, validAdminSession } from "@/lib/chatAdminAuth";
import { chatLogs, historyFilter } from "@/lib/chatLogStore";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" };
export async function GET(req: NextRequest) {
  if (!validAdminSession(req.cookies.get(ADMIN_COOKIE)?.value)) return NextResponse.json({ error: "Sign in to view chat history." }, { status: 401, headers });
  const params = req.nextUrl.searchParams;
  const page = Math.min(1000, Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1));
  const filter = historyFilter(params);
  try {
    const logs = await chatLogs();
    const [entries, total] = await Promise.all([
      logs.find(filter, { projection: { history: 0 }, maxTimeMS: 5_000 }).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 25).limit(25).toArray(),
      logs.countDocuments(filter, { maxTimeMS: 5_000 }),
    ]);
    return NextResponse.json({ entries, total, page, pageSize: 25 }, { headers });
  } catch {
    return NextResponse.json({ error: "Chat history is unavailable. Try Refresh in a moment." }, { status: 503, headers });
  }
}
