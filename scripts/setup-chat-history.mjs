import { MongoClient } from "mongodb";

if (!process.env.MONGODB_URI) throw new Error("Set MONGODB_URI before running setup");
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
try {
  const collection = client.db(process.env.MONGODB_DATABASE || "bedrock_ai").collection("chat_logs");
  await collection.createIndexes([
    { key: { createdAt: -1, _id: -1 }, name: "recent_questions" },
    { key: { conversationId: 1, createdAt: -1, _id: -1 }, name: "conversation_history" },
    { key: { status: 1, createdAt: -1, _id: -1 }, name: "status_history" },
  ]);
  console.log("Chat history connected; indexes ready.");
} catch {
  console.error("Could not initialize chat history. Check Atlas credentials and network access.");
  process.exitCode = 1;
} finally { await client.close(); }
