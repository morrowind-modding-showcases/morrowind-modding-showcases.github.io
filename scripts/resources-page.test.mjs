import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  collectResourceTags,
  loadResourcesDocument,
  renderResourcesDirectory,
  RESOURCE_TAGS,
  RESOURCE_TABS,
  validateResourcesDocument,
} from './build-resources-page.mjs';
import { loadPagesCmsConfig } from './pages-cms-lib.mjs';

const require = createRequire(import.meta.url);
const {
  addResourceTagFilter,
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
const availableTags = collectResourceTags(resources);

test('Resources content is structured for add, edit, and delete operations', () => {
  const sections = RESOURCE_TABS.flatMap(({ key, usesSections = true }) => (
    usesSections ? resources.tabs[key].sections : []
  ));
  const entries = RESOURCE_TABS.flatMap(({ key, usesSections = true }) => (
    usesSections
      ? resources.tabs[key].sections.flatMap(section => section.entries)
      : resources.tabs[key].entries
  ));
  const linkedUrls = entries.flatMap(entry => [
    entry.url,
    ...(entry.relatedLinks || []).map(link => link.url),
  ]);

  assert.equal(resources.schemaVersion, 3);
  assert.deepEqual(Object.keys(resources.tabs), RESOURCE_TABS.map(tab => tab.key));
  assert.deepEqual(RESOURCE_TAGS, [
    'MWSE', 'OpenMW', 'Scripting', 'Dialogue', 'Quests', 'NPCs', 'Interiors',
    'Exteriors', '3D', '2D', 'Animation', 'VFX', 'Audio', 'UI', 'Compatibility',
    'Character Creation', 'Mod Cleaning', 'Website', 'Discord', 'YouTube',
    'Video', 'Written', 'Plugin',
  ]);

  // Counts and ordering are intentionally not asserted. Pages CMS must be able
  // to add, edit, delete, and reorder sections and entries without breaking CI.
  for (const { key, usesSections = true } of RESOURCE_TABS) {
    if (usesSections) {
      assert.ok(Array.isArray(resources.tabs[key].sections), `${key} sections must be a list`);
      assert.equal(resources.tabs[key].entries, undefined);
    } else {
      assert.ok(Array.isArray(resources.tabs[key].entries), `${key} entries must be a list`);
      assert.equal(resources.tabs[key].sections, undefined);
    }
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
    for (const tag of entry.tags || []) {
      assert.equal(typeof tag, 'string');
      assert.equal(tag, tag.trim());
      assert.ok(tag.length <= 40, tag);
    }
  }

  assert.equal(new Set(linkedUrls).size, linkedUrls.length);
});

test('custom Resource tags are valid and become public filter options', () => {
  const customResources = structuredClone(resources);
  customResources.tabs.community.entries[0].tags.push('AI Tools');

  assert.doesNotThrow(() => validateResourcesDocument(customResources));
  assert.ok(collectResourceTags(customResources).includes('AI Tools'));
  assert.match(renderResourcesDirectory(customResources), /value="AI Tools" data-resource-filter/);

  customResources.tabs.community.entries[0].tags.push('Invalid|Tag');
  assert.throws(
    () => validateResourcesDocument(customResources),
    /contains an unsupported character/,
  );
});

test('Community, Tutorial, and Framework types are represented only by tags', () => {
  for (const entry of resources.tabs.community.entries) {
    const typeTags = ['Website', 'Discord', 'YouTube'].filter(tag => entry.tags.includes(tag));
    assert.equal(typeTags.length, 1, `${entry.name} must have one Community type tag`);
  }
  for (const entry of resources.tabs.tutorials.entries) {
    const typeTags = ['Video', 'Written', 'Plugin'].filter(tag => entry.tags.includes(tag));
    assert.equal(typeTags.length, 1, `${entry.name} must have one Tutorial type tag`);
  }
  for (const entry of resources.tabs.frameworks.entries) {
    assert.ok(entry.tags.includes('MWSE') || entry.tags.includes('OpenMW'), `${entry.name} must have a framework engine tag`);
  }
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
  assert.equal((page.match(/data-resource-filter>/g) || []).length, RESOURCE_TABS.length * availableTags.length);
  assert.match(page, /<script src="tabs\.js" defer><\/script>/);
  assert.match(page, /id="resource-panel-repositories" role="tabpanel"[^>]*aria-labelledby="resource-tab-repositories"/);
  assert.match(page, /id="resource-panel-frameworks" role="tabpanel"[^>]*hidden/);
  assert.match(page, /data-resource-tags="MWSE\|OpenMW\|Scripting\|NPCs"/);
  assert.match(page, /class="resource-tag" type="button" data-filter-by-tag="MWSE" aria-pressed="false" aria-label="Filter by MWSE"/);
  assert.match(page, /aria-label="Filter by [^"]+" data-overflow-tag hidden/);
  assert.match(page, /data-more-tags aria-expanded="false"/);
});

test('Community, Tutorials, and Frameworks render without section dividers', () => {
  const panelMarkup = key => {
    const start = page.indexOf(`<section class="resource-tab-panel" id="resource-panel-${key}"`);
    const end = page.indexOf('</section>', start);
    assert.ok(start >= 0 && end > start, `${key} panel must exist`);
    return page.slice(start, end);
  };

  assert.doesNotMatch(panelMarkup('community'), /class="resource-section"/);
  assert.doesNotMatch(panelMarkup('tutorials'), /class="resource-section"/);
  assert.doesNotMatch(panelMarkup('frameworks'), /class="resource-section"/);
  assert.match(panelMarkup('repositories'), /class="resource-section"/);
  assert.match(panelMarkup('tools'), /class="resource-section"/);
});

test('the Resource tabs and filtering controls stay pinned while scrolling', () => {
  assert.match(template, /\.resource-tabs \{[\s\S]*?position: sticky;[\s\S]*?top: 0;[\s\S]*?z-index: 30;/);
  assert.match(template, /\.resource-controls \{[\s\S]*?position: sticky;[\s\S]*?top: 59px;[\s\S]*?z-index: 25;/);
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

test('clickable Resource tags add their tag to filter state', () => {
  const initialState = { tab: 'frameworks', search: '', tags: ['OpenMW'] };
  const nextState = addResourceTagFilter(initialState, 'Audio', RESOURCE_TAGS);

  assert.deepEqual(nextState, { tab: 'frameworks', search: '', tags: ['OpenMW', 'Audio'] });
  assert.deepEqual(addResourceTagFilter(nextState, 'Audio', RESOURCE_TAGS), nextState);
  assert.equal(addResourceTagFilter(nextState, 'Unknown', RESOURCE_TAGS), nextState);

  const url = createResourceUrl('https://darkelfmodding.com/resources/', nextState, RESOURCE_TAGS);
  assert.deepEqual(url.searchParams.getAll('tag'), ['OpenMW', 'Audio']);
});

test('legacy Resources hashes still select a tab when the URL has no tab state', () => {
  const state = readResourceState(
    'https://darkelfmodding.com/resources/#resource-panel-tools',
    RESOURCE_TABS.map(tab => tab.key),
    RESOURCE_TAGS,
  );
  assert.equal(state.tab, 'tools');
});

test('Pages CMS exposes sectioned and flat Resource tabs as configured', () => {
  const collection = cmsConfig.match(
    /      - name: resources_directory[\s\S]*?(?=\r?\n  - name: wiki_group)/,
  )?.[0];

  assert.ok(collection, 'Resources collection must exist');
  assert.match(collection, /path: content\/resources\/resources\.json/);
  assert.match(collection, /name: tabs[\s\S]*?type: object/);
  const nextMarkers = {
    repositories: 'community',
    community: 'tutorials',
    tutorials: 'tools',
    tools: 'frameworks',
  };
  const tabBlock = key => {
    const start = collection.indexOf(`              - name: ${key}`);
    const nextKey = nextMarkers[key];
    const end = nextKey
      ? collection.indexOf(`              - name: ${nextKey}`, start + 1)
      : collection.length;
    assert.ok(start >= 0 && end > start, `${key} CMS block must exist`);
    return collection.slice(start, end);
  };

  for (const { key, usesSections = true } of RESOURCE_TABS) {
    const block = tabBlock(key);
    if (usesSections) {
      assert.match(block, /label: Sections[\s\S]*?list:/);
    } else {
      assert.doesNotMatch(block, /label: Sections/);
      assert.match(block, /label: Entries[\s\S]*?list:/);
    }
  }
  assert.match(collection, /name: entries[\s\S]*?type: object[\s\S]*?list:/);
  assert.equal((collection.match(/label: Tags/g) || []).length, RESOURCE_TABS.length);
  assert.equal((collection.match(/name: tags\r?\n\s+label: Tags\r?\n\s+type: string\r?\n\s+list: true/g) || []).length, RESOURCE_TABS.length);
  assert.doesNotMatch(collection, /label: Tags\r?\n\s+type: select/);
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
