const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');

function loadTS(file, dependencies = {}, request = fetch) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', 'fetch', 'setTimeout', compiled)((name) => dependencies[name] || require(name), exports, request, (fn) => { fn(); return 0; });
  return exports;
}
const corrections = loadTS('lib/ehCorrections.ts');
const people = [{ name: 'New Guy', ehBy: null }, { name: 'Gelato', ehBy: null }, { name: 'Murse', ehBy: null }];
const input = () => ({ requestId: randomUUID(), pax: 'New Guy', ehBy: 'Gelato', submittedBy: 'Murse', notes: 'Invited him to his first workout.' });

test('Correction names are canonical Roster names and invalid entries are rejected', () => {
  assert.equal(corrections.validateCorrection({ ...input(), ehBy: '  gELato  ' }, people).ehBy, 'Gelato');
  for (const change of [{ ehBy: 'Gelatto' }, { pax: 'Not in Roster' }, { submittedBy: '' }, { ehBy: 'New Guy' }, { notes: 'x'.repeat(401) }, { requestId: 'invalid' }, { website: 'spam' }]) {
    assert.throws(() => corrections.validateCorrection({ ...input(), ...change }, people), corrections.CorrectionInputError);
  }
});

test('Durable writes preserve concurrent records, retries are idempotent, and Discord failures are retryable', async () => {
  let history = { version: 1, corrections: [] };
  let version = 1;
  let calls = 0;
  let failDelivery = false;
  class Conflict extends Error {}
  const blob = {
    BlobPreconditionFailedError: Conflict,
    get: async () => ({ statusCode: 200, stream: new Response(JSON.stringify(history)).body, blob: { etag: String(version) } }),
    put: async (_key, body, options) => {
      if (options.ifMatch !== String(version)) throw new Conflict();
      history = JSON.parse(body); version++;
    },
  };
  const store = loadTS('lib/ehCorrectionStore.ts', { '@vercel/blob': blob, './ehCorrections': corrections }, async (_url, options) => {
    calls++;
    const payload = JSON.parse(options.body);
    assert.deepEqual(payload.allowed_mentions.parse, []);
    assert.ok(payload.embeds[0].description.includes('Standings stay unchanged'));
    return failDelivery ? new Response('{}', { status: 400 }) : new Response(JSON.stringify({ id: 'discord-message' }), { status: 200 });
  });
  const first = input(), second = { ...input(), pax: 'Murse' };
  await Promise.all([store.saveCorrection(first, null), store.saveCorrection(second, null)]);
  assert.equal((await store.correctionHistory()).length, 2);
  await store.saveCorrection(first, null);
  assert.equal((await store.correctionHistory()).length, 2);
  await assert.rejects(store.saveCorrection({ ...first, ehBy: 'Murse' }, null), corrections.CorrectionInputError);
  await assert.rejects(store.saveCorrection(input(), 'Gelato'), corrections.CorrectionInputError);
  const oldWebhook = process.env.DISCORD_WEBHOOK_URL;
  process.env.DISCORD_WEBHOOK_URL = 'https://discord.test/webhook';
  try {
    await Promise.all([store.notifyCorrection(first.requestId), store.notifyCorrection(first.requestId)]);
    assert.equal(calls, 1);
    assert.equal((await store.correctionHistory())[0].notification.status, 'sent');
    failDelivery = true;
    assert.equal(await store.notifyCorrection(second.requestId), 'pending');
    assert.equal((await store.correctionHistory())[1].notification.status, 'failed');
    failDelivery = false;
    assert.equal(await store.notifyCorrection(second.requestId), 'sent');
    assert.equal((await store.correctionHistory()).length, 2);
  } finally {
    if (oldWebhook === undefined) delete process.env.DISCORD_WEBHOOK_URL; else process.env.DISCORD_WEBHOOK_URL = oldWebhook;
  }
});

test('The submission endpoint rejects invalid JSON/origins and never notifies Discord if saving fails', async () => {
  const { NextRequest } = require('next/server');
  let notified = 0;
  const api = loadTS('app/api/eh-corrections/route.ts', {
    '@/lib/sheet': { fetchEhRoster: async () => people },
    '@/lib/ehCorrections': corrections,
    '@/lib/ehCorrectionStore': { saveCorrection: async () => { throw new Error('Storage outage'); }, notifyCorrection: async () => { notified++; return 'sent'; } },
  });
  const req = (body, origin = 'https://data.f3bedrock.com') => new NextRequest('https://data.f3bedrock.com/api/eh-corrections', { method: 'POST', headers: { 'Content-Type': 'application/json', origin }, body });
  assert.equal((await api.POST(req(JSON.stringify(input()), 'https://other.test'))).status, 403);
  assert.equal((await api.POST(req('{'))).status, 400);
  assert.equal((await api.POST(req(JSON.stringify(input())))).status, 503);
  assert.equal(notified, 0);
});
