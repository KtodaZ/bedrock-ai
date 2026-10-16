const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, dependencies = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', code)(name => dependencies[name] || require(name), exports);
  return exports;
}
const dataLib = load('lib/dataExplorer.ts');
const milestones = load('lib/milestones.ts', { './dataExplorer': dataLib });
const community = load('lib/community.ts', { './dataExplorer': dataLib, './milestones': milestones });
const trends = load('lib/attendanceTrends.ts', { './dataExplorer': dataLib, './milestones': milestones, './community': community });
const day = (n) => milestones.addDataDays('2026-10-14', -n);
const row = (pax, date, extra = {}) => ({ pax, date, site: 'Divento', city: '', post: true, q: false, fng: false, qs: false, qsq: false, ...extra });
const data = (rows, people = []) => ({ rows, people, sites: [], asOf: '2026-10-14', loadedAt: '' });

test('FNG follow-through uses Bedrock Roster FNGs, distinct post dates, and the asOf clock', () => {
  const d = data([
    row('New Guy', '2026-03-03', { fng: true }), row('new guy', '2026-03-03'), row('New Guy', '2026-03-10'), row('New Guy', day(5)),
    row('New Guy', '2026-10-20'), // future row ignored
    row('Visitor', '2026-03-05', { fng: true }), // other region never counts
    row('Fresh', day(10), { fng: true }),
    row('Kid (<18)', '2026-03-05', { fng: true }),
  ], [
    { name: 'New Guy', region: 'Bedrock', ehBy: 'Sponsor' },
    { name: 'Visitor', region: 'Asgard', ehBy: null },
    { name: 'Fresh', region: 'bedrock', ehBy: null },
  ]);
  const cohorts = community.fngCohorts(d);
  assert.deepEqual(cohorts.map(c => [c.month, c.early]), [['2026-10', true], ['2026-03', false]]);
  const march = cohorts[1].fngs[0];
  assert.equal(march.name, 'New Guy'); assert.equal(march.posts, 3); assert.equal(march.active, true); assert.equal(march.ehBy, 'Sponsor');
  assert.deepEqual(community.fngTotals(cohorts.flatMap(c => c.fngs)), { count: 2, returned: 1, ten: 0, active: 2 });
});

test('Family tree follows Roster EH’er spellings, keeps unmatched EH’ers as roots, and survives loops', () => {
  const d = data([row('Child', day(3)), row('Root', day(3))], [
    { name: 'Root', region: 'Bedrock', ehBy: null },
    { name: 'Child', region: 'Bedrock', ehBy: ' root ' },
    { name: 'Grandchild', region: 'Bedrock', ehBy: 'Child' },
    { name: 'Other', region: 'Bedrock', ehBy: 'Milkman' },
    { name: 'A', region: 'Bedrock', ehBy: 'B' },
    { name: 'B', region: 'Bedrock', ehBy: 'A' },
  ]);
  const roots = community.familyTree(d);
  assert.deepEqual(roots.map(r => [r.name, r.size]), [['Root', 2], ['A', 1], ['Milkman', 1]]);
  assert.equal(roots[0].children[0].name, 'Child'); assert.equal(roots[0].children[0].posts, 1);
  assert.equal(roots[0].children[0].children[0].name, 'Grandchild');
  assert.equal(roots[2].posts, 0);
  assert.ok(community.treeMatches(roots[0], 'grand')); assert.ok(!community.treeMatches(roots[0], 'milk'));
});

test('First-Q candidates need 10+ posts, 2+ in 30 days, and no recorded Q; 2.0s excluded', () => {
  const many = (name, n, extra = {}) => Array.from({ length: n }, (_, i) => row(name, day(40 + i), extra));
  const d = data([
    ...many('Ready', 9), row('Ready', day(1), { site: 'Spartan' }), row('Ready', day(2), { site: 'Spartan' }),
    ...many('Has Q', 12), row('Has Q', day(1), { q: true }), row('Has Q', day(2)),
    ...many('Stale', 12),
    ...many('Kid 2.0', 12), row('Kid 2.0', day(1)), row('Kid 2.0', day(2)),
  ]);
  const ready = community.firstQCandidates(d);
  assert.deepEqual(ready.map(r => [r.name, r.posts, r.recent30]), [['Ready', 11, 2]]);
  assert.equal(ready[0].usualAO, 'Divento');
});

test('Regular Q ratio counts the 90 days ending asOf and requires 13+ posts', () => {
  const posts = (name, n, qs) => Array.from({ length: n }, (_, i) => row(name, day(i * 5), { q: i < qs }));
  const d = data([...posts('Leader', 13, 4), ...posts('Steady', 14, 1), ...posts('Light', 12, 6), row('Leader', day(200), { q: true })]);
  const r = community.regularQRatios(d);
  assert.deepEqual(r.map(x => [x.name, x.qs90, x.posts90]), [['Leader', 4, 13], ['Steady', 1, 14]]);
  assert.equal(r[0].lastQ, day(0));
});

test('AO growth compares equal windows and withholds a percent below 3 workouts', () => {
  const rows = [];
  for (let w = 0; w < 26; w++) {
    const date = milestones.addDataDays('2026-10-13', -7 * w); // Tuesdays
    const count = w < 13 ? 6 : 3;
    for (let i = 0; i < count; i++) rows.push(row('P' + i, date));
    if (w < 2) rows.push(row('Q' + w, date, { site: 'Newbie' }));
  }
  const workouts = trends.attendanceWorkouts(data(rows));
  const g = trends.aoGrowth(workouts, '2026-10-14', 13, ['Divento', 'Newbie', 'Empty']);
  assert.deepEqual(g.map(x => x.site), ['Divento', 'Newbie']);
  assert.equal(Math.round(g[0].change), 100); assert.equal(g[0].current, 6); assert.equal(g[0].previous, 3);
  assert.equal(g[1].change, null); assert.equal(g[1].previous, null);
  const weekdays = trends.weekdayTurnout(workouts, '2026-07-15', '2026-10-14');
  assert.equal(weekdays[1].day, 'Tue'); assert.equal(weekdays[1].workouts, 15); assert.equal(weekdays[0].average, null);
});

test('Region pulse compares the last 7 days with the 7 before and counts Bedrock FNGs once', () => {
  const d = data([
    row('A', day(1)), row('B', day(1)), row('A', day(3), { site: 'Spartan' }),
    row('A', day(8)), row('New', day(2), { fng: true }), row('New', day(9)),
  ], [{ name: 'New', region: 'Bedrock', ehBy: null }]);
  const { current, previous } = trends.regionPulse(d);
  assert.deepEqual([current.from, current.to], [day(6), day(0)]);
  assert.deepEqual([current.posts, current.pax, current.fngs], [4, 3, 1]);
  assert.deepEqual([previous.posts, previous.fngs], [2, 0]);
  assert.equal(current.topAO.site, 'Divento'); assert.equal(current.topAO.average, 1.5);
});

test('Weekly post counts bucket trailing 7-day windows ending asOf', () => {
  const d = data([row('A', day(0)), row('a', day(6)), row('A', day(7)), row('A', day(83)), row('A', day(84)), row('A', day(0), { site: 'Spartan' })]);
  const all = trends.weeklyPostCounts(d, 12).get('a');
  assert.equal(all.length, 12); assert.equal(all[11], 3); assert.equal(all[10], 1); assert.equal(all[0], 1);
  assert.equal(trends.weeklyPostCounts(d, 12, 'Spartan').get('a')[11], 1);
});
