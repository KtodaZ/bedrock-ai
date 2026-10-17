const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const compiled = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../lib/chatSession.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = {};
new Function('exports', compiled)(mod);
const { ChatSession } = mod;
function storage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
const FAST = { recoveryMs: 200, pollMs: 5, stallMs: 50, headerMs: 50, checkMs: 30 };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
// results(id) answers the saved-answer endpoint; the default has nothing saved yet.
function setup(seed, results = () => json({ error: 'missing' }, 404), disk = storage(seed)) {
  const calls = [];
  const polls = [];
  const session = new ChatSession(() => disk, async (url, options) => {
    if (url.startsWith('/api/chat/result')) {
      const id = new URL(url, 'http://x').searchParams.get('id');
      polls.push(id);
      return results(id, polls.length, options);
    }
    if (setup.chat) return setup.chat(url, options);
    let stream;
    const body = new ReadableStream({ start(controller) { stream = controller; } });
    calls.push({ url, options, error: (e) => stream.error(e), send: (event, ending = '\n\n') => stream.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(event) + ending)), close: () => stream.close() });
    return new Response(body);
  }, FAST);
  session.hydrate();
  return { session, disk, calls, polls };
}
const saved = disk => JSON.parse(disk.getItem('bedrock-conversations'));

test('question and active conversation persist before response; duplicate sends are ignored', async () => {
  const { session, disk, calls } = setup();
  const pending = session.sendMessage('Who posted?');
  const id = session.getSnapshot().activeId;
  assert.equal(saved(disk)[0].messages[0].content, 'Who posted?');
  assert.equal(saved(disk)[0].pending, true);
  assert.equal(JSON.parse(disk.getItem('bedrock-chat-session')).activeId, id);
  await session.sendMessage('Duplicate');
  assert.equal(calls.length, 1);
  calls[0].send({ type: 'done', answer: 'Alex posted.' });
  await pending;
  const reloaded = new ChatSession(() => disk);
  reloaded.hydrate();
  assert.equal(reloaded.getSnapshot().activeId, id);
  assert.equal(reloaded.getSnapshot().conversations[0].messages[1].content, 'Alex posted.');
  assert.equal(reloaded.getSnapshot().conversations[0].pending, false);
});

test('background completion belongs to its own conversation and preserves active draft', async () => {
  const { session, disk, calls } = setup();
  const first = session.sendMessage('First question');
  const firstId = session.getSnapshot().activeId;
  session.startNewChat();
  session.setInput('Unsent new chat draft');
  calls[0].send({ type: 'done', answer: 'First answer' });
  await first;
  assert.equal(session.getSnapshot().activeId, null);
  assert.equal(session.getSnapshot().drafts.new, 'Unsent new chat draft');
  session.restoreConversation(firstId);
  session.setInput('Follow-up draft');
  const reload = new ChatSession(() => disk);
  reload.hydrate();
  assert.equal(reload.getSnapshot().drafts[firstId], 'Follow-up draft');
  reload.startNewChat();
  assert.equal(reload.getSnapshot().drafts.new, 'Unsent new chat draft');
});

test('parallel conversations and phase events never replace the active conversation', async () => {
  const { session, calls } = setup();
  const first = session.sendMessage('First');
  const firstId = session.getSnapshot().activeId;
  session.startNewChat();
  const second = session.sendMessage('Second');
  const secondId = session.getSnapshot().activeId;
  calls[0].send({ type: 'phase', label: 'Querying attendance' });
  calls[0].send({ type: 'done', answer: 'One' });
  await first;
  assert.equal(session.getSnapshot().activeId, secondId);
  assert.equal(session.getSnapshot().conversations.find(c => c.id === secondId).pending, true);
  calls[1].send({ type: 'done', answer: 'Two' });
  await second;
  assert.equal(session.getSnapshot().conversations.find(c => c.id === firstId).messages[1].content, 'One');
  assert.equal(session.getSnapshot().conversations.find(c => c.id === secondId).messages[1].content, 'Two');
});

test('reload fetches the saved answer for a pending question without asking again', async () => {
  const { session, disk, calls } = setup();
  const pending = session.sendMessage('Still running');
  const requestId = JSON.parse(calls[0].options.body).requestId;
  assert.equal(saved(disk)[0].requestId, requestId);
  const reloaded = setup(undefined, (id, n) => n < 3 ? json({ status: 'pending' })
    : json({ status: 'success', answer: 'Saved answer', queries: [{ sql: 'pax_profile {}', reason: 'Clove' }], suggestions: ['Next?'], reasoningLevel: 'high' }), disk);
  assert.equal(reloaded.session.getSnapshot().conversations[0].pending, true);
  await new Promise(r => setTimeout(r, 60));
  const c = reloaded.session.getSnapshot().conversations[0];
  assert.equal(reloaded.calls.length, 0, 'recovery never sends the question again');
  assert.deepEqual(reloaded.polls, [requestId, requestId, requestId]);
  assert.equal(c.pending, false);
  assert.equal(c.requestId, undefined);
  assert.deepEqual(c.messages.map(m => m.content), ['Still running', 'Saved answer']);
  assert.deepEqual(c.messages[1].suggestions, ['Next?']);
  assert.equal(c.messages[1].queryLog[0].reason, 'Clove');
  await pending;
});

test('legacy pending chats without a request ID stay interrupted and make no requests', () => {
  const c = { id: 'old', title: 'Q', messages: [{ role: 'user', content: 'Q' }], createdAt: 1, updatedAt: 2, pending: true };
  const { session, calls, polls } = setup({ 'bedrock-conversations': JSON.stringify([c]) });
  const restored = session.getSnapshot().conversations[0];
  assert.equal(restored.pending, false);
  assert.match(restored.messages[1].content, /interrupted/);
  assert.equal(calls.length + polls.length, 0);
});

test('deleted in-flight chats cannot reappear after a late response', async () => {
  const { session, disk, calls } = setup();
  const pending = session.sendMessage('Delete this');
  await Promise.resolve();
  session.deleteConversation(session.getSnapshot().activeId);
  assert.equal(calls[0].options.signal.aborted, true);
  calls[0].send({ type: 'done', answer: 'Late answer' });
  await pending;
  assert.deepEqual(saved(disk), []);
});

test('a dropped stream recovers the saved answer instead of showing an error', async () => {
  const { session, disk, calls, polls } = setup(undefined, () => json({ status: 'success', answer: 'Hilltop averaged 8.3 PAX.', queries: [], suggestions: [] }));
  const id = session.sendMessage('Hilltop drop?');
  const convo = session.getSnapshot().activeId;
  calls[0].send({ type: 'query', index: 1, reason: 'Hilltop', sql: 'ao_profile {}' });
  calls[0].send({ type: 'delta', text: 'Hilltop aver' });
  await new Promise(r => setTimeout(r, 0));
  assert.equal(session.getSnapshot().partials[convo], 'Hilltop aver');
  calls[0].error(new TypeError('network error'));
  await id;
  const c = saved(disk)[0];
  assert.equal(polls[0], JSON.parse(calls[0].options.body).requestId);
  assert.deepEqual(c.messages.map(m => m.content), ['Hilltop drop?', 'Hilltop averaged 8.3 PAX.']);
  assert.equal(c.messages[1].isError, undefined);
  assert.equal(c.messages[1].queryLog[0].reason, 'Hilltop', 'streamed lookups are kept when the saved record has none');
  assert.equal(session.getSnapshot().partials[convo], undefined);
  assert.equal(c.pending, false);
});

test('a silent connection is treated as dropped and recovered', async () => {
  const { session, disk, calls } = setup(undefined, () => json({ status: 'success', answer: 'Recovered after stall' }));
  await session.sendMessage('Quiet');
  assert.equal(calls.length, 1);
  assert.equal(saved(disk)[0].messages[1].content, 'Recovered after stall');
});

test('server-reported errors are shown without polling; saved errors are shown after recovery', async () => {
  const { session, disk, calls, polls } = setup(undefined, () => json({ status: 'error', error: 'Model failed' }));
  const first = session.sendMessage('One');
  calls[0].send({ type: 'error', message: 'Quota store unavailable' });
  await first;
  assert.equal(polls.length, 0);
  assert.equal(saved(disk)[0].messages[1].content, 'Quota store unavailable');
  const second = session.sendMessage('Two');
  calls[1].close();
  await second;
  assert.equal(saved(disk)[0].messages.at(-1).content, 'Model failed');
  assert.equal(saved(disk)[0].messages.at(-1).isError, true);
});

test('unrecoverable drops end in a saved error; Try again replaces the failed attempt', async () => {
  const { session, disk, calls, polls } = setup();
  const first = session.sendMessage('Disconnected');
  calls[0].close();
  await first;
  assert.equal(polls.length, 5, 'stops after the server repeatedly has no record');
  assert.match(saved(disk)[0].messages[1].content, /couldn't be recovered/);
  assert.equal(saved(disk)[0].pending, false);
  const second = session.sendMessage('Disconnected', { retry: true });
  while (calls.length < 2) await new Promise(r => setTimeout(r, 1));
  assert.equal(polls.length, 6, 'Try again first checks the earlier request');
  assert.deepEqual(saved(disk)[0].messages.map(m => m.content), ['Disconnected']);
  calls[1].send({ type: 'done', answer: 'Recovered' }, '');
  calls[1].close();
  await second;
  assert.deepEqual(saved(disk)[0].messages.map(m => m.content), ['Disconnected', 'Recovered']);
});

test('after recovery gives up, a reload or Try again still finds the saved answer without asking again', async () => {
  let ready = false;
  const results = () => ready ? json({ status: 'success', answer: 'Finished late' }) : json({ status: 'pending' });
  const { session, disk, calls, polls } = setup(undefined, results);
  const first = session.sendMessage('Slow');
  const requestId = JSON.parse(calls[0].options.body).requestId;
  calls[0].close();
  await first;
  assert.ok(polls.length > 5);
  const lost = saved(disk)[0].messages[1];
  assert.match(lost.content, /couldn't be recovered/);
  assert.equal(lost.requestId, requestId, 'the request ID is kept for later checks');
  // Back online: a reload checks once and fills in the answer.
  ready = true;
  const reloaded = setup(undefined, results, disk);
  await new Promise(r => setTimeout(r, 20));
  assert.equal(reloaded.calls.length, 0);
  assert.deepEqual(saved(disk)[0].messages.map(m => m.content), ['Slow', 'Finished late']);
  // Try again on the same kind of failure uses the saved answer rather than spending quota.
  ready = false;
  const again = setup();
  const second = again.session.sendMessage('Slow too');
  again.calls[0].close();
  await second;
  const lostId = saved(again.disk)[0].messages[1].requestId;
  ready = true;
  const retried = setup(undefined, results, again.disk);
  await retried.session.sendMessage('Slow too', { retry: true });
  assert.equal(retried.calls.length, 0, 'no new question was sent');
  assert.equal(retried.polls.at(-1), lostId);
  assert.deepEqual(saved(again.disk)[0].messages.map(m => m.content), ['Slow too', 'Finished late']);
});

test('a lost answer is picked up when the phone comes back online', async () => {
  let ready = false;
  const { session, disk, calls } = setup(undefined, () => ready ? json({ status: 'success', answer: 'Back online' }) : new Promise((_, r) => r(new TypeError('offline'))));
  const first = session.sendMessage('Offline');
  calls[0].close();
  await first;
  assert.match(saved(disk)[0].messages[1].content, /couldn't be recovered/);
  ready = true;
  session.recheckLost();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(saved(disk)[0].messages[1].content, 'Back online');
});

test('a response that never starts and a stuck answer check are both bounded', async () => {
  const { session, disk, polls } = setup(undefined, (id, n, options) => n === 1
    // The first check never answers until it is abandoned.
    ? new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    : json({ status: 'success', answer: 'Recovered after a stuck check' }));
  setup.chat = (url, options) => new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  try {
    await session.sendMessage('Headers never came');
  } finally { setup.chat = undefined; }
  assert.ok(polls.length >= 2);
  assert.equal(saved(disk)[0].messages[1].content, 'Recovered after a stuck check');
});

test('deleting a chat stops recovery', async () => {
  const { session, disk, calls, polls } = setup(undefined, () => json({ status: 'pending' }));
  const first = session.sendMessage('Delete me');
  calls[0].close();
  await new Promise(r => setTimeout(r, 20));
  session.deleteConversation(session.getSnapshot().activeId);
  await first;
  const count = polls.length;
  await new Promise(r => setTimeout(r, 30));
  assert.equal(polls.length, count);
  assert.deepEqual(saved(disk), []);
});

test('unterminated final SSE events still complete', async () => {
  const { session, disk, calls } = setup();
  const second = session.sendMessage('Try again');
  calls[0].send({ type: 'done', answer: 'Recovered' }, '');
  calls[0].close();
  await second;
  assert.equal(saved(disk)[0].messages.at(-1).content, 'Recovered');
});

test('legacy history resumes the latest chat; explicit new chat survives reload', () => {
  const c = { id: 'old', title: 'Saved', messages: [{ role: 'user', content: 'A question' }], createdAt: 1, updatedAt: 2 };
  const { session, disk } = setup({ 'bedrock-conversations': JSON.stringify([c]) });
  assert.equal(session.getSnapshot().activeId, 'old');
  session.startNewChat();
  const reload = new ChatSession(() => disk);
  reload.hydrate();
  assert.equal(reload.getSnapshot().activeId, null);
});

test('malformed history and unavailable storage do not crash chat', () => {
  const { session } = setup({ 'bedrock-conversations': '[null,{"messages":null}]' });
  assert.deepEqual(session.getSnapshot().conversations, []);
  const denied = new ChatSession(() => { throw new Error('Storage blocked'); });
  denied.hydrate();
  denied.setInput('Keep in memory');
  assert.equal(denied.getSnapshot().storageError, true);
  assert.equal(denied.getSnapshot().drafts.new, 'Keep in memory');
});

test('HTTP rejection is saved and clears pending state', async () => {
  const disk = storage();
  const session = new ChatSession(() => disk, async () => new Response(JSON.stringify({ error: 'Daily limit reached' }), { status: 429 }));
  session.hydrate();
  await session.sendMessage('Question');
  assert.equal(saved(disk)[0].messages[1].content, 'Daily limit reached');
  assert.equal(saved(disk)[0].pending, false);
});

test('streamed text shows while pending, resets between rounds, and late suggestions attach to the answer', async () => {
  const { session, disk, calls } = setup();
  const pending = session.sendMessage('How is Clove doing?');
  const id = session.getSnapshot().activeId;
  const flush = () => new Promise(r => setTimeout(r, 0));
  calls[0].send({ type: 'delta', text: 'Draft' });
  await flush();
  assert.equal(session.getSnapshot().partials[id], 'Draft');
  calls[0].send({ type: 'reset' });
  calls[0].send({ type: 'delta', text: '**Clove** has ' });
  calls[0].send({ type: 'delta', text: '5 posts.' });
  await flush();
  assert.equal(session.getSnapshot().partials[id], '**Clove** has 5 posts.');
  assert.equal(disk.getItem('bedrock-conversations').includes('5 posts'), false, 'partial text is never saved');
  calls[0].send({ type: 'done', answer: '**Clove** has 5 posts.', suggestions: [] });
  await pending;
  assert.equal(session.getSnapshot().partials[id], undefined);
  assert.equal(session.getSnapshot().conversations[0].pending, false);
  // The chat is free before suggestions arrive.
  const next = session.sendMessage('And Bono?');
  assert.equal(calls.length, 2);
  calls[0].send({ type: 'suggestions', suggestions: ['Who posts with Clove most?', 7] });
  await flush();
  // A newer question in the same chat means the old suggestions no longer apply.
  assert.equal(saved(disk)[0].messages[1].suggestions.length, 0);
  calls[1].send({ type: 'done', answer: 'Bono has 3.' });
  await next;
  calls[1].send({ type: 'suggestions', suggestions: ['What about Spartan?'] });
  calls[1].close();
  await flush();
  assert.deepEqual(saved(disk)[0].messages.at(-1).suggestions, ['What about Spartan?']);
  calls[0].close();
});

test('page buttons are saved with the answer, survive recovery, and only allow in-app paths', async () => {
  const { session, disk, calls } = setup(undefined, () => json({ status: 'success', answer: 'Recovered', pages: [{ href: '/data/trends', label: 'Attendance trends' }, { href: 'https://evil.test', label: 'Bad' }] }));
  const first = session.sendMessage('Trends?');
  calls[0].send({ type: 'done', answer: 'Up 4%.', pages: [{ href: '/data/aos?ao=Hilltop', label: 'Hilltop AO page' }, { href: '//evil.test', label: 'Bad' }, { href: 'javascript:alert(1)', label: 'Bad' }] });
  await first;
  assert.deepEqual(saved(disk)[0].messages[1].pages, [{ href: '/data/aos?ao=Hilltop', label: 'Hilltop AO page' }]);
  const second = session.sendMessage('Again?');
  calls[1].close();
  await second;
  assert.deepEqual(saved(disk)[0].messages.at(-1).pages, [{ href: '/data/trends', label: 'Attendance trends' }]);
});
