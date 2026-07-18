import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const htmlUrl = new URL('../modathon/index.html', import.meta.url);

async function componentClass() {
  const html = await readFile(htmlUrl, 'utf8');
  const script = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'Modathon component script is missing');

  const context = { DCLogic: class {}, console, Date, Map, Set, URL };
  vm.runInNewContext(script + '\nthis.ModathonComponent = Component;', context);
  return context.ModathonComponent;
}

test('places the profile achievement button in the Rarest Unlocks section', async () => {
  const html = await readFile(htmlUrl, 'utf8');
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
  const Component = await componentClass();
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
  const Component = await componentClass();
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
