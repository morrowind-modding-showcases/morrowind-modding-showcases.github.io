import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { dcComponentFrom } from './test-helpers.mjs';

const achievementsByYear = new Map();
for (const year of [2020, 2021, 2022, 2023, 2025, 2026]) {
  achievementsByYear.set(year, JSON.parse(await readFile(
    new URL(`../modathon/assets/data/${year}-achievements.json`, import.meta.url),
    'utf8',
  )).achievements);
}

test('places the profile achievement button in the Rarest Unlocks section', async () => {
  const { html } = await dcComponentFrom('../modathon/index.html');
  const toolbar = html.match(/<div class="detail-toolbar">([\s\S]*?)<!-- gamer card -->/)?.[1] || '';
  const rarestUnlocks = html.match(/<!-- rarest unlocks -->([\s\S]*?)<!-- categories -->/)?.[1] || '';
  assert.doesNotMatch(toolbar, /showModderAchievements/);
  assert.match(rarestUnlocks, /showModderAchievements/);
  assert.match(rarestUnlocks, /class="profile-link profile-achievements-button"/);
});

function database() {
  const alice = { id: 'alice', name: 'Alice', ach: [{}] };
  const bob = { id: 'bob', name: 'Bob Builder', ach: [{}] };
  return {
    alice,
    bob,
    value: {
      years: [2026],
      yearData: {
        2026: {
          achievements: [
            { id: 'alice-badge', name: 'Alice Badge', requirement: 'Alice requirement', unlockedBy: ['Old Alice'], unlockedCount: 1 },
            { id: 'bob-badge', name: 'Bob Badge', requirement: 'Bob requirement', unlockedBy: ['Bob Builder'], unlockedCount: 1 },
          ],
        },
      },
      byKey: new Map([['alice', alice], ['bob builder', bob]]),
      unlockerIdByName: new Map([['old alice', 'alice'], ['bob builder', 'bob']]),
      participantsByYear: { 2026: 2 },
    },
  };
}

test('filters achievements by canonical modder identity and typed dropdown text', async () => {
  const { Component } = await dcComponentFrom('../modathon/index.html');
  const component = new Component();
  const db = database();
  component.db = db.value;

  Object.assign(component.state, { aModderQ: 'Alice', aModderId: 'alice' });
  let values = component.achievementVals();
  assert.equal(values.achRows.map(row => row.name).join('|'), 'Alice Badge');

  Object.assign(component.state, { aModderQ: 'build', aModderId: null });
  values = component.achievementVals();
  assert.equal(values.achModderOptions.map(option => option.name).join('|'), 'Bob Builder');
  assert.equal(values.achRows.map(row => row.name).join('|'), 'Bob Badge');
});

test('profile achievement button resets other achievement filters before navigating', async () => {
  const { Component } = await dcComponentFrom('../modathon/index.html');
  const component = new Component();
  const { alice } = database();
  let destination = null;
  component.setState = (next, callback) => {
    Object.assign(component.state, next);
    callback?.();
  };
  component.nav = view => { destination = view; };
  Object.assign(component.state, { aq: 'badge', aYear: 2025, aRarity: 'gold', achExpanded: { x: true } });

  component.showAchievementsFor(alice);

  assert.equal(destination, 'achievements');
  assert.equal(component.state.aModderQ, 'Alice');
  assert.equal(component.state.aModderId, 'alice');
  assert.equal(component.state.aq, '');
  assert.equal(component.state.aYear, 'all');
  assert.equal(component.state.aRarity, 'all');
  assert.equal(Object.keys(component.state.achExpanded).length, 0);
});

test('achievement artwork is linked to valid WebP files', async () => {
  const expected = new Map([
    [2020, [
      'cluttermonkey',
      'meow',
      'fetcher',
      'chance-s-folly',
      'the-people-s-choice',
      'numbers-matter',
      'army-of-one',
      'master-of-madness',
      'panel-pleaser',
      'emperor-king-and-justice',
      'a-show-of-power',
      'lesh-make-a-deal',
    ]],
    [2021, ['oneness', 'cloudcleaver', 'cluttermonkey', 'a-warrior-s-legacy']],
    [2022, ['exterminator', 'meow', 'cluttermonkey']],
    [2023, ['cluttermonkey']],
  ]);

  for (const [year, ids] of expected) {
    const byId = new Map(
      achievementsByYear.get(year).map(achievement => [achievement.id, achievement]),
    );
    for (const id of ids) {
      const achievement = byId.get(id);
      assert.ok(achievement?.imageUrl, `${year}/${id} has no image`);
      const image = await readFile(
        new URL(`../modathon/${achievement.imageUrl}`, import.meta.url),
      );
      assert.equal(image.subarray(0, 4).toString('ascii'), 'RIFF');
      assert.equal(image.subarray(8, 12).toString('ascii'), 'WEBP');
    }
  }
});

test('achievement unlockers stay scoped to their source year', () => {
  const breathingWater2020 = achievementsByYear.get(2020)
    .find(achievement => achievement.id === 'breathing-water');
  const breathingWater2021 = achievementsByYear.get(2021)
    .find(achievement => achievement.id === 'breathing-water');

  assert.deepEqual(breathingWater2020.unlockedBy, []);
  assert.equal(breathingWater2020.unlockedCount, 0);
  assert.deepEqual(breathingWater2021.unlockedBy, ['Danae', 'XeroFoxx']);
  assert.equal(breathingWater2021.unlockedCount, 2);
});

test('locked hidden achievements do not reveal metadata or search terms', async () => {
  const { Component } = await dcComponentFrom('../modathon/index.html');
  const component = new Component();
  const pathfinder = achievementsByYear.get(2025)
    .find(achievement => achievement.id === 'pathfinder');
  component.db = {
    years: [2025],
    yearData: { 2025: { achievements: [pathfinder] } },
    byKey: new Map(),
    unlockerIdByName: new Map(),
    participantsByYear: { 2025: 1 },
  };

  let values = component.achievementVals();
  assert.equal(values.achRows.length, 1);
  assert.equal(values.achRows[0].name, 'Hidden Achievement');
  assert.equal(values.achRows[0].req, '');
  assert.equal(values.achRows[0].img, '');
  assert.equal(values.achRows[0].hasImage, false);

  component.state.aq = 'Pathfinder';
  values = component.achievementVals();
  assert.equal(values.achRows.length, 0);
});
