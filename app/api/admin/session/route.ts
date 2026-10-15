import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, ADMIN_SESSION_SECONDS, adminConfigured, createAdminSession, validAdminPassword } from "@/lib/chatAdminAuth";

const headers = { "Cache-Control": "no-store" };
// Next.js may normalize the dev server URL to 0.0.0.0. The browser's Host
// header preserves the requested origin; never trust a forwarded-host value.
function sameOrigin(req: NextRequest) {
  return req.headers.get("origin") === `${req.nextUrl.protocol}//${req.headers.get("host") || req.nextUrl.host}`;
}
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin" }, { status: 403, headers });
  if (!adminConfigured()) return NextResponse.json({ error: "Private history access is not configured yet." }, { status: 503, headers });
  if (Number(req.headers.get("content-length")) > 1024) return NextResponse.json({ error: "Invalid request" }, { status: 400, headers });
  let body;
  try {
    const text = await req.text();
    if (text.length > 1024) throw new Error();
    body = JSON.parse(text);
  } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400, headers }); }
  if (!validAdminPassword(body?.password)) return NextResponse.json({ error: "That password did not match. Try again." }, { status: 401, headers });
  const res = NextResponse.json({ ok: true }, { headers });
  res.cookies.set(ADMIN_COOKIE, createAdminSession(), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: ADMIN_SESSION_SECONDS });
  return res;
}

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin" }, { status: 403, headers });
  const res = NextResponse.json({ ok: true }, { headers });
  res.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  return res;
}
