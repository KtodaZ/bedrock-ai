const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { NextRequest } = require('next/server');
function load(file, deps = {}) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', js)((key) => deps[key] ?? require(key), exports);
  return exports;
}
const definitions = load('lib/chatHistoryMcp.ts', { './chatLogStore': {} }).CHAT_HISTORY_TOOLS;
function setup() {
  const calls = [];
  process.env.MCP_TOKEN = 'attendance-only';
  process.env.CHAT_HISTORY_MCP_TOKEN = 'private-history';
  const route = load('app/api/mcp/chat-history/route.ts', {
    '@/lib/chatHistoryMcp': { CHAT_HISTORY_TOOLS: definitions, callChatHistoryTool: async (...args) => { calls.push(args); return { total: 0, entries: [] }; } },
  });
  const request = (body, token = 'private-history', extra = {}) => new NextRequest('https://bedrock.test/api/mcp/chat-history', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...extra }, body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { route, request, calls };
}

test('Private history rejects attendance tokens, admin passwords, query-string credentials, and missing configuration', async () => {
  const { route, request, calls } = setup();
  for (const token of ['', 'attendance-only', 'admin-password']) assert.equal((await route.POST(request({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, token))).status, 401);
  const query = new NextRequest('https://bedrock.test/api/mcp/chat-history?key=private-history', { method: 'POST', body: '{}' });
  assert.equal((await route.POST(query)).status, 401);
  delete process.env.CHAT_HISTORY_MCP_TOKEN;
  assert.equal((await route.POST(request({}))).status, 401);
  assert.equal(calls.length, 0);
});

test('MCP initializes, lists read-only tools, handles notifications, and returns structured results', async () => {
  const { route, request, calls } = setup();
  const init = await (await route.POST(request({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }))).json();
  assert.equal(init.result.protocolVersion, '2025-06-18');
  assert.equal(init.result.serverInfo.name, 'bedrock-chat-history');
  const listing = await route.POST(request({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
  assert.equal(listing.headers.get('cache-control'), 'private, no-store');
  const tools = (await listing.json()).result.tools;
  assert.equal(tools.length, 5);
  assert.ok(tools.every(t => t.annotations.readOnlyHint && !t.annotations.destructiveHint));
  const notification = await route.POST(request({ jsonrpc: '2.0', method: 'notifications/initialized' }));
  assert.equal(notification.status, 202);
  assert.equal(await notification.text(), '');
  const result = await (await route.POST(request({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search_chat_history', arguments: { q: 'Kotter' } } }))).json();
  assert.deepEqual(result.result.structuredContent, { total: 0, entries: [] });
  assert.deepEqual(calls, [['search_chat_history', { q: 'Kotter' }]]);
});

test('Malformed JSON-RPC, oversized requests, cross-origin calls, and unknown tools do not query storage', async () => {
  const { route, request, calls } = setup();
  for (const value of [null, [], 1, { jsonrpc: '2.0', id: null, method: 'ping' }, { method: 'ping' }]) assert.equal((await route.POST(request(value))).status, 400);
  assert.equal((await route.POST(request('{bad'))).status, 400);
  assert.equal((await route.POST(request('x'.repeat(16001)))).status, 413);
  assert.equal((await route.POST(request({ jsonrpc: '2.0', id: 1, method: 'ping' }, 'private-history', { origin: 'https://other.test' }))).status, 403);
  for (const params of [[], null, 'invalid']) {
    const result = await (await route.POST(request({ jsonrpc: '2.0', id: 1, method: 'tools/call', params }))).json();
    assert.equal(result.error.code, -32602);
  }
  const unknown = await (await route.POST(request({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'deleteMany' } }))).json();
  assert.equal(unknown.error.code, -32602);
  assert.equal(calls.length, 0);
});

test('Tool arguments cannot inject queries, bypass limits, or smuggle invalid dates', async () => {
  let connections = 0;
  const { callChatHistoryTool } = load('lib/chatHistoryMcp.ts', { './chatLogStore': { chatLogs: async () => { connections++; throw new Error(); } } });
  const invalid = [
    ['search_chat_history', { q: { $ne: '' } }], ['search_chat_history', { limit: 51 }],
    ['search_chat_history', { offset: -1 }], ['search_chat_history', { from: '2026-02-30' }],
    ['search_chat_history', { from: '2026-10-15', to: '2026-10-01' }],
    ['search_chat_history', { pipeline: [{ $out: 'secret' }] }],
    ['get_chat_record', { request_id: { $ne: null } }], ['get_chat_conversation', {}],
    ['summarize_chat_history', []], ['deleteMany', {}],
  ];
  for (const [name, args] of invalid) assert.equal((await callChatHistoryTool(name, args)).isError, true);
  assert.match((await callChatHistoryTool('get_chat_history_schema', {})).guide, /untrusted/);
  assert.equal(connections, 0);
});

test('Search is paginated, conversation reads are chronological, and full records use exact IDs', async () => {
  const queries = [];
  const rows = [{ _id: 'record-1', conversationId: 'conversation-1', question: 'Who posted?', answer: 'a'.repeat(700), status: 'success', queries: [{ sql: 'SELECT 1', reason: 'Check' }] }];
  const collection = {
    find(filter) {
      const query = { filter }; queries.push(query);
      return { sort(order) { query.sort = order; return this; }, skip(n) { query.offset = n; return this; }, limit(n) { query.limit = n; return this; }, async toArray() { return rows; } };
    },
    countDocuments: async () => 3,
    findOne: async filter => { queries.push(filter); return { ...rows[0], history: [{ role: 'user', content: 'Earlier' }] }; },
  };
  const { callChatHistoryTool } = load('lib/chatHistoryMcp.ts', { './chatLogStore': { chatLogs: async () => collection, historyFilter: () => ({}) } });
  const search = await callChatHistoryTool('search_chat_history', { limit: 1, offset: 0 });
  assert.equal(search.total, 3); assert.equal(search.nextOffset, 1);
  assert.equal(search.entries[0].answerExcerpt.length, 600); assert.equal(search.entries[0].answerTruncated, true);
  assert.equal(queries[0].sort.createdAt, -1);
  await callChatHistoryTool('get_chat_conversation', { conversation_id: 'conversation-1' });
  assert.equal(queries[1].sort.createdAt, 1); assert.equal(queries[1].filter.conversationId, 'conversation-1');
  const full = await callChatHistoryTool('get_chat_record', { request_id: 'record-1' });
  assert.deepEqual(queries[2], { _id: 'record-1' });
  assert.equal(full.record.answer.length, 700); assert.equal(full.record.history.length, 1);
});

test('Summary totals cover every match and raw database errors never reach clients', async () => {
  let pipeline;
  const { callChatHistoryTool } = load('lib/chatHistoryMcp.ts', { './chatLogStore': {
    historyFilter: () => ({ status: 'success' }),
    chatLogs: async () => ({ aggregate(stages, options) { pipeline = stages; assert.equal(options.maxTimeMS, 5000); return { toArray: async () => [{ totals: [{ questions: 1000, successes: 1000 }], conversations: [{ count: 7 }], dailyVolume: [], repeatedQuestions: [] }] }; } }),
  } });
  const result = await callChatHistoryTool('summarize_chat_history', { status: 'success' });
  assert.equal(result.totals.questions, 1000); assert.equal(result.totals.conversations, 7);
  assert.deepEqual(pipeline[0], { $match: { status: 'success' } });
  assert.equal(pipeline[1].$facet.dailyVolume.at(-1).$limit, 366);
  const unavailable = load('lib/chatHistoryMcp.ts', { './chatLogStore': { historyFilter: () => ({}), chatLogs: async () => { throw new Error('mongodb://secret'); } } });
  const failure = await unavailable.callChatHistoryTool('search_chat_history', {});
  assert.equal(failure.isError, true); assert.ok(!JSON.stringify(failure).includes('mongodb://secret'));
});
