const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const MadnessScore = require('../assets/madness-score.js');

function fixture() {
  return {
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
  assert.equal(MadnessScore.achievementPoints({ rarity: 'Gold' }), 100);
  assert.equal(MadnessScore.achievementPoints({ rarity: 'Silver' }), 50);
  assert.equal(MadnessScore.achievementPoints({ rarity: 'Copper' }), 25);
  assert.equal(MadnessScore.placementPoints(1), 100);
  assert.equal(MadnessScore.placementPoints(2), 50);
  assert.equal(MadnessScore.placementPoints(3), 25);
  assert.equal(MadnessScore.placementRank('popular-choice'), 1);
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
});
