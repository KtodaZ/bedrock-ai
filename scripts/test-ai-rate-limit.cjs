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
  const chat = load('app/api/chat/route.ts', {
    openai: { default: FakeAI },
    '@/lib/attendance-db': {},
    '@/lib/aiRateLimit': { reserveAiRequest: async () => ({ allowed: false, status: 429, message: 'Limit reached', retryAfter: 60 }) },
  });
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
    if (options.tool_choice === 'none') return { output: [], output_text: 'Verified attendance summary.' };
    return { output: [{ type: 'function_call', call_id: 'query-' + calls.length, arguments: JSON.stringify({ sql: 'SELECT 1', reason: 'Check attendance' }) }] };
  } }; }
  const chat = load('app/api/chat/route.ts', {
    openai: { default: FakeAI },
    '@/lib/attendance-db': { fetchCSV: async () => 'csv', getDatabase: async () => ({}), runSQL: () => '1' },
    '@/lib/aiRateLimit': { reserveAiRequest: async () => ({ allowed: true }) },
  });
  const response = await chat.POST(new Request('https://data.f3bedrock.com/api/chat', { method: 'POST', body: JSON.stringify({ question: 'Who posted?', reasoningLevel: 'low' }) }));
  assert.ok((await response.text()).includes('Verified attendance summary.'));
  assert.equal(calls.length, 7);
  assert.equal(calls.filter(c => c.model === 'gpt-6.1-sol').length, 6);
  assert.ok(calls.every(c => c.max_output_tokens > 0 && c.max_output_tokens <= 6000));
});
