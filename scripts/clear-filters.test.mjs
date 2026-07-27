import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { dcComponentFrom, makeStateful } from './test-helpers.mjs';

test('Modathon clear buttons restore defaults for mods, modders, and achievements', async () => {
  const { html, Component } = await dcComponentFrom('../modathon/index.html');
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
  const modsPage = await dcComponentFrom('../madness/mods.html');
  const madnessStyle = await readFile(new URL('../madness/style.css', import.meta.url), 'utf8');
  const mods = makeStateful(modsPage.Component);
  const [modsArchive, eventArchive] = await Promise.all([
    readFile(new URL('../madness/data/madness-mods.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../madness/data/madness-event.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  mods.state.data = modsArchive.years;
  mods.state.events = eventArchive.events;
  const groups = mods.renderVals().groups;
  assert.deepEqual(Array.from(groups, group => group.year), [2025, 2024, 2023, 2022, 2020, 2019, 2018, 2017, 2016]);
  assert.deepEqual(
    Array.from(groups, group => [group.year, group.mods.filter(mod => mod.showWeekDivider).length]),
    [[2025, 1], [2024, 1], [2023, 1], [2022, 1], [2020, 1], [2019, 2], [2018, 2], [2017, 4], [2016, 4]],
  );
  assert.deepEqual(
    Array.from(groups.find(group => group.year === 2019).mods.filter(mod => mod.showWeekDivider), mod => mod.weekLabel),
    ['WEEKS 1–2', 'WEEKS 3–4'],
  );
  assert.deepEqual(
    Array.from(groups.find(group => group.year === 2017).mods.filter(mod => mod.showWeekDivider), mod => mod.weekLabel),
    ['WEEKS 1–2', 'WEEKS 3–4', 'WEEKS 5–6', 'WEEKS 7–8'],
  );
  const themedSeason = makeStateful(modsPage.Component);
  themedSeason.state.events = [{
    year: 2030,
    season: 14,
    themes: [
      { id: 'single-week', name: 'Single Week', weekStart: 2, weekEnd: 2 },
      { id: 'multi-week', name: 'Multi Week', weekStart: 3, weekEnd: 4 },
    ],
  }];
  themedSeason.state.data = [{
    year: 2030,
    mods: [
      { name: 'Quest Example', category: 'Quests', themeId: 'single-week' },
      { name: 'Dungeon Example', category: 'Dungeon', themeId: 'single-week' },
      { name: 'Unthemed Example', category: 'Items' },
      { name: 'Another Quest', category: 'Quests', themeId: 'multi-week' },
    ],
  }];
  assert.deepEqual(
    Array.from(themedSeason.renderVals().groups[0].mods, mod => [
      mod.category,
      mod.themeName,
      mod.weekLabel,
      mod.showWeekDivider,
    ]),
    [
      ['Quests', 'Single Week', 'WEEK 2', true],
      ['Dungeon', 'Single Week', 'WEEK 2', false],
      ['Items', '', '', false],
      ['Quests', 'Multi Week', 'WEEKS 3–4', true],
    ],
  );
  assert.deepEqual(
    Array.from(themedSeason.renderVals().catOpts),
    ['Dungeon', 'Items', 'Quests'],
  );
  themedSeason.state.cat = 'Quests';
  assert.deepEqual(
    Array.from(themedSeason.renderVals().groups[0].mods, mod => mod.name),
    ['Quest Example', 'Another Quest'],
    'standard category filtering must not depend on theme values',
  );

  mods.state.cat = 'Items';
  assert.equal(mods.renderVals().groups.find(group => group.year === 2016).mods[0].weekLabel, 'WEEK 2');
  assert.equal(
    mods.renderVals().groups.find(group => group.year === 2016).mods.every(mod => mod.category === 'Items'),
    true,
  );
  assert.match(madnessStyle, /\.mm-week-divider > span\s*\{/);
  assert.doesNotMatch(madnessStyle, /\.mm-week-divider span\s*\{/);
  assert.doesNotMatch(modsPage.html, /categoryWeekYears|groupsModsByCategoryWeek|previousCategory/);

  Object.assign(mods.state, { year: '2025', team: 'A', cat: 'Quests', q: 'search' });
  mods.renderVals().clearFilters();
  assert.equal(mods.state.year, 'all');
  assert.equal(mods.state.team, 'all');
  assert.equal(mods.state.cat, 'all');
  assert.equal(mods.state.q, '');
  assert.match(modsPage.html, /aria-label="Clear filters"/);
  assert.match(modsPage.html, /class="clear-filters-icon"/);

  const moddersPage = await dcComponentFrom('../madness/modders.html');
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
