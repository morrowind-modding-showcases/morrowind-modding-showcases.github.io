const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const MadnessScore = require('../assets/madness-score.js');
const scoreRules = require('../content/madness-score-rules.json');

const testRules = {
  entry: { modathon: 10, modjam: 100, madness: 500 },
  placement: {
    modathon: { first: 0, second: 0, third: 0 },
    modjam: { first: 100, second: 50, third: 25 },
    madness: { first: 100, second: 50, third: 25 },
  },
  modderthlon: 100,
  achievement: {
    gold: 100,
    silver: 50,
    bronze: 25,
    hidden: 40,
    challenge: 30,
    category: 20,
    metrics: 10,
    other: 15,
  },
};

function fixture(rules = testRules) {
  return {
    rules,
    registry: {
      modders: [
        { id: 'alice', name: 'Alice', aliases: ['Alice_old'] },
        { id: 'bob', name: 'Bob' },
      ],
    },
    modathonMods: {
      mods: {
        2025: [
          { name: 'May Mod', authors: [{ name: 'Alice_old', contributed: true }] },
        ],
      },
    },
    modathonEvents: {
      events: [{
        year: 2025,
        awards: [{ award: 'Overall Winner', mods: [{ attribution: ['Alice'] }] }],
      }],
    },
    modjamEvents: {
      events: [{ id: 'summer-2025', year: 2025 }],
    },
    modjamMods: {
      events: [{
        id: 'summer-2025',
        mods: [{
          id: 'jam-1',
          authors: [{ id: 'alice' }, { id: 'alice' }],
          placement: 'runner-up',
          awards: ['Best Guar'],
        }],
      }],
    },
    madnessTeams: {
      years: [{
        year: 2025,
        teams: [{
          place: '3rd Place',
          members: [{ id: 'alice' }, { id: 'bob' }],
          mods: [{ name: 'One' }, { name: 'Two' }],
        }],
      }],
    },
    achievementDocuments: [{
      event: { year: 2025 },
      achievements: [{
        name: 'Hidden Thing',
        rarity: 'Hidden',
        unlockedBy: ['Alice_old'],
      }],
    }],
  };
}

test('Madness Scores include all event entries, placements, achievements, and Modderthlons', () => {
  const scores = MadnessScore.buildScoreDocument(fixture());
  const alice = scores.modders.alice;

  assert.deepEqual(alice.entries, {
    modathon: { count: 1, points: 10 },
    modjam: { count: 1, points: 100 },
    madness: { count: 2, points: 1000 },
  });
  assert.deepEqual(alice.achievements, { count: 1, points: 40 });
  assert.deepEqual(alice.placements, {
    first: 0,
    second: 1,
    third: 1,
    count: 2,
    points: 75,
  });
  assert.deepEqual(alice.modderthlons, { count: 1, years: [2025], points: 100 });
  assert.equal(alice.total, 1325);
  assert.equal(
    MadnessScore.summary(alice),
    '4 entries · 1 achievement · 2 placements · 1 Modderthlon',
  );
  assert.deepEqual(MadnessScore.summaryParts(alice), [
    '4 entries',
    '1 achievement',
    '2 placements',
    '1 Modderthlon',
  ]);
  assert.deepEqual(MadnessScore.summaryRows(alice), [
    '4 entries · 1 achievement',
    '2 placements · 1 Modderthlon',
  ]);
});

test('judge awards remain recognitions and do not add Madness Score points', () => {
  const withoutAwards = fixture();
  withoutAwards.modjamMods.events[0].mods[0].awards = [];
  assert.equal(
    MadnessScore.buildScoreDocument(fixture()).modders.alice.total,
    MadnessScore.buildScoreDocument(withoutAwards).modders.alice.total,
  );
});

test('Madness team placement is scored once while every team mod earns entry points', () => {
  const scores = MadnessScore.buildScoreDocument(fixture());
  const bob = scores.modders.bob;

  assert.equal(bob.entries.madness.count, 2);
  assert.equal(bob.placements.third, 1);
  assert.equal(bob.total, 1025);
  assert.equal(bob.modderthlons.count, 0);
});

test('achievement and event-specific placement weights use the configured scale', () => {
  assert.equal(
    MadnessScore.achievementPoints({ rarity: 'Gold' }, scoreRules),
    scoreRules.achievement.gold,
  );
  assert.equal(
    MadnessScore.achievementPoints({ rarity: 'Silver' }, scoreRules),
    scoreRules.achievement.silver,
  );
  assert.equal(
    MadnessScore.achievementPoints({ rarity: 'Copper' }, scoreRules),
    scoreRules.achievement.bronze,
  );
  assert.equal(
    MadnessScore.placementPoints('modathon', 1, scoreRules),
    scoreRules.placement.modathon.first,
  );
  assert.equal(
    MadnessScore.placementPoints('modjam', 1, scoreRules),
    scoreRules.placement.modjam.first,
  );
  assert.equal(
    MadnessScore.placementPoints('modjam', 2, scoreRules),
    scoreRules.placement.modjam.second,
  );
  assert.equal(
    MadnessScore.placementPoints('madness', 3, scoreRules),
    scoreRules.placement.madness.third,
  );
  assert.equal(MadnessScore.placementRank('popular-choice'), 1);
});

test('editable production rules are accepted without assuming their point values', () => {
  const scores = MadnessScore.buildScoreDocument({
    rules: scoreRules,
    registry: { modders: [] },
  });

  assert.deepEqual(scores.rules, scoreRules);
});

test('every score factor is read from the editable rules', () => {
  const customRules = structuredClone(testRules);
  customRules.entry = { modathon: 1, modjam: 2, madness: 3 };
  customRules.placement = {
    modathon: { first: 11, second: 0, third: 0 },
    modjam: { first: 0, second: 7, third: 0 },
    madness: { first: 0, second: 0, third: 5 },
  };
  customRules.modderthlon = 13;
  customRules.achievement.hidden = 17;

  const scores = MadnessScore.buildScoreDocument(fixture(customRules));

  assert.equal(scores.modders.alice.total, 62);
  assert.deepEqual(scores.rules, customRules);
});

test('all three profile sites load and display the shared Madness Score', () => {
  const modathon = fs.readFileSync('modathon/index.html', 'utf8');
  const modjamIndex = fs.readFileSync('modjam/index.html', 'utf8');
  const modjamApp = fs.readFileSync('modjam/app.js', 'utf8');
  const madnessProfile = fs.readFileSync('madness/modder.html', 'utf8');

  for (const source of [modathon, modjamIndex, madnessProfile]) {
    assert.match(source, /assets\/madness-score\.js/);
  }
  for (const source of [modathon, modjamApp, madnessProfile]) {
    assert.match(source, /assets\/data\/madness-scores\.json/);
    assert.match(source, /MADNESS SCORE|Madness Score/);
  }
  assert.match(modathon, /class="score-caption-line"/);
  assert.match(modathon, /MmsMadnessScore\.summaryRows/);
});
