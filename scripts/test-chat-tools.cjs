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
const eh = load('lib/ehChallenge.ts');
const ehProfile = load('lib/ehProfile.ts', { './ehChallenge': eh });
const tools = load('lib/chatTools.ts', { './dataExplorer': dataLib, './milestones': milestones, './attendanceTrends': trends, './aoProfile': ao, './community': community, './paxActivity': activity, './ehChallenge': eh, './ehProfile': ehProfile });

const day = (n) => milestones.addDataDays('2026-10-14', -n);
const row = (pax, date, extra = {}) => ({ pax, date, site: 'Divento', city: '', post: true, q: false, fng: false, qs: false, qsq: false, ...extra });
function context() {
  const rows = [
    row('Clove', day(1), { q: true }), row('Milk Man', day(1)), row('Bono', day(1)),
    row('Clove', day(3), { site: 'Pinnacle' }), row('Milk Man', day(3), { site: 'Pinnacle', q: true }),
    row('Clove', day(8)), row('Bono', day(8), { q: true }), row('New Guy', day(8), { fng: true }),
    row('Clove', '2025-10-09'), row('Bono', '2025-10-09'),
    row('Clove', day(40), { site: 'Spartan', q: true }), row('Gone', day(40), { site: 'Spartan' }),
    row('Kid (<18)', day(1)),
  ];
  const data = { rows, asOf: '2026-10-14', loadedAt: '', sites: [{ name: 'Divento', city: 'Roseville', active: true }],
    people: [
      { name: 'Clove', region: 'Bedrock', ehBy: null },
      { name: 'Milk Man', region: 'Bedrock', ehBy: 'Clove' },
      { name: 'New Guy', region: 'Bedrock', ehBy: 'Milk Man' },
      { name: 'Gone', region: 'Bedrock', ehBy: null },
      { name: 'Bono', region: 'Bedrock', ehBy: null },
    ] };
  return { data, workouts: trends.attendanceWorkouts(data), challenge: async () => { throw new Error('not used'); } };
}
const run = async (ctx, name, args) => {
  const r = await tools.runChatTool(ctx, name, args);
  return { ...JSON.parse(r.output), _link: r.link };
};

test('Tool definitions are strict and every property is required', () => {
  const names = tools.CHAT_TOOLS.map(t => t.name);
  assert.equal(new Set(names).size, names.length);
  for (const t of tools.CHAT_TOOLS) {
    assert.equal(t.strict, true);
    assert.deepEqual(t.parameters.required, Object.keys(t.parameters.properties));
    assert.equal(t.parameters.additionalProperties, false);
    assert.ok(tools.isChatTool(t.name));
  }
});

test('Names resolve by spacing, misspelling, and partial match; ambiguity returns choices', () => {
  const names = ['Milk Man', 'Mammogram', 'Clove', 'Double Flush', 'Double Down'];
  assert.deepEqual(tools.resolveName('milkman', names, 'PAX'), { name: 'Milk Man' });
  assert.equal(tools.resolveName('Mamogram', names, 'PAX').name, 'Mammogram');
  assert.equal(tools.resolveName('flush', names, 'PAX').name, 'Double Flush');
  assert.deepEqual(tools.resolveName('double', names, 'PAX').closest, ['Double Flush', 'Double Down']);
  assert.ok(tools.resolveName('Zebra', names, 'PAX').error);
  assert.equal(tools.resolveName('Davento', ['Divento', 'Spartan'], 'AO').name, 'Divento');
  assert.equal(tools.resolveName('great awakening', ['The Great Awakening'], 'AO').name, 'The Great Awakening');
});

test('PAX profile matches Data page counts, Roster links, and returns a profile link', async () => {
  const ctx = context();
  const p = await run(ctx, 'pax_profile', { name: 'clove', from: day(10), to: null });
  assert.equal(p.name, 'Clove');
  assert.equal(p.allTime.posts, 5); assert.equal(p.allTime.qs, 2);
  assert.equal(p.allTime.firstPost, '2025-10-09');
  assert.deepEqual(p.ehd, ['Milk Man']);
  assert.deepEqual(p.byAO.map(a => [a.ao, a.posts]), [['Divento', 3], ['Pinnacle', 1], ['Spartan', 1]]);
  assert.equal(p.range.posts, 3);
  assert.equal(p._link, '/data?period=all&pax=Clove');
  assert.match(JSON.stringify(p), /"link":"\/data\?period=all&pax=Clove"/);
  const kid = await run(ctx, 'pax_profile', { name: 'Kid', from: null, to: null });
  assert.ok(kid.error, 'under-18 names are never returned');
});

test('PAX profile keeps months older than 18 months and the all-time busiest month', async () => {
  const ctx = context();
  ctx.data.rows.push(...['2024-01-03', '2024-01-10', '2024-01-17', '2024-01-24'].map(d => row('Clove', d)));
  ctx.workouts = trends.attendanceWorkouts(ctx.data);
  const p = await run(ctx, 'pax_profile', { name: 'Clove', from: null, to: null });
  const jan = p.monthly.find(m => m[0] === '2024-01');
  assert.deepEqual(jan, ['2024-01', 4, 0]);
  assert.deepEqual(p.busiestMonth, { month: '2024-01', posts: 4 });
});

test('AO, year-over-year, rankings, and date range tools share the AO page numbers', async () => {
  const ctx = context();
  const a = await run(ctx, 'ao_profile', { ao: 'davento', weeks: '13', compare_with: 'pinnacle' });
  assert.equal(a.ao, 'Divento'); assert.equal(a.note, 'Showing results for Divento.');
  assert.equal(a.workouts, 2); assert.equal(a.posts, 6);
  assert.equal(a.compareWith.ao, 'Pinnacle');
  assert.equal(a._link, '/data/aos?ao=Divento&vs=Pinnacle');
  const region = await run(ctx, 'year_over_year', { ao: null, year: null });
  assert.equal(region.ao, 'Whole region');
  assert.equal(region.current.through, '2026-10-14'); assert.equal(region.previous.through, '2025-10-14');
  assert.equal(region.previous.posts, 2);
  const yoy = await run(ctx, 'year_over_year', { ao: 'Divento', year: null });
  assert.equal(yoy._link, '/data/aos?ao=Divento&chart=yoy');
  const ytd = await run(ctx, 'ao_rankings', { period: 'ytd' });
  assert.equal(ytd.period, 'year to date');
  assert.equal(ytd.aos.find(x => x.ao === 'Divento').workouts, 2);
  const ranks = await run(ctx, 'ao_rankings', { period: '13' });
  assert.deepEqual(ranks.aos.map(x => x.ao).sort(), ['Divento', 'Pinnacle', 'Spartan']);
  assert.equal(ranks.aos.find(x => x.ao === 'Pinnacle').type, 'run');
  const range = await run(ctx, 'period_summary', { from: day(10), to: '2026-12-31', ao: null });
  assert.equal(range.to, '2026-10-14');
  assert.equal(range.posts, 8);
  assert.deepEqual(range.topPosters[0], ['Clove', 3]);
  assert.deepEqual(range.bedrockFngs, [['New Guy', day(8), 'Divento']]);
  assert.ok((await run(ctx, 'period_summary', { from: 'May', to: day(1), ao: null })).error);
});

test('Lists, family tree, and milestones use Community and Milestones rules', async () => {
  const ctx = context();
  const kotter = await run(ctx, 'pax_list', { list: 'kotter', limit: null });
  assert.deepEqual(kotter.rows.map(r => r[0]), ['Gone']);
  assert.deepEqual(kotter.columns, ['name', 'allTimePosts', 'allTimeQs', 'lastPost', 'days'], 'Q counts answer "who never Q\'d" in one lookup');
  assert.equal(typeof kotter.rows[0][2], 'number');
  assert.equal(kotter._link, '/data?view=kotter&period=all');
  const mix = await run(ctx, 'pax_list', { list: 'run_site_qs', limit: 5 });
  assert.ok(Array.isArray(mix.runOnly));
  const tree = await run(ctx, 'family_tree', { name: 'new guy' });
  assert.deepEqual(tree.ehChainUpward, ['Milk Man', 'Clove']);
  const top = await run(ctx, 'family_tree', { name: null });
  assert.equal(top.largest[0].name, 'Clove'); assert.equal(top.largest[0].below, 2);
  const m = await run(ctx, 'milestones', { step: 'major', name: 'Clove' });
  assert.equal(m.upcoming[0][2], 100);
  const fng = await run(ctx, 'fng_follow_through', { year: null });
  assert.equal(fng.totals.count, 1);
});

test('EH Challenge tool reports standings for a PAX and returns his page', async () => {
  const ctx = context();
  const result = { period: 'challenge', start: '2026-10-15', asOf: '2026-10-20', end: '2026-12-31', scoringEnabled: true, goal: 50, regionFngs: 1,
    leaderboard: [{ name: 'Milk Man', total: 8, week: 8, fngs: 1, breakdown: { workouts: 8, referrals: 0, themes: 0 } }],
    fngs: [{ name: 'New Guy', ehBy: 'Milk Man', firstPost: '2026-10-16', posts: 2, points: 8, lastPost: '2026-10-18' }],
    unassignedPoints: 0, themes: [], bandText: '' };
  ctx.challenge = async (period) => ({ ...result, period });
  const r = await run(ctx, 'eh_challenge', { period: 'challenge', name: 'milkman' });
  assert.equal(r.rank, 1); assert.equal(r.standing.total, 8);
  assert.deepEqual(r.ehd, [['New Guy', '2026-10-16', 2, 8]]);
  assert.equal(r._link, '/eh-challenge/person/Milk%20Man?period=challenge');
  const board = await run(ctx, 'eh_challenge', { period: 'year', name: null });
  assert.equal(board.period, 'year'); assert.equal(board.leaderboard[0][0], 'Milk Man');
});

test('Unknown tools and failures return errors instead of throwing', async () => {
  const ctx = context();
  ctx.challenge = async () => { throw new Error('sheet down'); };
  assert.match((await tools.runChatTool(ctx, 'nope', {})).output, /Unknown tool/);
  assert.match((await tools.runChatTool(ctx, 'eh_challenge', { period: 'challenge', name: null })).output, /Lookup failed/);
  assert.match(tools.chatDataFacts(ctx.data, ctx.workouts), /through 2026-10-14/);
});
