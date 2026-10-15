const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function loadTS(file, dependencies = {}) {
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', compiled)((name) => dependencies[name] || require(name), exports);
  return exports;
}
const lib = loadTS('lib/dataExplorer.ts');
const row = (pax, date, extra = {}) => ({ pax, date, site: 'Active', city: 'Roseville', post: true, q: false, fng: false, qs: false, qsq: false, ...extra });
const data = (rows) => ({ rows, people: [{ name: 'Alex', region: 'Bedrock', ehBy: 'Ben' }, { name: 'Ben', region: 'Other', ehBy: null }], sites: [{ name: 'Active', active: true }, { name: 'Also active', active: true }, { name: 'Retired', active: false }], asOf: '2026-10-15', loadedAt: '2026-10-15T00:00:00Z' });
const filters = (extra = {}) => ({ ...lib.defaultDataFilters('2026-10-15'), ...extra });

test('CSV parsing supports embedded newlines and quotes; attendance is allowlisted and excludes protected and metadata rows', () => {
  assert.deepEqual(lib.readDataCSV('\uFEFFName,Note\r\n"A, B","a ""quote""\nand line"\r\n'), [['Name', 'Note'], ['A, B', 'a "quote"\nand line']]);
  const header = 'PAX Name,Site Name,Date,Post,Q,FNG,QS,QS-Q,City,SECRET';
  const parsed = lib.parseDataAttendance(header + '\nAlex,Active,10/1/2026,1,0,1,1,0,Roseville,private\nHidden (<18),Active,10/1/2026,1,0,0,0,0,Roseville,private\nOld (Archived),Active,10/1/2026,1,0,0,0,0,Roseville,private\nAlex,UPDATE,1/1/2099,1,0,0,0,0,Roseville,private\nAlex,Active,2/30/2026,1,0,0,0,0,Roseville,private');
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].date, '2026-10-01');
  assert.equal(parsed[0].fng, true);
  assert.equal(JSON.stringify(parsed).includes('private'), false);
  assert.throws(() => lib.parseDataAttendance('Name,Date\nAlex,10/1/2026'), /missing PAX Name/);
});

test('Sites uses the named Active status, not the reference backend’s inverted Y interpretation', () => {
  assert.deepEqual(lib.parseDataSites('Name,City,Active,Active,Phone\nOne,Roseville,Y,Active,secret\nTwo,Rocklin,N,Retired,secret'), [
    { name: 'One', city: 'Roseville', active: true }, { name: 'Two', city: 'Rocklin', active: false },
  ]);
});

test('Posts and Qsource are separate; duplicate days affect post count but not attendance percentage or streak', () => {
  const d = data([row('Alex', '2026-10-01', { q: true }), row(' ALEX ', '2026-10-01', { site: 'Retired' }), row('Alex', '2026-10-03'), row('Ben', '2026-10-05'), row('Alex', '2026-10-06', { post: false, qs: true, qsq: true })]);
  const a = lib.summarizePax(d, filters({ search: 'alex' }))[0];
  assert.equal(a.name, 'Alex'); assert.equal(a.posts, 3); assert.equal(a.qs, 1);
  assert.equal(a.streak, 2); assert.equal(a.attendance, 2 / 3 * 100); assert.equal(a.qRatio, 1 / 3 * 100);
  const qs = lib.summarizePax(d, filters({ view: 'qsource' }));
  assert.equal(qs.length, 1); assert.equal(qs[0].posts, 1); assert.equal(qs[0].qs, 1);
  assert.equal(a.aos, 1); assert.equal(a.aoPercent, 50);
});

test('Date, search, AO, region and multiple flags intersect, while raw rows retain Post=0 and raw FNG flags', () => {
  const d = data([row('Alex', '2025-10-01', { q: true }), row('Alex', '2026-10-02', { q: true, fng: true }), row('Alex', '2026-10-03'), row('Ben', '2026-10-02', { q: true, fng: true }), row('Alex', '2026-10-02', { site: 'Retired', q: true, fng: true }), row('Alex', '2026-10-02', { post: false, qs: true })]);
  const found = lib.filterDataRows(d, filters({ period: 'custom', from: '2026-10-02', to: '2026-10-02', search: 'aLEX', site: 'Active', region: 'bedrock', flags: ['q', 'fng'] }));
  assert.equal(found.length, 1);
  assert.equal(lib.filterDataRows(d, filters({ view: 'raw', flags: ['qs'] }))[0].post, false);
  assert.equal(lib.filterDataRows(d, filters({ region: 'other', flags: ['fng'] }))[0].pax, 'Ben');
});

test('Kotter eligibility uses complete history and latest attendance, with exact thresholds and Bedrock eligibility', () => {
  const d = data([row('Alex', '2026-09-01', { q: true }), row('Alex', '2026-10-01'), row('Ben', '2026-09-01', { q: true }), row('No Q', '2026-09-01')]);
  d.people.push({ name: 'No Q', region: 'Bedrock', ehBy: null });
  assert.equal(lib.summarizePax(d, filters({ view: 'kotter', period: 'all' })).some(p => p.name === 'Alex'), false); // exactly 14
  assert.deepEqual(lib.summarizePax(d, filters({ view: 'qkotter', period: 'all' })).map(p => p.name), ['Alex']);
  d.asOf = '2026-10-16';
  const a = lib.summarizePax(d, filters({ view: 'kotter', period: 'custom', to: '2026-09-02' })).find(p => p.name === 'Alex');
  assert.equal(a.last, '2026-10-01'); assert.equal(a.days, 15); assert.equal(a.posts, 1);
});

test('All-time denominator starts at first post, selected periods include opportunities before that PAX joined', () => {
  const d = data([row('Ben', '2026-01-01'), row('Alex', '2026-10-01'), row('Ben', '2026-10-02')]);
  assert.equal(lib.summarizePax(d, filters({ period: 'all', search: 'Alex' }))[0].attendance, 50);
  assert.ok(Math.abs(lib.summarizePax(d, filters({ period: 'year', search: 'Alex' }))[0].attendance - 100 / 3) < 1e-10);
  assert.equal(lib.summarizePax(d, filters({ period: 'month', month: '10', search: 'Alex' }))[0].attendance, 50);
});

test('Shared workouts match date AND AO, exclude self, deduplicate companions, and support Q relationships and post ranges', () => {
  const d = data([row('Alex', '2026-10-01', { q: true }), row('Ben', '2026-10-01'), row('BEN', '2026-10-01'), row('Elsewhere', '2026-10-01', { site: 'Other' }), row('Alex', '2026-10-02'), row('Leader', '2026-10-02', { q: true })]);
  assert.deepEqual(lib.companions(d, 'Alex', 'with'), [{ name: 'Ben', count: 1 }, { name: 'Leader', count: 1 }]);
  assert.deepEqual(lib.companions(d, 'Alex', 'by'), [{ name: 'Leader', count: 1 }]);
  assert.deepEqual(lib.companions(d, 'Alex', 'led'), [{ name: 'Ben', count: 1 }]);
  assert.deepEqual(lib.companions(d, 'Alex', 'with', 1, 1), [{ name: 'Leader', count: 1 }]);
});

test('Share filter roundtrip validates unsafe input; exports quote cells and neutralize spreadsheet formulas', () => {
  const f = filters({ search: 'A & B', view: 'raw', period: 'custom', from: '2026-10-01', site: 'A/B', flags: ['q', 'post'] });
  assert.deepEqual(lib.readDataFilters(lib.dataFilterParams(f), '2026-10-15'), f);
  const safe = lib.readDataFilters(new URLSearchParams('view=evil&period=evil&month=99&from=2026-02-30&flags=post,secret'), '2026-10-15');
  assert.equal(safe.view, 'pax'); assert.equal(safe.month, '10'); assert.equal(safe.from, ''); assert.deepEqual(safe.flags, ['post']);
  const exported = lib.dataCSV(['PAX', 'Flag'], [['=SUM(1,2)', true], ['A"B', false]]);
  assert.ok(exported.includes('"\'=SUM(1,2)","1"')); assert.ok(exported.includes('"A""B","0"'));
});

test('Explorer endpoint is free and read-only and returns a retryable error without source details', async () => {
  const NextResponse = { json: (body, options) => ({ body, ...options }) };
  const good = loadTS('app/api/data/route.ts', { 'next/server': { NextResponse }, '../../../lib/dataExplorerSource': { loadExplorerData: async () => data([]) } });
  const result = await good.GET(); assert.deepEqual(result.body.rows, []); assert.match(result.headers['Cache-Control'], /max-age=60/);
  const bad = loadTS('app/api/data/route.ts', { 'next/server': { NextResponse }, '../../../lib/dataExplorerSource': { loadExplorerData: async () => { throw Error('private-source-details'); } } });
  const failure = await bad.GET(); assert.equal(failure.status, 503); assert.equal(failure.headers['Cache-Control'], 'no-store'); assert.equal(JSON.stringify(failure).includes('private-source-details'), false);
});

test('Public Roster projection excludes intake fields and protected attribution names', async () => {
  const roster = ',F3 Name,Date Joined,18> = DR,Region,EH\'er,Phone\n,Alex,10/1/2026,,Bedrock,Hidden (<18),555-secret\n,Hidden (<18),10/1/2026,,Bedrock,Alex,555-secret\n,Old (Archived),10/1/2026,,Bedrock,Alex,555-secret\n,Ben,10/1/2026,,Other,Alex,555-secret';
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, text: async () => roster });
  try {
    const sheet = loadTS('lib/sheet.ts', { './attendance-db': {}, './dataExplorer': lib });
    const people = await sheet.fetchDataRoster();
    assert.deepEqual(people, [{ name: 'Alex', region: 'Bedrock', ehBy: null }, { name: 'Ben', region: 'Other', ehBy: 'Alex' }]);
    assert.equal(JSON.stringify(people).includes('555-secret'), false);
  } finally { global.fetch = originalFetch; }
});

test('Flags do not move the all-time opportunity start; first-in-view still reflects the flags', () => {
  const d = data([row('Alex', '2026-01-01'), row('Ben', '2026-01-02'), row('Alex', '2026-01-03', { q: true })]);
  const alex = lib.summarizePax(d, filters({ period: 'all', flags: ['q'] }))[0];
  assert.equal(alex.first, '2026-01-03');
  assert.ok(Math.abs(alex.attendance - 100 / 3) < 1e-10);
});
