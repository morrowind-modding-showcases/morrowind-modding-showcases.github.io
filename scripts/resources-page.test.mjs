import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  loadResourcesDocument,
  renderResourcesDirectory,
  RESOURCE_TABS,
} from './build-resources-page.mjs';

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

  assert.equal(resources.schemaVersion, 2);
  assert.deepEqual(Object.keys(resources.tabs), RESOURCE_TABS.map(tab => tab.key));
  assert.equal(sections.length, 9);
  assert.equal(entries.length, 115);
  assert.equal(linkedUrls.length, 116);
  assert.equal(new Set(linkedUrls).size, linkedUrls.length);
  assert.equal(resources.tabs.repositories.sections[0].title, 'Asset Repositories');
  assert.equal(resources.tabs.frameworks.sections.at(-1).title, 'OpenMW Frameworks');
  assert.equal(resources.tabs.repositories.sections[0].entries[0].relatedLinks[0].label, 'Website');
});

test('the committed Resources page is generated from its editable source', () => {
  assert.equal(
    page,
    template.replace('<!-- RESOURCES_DIRECTORY -->', renderResourcesDirectory(resources)),
  );
  assert.doesNotMatch(page, /RESOURCES_DIRECTORY/);
  assert.equal((page.match(/role="tab"/g) || []).length, 5);
  assert.equal((page.match(/role="tabpanel"/g) || []).length, 5);
  assert.match(page, /<script src="tabs\.js" defer><\/script>/);
  assert.match(page, /id="resource-panel-repositories" role="tabpanel"[^>]*aria-labelledby="resource-tab-repositories"/);
  assert.match(page, /id="resource-panel-frameworks" role="tabpanel"[^>]*hidden/);
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
  assert.match(collection, /name: relatedLinks[\s\S]*?type: object[\s\S]*?list:/);
  assert.match(collection, /name: url[\s\S]*?pattern:[\s\S]*?regex: '\^https\?:\/\//);
});

test('content and site builds regenerate the Resources page', () => {
  assert.match(buildContentSource, /import \{ buildResourcesPage \} from '\.\/build-resources-page\.mjs';/);
  assert.match(buildContentSource, /buildResourcesPage\(\)/);
  assert.match(buildSiteSource, /import \{ buildResourcesPage \} from '\.\/build-resources-page\.mjs';/);
  assert.match(buildSiteSource, /await buildResourcesPage\(\);/);
});
