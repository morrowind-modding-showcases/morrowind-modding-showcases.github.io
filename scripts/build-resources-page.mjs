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
  { key: 'community', label: 'Community' },
  { key: 'tutorials', label: 'Tutorials' },
  { key: 'tools', label: 'Tools & Utilities' },
  { key: 'frameworks', label: 'Frameworks' },
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

export function validateResourcesDocument(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    fail('the document must be an object');
  }
  if (document.schemaVersion !== 2) fail('schemaVersion must be 2');
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
  RESOURCE_TABS.forEach(({ key }) => {
    const tab = document.tabs[key];
    if (!tab || typeof tab !== 'object' || Array.isArray(tab)) {
      fail(`tabs.${key} must be an object`);
    }
    if (!Array.isArray(tab.sections)) fail(`tabs.${key}.sections must be a list`);

    tab.sections.forEach((section, sectionIndex) => {
      const sectionContext = `tabs.${key}.sections[${sectionIndex}]`;
      const title = requireString(section?.title, `${sectionContext}.title`);
      if (sectionTitles.has(title.toLowerCase())) fail(`duplicate section title "${title}"`);
      sectionTitles.add(title.toLowerCase());
      if (!Array.isArray(section.entries)) fail(`${sectionContext}.entries must be a list`);

      section.entries.forEach((entry, entryIndex) => {
        const entryContext = `${sectionContext}.entries[${entryIndex}]`;
        requireString(entry?.name, `${entryContext}.name`);
        validateUrl(entry?.url, `${entryContext}.url`);
        requireString(entry?.description, `${entryContext}.description`, { required: false });
        if (entry.relatedLinks === undefined) return;
        if (!Array.isArray(entry.relatedLinks)) fail(`${entryContext}.relatedLinks must be a list`);
        entry.relatedLinks.forEach((link, linkIndex) => {
          const linkContext = `${entryContext}.relatedLinks[${linkIndex}]`;
          requireString(link?.label, `${linkContext}.label`);
          validateUrl(link?.url, `${linkContext}.url`);
        });
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

function renderResourcesTable(sections) {
  const rows = sections.flatMap(section => [
    '  <tr class="resource-section">',
    `    <td class="s0" dir="ltr">${escapeHtml(section.title)}:</td>`,
    '    <td class="s0" dir="ltr">Description:</td>',
    '  </tr>',
    ...section.entries.flatMap(entry => [
      '  <tr>',
      '    <td class="s2" dir="ltr">',
      `      <a target="_blank" rel="noopener" href="${escapeHtml(entry.url)}">${escapeHtml(entry.name)}</a>${renderRelatedLinks(entry.relatedLinks)}`,
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

export function renderResourcesDirectory(document) {
  validateResourcesDocument(document);

  const tabs = RESOURCE_TABS.map(({ key, label }, index) => (
    `    <button class="resource-tab" id="resource-tab-${key}" type="button" role="tab" aria-selected="${index === 0}" aria-controls="resource-panel-${key}" tabindex="${index === 0 ? '0' : '-1'}" data-resource-tab="${key}">${escapeHtml(label)}</button>`
  ));

  const panels = RESOURCE_TABS.flatMap(({ key }, index) => {
    const sections = document.tabs[key].sections;
    const content = sections.length > 0
      ? [
          '      <div class="resources-table-wrap">',
          ...renderResourcesTable(sections).split('\n').map(line => `        ${line}`),
          '      </div>',
        ]
      : ['      <p class="empty-tab-message">No resources have been added to this tab yet.</p>'];

    return [
      `    <section class="resource-tab-panel" id="resource-panel-${key}" role="tabpanel" aria-labelledby="resource-tab-${key}" tabindex="0"${index === 0 ? '' : ' hidden'}>`,
      ...content,
      '    </section>',
    ];
  });

  return [
    '<div class="resources-directory" data-resources-directory>',
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
  const sections = RESOURCE_TABS.flatMap(({ key }) => document.tabs[key].sections);
  return { tabCount: RESOURCE_TABS.length, sectionCount: sections.length, entryCount: sections.reduce((count, section) => count + section.entries.length, 0) };
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
