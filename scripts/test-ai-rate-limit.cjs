const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, deps = {}) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', js)((key) => deps[key] ?? require(key), exports);
  return exports;
}
function setup() {
  process.env.AUTH_SECRET = 'test-only';
  let state = { version: 1, day: '2026-10-14', total: 0, clients: {} }, version = 0, offline = false;
  class Conflict extends Error {}
  const blob = {
    BlobPreconditionFailedError: Conflict,
    async get() {
      if (offline) throw new Error('offline');
      return { statusCode: 200, stream: new Response(JSON.stringify(state)).body, blob: { etag: String(version) } };
    },
    async put(path, data, opts) {
      if (opts.ifMatch !== String(version)) throw new Conflict();
      state = JSON.parse(data); version++;
    },
  };
  return { ...load('lib/aiRateLimit.ts', { '@vercel/blob': blob }), state: () => state, offline: () => offline = true };
}
const now = Date.parse('2026-10-14T12:00:00Z');
// Libraries the chat route imports; tests replace the sheet, tools, and SQL.
const chatDeps = (extra = {}) => ({
  '@/lib/chatLogStore': { saveChatLog: async () => {}, claimChatLog: async () => 'unavailable' },
  '@/lib/attendance-db': { fetchCSV: async () => 'csv', getDatabase: async () => ({}), runSQL: () => '1', isReadOnlySelect: (sql) => /^select/i.test(sql) },
  '@/lib/dataExplorerSource': { loadExplorerData: async () => ({ rows: [], people: [], sites: [], asOf: '2026-10-14', loadedAt: '' }) },
  '@/lib/attendanceTrends': { attendanceWorkouts: () => [] },
  '@/lib/chatTools': { CHAT_TOOLS: [], chatDataFacts: () => 'facts', isChatTool: (n) => n === 'pax_profile', runChatTool: async () => ({ output: '{"posts":3,"link":"/data?pax=A"}' }) },
  '@/lib/ehChallenge': { computeChallenge: () => ({}) },
  '@/lib/sheet': { fetchAttendance: async () => [], fetchEhAttributions: async () => [], fetchResurrectionAttributions: async () => [] },
  ...extra,
});
// The analysis model streams; follow-up suggestions do not.
// Like the real API, streamed responses carry text only in message items (no output_text shortcut).
const streamOf = ({ output, output_text: text = '' }, draft = text) => (async function* () {
  if (draft) yield { type: 'response.output_text.delta', delta: draft };
  const message = draft ? [{ type: 'message', content: [{ type: 'output_text', text: draft }] }] : [];
  yield { type: 'response.completed', response: { output: [...message, ...output] } };
})();
const headers = (ip) => new Headers({ 'x-forwarded-for': ip });
test('Five questions per IP per minute, reset, no raw IP in storage', async () => {
  const s = setup();
  for (let i = 0; i < 5; i++) assert.equal((await s.reserveAiRequest(headers('192.0.2.1'), now)).allowed, true);
  assert.equal((await s.reserveAiRequest(headers('192.0.2.1'), now)).status, 429);
  assert.equal((await s.reserveAiRequest(headers('192.0.2.1'), now + 60000)).allowed, true);
  assert.ok(!JSON.stringify(s.state()).includes('192.0.2.1'));
});
test('Shared daily cap survives competing reservations and resets next day', async () => {
  const s = setup();
  for (let i = 0; i < 99; i++) assert.equal((await s.reserveAiRequest(headers('ip-' + i), now)).allowed, true);
  const results = await Promise.all([s.reserveAiRequest(headers('a'), now), s.reserveAiRequest(headers('b'), now)]);
  assert.equal(results.filter(r => r.allowed).length, 1);
  assert.equal(s.state().total, 100);
  assert.equal((await s.reserveAiRequest(headers('c'), now)).status, 429);
  assert.equal((await s.reserveAiRequest(headers('c'), now + 86400000)).allowed, true);
  assert.equal(s.state().total, 1);
});
test('Unavailable storage fails closed', async () => {
  const s = setup(); s.offline();
  assert.equal((await s.reserveAiRequest(headers('a'), now)).status, 503);
});
test('Rejected questions never call OpenAI, and homepage suggestions are free', async () => {
  let calls = 0;
  class FakeAI { responses = { create() { calls++; throw new Error('Should not call'); } }; }
  const chat = load('app/api/chat/route.ts', chatDeps({
    openai: { default: FakeAI },
    '@/lib/aiRateLimit': { reserveAiRequest: async () => ({ allowed: false, status: 429, message: 'Limit reached', retryAfter: 60 }) },
  }));
  const req = (body) => new Request('https://data.f3bedrock.com/api/chat', { method: 'POST', body: JSON.stringify(body) });
  assert.equal((await chat.POST(req({ question: 'Who posted?' }))).status, 429);
  assert.equal((await chat.POST(req({ question: 123 }))).status, 400);
  assert.equal((await chat.POST(req({ question: 'a'.repeat(2001) }))).status, 400);
  const suggestions = load('app/api/suggestions/route.ts');
  assert.equal((await suggestions.GET()).status, 200);
  assert.equal(calls, 0);
});
test('Allowed chat has at most six analysis rounds and a bounded follow-up call', async () => {
  let calls = [];
  delete process.env.DISCORD_WEBHOOK_URL;
  class FakeAI { responses = { async create(options) {
    calls.push(options);
    if (options.model === 'gpt-5-mini') return { output_text: '[]' };
    if (options.tool_choice === 'none') return streamOf({ output: [], output_text: 'Verified attendance summary.' });
    return streamOf({ output: [{ type: 'function_call', name: 'run_sql', call_id: 'query-' + calls.length, arguments: JSON.stringify({ sql: 'SELECT 1', reason: 'Check attendance' }) }] }, '');
  } }; }
  const chat = load('app/api/chat/route.ts', chatDeps({
    openai: { default: FakeAI },
    '@/lib/aiRateLimit': { reserveAiRequest: async () => ({ allowed: true }) },
  }));
  const response = await chat.POST(new Request('https://data.f3bedrock.com/api/chat', { method: 'POST', body: JSON.stringify({ question: 'Who posted?', reasoningLevel: 'low' }) }));
  assert.ok((await response.text()).includes('Verified attendance summary.'));
  assert.equal(calls.length, 7);
  assert.equal(calls.filter(c => c.model === 'gpt-6.1-sol').length, 6);
  assert.ok(calls.every(c => c.max_output_tokens > 0 && c.max_output_tokens <= 6000));
});

test('Chat streams the answer, runs lookup tools, refuses writes, and sends suggestions after the answer', async () => {
  const calls = [], sql = [], tools = [];
  delete process.env.DISCORD_WEBHOOK_URL;
  class FakeAI { responses = { async create(options) {
    calls.push(options);
    if (options.model === 'gpt-5-mini') return { output_text: '["What about Spartan?"]' };
    if (calls.filter(c => c.model === 'gpt-6.1-sol').length === 1) return streamOf({ output: [
      { type: 'function_call', name: 'pax_profile', call_id: 'a', arguments: JSON.stringify({ name: 'Clove', from: null, to: null }) },
      { type: 'function_call', name: 'run_sql', call_id: 'b', arguments: JSON.stringify({ sql: 'DROP TABLE attendance', reason: 'Bad' }) },
    ] }, 'Thinking…');
    return streamOf({ output: [], output_text: '**Clove** has 3 posts. [Open Clove’s profile](/data?pax=A)' });
  } }; }
  const chat = load('app/api/chat/route.ts', chatDeps({
    openai: { default: FakeAI },
    '@/lib/aiRateLimit': { reserveAiRequest: async () => ({ allowed: true }) },
    '@/lib/attendance-db': { fetchCSV: async () => 'csv', getDatabase: async () => ({}), runSQL: (db, q) => { sql.push(q); return '1'; }, isReadOnlySelect: (q) => /^select/i.test(q) },
    '@/lib/chatTools': { CHAT_TOOLS: [{ type: 'function', name: 'pax_profile' }], chatDataFacts: () => 'Latest attendance date 2026-10-14.', isChatTool: (n) => n === 'pax_profile', runChatTool: async (ctx, name, args) => { tools.push([name, args]); return { output: '{"posts":3}' }; } },
  }));
  const response = await chat.POST(new Request('https://data.f3bedrock.com/api/chat', { method: 'POST', body: JSON.stringify({ question: 'How many posts does Clove have?', reasoningLevel: 'low' }) }));
  const events = (await response.text()).split('\n\n').filter(Boolean).map(e => JSON.parse(e.slice(6)));
  const types = events.map(e => e.type);
  // Draft text written alongside tool calls is cleared before the real answer streams.
  assert.ok(types.indexOf('reset') > types.indexOf('delta'));
  assert.ok(types.lastIndexOf('delta') < types.indexOf('done'));
  assert.ok(types.indexOf('done') < types.indexOf('suggestions'));
  assert.deepEqual(events.find(e => e.type === 'suggestions').suggestions, ['What about Spartan?']);
  assert.deepEqual(tools, [['pax_profile', { name: 'Clove', from: null, to: null }]]);
  assert.deepEqual(sql, [], 'write SQL never reaches the database');
  const sol = calls.filter(c => c.model === 'gpt-6.1-sol');
  assert.equal(sol.length, 2);
  assert.ok(sol.every(c => c.stream === true && c.tools.length === 2));
  assert.match(sol[0].input[0].content, /Latest attendance date 2026-10-14/);
  const outputs = sol[1].input.filter(i => i.type === 'function_call_output').map(i => i.output);
  assert.deepEqual(outputs, ['{"posts":3}', 'SQL Error: only a single read-only SELECT or WITH query is allowed.']);
});
