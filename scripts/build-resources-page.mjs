import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { REPO_ROOT } from './wiki-content-lib.mjs';

export const RESOURCES_DATA_PATH = path.join(REPO_ROOT, 'content', 'resources', 'resources.json');
export const RESOURCES_TEMPLATE_PATH = path.join(REPO_ROOT, 'scripts', 'resources-page.template.html');
export const RESOURCES_OUTPUT_PATH = path.join(REPO_ROOT, 'resources', 'index.html');

const RESOURCES_DIRECTORY_MARKER = '<!-- RESOURCES_DIRECTORY -->';

export const RESOURCE_TABS = Object.freeze([
  { key: 'repositories', label: 'Repositories' },
  { key: 'community', label: 'Community', usesSections: false },
  { key: 'tutorials', label: 'Tutorials', usesSections: false },
  { key: 'tools', label: 'Tools & Utilities' },
  { key: 'frameworks', label: 'Frameworks', usesSections: false },
]);

export const RESOURCE_TAGS = Object.freeze([
  'MWSE',
  'OpenMW',
  'Scripting',
  'Dialogue',
  'Quests',
  'NPCs',
  'Interiors',
  'Exteriors',
  '3D',
  '2D',
  'Animation',
  'VFX',
  'Audio',
  'UI',
  'Compatibility',
  'Character Creation',
  'Mod Cleaning',
  'Website',
  'Discord',
  'YouTube',
  'Video',
  'Written',
  'Plugin',
]);

function fail(message) {
  throw new Error(`Resources content: ${message}`);
}

function requireString(value, context, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (!required) return '';
    fail(`${context} is required`);
  }
  if (typeof value !== 'string') fail(`${context} must be a string`);
  return value.trim();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function validateUrl(value, context) {
  const url = requireString(value, context);
  if (!/^https?:\/\/[^\s]+$/i.test(url)) {
    fail(`${context} must be a complete HTTP(S) URL`);
  }
  return url;
}

function validateResourceEntry(entry, entryContext) {
  requireString(entry?.name, `${entryContext}.name`);
  validateUrl(entry?.url, `${entryContext}.url`);
  requireString(entry?.description, `${entryContext}.description`, { required: false });
  if (entry.tags !== undefined) {
    if (!Array.isArray(entry.tags)) fail(`${entryContext}.tags must be a list`);
    const duplicateTags = entry.tags.filter((tag, tagIndex) => entry.tags.indexOf(tag) !== tagIndex);
    if (duplicateTags.length > 0) fail(`${entryContext}.tags contains duplicate tags: ${duplicateTags.join(', ')}`);
    entry.tags.forEach((tag, tagIndex) => {
      const normalizedTag = requireString(tag, `${entryContext}.tags[${tagIndex}]`);
      if (!RESOURCE_TAGS.includes(normalizedTag)) {
        fail(`${entryContext}.tags[${tagIndex}] must be one of: ${RESOURCE_TAGS.join(', ')}`);
      }
    });
  }
  if (entry.relatedLinks !== undefined) {
    if (!Array.isArray(entry.relatedLinks)) fail(`${entryContext}.relatedLinks must be a list`);
    entry.relatedLinks.forEach((link, linkIndex) => {
      const linkContext = `${entryContext}.relatedLinks[${linkIndex}]`;
      requireString(link?.label, `${linkContext}.label`);
      validateUrl(link?.url, `${linkContext}.url`);
    });
  }
}

export function validateResourcesDocument(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    fail('the document must be an object');
  }
  if (document.schemaVersion !== 3) fail('schemaVersion must be 3');
  if (!document.tabs || typeof document.tabs !== 'object' || Array.isArray(document.tabs)) {
    fail('tabs must be an object');
  }

  const expectedTabKeys = RESOURCE_TABS.map(tab => tab.key);
  const authoredTabKeys = Object.keys(document.tabs);
  const unexpectedTabKeys = authoredTabKeys.filter(key => !expectedTabKeys.includes(key));
  if (unexpectedTabKeys.length > 0) {
    fail(`tabs contains unsupported tab${unexpectedTabKeys.length === 1 ? '' : 's'}: ${unexpectedTabKeys.join(', ')}`);
  }

  const sectionTitles = new Set();
  RESOURCE_TABS.forEach(({ key, usesSections = true }) => {
    const tab = document.tabs[key];
    if (!tab || typeof tab !== 'object' || Array.isArray(tab)) {
      fail(`tabs.${key} must be an object`);
    }

    if (!usesSections) {
      if (tab.sections !== undefined) fail(`tabs.${key}.sections is not supported; use tabs.${key}.entries`);
      if (!Array.isArray(tab.entries)) fail(`tabs.${key}.entries must be a list`);
      tab.entries.forEach((entry, entryIndex) => {
        validateResourceEntry(entry, `tabs.${key}.entries[${entryIndex}]`);
      });
      return;
    }

    if (!Array.isArray(tab.sections)) fail(`tabs.${key}.sections must be a list`);
    tab.sections.forEach((section, sectionIndex) => {
      const sectionContext = `tabs.${key}.sections[${sectionIndex}]`;
      const title = requireString(section?.title, `${sectionContext}.title`);
      if (sectionTitles.has(title.toLowerCase())) fail(`duplicate section title "${title}"`);
      sectionTitles.add(title.toLowerCase());
      if (!Array.isArray(section.entries)) fail(`${sectionContext}.entries must be a list`);

      section.entries.forEach((entry, entryIndex) => {
        validateResourceEntry(entry, `${sectionContext}.entries[${entryIndex}]`);
      });
    });
  });
  return document;
}

export async function loadResourcesDocument() {
  const document = JSON.parse(await readFile(RESOURCES_DATA_PATH, 'utf8'));
  return validateResourcesDocument(document);
}

function renderRelatedLinks(relatedLinks = []) {
  if (!relatedLinks.length) return '';
  return relatedLinks.map(link => (
    ` <span class="related-link">(<a target="_blank" rel="noopener" href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a>)</span>`
  )).join('');
}

function renderResourceTags(tags = []) {
  if (!tags.length) return '';

  const visibleTagCount = 2;
  const renderedTags = tags.map((tag, index) => (
    `        <span class="resource-tag"${index >= visibleTagCount ? ' data-overflow-tag hidden' : ''}>${escapeHtml(tag)}</span>`
  ));
  const remainingTagCount = Math.max(0, tags.length - visibleTagCount);
  if (remainingTagCount > 0) {
    renderedTags.push(`        <button class="resource-tags-more" type="button" data-more-tags aria-expanded="false" aria-label="Show ${remainingTagCount} more tag${remainingTagCount === 1 ? '' : 's'}">&hellip;</button>`);
  }

  return [
    '      <div class="resource-entry-tags" aria-label="Resource tags">',
    ...renderedTags,
    '      </div>',
  ].join('\n');
}

function renderResourcesTable(sections, { showSectionHeaders = true } = {}) {
  const rows = sections.flatMap((section, sectionIndex) => [
    ...(showSectionHeaders ? [
      `  <tr class="resource-section" data-resource-section="${sectionIndex}">`,
      `    <td class="s0" dir="ltr">${escapeHtml(section.title)}:</td>`,
      '    <td class="s0" dir="ltr">Description:</td>',
      '  </tr>',
    ] : []),
    ...section.entries.flatMap(entry => [
      `  <tr class="resource-entry" data-resource-entry data-resource-section-id="${sectionIndex}" data-resource-tags="${escapeHtml((entry.tags || []).join('|'))}">`,
      '    <td class="s2" dir="ltr">',
      '      <div class="resource-entry-name">',
      `        <a target="_blank" rel="noopener" href="${escapeHtml(entry.url)}">${escapeHtml(entry.name)}</a>${renderRelatedLinks(entry.relatedLinks)}`,
      '      </div>',
      ...renderResourceTags(entry.tags).split('\n').filter(Boolean),
      '    </td>',
      `    <td class="s1" dir="ltr">${escapeHtml(entry.description || '')}</td>`,
      '  </tr>',
    ]),
  ]);

  return [
    '<table class="waffle">',
    '  <thead>',
    '    <tr><th scope="col">Resource</th><th scope="col">Description</th></tr>',
    '  </thead>',
    '  <tbody>',
    ...rows,
    '  </tbody>',
    '</table>',
  ].join('\n');
}

function renderResourceControls(key, label) {
  const filterOptions = RESOURCE_TAGS.map((tag, index) => [
    '          <label class="resource-filter-option">',
    `            <input type="checkbox" value="${escapeHtml(tag)}" data-resource-filter>`,
    `            <span>${escapeHtml(tag)}</span>`,
    '          </label>',
  ].join('\n'));

  return [
    `      <div class="resource-controls" data-resource-controls data-resource-controls-for="${key}">`,
    '        <div class="resource-search-row">',
    '          <label class="resource-search">',
    '            <span class="resource-search-icon" aria-hidden="true">&#128269;</span>',
    `            <input type="search" data-resource-search aria-label="Search ${escapeHtml(label)} resources" placeholder="Search resources..." autocomplete="off">`,
    '          </label>',
    `          <button class="resource-filter-toggle" type="button" data-filter-toggle aria-expanded="false" aria-controls="resource-filter-menu-${key}">`,
    '            <span>Filters <span data-filter-count>(0)</span></span>',
    '            <span class="resource-filter-chevron" aria-hidden="true">&#9662;</span>',
    '          </button>',
    '        </div>',
    `        <div class="resource-filter-menu" id="resource-filter-menu-${key}" data-filter-menu hidden>`,
    '          <fieldset>',
    '            <legend>Filter by tags</legend>',
    ...filterOptions,
    '          </fieldset>',
    '        </div>',
    '        <div class="resource-active-filters" data-active-filter-row hidden>',
    '          <div class="resource-filter-chips" data-filter-chips aria-label="Active tag filters"></div>',
    '          <button class="resource-clear-filters" type="button" data-clear-filters>Clear all</button>',
    '        </div>',
    '        <p class="resource-results-status" data-results-status aria-live="polite"></p>',
    '      </div>',
  ].join('\n');
}

export function renderResourcesDirectory(document) {
  validateResourcesDocument(document);

  const tabs = RESOURCE_TABS.map(({ key, label }, index) => (
    `    <button class="resource-tab" id="resource-tab-${key}" type="button" role="tab" aria-selected="${index === 0}" aria-controls="resource-panel-${key}" tabindex="${index === 0 ? '0' : '-1'}" data-resource-tab="${key}">${escapeHtml(label)}</button>`
  ));

  const panels = RESOURCE_TABS.flatMap(({ key, label, usesSections = true }, index) => {
    const tab = document.tabs[key];
    const groups = usesSections ? tab.sections : [{ entries: tab.entries }];
    const entryCount = groups.reduce((count, group) => count + group.entries.length, 0);
    const content = entryCount > 0
      ? [
          '      <div class="resources-table-wrap">',
          ...renderResourcesTable(groups, { showSectionHeaders: usesSections }).split('\n').map(line => `        ${line}`),
          '      </div>',
          '      <p class="resource-no-results" data-no-results hidden>No resources match your search and filters.</p>',
        ]
      : ['      <p class="empty-tab-message">No resources have been added to this tab yet.</p>'];

    return [
      `    <section class="resource-tab-panel" id="resource-panel-${key}" role="tabpanel" aria-labelledby="resource-tab-${key}" tabindex="0"${index === 0 ? '' : ' hidden'}>`,
      ...renderResourceControls(key, label).split('\n'),
      ...content,
      '    </section>',
    ];
  });

  return [
    `<div class="resources-directory" data-resources-directory data-resource-tags="${escapeHtml(JSON.stringify(RESOURCE_TAGS))}">`,
    '  <div class="resource-tabs" role="tablist" aria-label="Resource categories">',
    ...tabs,
    '  </div>',
    '  <div class="resources-panel">',
    ...panels,
    '  </div>',
    '</div>',
  ].join('\n');
}

export async function buildResourcesPage() {
  const [document, template] = await Promise.all([
    loadResourcesDocument(),
    readFile(RESOURCES_TEMPLATE_PATH, 'utf8'),
  ]);
  if (!template.includes(RESOURCES_DIRECTORY_MARKER)) {
    fail(`template is missing ${RESOURCES_DIRECTORY_MARKER}`);
  }
  const page = template.replace(RESOURCES_DIRECTORY_MARKER, renderResourcesDirectory(document));
  await writeFile(RESOURCES_OUTPUT_PATH, page, 'utf8');
  const sections = RESOURCE_TABS.flatMap(({ key, usesSections = true }) => usesSections ? document.tabs[key].sections : []);
  const entryCount = RESOURCE_TABS.reduce((count, { key, usesSections = true }) => (
    count + (usesSections
      ? document.tabs[key].sections.reduce((tabCount, section) => tabCount + section.entries.length, 0)
      : document.tabs[key].entries.length)
  ), 0);
  return { tabCount: RESOURCE_TABS.length, sectionCount: sections.length, entryCount };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  buildResourcesPage()
    .then(({ tabCount, sectionCount, entryCount }) => {
      console.log(`Built Resources page from ${tabCount} tabs, ${sectionCount} sections, and ${entryCount} entries.`);
    })
    .catch(error => {
      console.error(error.message || error);
      process.exitCode = 1;
    });
}
