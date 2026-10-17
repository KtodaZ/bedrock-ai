const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, deps = {}) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', js)((key) => deps[key] ?? (['@/lib/chatPages', '@/lib/dataExplorer'].includes(key) ? load(key.slice(2) + '.ts') : require(key)), exports);
  return exports;
}

test('Admin sessions fail closed, reject tampering/expiry, and rotate with the password', () => {
  const auth = load('lib/chatAdminAuth.ts');
  process.env.AUTH_SECRET = 'test-session-secret';
  delete process.env.CHAT_ADMIN_PASSWORD;
  assert.equal(auth.validAdminPassword(''), false);
  assert.equal(auth.validAdminSession(''), false);
  process.env.CHAT_ADMIN_PASSWORD = 'a-long-test-password';
  assert.equal(auth.validAdminPassword('a-long-test-password'), true);
  assert.equal(auth.validAdminPassword('wrong'), false);
  assert.equal(auth.validAdminPassword({ password: 'a-long-test-password' }), false);
  const now = 1800000000000;
  const token = auth.createAdminSession(now);
  assert.equal(auth.validAdminSession(token, now), true);
  assert.equal(auth.validAdminSession(token + 'x', now), false);
  assert.equal(auth.validAdminSession(token, now + 8 * 86400000), false);
  process.env.CHAT_ADMIN_PASSWORD = 'rotated';
  assert.equal(auth.validAdminSession(token, now), false);
});

test('History search is literal, date bounds include the whole end date, and filters are bounded', () => {
  const { historyFilter } = load('lib/chatLogStore.ts');
  const filter = historyFilter(new URLSearchParams({ q: '.*(Q)+', from: '2026-10-01', to: '2026-10-15', status: 'error', conversation: 'abc-123' }));
  assert.equal(filter.$or[0].question.$regex, '\\.\\*\\(Q\\)\\+');
  assert.equal(filter.createdAt.$gte.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(filter.createdAt.$lt.toISOString(), '2026-10-16T00:00:00.000Z');
  assert.equal(filter.status, 'error');
  assert.equal(filter.conversationId, 'abc-123');
  assert.deepEqual(historyFilter(new URLSearchParams({ from: 'invalid', status: '$ne' })), {});
});

test('Unauthenticated history requests never query the database', async () => {
  let queried = false;
  const route = load('app/api/admin/chats/route.ts', {
    '@/lib/chatAdminAuth': { ADMIN_COOKIE: 'test', validAdminSession: () => false },
    '@/lib/chatLogStore': { chatLogs: async () => { queried = true; }, historyFilter: () => ({}) },
  });
  const result = await route.GET({ cookies: { get: () => undefined } });
  assert.equal(result.status, 401);
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
  assert.equal(queried, false);
});

test('Login rejects cross-origin requests and sets a private, expiring cookie', async () => {
  const { NextRequest } = require('next/server');
  const auth = load('lib/chatAdminAuth.ts');
  process.env.AUTH_SECRET = 'test-session-secret'; process.env.CHAT_ADMIN_PASSWORD = 'test-admin';
  const route = load('app/api/admin/session/route.ts', { '@/lib/chatAdminAuth': auth });
  const req = (origin, password) => new NextRequest('https://bedrock.test/api/admin/session', { method: 'POST', headers: { origin }, body: JSON.stringify({ password }) });
  assert.equal((await route.POST(req('https://other.test', 'test-admin'))).status, 403);
  assert.equal((await route.POST(req('https://bedrock.test', 'wrong'))).status, 401);
  const devRequest = new NextRequest('http://0.0.0.0:3000/api/admin/session', { method: 'POST', headers: { host: 'localhost:3000', origin: 'http://localhost:3000' }, body: JSON.stringify({ password: 'test-admin' }) });
  assert.equal((await route.POST(devRequest)).status, 200);
  const valid = await route.POST(req('https://bedrock.test', 'test-admin'));
  assert.equal(valid.status, 200);
  const cookie = valid.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=strict/i); assert.match(cookie, /Max-Age=604800/i);
});

for (const fails of [false, true]) test(`Chat logging saves the full ${fails ? 'failed' : 'successful'} request with context and SQL`, async () => {
  delete process.env.DISCORD_WEBHOOK_URL;
  const saved = [];
  let round = 0;
  class FakeAI { responses = { async create(options) {
    if (options.model === 'gpt-5-mini') return { output_text: '[]' };
    const stream = ({ output, output_text: text }) => (async function* () {
      yield { type: 'response.completed', response: { output: text ? [{ type: 'message', content: [{ type: 'output_text', text }] }, ...output] : output } };
    })();
    if (round++ === 0) return stream({ output: [{ type: 'function_call', name: 'run_sql', call_id: 'one', arguments: JSON.stringify({ sql: 'SELECT 1', reason: 'Count posts' }) }] });
    if (fails) throw new Error('Test model failure');
    return stream({ output: [], output_text: 'A complete attendance answer.' });
  } }; }
  const route = load('app/api/chat/route.ts', {
    openai: { default: FakeAI },
    '@/lib/chatLogStore': { saveChatLog: async log => saved.push(structuredClone(log)), claimChatLog: async () => 'unavailable' },
    '@/lib/attendance-db': { fetchCSV: async () => 'csv', getDatabase: async () => ({}), runSQL: () => '1', isReadOnlySelect: () => true },
    '@/lib/aiRateLimit': { reserveAiRequest: async () => ({ allowed: true }) },
    '@/lib/dataExplorerSource': { loadExplorerData: async () => ({ rows: [], people: [], sites: [], asOf: '2026-10-14', loadedAt: '' }) },
    '@/lib/attendanceTrends': { attendanceWorkouts: () => [] },
    '@/lib/chatTools': { CHAT_TOOLS: [], chatDataFacts: () => '', isChatTool: () => false, runChatTool: async () => ({ output: '{}' }) },
    '@/lib/ehChallenge': { computeChallenge: () => ({}) },
    '@/lib/sheet': { fetchAttendance: async () => [], fetchEhAttributions: async () => [], fetchResurrectionAttributions: async () => [] },
  });
  const response = await route.POST(new Request('https://bedrock.test/api/chat', { method: 'POST', body: JSON.stringify({ question: 'Who posted?', conversationId: 'test-conversation', reasoningLevel: 'low', history: [{ role: 'user', content: 'Earlier question' }] }) }));
  await response.text();
  assert.equal(saved.length, 2);
  assert.equal(saved[0].status, 'pending');
  const log = saved[1];
  assert.equal(log._id, saved[0]._id);
  assert.equal(log.conversationId, 'test-conversation');
  assert.equal(log.history[0].content, 'Earlier question');
  assert.equal(log.queries[0].sql, 'SELECT 1');
  assert.equal(log.status, fails ? 'error' : 'success');
  if (fails) assert.match(log.error, /Test model failure/);
  else assert.equal(log.answer, 'A complete attendance answer.');
  assert.ok(log.durationMs >= 0);
});

test('A database write failure does not fail the chat and does not expose credentials', async () => {
  const original = console.error; const errors = [];
  process.env.MONGODB_URI = 'mongodb://fake-credential';
  globalThis.chatMongo = undefined;
  class FailedMongo { async connect() { throw new Error('secret-credential'); } async close() {} }
  const { saveChatLog } = load('lib/chatLogStore.ts', { mongodb: { MongoClient: FailedMongo } });
  try {
    console.error = message => errors.push(message);
    await saveChatLog({ _id: 'test-only' });
    assert.deepEqual(errors, ['[chat-history] write failed request=test-only']);
  } finally { console.error = original; delete process.env.MONGODB_URI; delete globalThis.chatMongo; }
});

const RID = '0b0e5e57-3c1f-4c1a-9a43-6f1f0c3c2d11';
function recoveryChat(deps) {
  class FakeAI { responses = { async create(options) {
    if (options.model === 'gpt-5-mini') return { output_text: '[]' };
    return (async function* () {
      yield { type: 'response.completed', response: { output: [{ type: 'message', content: [{ type: 'output_text', text: 'Saved answer.' }] }] } };
    })();
  } }; }
  return load('app/api/chat/route.ts', {
    openai: { default: FakeAI },
    '@/lib/attendance-db': { fetchCSV: async () => 'csv', getDatabase: async () => ({}), runSQL: () => '1', isReadOnlySelect: () => true },
    '@/lib/dataExplorerSource': { loadExplorerData: async () => ({ rows: [], people: [], sites: [], asOf: '2026-10-14', loadedAt: '' }) },
    '@/lib/attendanceTrends': { attendanceWorkouts: () => [] },
    '@/lib/chatTools': { CHAT_TOOLS: [], chatDataFacts: () => '', isChatTool: () => false, runChatTool: async () => ({ output: '{}' }) },
    '@/lib/ehChallenge': { computeChallenge: () => ({}) },
    '@/lib/sheet': { fetchAttendance: async () => [], fetchEhAttributions: async () => [], fetchResurrectionAttributions: async () => [] },
    ...deps,
  });
}
const ask = (route, body) => route.POST(new Request('https://bedrock.test/api/chat', { method: 'POST', body: JSON.stringify({ question: 'Who posted?', ...body }) }));

test('Chat claims the browser request ID once; bad IDs never reach quota and repeats never run', async () => {
  delete process.env.DISCORD_WEBHOOK_URL;
  const { REQUEST_ID } = load('lib/chatLogStore.ts');
  const saved = []; let reserved = 0; let modelCalls = 0; const claimed = new Set();
  const route = recoveryChat({
    '@/lib/chatLogStore': { REQUEST_ID,
      // Atomic like a unique insert: the second claim of an ID fails even when both arrive together.
      claimChatLog: async log => { await Promise.resolve(); if (claimed.has(log._id)) return 'duplicate'; claimed.add(log._id); saved.push(structuredClone(log)); return 'claimed'; },
      saveChatLog: async log => saved.push(structuredClone(log)) },
    '@/lib/aiRateLimit': { reserveAiRequest: async () => { reserved++; return { allowed: true }; } },
    '@/lib/chatTools': { CHAT_TOOLS: [], chatDataFacts: () => { modelCalls++; return ''; }, isChatTool: () => false, runChatTool: async () => ({ output: '{}' }) },
  });
  assert.equal((await ask(route, { requestId: 'not-a-uuid' })).status, 400);
  assert.equal((await ask(route, { requestId: { $ne: null } })).status, 400);
  assert.equal(reserved, 0);
  const [a, b] = await Promise.all([ask(route, { requestId: RID }), ask(route, { requestId: RID })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  await (a.status === 200 ? a : b).text();
  assert.equal(modelCalls, 1, 'only the claimed request runs');
  assert.equal(saved[0].status, 'pending');
  assert.equal(saved.filter(l => l.status === 'pending').length, 1, 'the claim is the pending record');
  assert.equal(saved.at(-1)._id, RID);
  assert.equal(saved.at(-1).status, 'success');
});

test('A unique-key conflict is a duplicate; other storage failures still answer', async () => {
  process.env.MONGODB_URI = 'mongodb://test';
  const errors = []; const original = console.error;
  for (const [failure, expected] of [[{ code: 11000 }, 'duplicate'], [new Error('mongodb://secret'), 'unavailable'], [null, 'claimed']]) {
    globalThis.chatMongo = undefined;
    class FakeMongo { async connect() { return this; } db() { return { collection: () => ({ insertOne: async () => { if (failure) throw failure; } }) }; } }
    const { claimChatLog } = load('lib/chatLogStore.ts', { mongodb: { MongoClient: FakeMongo } });
    try { console.error = m => errors.push(m); assert.equal(await claimChatLog({ _id: RID }), expected); } finally { console.error = original; }
  }
  assert.ok(errors.every(e => !e.includes('secret')));
  delete process.env.MONGODB_URI; delete globalThis.chatMongo;
});

test('Saved answers are returned by request ID without history; invalid, missing, and unconfigured requests fail safely', async () => {
  let read = 0;
  const route = load('app/api/chat/result/route.ts', { '@/lib/chatLogStore': {
    REQUEST_ID: load('lib/chatLogStore.ts').REQUEST_ID,
    readChatResult: async id => { read++; return id === RID ? { status: 'success', answer: 'Saved.', queries: [], suggestions: ['Next?'] } : null; },
  } });
  const { NextRequest } = require('next/server');
  const get = id => route.GET(new NextRequest(`https://bedrock.test/api/chat/result?id=${encodeURIComponent(id)}`));
  delete process.env.MONGODB_URI;
  assert.equal((await get(RID)).status, 503);
  process.env.MONGODB_URI = 'mongodb://test';
  try {
    assert.equal((await get('../admin')).status, 400);
    assert.equal(read, 0);
    const found = await get(RID);
    assert.equal(found.status, 200);
    assert.equal(found.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await found.json(), { status: 'success', answer: 'Saved.', queries: [], suggestions: ['Next?'] });
    assert.equal((await get('11111111-2222-3333-4444-555555555555')).status, 404);
  } finally { delete process.env.MONGODB_URI; }
});

test('Result reads skip history and records older than a day', async () => {
  let call;
  process.env.MONGODB_URI = 'mongodb://test';
  globalThis.chatMongo = undefined;
  class FakeMongo { async connect() { return this; } db() { return { collection: () => ({ findOne: async (filter, options) => {
    call = { filter, options };
    return { status: 'pending', history: [{ role: 'user', content: 'private' }], queries: [] };
  } }) }; } }
  try {
    const { readChatResult } = load('lib/chatLogStore.ts', { mongodb: { MongoClient: FakeMongo } });
    const result = await readChatResult(RID);
    assert.equal(call.filter._id, RID);
    assert.ok(Date.now() - call.filter.createdAt.$gte.getTime() >= 24 * 3600_000 - 1000);
    assert.equal(call.options.projection.history, undefined);
    assert.equal(result.history, undefined);
    assert.equal(result.status, 'pending');
  } finally { delete process.env.MONGODB_URI; delete globalThis.chatMongo; }
});
