import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function componentFrom(relativePath) {
  const html = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  const script = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, relativePath + ' component script is missing');

  const context = { DCLogic: class {}, console, Date, Map, Set, URL };
  vm.runInNewContext(script + '\nthis.PageComponent = Component;', context);
  return { html, Component: context.PageComponent };
}

function makeStateful(Component) {
  const component = new Component();
  component.setState = (next, callback) => {
    const update = typeof next === 'function' ? next(component.state) : next;
    Object.assign(component.state, update);
    callback?.();
  };
  return component;
}

test('Modathon clear buttons restore defaults for mods, modders, and achievements', async () => {
  const { html, Component } = await componentFrom('../modathon/index.html');
  const component = makeStateful(Component);

  assert.equal((html.match(/aria-label="Clear filters"/g) || []).length, 3);
  assert.equal((html.match(/class="clear-filters-icon"/g) || []).length, 4);
  assert.doesNotMatch(html, />CLEAR(?: FILTERS)?<\/button>/);

  Object.assign(component.state, { modQ: 'house', modYear: 2025, modCategory: 'Landmasses', modSort: 'name', modLimit: 120 });
  component.clearModsFilters();
  assert.equal(component.state.modQ, '');
  assert.equal(component.state.modYear, 'all');
  assert.equal(component.state.modCategory, 'all');
  assert.equal(component.state.modSort, 'downloads');
  assert.equal(component.state.modLimit, 60);

  Object.assign(component.state, { q: 'alice', modderSort: 'name' });
  component.clearModderFilters();
  assert.equal(component.state.q, '');
  assert.equal(component.state.modderSort, 'achievements');

  Object.assign(component.state, {
    aq: 'badge', aYear: 2025, aRarity: 'gold', aModderQ: 'Alice', aModderId: 'alice', achExpanded: { badge: true },
  });
  component.clearAchievementFilters();
  assert.equal(component.state.aq, '');
  assert.equal(component.state.aYear, 'all');
  assert.equal(component.state.aRarity, 'all');
  assert.equal(component.state.aModderQ, '');
  assert.equal(component.state.aModderId, null);
  assert.equal(Object.keys(component.state.achExpanded).length, 0);
});

test('Madness clear buttons restore the mods and modders defaults', async () => {
  const modsPage = await componentFrom('../madness/mods.html');
  const mods = makeStateful(modsPage.Component);
  Object.assign(mods.state, { year: '2025', team: 'A', cat: 'Quests', q: 'search' });
  mods.renderVals().clearFilters();
  assert.equal(mods.state.year, 'all');
  assert.equal(mods.state.team, 'all');
  assert.equal(mods.state.cat, 'all');
  assert.equal(mods.state.q, '');
  assert.match(modsPage.html, /aria-label="Clear filters"/);
  assert.match(modsPage.html, /class="clear-filters-icon"/);

  const moddersPage = await componentFrom('../madness/modders.html');
  const modders = makeStateful(moddersPage.Component);
  Object.assign(modders.state, { q: 'alice', sort: 'name' });
  modders.renderVals().clearFilters();
  assert.equal(modders.state.q, '');
  assert.equal(modders.state.sort, 'veteran');
  assert.match(moddersPage.html, /aria-label="Clear filters"/);
  assert.match(moddersPage.html, /class="clear-filters-icon"/);
});

test('TES3 Mod Map clear button resets search, layer selection, and deep-link filters', async () => {
  const html = await readFile(new URL('../map/index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('../map/js/map.js', import.meta.url), 'utf8');

  assert.match(html, /id="clear-filters"/);
  assert.match(html, /aria-label="Clear filters"/);
  assert.match(html, /class="clear-filters-icon"/);
  assert.match(script, /searchInput\.value = ""/);
  assert.match(script, /filterMode = "all"/);
  assert.match(script, /value="all"\]'\)\.checked = true/);
  assert.match(script, /entry\.pinned = false/);
  assert.match(script, /setActiveMod\(null\)/);
  assert.match(script, /searchParams\.delete\("mod"\)/);
  assert.match(script, /searchParams\.delete\("location"\)/);
});
