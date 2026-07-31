const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const MadnessScore = require('../assets/madness-score.js');
const scoreRules = require('../content/madness-score-rules.json');

function fixture() {
  return {
    rules: scoreRules,
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
    modjam: { count: 1, points: 10 },
    madness: { count: 2, points: 20 },
  });
  assert.deepEqual(alice.achievements, { count: 1, points: 40 });
  assert.deepEqual(alice.placements, {
    first: 1,
    second: 1,
    third: 1,
    count: 3,
    points: 175,
  });
  assert.deepEqual(alice.modderthlons, { count: 1, years: [2025], points: 100 });
  assert.equal(alice.total, 355);
  assert.equal(
    MadnessScore.summary(alice),
    '4 entries · 1 achievement · 3 placements · 1 Modderthlon',
  );
  assert.deepEqual(MadnessScore.summaryParts(alice), [
    '4 entries',
    '1 achievement',
    '3 placements',
    '1 Modderthlon',
  ]);
  assert.deepEqual(MadnessScore.summaryRows(alice), [
    '4 entries · 1 achievement',
    '3 placements · 1 Modderthlon',
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
  assert.equal(bob.total, 45);
  assert.equal(bob.modderthlons.count, 0);
});

test('achievement and placement weights retain the established medal scale', () => {
  assert.equal(MadnessScore.achievementPoints({ rarity: 'Gold' }, scoreRules), 100);
  assert.equal(MadnessScore.achievementPoints({ rarity: 'Silver' }, scoreRules), 50);
  assert.equal(MadnessScore.achievementPoints({ rarity: 'Copper' }, scoreRules), 25);
  assert.equal(MadnessScore.placementPoints(1, scoreRules), 100);
  assert.equal(MadnessScore.placementPoints(2, scoreRules), 50);
  assert.equal(MadnessScore.placementPoints(3, scoreRules), 25);
  assert.equal(MadnessScore.placementRank('popular-choice'), 1);
});

test('every score factor is read from the editable rules', () => {
  const customRules = structuredClone(scoreRules);
  customRules.entry = { modathon: 1, modjam: 2, madness: 3 };
  customRules.placement = { first: 11, second: 7, third: 5 };
  customRules.modderthlon = 13;
  customRules.achievement.hidden = 17;

  const input = fixture();
  input.rules = customRules;
  const scores = MadnessScore.buildScoreDocument(input);

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
