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
function setup(seed) {
  const disk = storage(seed);
  const calls = [];
  const session = new ChatSession(() => disk, async (url, options) => {
    let stream;
    const body = new ReadableStream({ start(controller) { stream = controller; } });
    calls.push({ url, options, send: (event, ending = '\n\n') => stream.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(event) + ending)), close: () => stream.close() });
    return new Response(body);
  });
  session.hydrate();
  return { session, disk, calls };
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

test('reload preserves interrupted questions without automatically spending quota', async () => {
  const { session, disk, calls } = setup();
  const pending = session.sendMessage('Still running');
  let retries = 0;
  const reload = new ChatSession(() => disk, () => { retries++; throw new Error('Do not retry'); });
  reload.hydrate();
  const c = reload.getSnapshot().conversations[0];
  assert.equal(c.pending, false);
  assert.match(c.messages[1].content, /interrupted/);
  assert.equal(c.messages[0].content, 'Still running');
  assert.equal(retries, 0);
  calls[0].send({ type: 'done', answer: 'Complete' });
  await pending;
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

test('truncated streams become saved errors; unterminated final SSE events still complete', async () => {
  const { session, disk, calls } = setup();
  const first = session.sendMessage('Disconnected');
  calls[0].close();
  await first;
  assert.match(saved(disk)[0].messages[1].content, /connection ended/);
  assert.equal(saved(disk)[0].pending, false);
  const second = session.sendMessage('Try again');
  calls[1].send({ type: 'done', answer: 'Recovered' }, '');
  calls[1].close();
  await second;
  assert.equal(saved(disk)[0].messages.at(-1).content, 'Recovered');
  assert.ok(JSON.parse(calls[1].options.body).history.every(m => !m.content.includes('connection ended')));
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
