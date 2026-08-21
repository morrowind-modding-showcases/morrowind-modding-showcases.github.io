import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  loadResourcesDocument,
  renderResourcesDirectory,
  RESOURCE_TAGS,
  RESOURCE_TABS,
} from './build-resources-page.mjs';
import { loadPagesCmsConfig } from './pages-cms-lib.mjs';

const require = createRequire(import.meta.url);
const {
  createResourceUrl,
  readResourceState,
  resourceMatches,
} = require('../resources/tabs.js');

const resources = await loadResourcesDocument();
const template = await readFile(new URL('resources-page.template.html', import.meta.url), 'utf8');
const page = await readFile(new URL('../resources/index.html', import.meta.url), 'utf8');
const cmsConfig = await readFile(new URL('../.pages.yml', import.meta.url), 'utf8');
const buildContentSource = await readFile(new URL('build-content.mjs', import.meta.url), 'utf8');
const buildSiteSource = await readFile(new URL('build-site.mjs', import.meta.url), 'utf8');

test('Resources content is structured for add, edit, and delete operations', () => {
  const sections = RESOURCE_TABS.flatMap(tab => resources.tabs[tab.key].sections);
  const entries = sections.flatMap(section => section.entries);
  const linkedUrls = entries.flatMap(entry => [
    entry.url,
    ...(entry.relatedLinks || []).map(link => link.url),
  ]);

  assert.equal(resources.schemaVersion, 3);
  assert.deepEqual(Object.keys(resources.tabs), RESOURCE_TABS.map(tab => tab.key));
  assert.deepEqual(RESOURCE_TAGS, [
    'MWSE', 'OpenMW', 'Scripting', 'Dialogue', 'Quests', 'NPCs', 'Interiors',
    'Exteriors', '3D', '2D', 'Animation', 'VFX', 'Audio', 'UI', 'Compatibility',
    'Character Creation', 'Mod Cleaning',
  ]);

  // Counts and ordering are intentionally not asserted. Pages CMS must be able
  // to add, edit, delete, and reorder sections and entries without breaking CI.
  for (const { key } of RESOURCE_TABS) {
    assert.ok(
      Array.isArray(resources.tabs[key].sections),
      `${key} sections must be a list`,
    );
  }

  for (const section of sections) {
    assert.equal(typeof section.title, 'string');
    assert.ok(
      Array.isArray(section.entries),
      `${section.title} entries must be a list`,
    );
  }

  for (const entry of entries) {
    assert.equal(typeof entry.name, 'string');
    assert.match(entry.url, /^https?:\/\//i);
    assert.ok(
      entry.relatedLinks === undefined || Array.isArray(entry.relatedLinks),
    );
    assert.ok(entry.tags === undefined || Array.isArray(entry.tags));
    assert.equal(new Set(entry.tags || []).size, (entry.tags || []).length);
    for (const tag of entry.tags || []) assert.ok(RESOURCE_TAGS.includes(tag), tag);
  }

  assert.equal(new Set(linkedUrls).size, linkedUrls.length);
});

test('the committed Resources page is generated from its editable source', () => {
  assert.equal(
    page,
    template.replace('<!-- RESOURCES_DIRECTORY -->', renderResourcesDirectory(resources)),
  );
  assert.doesNotMatch(page, /RESOURCES_DIRECTORY/);
  assert.equal((page.match(/role="tab"/g) || []).length, 5);
  assert.equal((page.match(/role="tabpanel"/g) || []).length, 5);
  assert.equal((page.match(/data-resource-search/g) || []).length, 5);
  assert.equal((page.match(/data-filter-menu/g) || []).length, 5);
  assert.equal((page.match(/data-resource-filter>/g) || []).length, RESOURCE_TABS.length * RESOURCE_TAGS.length);
  assert.match(page, /<script src="tabs\.js" defer><\/script>/);
  assert.match(page, /id="resource-panel-repositories" role="tabpanel"[^>]*aria-labelledby="resource-tab-repositories"/);
  assert.match(page, /id="resource-panel-frameworks" role="tabpanel"[^>]*hidden/);
  assert.match(page, /data-resource-tags="MWSE\|OpenMW\|Scripting\|NPCs"/);
  assert.match(page, /class="resource-tag" data-overflow-tag hidden/);
  assert.match(page, /data-more-tags aria-expanded="false"/);
});

test('Resources URL state preserves the tab, search, and selected tags', () => {
  const tabs = RESOURCE_TABS.map(tab => tab.key);
  const state = readResourceState(
    'https://darkelfmodding.com/resources/?tab=frameworks&search=voice&tag=Audio&tag=OpenMW&tag=Unknown',
    tabs,
    RESOURCE_TAGS,
  );

  assert.deepEqual(state, {
    tab: 'frameworks',
    search: 'voice',
    tags: ['OpenMW', 'Audio'],
  });

  const url = createResourceUrl('https://darkelfmodding.com/resources/?campaign=fall#resource-panel-tools', state, RESOURCE_TAGS);
  assert.equal(url.searchParams.get('campaign'), 'fall');
  assert.equal(url.searchParams.get('tab'), 'frameworks');
  assert.equal(url.searchParams.get('search'), 'voice');
  assert.deepEqual(url.searchParams.getAll('tag'), ['OpenMW', 'Audio']);
  assert.equal(url.hash, '');

  assert.equal(resourceMatches('Kezyma voices dialogue', ['OpenMW', 'Audio'], state), true);
  assert.equal(resourceMatches('Kezyma voices dialogue', ['OpenMW'], state), false);
  assert.equal(resourceMatches('Different framework', ['OpenMW', 'Audio'], state), false);
});

test('legacy Resources hashes still select a tab when the URL has no tab state', () => {
  const state = readResourceState(
    'https://darkelfmodding.com/resources/#resource-panel-tools',
    RESOURCE_TABS.map(tab => tab.key),
    RESOURCE_TAGS,
  );
  assert.equal(state.tab, 'tools');
});

test('Pages CMS exposes five fixed Resource tabs with nested section and entry lists', () => {
  const collection = cmsConfig.match(
    /      - name: resources_directory[\s\S]*?(?=\r?\n  - name: wiki_group)/,
  )?.[0];

  assert.ok(collection, 'Resources collection must exist');
  assert.match(collection, /path: content\/resources\/resources\.json/);
  assert.match(collection, /name: tabs[\s\S]*?type: object/);
  for (const { key } of RESOURCE_TABS) {
    assert.match(collection, new RegExp(`name: ${key}[\\s\\S]*?label: Sections[\\s\\S]*?list:`));
  }
  assert.match(collection, /name: entries[\s\S]*?type: object[\s\S]*?list:/);
  assert.equal((collection.match(/label: Tags/g) || []).length, RESOURCE_TABS.length);
  assert.match(collection, /name: tags[\s\S]*?multiple: true[\s\S]*?- "MWSE"[\s\S]*?- "Mod Cleaning"/);
  assert.match(collection, /name: relatedLinks[\s\S]*?type: object[\s\S]*?list:/);
  assert.match(collection, /name: url[\s\S]*?pattern:[\s\S]*?regex: '\^https\?:\/\//);
});

test('Pages CMS URL patterns accept ordinary HTTP(S) URLs', async () => {
  const config = await loadPagesCmsConfig();
  const patterns = [];

  const collectPatterns = value => {
    if (!value || typeof value !== 'object') return;
    if (value.pattern?.regex?.includes('https?://') && !value.pattern.regex.includes('youtube')) {
      patterns.push(value.pattern.regex);
    }
    Object.values(value).forEach(collectPatterns);
  };
  collectPatterns(config);

  const nexusUrl = 'https://www.nexusmods.com/morrowind/mods/58854';
  assert.ok(patterns.length > 0, 'Pages CMS must define HTTP(S) URL patterns');
  for (const pattern of patterns) {
    assert.match(nexusUrl, new RegExp(pattern), pattern);
  }
});

test('content and site builds regenerate the Resources page', () => {
  assert.match(buildContentSource, /import \{ buildResourcesPage \} from '\.\/build-resources-page\.mjs';/);
  assert.match(buildContentSource, /buildResourcesPage\(\)/);
  assert.match(buildSiteSource, /import \{ buildResourcesPage \} from '\.\/build-resources-page\.mjs';/);
  assert.match(buildSiteSource, /await buildResourcesPage\(\);/);
});
