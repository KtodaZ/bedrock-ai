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
const names = { pax: ['Clove', 'Milk Man', 'Double Down'], aos: ['Hilltop', 'Pinnacle', 'Rattlesnake Ridge', 'Divento', 'Spartan'] };
const check = (href) => pages.checkPageLink(href, names);
const source = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('the closing links line becomes page buttons and leaves the answer text', () => {
  const r = pages.finalizeLinks('**Clove** has 412 posts.\n\n[Open Clove\'s profile](/data?period=all&pax=Clove) · [Q leaders](/data/community?tab=q)\n', ['/data?period=all&pax=Clove'], names);
  assert.equal(r.answer, '**Clove** has 412 posts.');
  assert.deepEqual(r.pages, [{ href: '/data?period=all&pax=Clove', label: "Clove's profile" }, { href: '/data/community?tab=q', label: 'Q leaders' }]);
});

test('links are checked against what each page reads, and names are corrected to their real spelling', () => {
  assert.equal(check('/data?period=all&pax=milk%20man&rel=by&prange=recent#companions-heading'), '/data?period=all&pax=Milk+Man&rel=by&prange=recent#companions-heading');
  assert.equal(check('/data?view=raw&period=custom&from=2026-03-01&to=2026-03-31&site=hilltop&flags=q,fng'), '/data?view=raw&period=custom&from=2026-03-01&to=2026-03-31&site=Hilltop&flags=q%2Cfng');
  assert.equal(check('/data?pax=Clove&pview=month&pmonth=2026-03#calendar-heading'), '/data?pax=Clove&pview=month&pmonth=2026-03#calendar-heading');
  assert.equal(check('/data/aos?ao=Hilltop&chart=yoy&year=2025'), '/data/aos?ao=Hilltop&chart=yoy&year=2025');
  assert.equal(check('/data/aos?ao=Hilltop&list=qs#ao-people-heading'), '/data/aos?ao=Hilltop&list=qs#ao-people-heading');
  assert.equal(check('/data/trends?weeks=52&ao=Hilltop&ao=Pinnacle#weekday-heading'), '/data/trends?weeks=52&ao=Hilltop&ao=Pinnacle#weekday-heading');
  assert.equal(check('/data/community?tab=tree&search=Clove#family-tree-heading'), '/data/community?tab=tree&search=Clove#family-tree-heading');
  assert.equal(check('/data/milestones?mode=reached&horizon=all&sort=remaining'), '/data/milestones?mode=reached&horizon=all&sort=remaining');
  assert.equal(check('/eh-challenge?period=challenge&sort=fngs&search=Clove#eh-standings-heading'), '/eh-challenge?period=challenge&sort=fngs&search=Clove#eh-standings-heading');
  assert.equal(check('/eh-challenge/person/milk%20man?period=year#badges-heading'), '/eh-challenge/person/Milk%20Man?period=year#badges-heading');
  assert.equal(check('/eh-challenge/points'), '/eh-challenge/points');
  for (const bad of [
    '/data?pax=Nobody', '/data?site=Atlantis', '/data?view=chart', '/data?colour=red', '/data?period=all&period=year',
    '/data?from=2026-13-01', '/data?pax=Clove#nowhere', '/data/secret', '/data/aos?ao=Hilltop&list=fngs',
    '/data/trends?ao=Hilltop&ao=Pinnacle&ao=Divento&ao=Spartan&ao=Rattlesnake%20Ridge', '/eh-challenge/person/Nobody',
    '//evil.test/data', 'https://evil.test/data', '/data?search=',
  ]) assert.equal(check(bad), null, bad);
});

test('made-up links become plain text inline and are dropped from the buttons; real ones stay', () => {
  const r = pages.finalizeLinks('See [the Kotter List](/data?view=kotter&period=all) and [Atlantis](/data/aos?ao=Atlantis) for more.\n\n[Open made-up page](/data/secret)', [], names);
  assert.equal(r.answer, 'See [the Kotter List](/data?view=kotter&period=all) and Atlantis for more.', 'a links line with only made-up pages is dropped');
  assert.deepEqual(r.pages, []);
  const mixed = pages.finalizeLinks('Answer.\n[Clove](/data?period=all&pax=clove) · [Made up](/data/nope) · [Web](https://example.com)', [], names);
  assert.equal(mixed.answer, 'Answer.');
  assert.deepEqual(mixed.pages, [{ href: '/data?period=all&pax=Clove', label: 'Clove' }]);
});

test('with no links in the answer, the first lookup link is suggested with a readable label', () => {
  assert.deepEqual(pages.finalizeLinks('Hilltop averaged 8.1 PAX.', ['/data/aos?ao=Hilltop&weeks=all', '/data/trends']).pages,
    [{ href: '/data/aos?ao=Hilltop&weeks=all', label: 'Hilltop AO page' }]);
  assert.equal(pages.pageLabel('/data/aos?ao=Hilltop&vs=Pinnacle'), 'Hilltop vs Pinnacle');
  assert.equal(pages.pageLabel('/data/aos?ao=Hilltop&chart=yoy'), 'Hilltop year over year');
  assert.equal(pages.pageLabel('/data/aos?ao=Hilltop&list=qs'), 'Hilltop top Qs');
  assert.equal(pages.pageLabel('/data?pax=Clove&rel=led'), "Clove's Qs led");
  assert.equal(pages.pageLabel('/eh-challenge/person/Milk%20Man?period=challenge'), "Milk Man's EH Challenge page");
  assert.equal(pages.pageLabel('/data/community?tab=tree#family-tree-heading'), 'EH family tree');
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

// The schema must match the pages, or the chat would build links that open the wrong view.
const PAGE_FILES = {
  '/data': ['app/DataExplorer.tsx', 'lib/dataExplorer.ts'],
  '/data/trends': ['app/AttendanceTrends.tsx'],
  '/data/aos': ['app/AoPages.tsx'],
  '/data/community': ['app/Community.tsx'],
  '/data/milestones': ['app/Milestones.tsx'],
  '/eh-challenge': ['app/EhChallenge.tsx'],
  '/eh-challenge/person/<PAX>': ['app/PersonDetail.tsx', 'app/eh-challenge/person/[name]/page.tsx'],
  '/eh-challenge/points': [],
};
test('every linkable route, parameter, and section exists in the page that reads it', () => {
  assert.deepEqual(Object.keys(pages.LINK_ROUTES).sort(), Object.keys(PAGE_FILES).sort());
  for (const [route, spec] of Object.entries(pages.LINK_ROUTES)) {
    const dir = route.replace('<PAX>', '[name]');
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'app', dir, 'page.tsx')), route);
    const code = PAGE_FILES[route].map(source).join('\n');
    for (const key of Object.keys(spec.params))
      assert.match(code, new RegExp(`(get|getAll|linkedParam)\\("${key}"\\)|\\{ ${key}: selected \\}`), `${route} reads ${key}`);
    for (const id of Object.keys(spec.sections)) assert.ok(code.includes(`id="${id}"`), `${route} has #${id}`);
  }
  for (const p of pages.DATA_PAGES) assert.equal(pages.checkPageLink(p.href), p.href, p.href);
  assert.match(pages.PAGES_PROMPT, /rel=profile people list: with \(posted with most\)/);
});

test('lookup links are all valid page links', () => {
  const linkSource = source('lib/chatTools.ts');
  for (const literal of linkSource.matchAll(/["`](\/(?:data|eh-challenge)[^"`$]*)["`]/g)) {
    const href = literal[1].replace(/[?&]$/, '');
    assert.notEqual(pages.checkPageLink(href), null, href);
  }
});
