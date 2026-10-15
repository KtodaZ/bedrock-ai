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
  const rows = [post('Returnee', '2026-01-01'), post('Returnee', '2026-10-19'), post('Returnee', '2026-10-22')];
  const original = [{ pax: 'Returnee', ehBy: 'Original' }];
  assert.equal(scoring.computeChallenge(rows, original, 'year').leaderboard.length, 0);
  const record = { pax: 'Returnee', broughtBy: 'Rescuer', date: '2026-10-19' };
  const result = scoring.computeChallenge(rows, original, 'year', [record, record]);
  assert.deepEqual(result.leaderboard.map((p) => [p.name, p.total]), [['Rescuer', 5]]);
  for (const date of ['2026-10-20', '2026-10-22']) {
    assert.equal(scoring.computeChallenge(rows, original, 'year', [{ ...record, date }]).leaderboard.length, 0);
  }
});

test('Family Tree credits the first-time inviter once, separately from upstream referrals', () => {
  const rows = [post('First Inviter', '2026-10-01', true), post('Alex', '2026-10-26', true), post('Ben', '2026-10-26', true)];
  const entries = [{ pax: 'First Inviter', ehBy: 'Grand' }, { pax: 'Alex', ehBy: 'First Inviter' }, { pax: 'Ben', ehBy: 'First Inviter' }];
  const result = scoring.computeChallenge(rows, entries, 'year');
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
  assert.ok(!profile.badges.find((b) => b.name === 'Century club').earned);
  assert.equal(profiles.buildPersonProfile(result, 'Missing'), null);
  assert.deepEqual([0, 1, 2, 4, 5].map((n) => profiles.nextMilestone(n)), [
    { workout: 1, points: 5, remaining: 1 }, { workout: 2, points: 3, remaining: 1 }, { workout: 5, points: 5, remaining: 3 }, { workout: 5, points: 5, remaining: 1 }, { workout: 6, points: 1, remaining: 1 },
  ]);
  assert.ok(profiles.matchesPerson({ name: 'Alex', ehBy: 'First Inviter' }, 'FIRST   INVITER'));
  assert.equal(profiles.personURL('A/B & C', 'year'), '/eh-challenge/person/A%2FB%20%26%20C?period=year');
});
