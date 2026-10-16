import { MongoClient, type Filter } from "mongodb";

export type ChatLog = {
  _id: string;
  conversationId: string;
  createdAt: Date;
  updatedAt: Date;
  question: string;
  history: { role: "user" | "assistant"; content: string }[];
  model: string;
  reasoningLevel: string;
  status: "pending" | "success" | "error";
  answer?: string;
  error?: string;
  durationMs?: number;
  queries: { sql: string; reason: string }[];
  suggestions?: string[];
};

/** Browser-generated request IDs are random UUIDs; holding one is what lets a browser read its answer back. */
export const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Saved answers can be recovered for a day, long enough to reopen the page after a dropped connection. */
const RESULT_TTL_MS = 24 * 60 * 60_000;

// Reuse one small pool per warm server instance, including across dev reloads.
const shared = globalThis as typeof globalThis & { chatMongo?: Promise<MongoClient> };
export async function chatLogs() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Chat history storage is not configured");
  if (!shared.chatMongo) {
    const client = new MongoClient(uri, {
      appName: "bedrock-chat-history", maxPoolSize: 3, minPoolSize: 0,
      maxIdleTimeMS: 60_000, serverSelectionTimeoutMS: 3_000,
      connectTimeoutMS: 3_000, timeoutMS: 5_000,
    });
    shared.chatMongo = client.connect().catch(async (error) => {
      shared.chatMongo = undefined;
      await client.close().catch(() => {});
      throw error;
    });
  }
  return (await shared.chatMongo).db(process.env.MONGODB_DATABASE || "bedrock_ai").collection<ChatLog>("chat_logs");
}

// Await writes inside the request: serverless runtimes can stop background work.
// A logging outage must never prevent an attendance answer from being returned.
export async function saveChatLog(log: ChatLog): Promise<void> {
  if (!process.env.MONGODB_URI) return;
  try {
    await (await chatLogs()).replaceOne({ _id: log._id }, log, { upsert: true });
  } catch {
    // Do not print driver errors, which may contain credentials or connection details.
    console.error(`[chat-history] write failed request=${log._id}`);
  }
}

/**
 * Atomically creates the pending record, so one request ID can only ever run once.
 * "unavailable" means storage is down or unconfigured; the answer still runs, unlogged and unrecoverable.
 */
export async function claimChatLog(log: ChatLog): Promise<"claimed" | "duplicate" | "unavailable"> {
  if (!process.env.MONGODB_URI) return "unavailable";
  try {
    await (await chatLogs()).insertOne(log);
    return "claimed";
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) return "duplicate";
    console.error(`[chat-history] write failed request=${log._id}`);
    return "unavailable";
  }
}

export type ChatResult = Pick<ChatLog, "status" | "answer" | "error" | "reasoningLevel" | "queries" | "suggestions">;
/** The answer for one recent request, without its conversation history; null when absent or expired. */
export async function readChatResult(id: string): Promise<ChatResult | null> {
  const log = await (await chatLogs()).findOne(
    { _id: id, createdAt: { $gte: new Date(Date.now() - RESULT_TTL_MS) } },
    { projection: { status: 1, answer: 1, error: 1, reasoningLevel: 1, queries: 1, suggestions: 1 } },
  );
  if (!log) return null;
  return { status: log.status, answer: log.answer, error: log.error, reasoningLevel: log.reasoningLevel,
    queries: log.queries ?? [], suggestions: log.suggestions ?? [] };
}

export function historyFilter(params: URLSearchParams): Filter<ChatLog> {
  const filter: Filter<ChatLog> = {};
  const search = (params.get("q") || "").trim().slice(0, 200);
  if (search) {
    const literal = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [{ question: { $regex: literal, $options: "i" } }, { answer: { $regex: literal, $options: "i" } }];
  }
  const status = params.get("status");
  if (status === "success" || status === "error" || status === "pending") filter.status = status;
  const conversation = params.get("conversation");
  if (conversation && conversation.length <= 100) filter.conversationId = conversation;
  const from = params.get("from"), to = params.get("to");
  const range: { $gte?: Date; $lt?: Date } = {};
  for (const [value, key] of [[from, "$gte"], [to, "$lt"]] as const) {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))) {
      range[key] = new Date(Date.parse(value) + (key === "$lt" ? 86_400_000 : 0));
    }
  }
  if (Object.keys(range).length) filter.createdAt = range;
  return filter;
}
