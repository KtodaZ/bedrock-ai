import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "bedrock-chat-admin";
export const ADMIN_SESSION_SECONDS = 7 * 24 * 60 * 60;

export function adminConfigured() {
  return Boolean(process.env.CHAT_ADMIN_PASSWORD && process.env.AUTH_SECRET);
}

export function validAdminPassword(value: unknown) {
  const expected = process.env.CHAT_ADMIN_PASSWORD;
  if (!adminConfigured() || !expected || typeof value !== "string" || value.length > 512) return false;
  const digest = (s: string) => createHmac("sha256", process.env.AUTH_SECRET!).update(s).digest();
  return timingSafeEqual(digest(value), digest(expected));
}

function signature(payload: string) {
  return createHmac("sha256", process.env.AUTH_SECRET!)
    .update(`chat-admin:${process.env.CHAT_ADMIN_PASSWORD}:${payload}`).digest("base64url");
}

export function createAdminSession(now = Date.now()) {
  if (!adminConfigured()) throw new Error("Admin access is not configured");
  const expires = String(Math.floor(now / 1000) + ADMIN_SESSION_SECONDS);
  return `${expires}.${signature(expires)}`;
}

export function validAdminSession(value: string | undefined, now = Date.now()) {
  if (!adminConfigured() || !value || value.length > 100) return false;
  const [expires, supplied, extra] = value.split(".");
  if (extra !== undefined || !/^\d{10,11}$/.test(expires) || !supplied) return false;
  const seconds = Math.floor(now / 1000);
  if (Number(expires) <= seconds || Number(expires) > seconds + ADMIN_SESSION_SECONDS) return false;
  const expected = Buffer.from(signature(expires));
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
