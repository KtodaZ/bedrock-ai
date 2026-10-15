import assert from "node:assert/strict";

// Read-only deployment check: no AI calls, notifications, or database writes.
const origin = new URL(process.argv[2] || "https://data.f3bedrock.com").origin;
const token = process.env.CHAT_HISTORY_MCP_TOKEN;
if (!token) throw new Error("Set CHAT_HISTORY_MCP_TOKEN before checking the deployment");
const endpoint = `${origin}/api/mcp/chat-history`;
let id = 0;
async function rpc(method, params) {
  const response = await fetch(endpoint, {
    method: "POST", signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  assert.equal(response.status, 200, `${method}: expected HTTP 200, received ${response.status}`);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  const body = await response.json();
  assert.ok(!body.error, `${method}: JSON-RPC error`);
  return body.result;
}
async function call(name, args = {}) {
  const result = await rpc("tools/call", { name, arguments: args });
  assert.equal(result.isError, false, `${name}: tool failed`);
  return result.structuredContent;
}

const unauthenticated = await fetch(endpoint, {
  method: "POST", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "tools/list" }),
});
assert.equal(unauthenticated.status, 401, `Private endpoint: expected HTTP 401, received ${unauthenticated.status}`);
const initialization = await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "bedrock-deployment-check", version: "1.0.0" } });
assert.equal(initialization.serverInfo.name, "bedrock-chat-history");
const { tools } = await rpc("tools/list");
assert.deepEqual(tools.map(tool => tool.name).sort(), ["get_chat_conversation", "get_chat_history_schema", "get_chat_record", "search_chat_history", "summarize_chat_history"]);
assert.ok(tools.every(tool => tool.annotations.readOnlyHint));
assert.ok((await call("get_chat_history_schema")).guide);
const search = await call("search_chat_history", { limit: 1 });
const summary = await call("summarize_chat_history");
assert.ok(Number.isInteger(search.total) && Number.isInteger(summary.totals.questions));
if (search.entries.length) {
  const entry = search.entries[0];
  const full = await call("get_chat_record", { request_id: entry.requestId });
  assert.equal(full.record._id, entry.requestId);
  const conversation = await call("get_chat_conversation", { conversation_id: entry.conversationId, limit: 1 });
  assert.ok(conversation.total >= 1);
}
const admin = await fetch(`${origin}/admin/chats`, { signal: AbortSignal.timeout(15000) });
assert.equal(admin.status, 200, `Admin page: expected HTTP 200, received ${admin.status}`);
console.log(`Chat history deployment verified: private authentication, all five MCP tools, MongoDB reads, and admin page. ${summary.totals.questions} recorded questions.`);
