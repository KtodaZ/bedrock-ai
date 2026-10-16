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
const row = (pax, date, extra = {}) => ({ pax, date, site: 'Divento', post: true, q: false, qs: false, qsq: false, fng: false, city: '', ...extra });
const source = rows => ({ rows, people: [{ name: 'Alex', region: 'Bedrock', ehBy: null }], sites: [], asOf: '2026-10-15', loadedAt: '2026-10-15T00:00:00Z' });
const old = (count, name = 'Alex') => Array.from({ length: count }, (_, i) => row(name, milestones.addDataDays('2025-01-01', i)));

test('Every hundred advances after reaching it; 500s and 1000s receive distinct emphasis', () => {
  assert.deepEqual([0, 99, 100, 499, 500, 999, 1000].map(n => milestones.nextPostMilestone(n)), [100, 100, 200, 500, 600, 1000, 1100]);
  assert.equal(milestones.nextPostMilestone(330, 500), 500);
  assert.equal(milestones.nextPostMilestone(500, 500), 1000);
  assert.equal(milestones.nextPostMilestone(1000, 1000), 2000);
  assert.deepEqual([100, 500, 1000, 1500, 2000].map(milestones.milestoneTier), ['hundred', 'five-hundred', 'thousand', 'five-hundred', 'thousand']);
});

test('Forecast uses full recorded Post history and normalized names, not Qsource or protected/future rows', () => {
  const d = source([...old(95), row(' ALEX ', '2026-10-01'), row('Alex', '2026-10-04'), row('Alex', '2026-10-08'), row('Alex', '2026-10-14'), row('Alex', '2026-10-15', { post: false, qs: true }), row('Alex', '2026-10-16'), row('Hidden (<18)', '2026-10-14'), row('Old (Archived)', '2026-10-14')]);
  const { forecasts } = milestones.buildMilestones(d);
  assert.equal(forecasts.length, 1);
  const f = forecasts[0];
  assert.equal(f.name, 'Alex'); assert.equal(f.region, 'Bedrock'); assert.equal(f.posts, 99); assert.equal(f.target, 100); assert.equal(f.remaining, 1);
  assert.equal(f.recentPosts, 4); assert.equal(f.projected, '2026-11-07'); assert.equal(f.earliest, '2026-10-23'); assert.equal(f.latest, '2026-11-07');
  assert.ok(Math.abs(f.postsPerWeek - 4 / 90 * 7) < 1e-9);
});

test('Forecast withholds dates for sparse, stale, and short histories; exact minimum observation window is allowed', () => {
  const short = source([0, 1, 2, 12].map(i => row('Alex', milestones.addDataDays('2026-10-03', i))));
  assert.match(milestones.buildMilestones(short).forecasts[0].reason, /14 days/);
  const sparse = source([...old(96), row('Alex', '2026-07-17'), row('Alex', '2026-10-14')]); // first of these is outside inclusive 90-day window
  const f = milestones.buildMilestones(sparse).forecasts[0]; assert.equal(f.recentPosts, 1); assert.equal(f.projected, null); assert.match(f.reason, /Fewer than 4/);
  const stale = source([...old(95), ...['2026-08-01', '2026-08-02', '2026-09-01', '2026-09-15'].map(d => row('Alex', d))]);
  assert.match(milestones.buildMilestones(stale).forecasts[0].reason, /No posts in the last 30/);
  const fourteen = source([0, 2, 7, 13].map(i => row('Alex', milestones.addDataDays('2026-10-02', i))));
  assert.equal(milestones.buildMilestones(fourteen).forecasts[0].reason, null);
  assert.equal(milestones.buildMilestones(fourteen).forecasts[0].postsPerWeek, 2);
});

test('Reached dates use the exact hundredth post, including multiple posts in a day; larger filters include every matching milestone', () => {
  const d = source([...old(498), row('Alex', '2026-10-14'), row('Alex', '2026-10-14', { site: 'Spartan' })]);
  const all = milestones.buildMilestones(d);
  assert.equal(all.forecasts[0].posts, 500); assert.equal(all.forecasts[0].target, 600);
  assert.equal(all.reached[0].target, 500); assert.equal(all.reached[0].date, '2026-10-14'); assert.equal(all.reached[0].tier, 'five-hundred');
  assert.deepEqual(milestones.buildMilestones(d, 500).reached.map(r => r.target), [500]);
  assert.equal(milestones.buildMilestones(d, 1000).reached.length, 0);
});

test('Week/date helpers use UTC and anchor the forecast timeline to sheet dates', () => {
  assert.equal(milestones.addDataDays('2024-02-28', 1), '2024-02-29');
  assert.equal(milestones.mondayOf('2026-10-12'), '2026-10-12');
  assert.equal(milestones.mondayOf('2026-10-18'), '2026-10-12');
  const weeks = milestones.milestoneWeeks([{ projected: '2026-10-19', tier: 'hundred' }, { projected: '2026-10-19', tier: 'five-hundred' }, { projected: '2026-10-20', tier: 'thousand' }, { projected: '2027-01-01', tier: 'hundred' }], '2026-10-15', 30);
  const week = weeks.find(w => w.week === '2026-10-19');
  assert.deepEqual(week, { week: '2026-10-19', total: 3, hundreds: 1, fiveHundreds: 1, thousands: 1 });
  assert.equal(weeks.reduce((sum, w) => sum + w.total, 0), 3);
});

test('Attendance trends distinguish raw posts, distinct turnout, and workouts without counting Qsource or protected records', () => {
  const d = source([row('Alex', '2026-10-12'), row(' ALEX ', '2026-10-12'), row('Ben', '2026-10-12'), row('Alex', '2026-10-12', { site: 'Spartan' }), row('Alex', '2026-10-13', { post: false, qs: true }), row('Hidden (<18)', '2026-10-12'), row('Alex', '2026-10-16')]);
  const workouts = trends.attendanceWorkouts(d);
  assert.equal(workouts.length, 2); assert.equal(workouts[0].posts, 3); assert.equal(workouts[0].pax.length, 2);
  const summary = trends.summarizeAttendance(workouts, '2026-10-12', d.asOf);
  assert.deepEqual(summary, { posts: 4, pax: 2, workouts: 2, average: 1.5 });
  assert.deepEqual(trends.summarizeAttendance(workouts, '2026-10-12', d.asOf, ['Spartan']), { posts: 1, pax: 1, workouts: 1, average: 1 });
});

test('Weekly AO comparisons share Monday buckets, leave gaps for missing records, and clip the partial final week', () => {
  const workouts = trends.attendanceWorkouts(source([row('Alex', '2026-10-01'), row('Alex', '2026-10-12'), row('Ben', '2026-10-12', { site: 'Spartan' })]));
  const buckets = trends.attendanceBuckets(workouts, '2026-10-15', 3, 'Divento');
  assert.deepEqual(buckets.map(b => [b.start, b.end]), [['2026-09-28', '2026-10-04'], ['2026-10-05', '2026-10-11'], ['2026-10-12', '2026-10-15']]);
  assert.equal(trends.attendanceValue(buckets[1], 'average'), null); assert.equal(trends.attendanceValue(buckets[1], 'posts'), null);
  assert.equal(buckets[2].workouts, 1);
  const other = trends.attendanceBuckets(workouts, '2026-10-15', 3, 'Spartan');
  assert.deepEqual(other.map(b => b.start), buckets.map(b => b.start));
});

test('Turnout summary is weighted by actual workouts; heatmap links roundtrip dates and punctuation safely', () => {
  const workouts = trends.attendanceWorkouts(source([row('A', '2026-10-12'), row('B', '2026-10-12'), row('C', '2026-10-12'), row('D', '2026-10-12'), row('E', '2026-10-13', { site: 'Other' }), row('E', '2026-10-14', { site: 'Other' })]));
  assert.equal(trends.summarizeAttendance(workouts, '2026-10-12', '2026-10-15').average, 2);
  const url = new URL(trends.rawAttendanceURL('A & B/Other', '2026-10-12', '2026-10-15'), 'https://example.com');
  assert.equal(url.pathname, '/data'); assert.equal(url.searchParams.get('site'), 'A & B/Other'); assert.equal(url.searchParams.get('from'), '2026-10-12'); assert.equal(url.searchParams.get('to'), '2026-10-15'); assert.equal(url.searchParams.get('flags'), 'post');
});
