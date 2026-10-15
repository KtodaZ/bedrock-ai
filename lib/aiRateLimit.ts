import { createHmac } from "node:crypto";
import { BlobPreconditionFailedError, get, put } from "@vercel/blob";

interface Usage { version: 1; day: string; total: number; clients: Record<string, { minute: number; count: number }> }
const path = process.env.AI_RATE_LIMIT_BLOB_PATH ?? "ai-rate-limit/usage.json";
const options = () => ({ access: "private" as const, token: process.env.BLOB_READ_WRITE_TOKEN });
export type LimitResult = { allowed: true } | { allowed: false; status: 429 | 503; message: string; retryAfter: number };

// Conditional writes make the daily cap shared and atomic across server instances.
// Never fall back to process-local counters: unavailable storage must stop paid calls.
export async function reserveAiRequest(headers: Headers, now = Date.now()): Promise<LimitResult> {
  try {
    if (!process.env.AUTH_SECRET) throw new Error("Missing rate-limit secret");
    const ip = headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    const client = createHmac("sha256", process.env.AUTH_SECRET).update(ip).digest("hex");
    const day = new Date(now).toISOString().slice(0, 10);
    const minute = Math.floor(now / 60_000);
    const dailyLimit = 100;
    for (let attempt = 0; attempt < 8; attempt++) {
      const result = await get(path, { ...options(), useCache: false });
      if (!result || result.statusCode !== 200) throw new Error("Usage storage unavailable");
      let usage = await new Response(result.stream).json() as Usage;
      if (usage.version !== 1 || typeof usage.day !== "string" || !Number.isInteger(usage.total) || usage.total < 0 || !usage.clients || typeof usage.clients !== "object") throw new Error("Invalid usage storage");
      if (usage.day !== day) usage = { version: 1, day, total: 0, clients: {} };
      if (usage.total >= dailyLimit) return { allowed: false, status: 429, message: "Today's AI question limit has been reached. Please try again tomorrow. The EH leaderboard is still available.", retryAfter: Math.ceil((Date.parse(`${day}T00:00:00Z`) + 86400_000 - now) / 1000) };
      const bucket = usage.clients[client];
      if (bucket?.minute === minute && bucket.count >= 5) return { allowed: false, status: 429, message: "You've asked several questions quickly. Please try again in a minute.", retryAfter: 60 - Math.floor(now / 1000) % 60 };
      usage.clients = Object.fromEntries(Object.entries(usage.clients).filter(([, b]) => b.minute === minute));
      usage.clients[client] = { minute, count: bucket?.minute === minute ? bucket.count + 1 : 1 };
      usage.total++;
      try {
        await put(path, JSON.stringify(usage), { ...options(), addRandomSuffix: false, ifMatch: result.blob.etag, contentType: "application/json", cacheControlMaxAge: 60 });
        return { allowed: true };
      } catch (error) {
        if (!(error instanceof BlobPreconditionFailedError)) throw error;
      }
    }
    throw new Error("Usage storage busy");
  } catch {
    return { allowed: false, status: 503, message: "AI questions are temporarily unavailable. Please try again shortly.", retryAfter: 60 };
  }
}
