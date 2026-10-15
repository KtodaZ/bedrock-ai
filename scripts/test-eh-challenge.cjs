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

const scoring = loadTS('lib/ehChallenge.ts');
const profiles = loadTS('lib/ehProfile.ts', { './ehChallenge': scoring });
const post = (pax, date, fng = false) => ({ pax, date, fng, post: true, site: 'Test' });

test('Resurrection credits the recorded bring-back person, never guesses the original EH’er', () => {
  const rows = [post('Returnee', '2026-01-01'), post('Returnee', '2026-11-16'), post('Returnee', '2026-11-19')];
  const original = [{ pax: 'Returnee', ehBy: 'Original' }];
  assert.equal(scoring.computeChallenge(rows, original, 'challenge').leaderboard.length, 0);
  const record = { pax: 'Returnee', broughtBy: 'Rescuer', date: '2026-11-16' };
  const result = scoring.computeChallenge(rows, original, 'challenge', [record, record]);
  assert.deepEqual(result.leaderboard.map((p) => [p.name, p.total]), [['Rescuer', 5]]);
  for (const date of ['2026-11-17', '2026-11-19']) {
    assert.equal(scoring.computeChallenge(rows, original, 'challenge', [{ ...record, date }]).leaderboard.length, 0);
  }
});

test('Family Tree credits the first-time inviter once, separately from upstream referrals', () => {
  const rows = [post('First Inviter', '2026-10-16', true), post('Alex', '2026-11-09', true), post('Ben', '2026-11-09', true)];
  const entries = [{ pax: 'First Inviter', ehBy: 'Grand' }, { pax: 'Alex', ehBy: 'First Inviter' }, { pax: 'Ben', ehBy: 'First Inviter' }];
  const result = scoring.computeChallenge(rows, entries, 'challenge');
  assert.equal(result.leaderboard.find((p) => p.name === 'First Inviter').breakdown.themes, 5);
  assert.equal(result.leaderboard.find((p) => p.name === 'Grand').breakdown.themes, 0);
  assert.equal(result.leaderboard.find((p) => p.name === 'Grand').breakdown.referrals, 10);
  for (const person of result.leaderboard) assert.equal(Object.values(person.breakdown).reduce((a, b) => a + b, 0), person.total);
});

test('Profiles derive milestones and badges from the selected period’s recorded activity', () => {
  const rows = [post('Alex', '2026-01-01', true), post('Ben', '2026-01-02', true), ...[2, 3, 4, 5].map((day) => post('Alex', `2026-01-0${day}`))];
  const result = scoring.computeChallenge(rows, [{ pax: 'Alex', ehBy: 'First Inviter' }, { pax: 'Ben', ehBy: 'First Inviter' }], 'year');
  const profile = profiles.buildPersonProfile(result, '  FIRST   Inviter ');
  assert.equal(profile.recruits.length, 2);
  assert.equal(profile.returned, 1);
  assert.equal(profile.regulars, 1);
  assert.equal(profile.nextSteps[0].name, 'Ben');
  assert.ok(profile.badges.find((b) => b.name === 'Habit builder').earned);
  assert.equal(profile.badges.find((b) => b.name === 'Century club'), undefined);
  assert.equal(profiles.buildPersonProfile(result, 'Missing'), null);
  assert.deepEqual([0, 1, 2, 4, 5].map((n) => profiles.nextMilestone(n)), [
    { workout: 1, points: 5, remaining: 1 }, { workout: 2, points: 3, remaining: 1 }, { workout: 5, points: 5, remaining: 3 }, { workout: 5, points: 5, remaining: 1 }, { workout: 6, points: 1, remaining: 1 },
  ]);
  assert.ok(profiles.matchesPerson({ name: 'Alex', ehBy: 'First Inviter' }, 'FIRST   INVITER'));
  assert.equal(profiles.personURL('A/B & C', 'year'), '/eh-challenge/person/A%2FB%20%26%20C?period=year');
});


test('Fixed challenge boundaries exclude earlier FNGs, later FNGs, and workouts after Dec 31', () => {
  const rows = [
    post('Earlier', '2026-10-14', true), post('Earlier', '2026-10-15'),
    post('Opening', '2026-10-15', true), post('Opening', '2026-10-15'),
    post('Opening', '2026-10-16'), post('Closing', '2026-12-31', true),
    post('Opening', '2027-01-01'), post('Too late', '2027-01-01', true),
  ];
  const entries = ['Earlier', 'Opening', 'Closing', 'Too late'].map((pax) => ({ pax, ehBy: 'Inviter' }));
  const r = scoring.computeChallenge(rows, entries, 'challenge');
  assert.equal(r.start, '2026-10-15');
  assert.equal(r.end, '2026-12-31');
  assert.equal(r.asOf, '2026-12-31');
  assert.equal(r.sourceAsOf, '2027-01-01');
  assert.equal(r.goal, 50);
  assert.equal(r.regionFngs, 2);
  assert.deepEqual(r.fngs.map((f) => [f.name, f.posts, f.points]), [['Closing', 1, 5], ['Opening', 2, 8]]);
  assert.equal(r.leaderboard[0].breakdown.workouts, 13);
  assert.equal(r.scoringEnabled, true);
  assert.equal(scoring.computeChallenge([post('Earlier', '2026-10-14', true)], entries, 'challenge').regionFngs, 0);
});

test('Annual stats have a 100-FNG goal and never award historical competition points', () => {
  const rows = [post('Earlier', '2026-01-01', true), post('Alex', '2026-10-15', true), post('Ben', '2026-10-15', true)];
  const entries = [{ pax: 'Earlier', ehBy: 'Grand' }, { pax: 'Alex', ehBy: 'Grand' }, { pax: 'Ben', ehBy: 'Alex' }];
  const annual = scoring.computeChallenge(rows, entries, 'year');
  assert.equal(annual.goal, 100);
  assert.equal(annual.regionFngs, 3);
  assert.equal(annual.scoringEnabled, false);
  assert.ok(annual.leaderboard.every((e) => e.total === 0 && e.week === 0));
  assert.ok(annual.fngs.every((f) => f.points === 0));
  assert.match(annual.bandText, /100/);
  assert.match(annual.bandText, /stats, no challenge points/);
  assert.doesNotMatch(annual.bandText, /pts|This week|Coming up/);
  for (const period of ['month', 'all']) {
    const stats = scoring.computeChallenge(rows, entries, period);
    assert.equal(stats.goal, null);
    assert.equal(stats.scoringEnabled, false);
    assert.ok(stats.leaderboard.every((e) => e.total === 0));
  }
});

test('Double Down earns only normal first-post points and upstream referral remains +5', () => {
  const double = scoring.computeChallenge([post('Alex', '2026-10-15', true), post('Ben', '2026-10-15', true)], [
    { pax: 'Alex', ehBy: 'Inviter' }, { pax: 'Ben', ehBy: 'Inviter' },
  ], 'challenge');
  assert.equal(double.leaderboard[0].total, 10);
  assert.equal(double.leaderboard[0].breakdown.themes, 0);
  assert.equal(double.leaderboard[0].fngs, 2);
  const referral = scoring.computeChallenge([post('Alex', '2026-10-15', true), post('Ben', '2026-10-16', true)], [
    { pax: 'Alex', ehBy: 'Grand' }, { pax: 'Ben', ehBy: 'Alex' },
  ], 'challenge');
  assert.equal(referral.leaderboard.find((e) => e.name === 'Grand').breakdown.referrals, 5);
  assert.equal(referral.leaderboard.find((e) => e.name === 'Alex').breakdown.workouts, 5);
  assert.equal(profiles.buildPersonProfile(referral, 'Grand').badges.find((b) => b.name === 'Ripple effect').earned, true);
  assert.equal(profiles.personURL('A/B & C', 'challenge'), '/eh-challenge/person/A%2FB%20%26%20C?period=challenge');
  assert.match(scoring.buildBandText(referral, 'fngs'), /2026 EH Challenge.*Most FNGs/);
});

test('Period parsing preserves the year default and API supports explicit challenge requests', async () => {
  assert.equal(scoring.parsePeriod('challenge'), 'challenge');
  for (const value of [null, undefined, '', 'bad']) assert.equal(scoring.parsePeriod(value), 'year');
  const api = loadTS('app/api/eh-challenge/route.ts', {
    '@/lib/ehChallenge': scoring,
    '@/lib/sheet': {
      fetchAttendance: async () => [post('Earlier', '2026-01-01', true), post('Opening', '2026-10-15', true)],
      fetchEhAttributions: async () => [{ pax: 'Earlier', ehBy: 'Inviter' }, { pax: 'Opening', ehBy: 'Inviter' }],
      fetchResurrectionAttributions: async () => [],
    },
  });
  for (const [query, period, count, goal] of [['', 'year', 2, 100], ['?period=challenge', 'challenge', 1, 50]]) {
    const response = await api.GET({ nextUrl: new URL('https://example.test/api/eh-challenge' + query) });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual([body.period, body.regionFngs, body.goal], [period, count, goal]);
  }
});


test('Missing-today notice follows the Pacific calendar day, not UTC or the challenge end date', () => {
  const beforeMidnight = new Date('2026-10-16T06:59:00Z');
  const afterMidnight = new Date('2026-10-16T07:01:00Z');
  assert.equal(scoring.attendanceIsBehindToday('2026-10-14', beforeMidnight), true);
  assert.equal(scoring.attendanceIsBehindToday('2026-10-15', beforeMidnight), false);
  assert.equal(scoring.attendanceIsBehindToday('2026-10-15', afterMidnight), true);
  assert.equal(scoring.attendanceIsBehindToday('2026-10-16', afterMidnight), false);
});
