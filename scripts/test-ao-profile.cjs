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
const ao = load('lib/aoProfile.ts', { './dataExplorer': dataLib, './milestones': milestones, './attendanceTrends': trends, './community': community });
const activity = load('lib/paxActivity.ts');
const day = (n) => milestones.addDataDays('2026-10-14', -n);
const row = (pax, date, extra = {}) => ({ pax, date, site: 'Divento', city: '', post: true, q: false, fng: false, qs: false, qsq: false, ...extra });
const data = (rows, people = [], sites = []) => ({ rows, people, sites, asOf: '2026-10-14', loadedAt: '' });

test('AO detail ranks regulars, Qs, Q draw, and biggest workouts inside the period', () => {
  const d = data([
    // Three Divento workouts in the window: 3, 2, and 4 PAX.
    row('Alpha', day(1), { q: true }), row('Bravo', day(1)), row('Charlie', day(1)),
    row('Alpha', day(8), { q: true }), row('Bravo', day(8)),
    row('Bravo', day(15), { q: true }), row('Alpha', day(15)), row('Charlie', day(15)), row('Delta', day(15), { fng: true }),
    row('Kid (<18)', day(15)), // hidden from public counts
    row('Alpha', day(200), { q: true }), // before 13 weeks
    row('Echo', day(1), { site: 'Pinnacle', q: true }),
  ], [{ name: 'Delta', region: 'Bedrock', ehBy: 'Alpha' }], [{ name: 'Divento', city: 'Rocklin', active: true }]);
  const workouts = trends.attendanceWorkouts(d);
  const detail = ao.aoDetail(d, workouts, 'Divento', 13);
  assert.equal(detail.kind, 'beatdown'); assert.equal(detail.city, 'Rocklin');
  assert.equal(detail.workouts, 3); assert.equal(detail.posts, 9); assert.equal(detail.pax, 4);
  assert.equal(detail.average, 3);
  assert.deepEqual(detail.topPax.map(p => [p.name, p.posts, Math.round(p.share)]), [['Alpha', 3, 100], ['Bravo', 3, 100], ['Charlie', 2, 67], ['Delta', 1, 33]]);
  assert.deepEqual(detail.topQs.map(q => [q.name, q.qs]), [['Alpha', 2], ['Bravo', 1]]);
  // Alpha Q'd the 3- and 2-PAX workouts; Bravo has only one Q, below the draw minimum.
  assert.deepEqual(detail.draws.map(q => [q.name, q.average]), [['Alpha', 2.5]]);
  assert.deepEqual(detail.biggest[0], { date: day(15), pax: 4, qs: ['Bravo'] });
  assert.deepEqual(detail.fngs, [{ name: 'Delta', date: day(15) }]);
  assert.equal(ao.aoDetail(d, workouts, 'Divento', 'all').workouts, 4);
  assert.equal(ao.aoDetail(d, workouts, 'Nowhere', 13), null);
});

test('AO growth compares equal windows and needs three workouts in each', () => {
  const rows = [];
  for (let w = 0; w < 26; w++) {
    const pax = w < 13 ? 4 : 2; // recent 13 weeks average 4, prior 13 average 2
    for (let p = 0; p < pax; p++) rows.push(row('P' + p, day(w * 7)));
  }
  const d = data(rows);
  const detail = ao.aoDetail(d, trends.attendanceWorkouts(d), 'Divento', 13);
  assert.equal(detail.previous, 2); assert.equal(detail.change, 100);
  assert.equal(ao.aoDetail(d, trends.attendanceWorkouts(d), 'Divento', 'all').change, null);
});

test('AO list puts quiet AOs last and parses only known periods', () => {
  const d = data([row('A', day(2)), row('B', day(2)), row('A', day(9)), row('A', day(120), { site: 'Asylum' })]);
  const list = ao.aoSummaries(d, trends.attendanceWorkouts(d));
  assert.deepEqual(list.map(a => [a.site, a.quiet]), [['Divento', false], ['Asylum', true]]);
  assert.equal(list[0].average, 1.5);
  assert.deepEqual(['26', 'all', '7', null].map(ao.parseAoWeeks), [26, 'all', 13, 13]);
  assert.equal(ao.aoURL('Grizzly Bar'), '/data/aos?ao=Grizzly+Bar');
});

test('Run vs beatdown Q mix uses the listed AO types and the last 365 days', () => {
  assert.equal(community.aoKind('The Great Awakening'), 'beatdown');
  assert.equal(community.aoKind(' rattlesnake ridge '), 'run');
  assert.equal(community.aoKind('CSAUP'), null);
  const d = data([
    row('Runner', day(3), { site: 'Pinnacle', q: true }), row('Runner', day(10), { site: 'Trailhead', q: true }),
    row('Runner', day(400), { site: 'Spartan', q: true }), // old beatdown, outside window
    row('Mixed', day(3), { site: 'Rattlesnake Ridge', q: true }), row('Mixed', day(5), { site: 'Hilltop', q: true }), row('Mixed', day(6), { site: 'Hilltop', q: true }),
    row('Mixed', day(5), { site: 'Hilltop', q: true }), // duplicate row ignored
    row('Once', day(3), { site: 'Pinnacle', q: true }),
    row('Other', day(3), { site: 'CSAUP', q: true }), row('Other', day(4), { site: 'CSAUP', q: true }),
  ]);
  const { runOnly, mix } = community.qMix(d);
  assert.deepEqual(runOnly.map(m => [m.name, m.run, m.lastBeatdown]), [['Runner', 2, day(400)]]);
  assert.deepEqual(mix.map(m => [m.name, m.run, m.beatdown, Math.round(m.runShare)]), [['Mixed', 1, 2, 33]]);
});

test('Major milestones are 100, 500, then every 500', () => {
  assert.deepEqual([0, 99, 100, 499, 500, 999, 1000, 1499, 2000].map(n => milestones.nextPostMilestone(n, 'major')), [100, 100, 500, 500, 1000, 1000, 1500, 1500, 2500]);
  const rows = Array.from({ length: 1000 }, (_, i) => row('Iron', milestones.addDataDays('2023-01-01', i)));
  const reached = milestones.buildMilestones(data(rows), 'major').reached.map(r => r.target).sort((a, b) => a - b);
  assert.deepEqual(reached, [100, 500, 1000]);
  assert.equal(milestones.buildMilestones(data(rows), 100).reached.length, 10);
});

test('Monthly activity fills empty months from the first post through asOf', () => {
  const months = activity.monthlyActivity([
    row('A', '2026-07-02', { q: true }), row('A', '2026-07-09'), row('A', '2026-09-01'), row('A', '2026-08-01', { post: false, qs: true }), row('A', '2026-11-01'),
  ], '2026-10-14');
  assert.deepEqual(months, [
    { month: '2026-07', posts: 2, qs: 1 }, { month: '2026-08', posts: 0, qs: 0 }, { month: '2026-09', posts: 1, qs: 0 }, { month: '2026-10', posts: 0, qs: 0 },
  ]);
  assert.deepEqual(activity.monthlyActivity([], '2026-10-14'), []);
});
