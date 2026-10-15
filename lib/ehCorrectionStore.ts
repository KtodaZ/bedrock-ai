import { BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { CorrectionInputError, correctionDiscordPayload, sameCorrection, type EhCorrection, type EhCorrectionInput } from "./ehCorrections";

interface History { version: 1; corrections: EhCorrection[] }
const HISTORY_PATH = process.env.EH_CORRECTIONS_BLOB_PATH ?? "eh-corrections/history.json";
const blobOptions = () => ({ access: "private" as const, token: process.env.BLOB_READ_WRITE_TOKEN });

async function readHistory() {
  const result = await get(HISTORY_PATH, { ...blobOptions(), useCache: false });
  if (!result || result.statusCode !== 200) throw new Error("Correction history unavailable");
  const history = await new Response(result.stream).json() as History;
  if (history.version !== 1 || !Array.isArray(history.corrections)) throw new Error("Invalid correction history");
  return { history, etag: result.blob.etag };
}

async function mutateHistory<T>(mutate: (history: History) => { value: T; changed: boolean }): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { history, etag } = await readHistory();
    const result = mutate(history);
    if (!result.changed) return result.value;
    try {
      await put(HISTORY_PATH, JSON.stringify(history), { ...blobOptions(), addRandomSuffix: false, ifMatch: etag, contentType: "application/json", cacheControlMaxAge: 60 });
      return result.value;
    } catch (error) {
      if (!(error instanceof BlobPreconditionFailedError) || attempt === 4) throw error;
    }
  }
  throw new Error("Couldn't save correction history");
}

export async function correctionHistory(): Promise<EhCorrection[]> {
  return (await readHistory()).history.corrections;
}

export async function saveCorrection(input: EhCorrectionInput, previousEhBy: string | null): Promise<EhCorrection> {
  return mutateHistory((history) => {
    const existing = history.corrections.find((r) => r.requestId === input.requestId);
    if (existing) {
      if (!sameCorrection(existing, input)) throw new CorrectionInputError("This submission has changed. Close the form and try again.");
      return { value: existing, changed: false };
    }
    if (previousEhBy === input.ehBy) throw new CorrectionInputError("That EH’er is already recorded in the Roster.");
    const now = new Date().toISOString();
    const record: EhCorrection = { ...input, previousEhBy, createdAt: now, notification: { status: "pending", updatedAt: now } };
    history.corrections.push(record);
    return { value: record, changed: true };
  });
}

export async function notifyCorrection(requestId: string): Promise<"sent" | "pending"> {
  // Claim delivery atomically so simultaneous retries do not post the same alert.
  const claimed = await mutateHistory<EhCorrection | null>((history) => {
    const record = history.corrections.find((r) => r.requestId === requestId);
    if (!record) throw new Error("Correction not found");
    if (record.notification.status === "sent") return { value: null, changed: false };
    if (record.notification.status === "sending" && Date.now() - Date.parse(record.notification.updatedAt) < 60_000) return { value: null, changed: false };
    record.notification = { status: "sending", updatedAt: new Date().toISOString() };
    return { value: record, changed: true };
  });
  if (!claimed) {
    const existing = (await correctionHistory()).find((r) => r.requestId === requestId);
    return existing?.notification.status === "sent" ? "sent" : "pending";
  }
  let messageId: string | undefined;
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (webhook) {
    const url = new URL(webhook);
    url.searchParams.set("wait", "true");
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(correctionDiscordPayload(claimed)), signal: AbortSignal.timeout(8000) });
        if (response.ok) {
          const result = await response.json() as { id?: string };
          messageId = result.id;
          break;
        }
        if (response.status !== 429 && response.status < 500) break;
        const wait = Math.min(3000, Math.max(500, Number(response.headers.get("retry-after") || 1) * 1000));
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, wait));
      } catch {
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }
  await mutateHistory((history) => {
    const record = history.corrections.find((r) => r.requestId === requestId)!;
    record.notification = { status: messageId ? "sent" : "failed", updatedAt: new Date().toISOString(), ...(messageId ? { messageId } : {}) };
    return { value: undefined, changed: true };
  });
  return messageId ? "sent" : "pending";
}
