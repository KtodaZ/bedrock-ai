const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, deps = {}) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', js)(key => deps[key] ?? require(key), exports);
  return exports;
}
const pages = load('lib/chatPages.ts');

test('the closing links line becomes page buttons and leaves the answer text', () => {
  const r = pages.finalizeLinks('**Clove** has 412 posts.\n\n[Open Clove\'s profile](/data?period=all&pax=Clove) · [Q leaders](/data/community?tab=q)\n', ['/data?period=all&pax=Clove']);
  assert.equal(r.answer, '**Clove** has 412 posts.');
  assert.deepEqual(r.pages, [{ href: '/data?period=all&pax=Clove', label: "Clove's profile" }, { href: '/data/community?tab=q', label: 'Q leaders' }]);
});

test('made-up in-app paths become plain text; inline links that exist stay inline', () => {
  const r = pages.finalizeLinks('See [the Kotter List](/data?view=kotter&period=all) and [Hilltop](/data/aos?ao=Hilltop) for more.\n\n[Open made-up page](/data/secret)', []);
  assert.equal(r.answer, 'See [the Kotter List](/data?view=kotter&period=all) and Hilltop for more.', 'a links line with only made-up pages is dropped');
  assert.deepEqual(r.pages, []);
  const mixed = pages.finalizeLinks('Answer.\n[Clove](/data?period=all&pax=Clove) · [Made up](/data/nope) · [Web](https://example.com)', ['/data?period=all&pax=Clove']);
  assert.equal(mixed.answer, 'Answer.');
  assert.deepEqual(mixed.pages, [{ href: '/data?period=all&pax=Clove', label: 'Clove' }]);
});

test('with no links in the answer, the first lookup link is suggested with a readable label', () => {
  assert.deepEqual(pages.finalizeLinks('Hilltop averaged 8.1 PAX.', ['/data/aos?ao=Hilltop&weeks=all', '/data/trends']).pages,
    [{ href: '/data/aos?ao=Hilltop&weeks=all', label: 'Hilltop AO page' }]);
  assert.equal(pages.pageLabel('/data/aos?ao=Hilltop&vs=Pinnacle'), 'Hilltop vs Pinnacle');
  assert.equal(pages.pageLabel('/eh-challenge/person/Milk%20Man?period=challenge'), "Milk Man's EH Challenge page");
  assert.equal(pages.pageLabel('/data/community?tab=tree'), 'EH family tree');
  assert.equal(pages.pageLabel('/data?view=raw&period=custom&from=2026-01-01&to=2026-02-01&site=Spartan'), 'Spartan attendance records');
});

test('page buttons are deduplicated, capped at three, and a trailing rule before them is removed', () => {
  const tail = '[A](/data/trends) · [B](/data/trends) · [C](/data/milestones) · [D](/eh-challenge) · [E](/data/aos)';
  const r = pages.finalizeLinks(`Answer.\n\n---\n${tail}`, []);
  assert.equal(r.answer, 'Answer.');
  assert.deepEqual(r.pages.map(p => p.href), ['/data/trends', '/data/milestones', '/eh-challenge']);
});

test('a last line with words besides links stays in the answer', () => {
  const r = pages.finalizeLinks('Check in with him this week on [his profile](/data?period=all).', []);
  assert.match(r.answer, /\[his profile\]/);
  assert.deepEqual(r.pages, []);
});

test('every directory page is a real route', () => {
  for (const p of pages.DATA_PAGES) {
    const route = new URL(p.href, 'https://x').pathname;
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'app', route, 'page.tsx')), route);
  }
  assert.match(pages.PAGES_PROMPT, /\/data\/community\?tab=q — Q leaders/);
});
