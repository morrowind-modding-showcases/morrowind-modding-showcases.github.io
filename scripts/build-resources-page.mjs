import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { REPO_ROOT } from './wiki-content-lib.mjs';

export const RESOURCES_DATA_PATH = path.join(REPO_ROOT, 'content', 'resources', 'resources.json');
export const RESOURCES_TEMPLATE_PATH = path.join(REPO_ROOT, 'scripts', 'resources-page.template.html');
export const RESOURCES_OUTPUT_PATH = path.join(REPO_ROOT, 'resources', 'index.html');

const RESOURCES_TABLE_MARKER = '<!-- RESOURCES_TABLE -->';

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
  if (document.schemaVersion !== 1) fail('schemaVersion must be 1');
  if (!Array.isArray(document.sections) || document.sections.length === 0) {
    fail('sections must be a non-empty list');
  }

  const sectionTitles = new Set();
  document.sections.forEach((section, sectionIndex) => {
    const sectionContext = `sections[${sectionIndex}]`;
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

export function renderResourcesTable(document) {
  validateResourcesDocument(document);
  const rows = document.sections.flatMap(section => [
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

export async function buildResourcesPage() {
  const [document, template] = await Promise.all([
    loadResourcesDocument(),
    readFile(RESOURCES_TEMPLATE_PATH, 'utf8'),
  ]);
  if (!template.includes(RESOURCES_TABLE_MARKER)) {
    fail(`template is missing ${RESOURCES_TABLE_MARKER}`);
  }
  const page = template.replace(RESOURCES_TABLE_MARKER, renderResourcesTable(document));
  await writeFile(RESOURCES_OUTPUT_PATH, page, 'utf8');
  return { sectionCount: document.sections.length, entryCount: document.sections.reduce((count, section) => count + section.entries.length, 0) };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  buildResourcesPage()
    .then(({ sectionCount, entryCount }) => {
      console.log(`Built Resources page from ${sectionCount} sections and ${entryCount} entries.`);
    })
    .catch(error => {
      console.error(error.message || error);
      process.exitCode = 1;
    });
}
