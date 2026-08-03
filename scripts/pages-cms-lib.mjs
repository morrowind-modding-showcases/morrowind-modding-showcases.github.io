import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

import { STANDARD_MOD_CATEGORIES } from './content-lib.mjs';

export const PAGES_CONFIG_PATH = fileURLToPath(new URL('../.pages.yml', import.meta.url));

const FIELD_TYPES = new Set([
  'boolean',
  'code',
  'date',
  'file',
  'image',
  'number',
  'object',
  'reference',
  'rich-text',
  'select',
  'string',
  'text',
  'uuid',
]);
const CONTENT_FORMATS = new Set([
  'yaml-frontmatter',
  'json-frontmatter',
  'toml-frontmatter',
  'yaml',
  'json',
  'toml',
  'datagrid',
  'code',
  'raw',
]);
const DATE_FORMAT = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'";
const TOKEN_PATTERN = /\{([^{}]+)\}/g;

function fail(context, message) {
  throw new Error(`Pages CMS ${context}: ${message}`);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, context) {
  if (!isObject(value)) fail(context, 'must be an object');
}

function requireString(value, context) {
  if (typeof value !== 'string' || value.trim() === '') fail(context, 'must be a non-empty string');
}

function requireBoolean(value, context) {
  if (typeof value !== 'boolean') fail(context, 'must be true or false');
}

function contentEntries(items, result = [], parent = null) {
  for (const entry of items || []) {
    requireObject(entry, 'content entry');
    requireString(entry.name, 'content entry.name');
    if (parent) result.push({ ...entry, parent });
    else result.push({ ...entry, parent: null });
    if (entry.type === 'group') contentEntries(entry.items, result, entry.name);
  }
  return result;
}

export function collectPagesContent(config) {
  requireObject(config, 'configuration');
  if (!Array.isArray(config.content)) fail('configuration.content', 'must be a list');
  return contentEntries(config.content);
}

function fieldPathSet(fields, prefix = '') {
  const paths = new Set();
  for (const field of fields || []) {
    const fieldPath = `${prefix}${field.name}`;
    paths.add(fieldPath);
    if (Array.isArray(field.fields)) {
      for (const nested of fieldPathSet(field.fields, `${fieldPath}.`)) paths.add(nested);
    }
  }
  return paths;
}

function optionValue(option, context) {
  if (typeof option === 'string') return option;
  requireObject(option, context);
  requireString(option.name, `${context}.name`);
  requireString(option.label, `${context}.label`);
  return option.name;
}

function validatePattern(pattern, context) {
  requireObject(pattern, context);
  requireString(pattern.regex, `${context}.regex`);
  requireString(pattern.message, `${context}.message`);
  try {
    new RegExp(pattern.regex);
  } catch (error) {
    fail(`${context}.regex`, `is not a valid regular expression: ${error.message}`);
  }
}

function validateTemplate(template, availablePaths, context, { allowPrimary = false } = {}) {
  if (template === undefined) return;
  if (typeof template !== 'string') fail(context, 'must be a string');
  for (const match of template.matchAll(TOKEN_PATTERN)) {
    const token = match[1];
    if (['name', 'path', 'primary', 'slug', 'year', 'month', 'day', 'hour', 'minute', 'second'].includes(token)) {
      if (token === 'primary' && !allowPrimary) fail(context, 'may not use {primary} here');
      continue;
    }
    const fieldPath = token.startsWith('fields.') ? token.slice('fields.'.length) : token;
    if (!availablePaths.has(fieldPath)) fail(context, `references unknown field "${fieldPath}"`);
  }
}

function validateFields(fields, context, collectionNames, components, availableComponents = new Set()) {
  if (!Array.isArray(fields)) fail(context, 'fields must be a list');
  const names = new Set();
  for (const field of fields) {
    requireObject(field, `${context}.field`);
    requireString(field.name, `${context}.field.name`);
    if (names.has(field.name)) fail(context, `contains duplicate field "${field.name}"`);
    names.add(field.name);

    if (field.component !== undefined) {
      requireString(field.component, `${context}.${field.name}.component`);
      if (!components[field.component]) fail(`${context}.${field.name}`, `references unknown component "${field.component}"`);
      availableComponents.add(field.component);
    }
    const type = field.type || components[field.component]?.type;
    if (!FIELD_TYPES.has(type)) fail(`${context}.${field.name}`, `has unsupported type "${type}"`);
    for (const key of ['required', 'hidden', 'readonly']) {
      if (field[key] !== undefined) requireBoolean(field[key], `${context}.${field.name}.${key}`);
    }
    if (field.pattern !== undefined) validatePattern(field.pattern, `${context}.${field.name}.pattern`);

    if (field.options?.multiple !== undefined) {
      requireBoolean(field.options.multiple, `${context}.${field.name}.options.multiple`);
    }
    if (field.list !== undefined && typeof field.list !== 'boolean' && !isObject(field.list)) {
      fail(`${context}.${field.name}.list`, 'must be true, false, or an object');
    }

    if (type === 'object') {
      const nestedFields = field.fields || components[field.component]?.fields;
      validateFields(nestedFields, `${context}.${field.name}`, collectionNames, components, availableComponents);
    }
    if (type === 'select') {
      const values = field.options?.values;
      if (!Array.isArray(values) || values.length === 0) fail(`${context}.${field.name}.options.values`, 'must be a non-empty list');
      const optionNames = values.map((option, index) => optionValue(option, `${context}.${field.name}.options.values[${index}]`));
      if (new Set(optionNames).size !== optionNames.length) fail(`${context}.${field.name}`, 'contains duplicate select values');
    }
    if (type === 'reference') {
      requireObject(field.options, `${context}.${field.name}.options`);
      requireString(field.options.collection, `${context}.${field.name}.options.collection`);
      if (!collectionNames.has(field.options.collection)) {
        fail(`${context}.${field.name}`, `references unknown collection "${field.options.collection}"`);
      }
      if (field.options.multiple === true && field.list === true) {
        fail(`${context}.${field.name}`, 'must use reference multiple or list, not both');
      }
      for (const key of ['value', 'label', 'search']) {
        if (field.options[key] !== undefined) requireString(field.options[key], `${context}.${field.name}.options.${key}`);
      }
    }
    if (type === 'date') {
      requireObject(field.options, `${context}.${field.name}.options`);
      if (field.options.time !== true) fail(`${context}.${field.name}`, 'must preserve UTC time with options.time: true');
      if (field.options.format !== DATE_FORMAT) fail(`${context}.${field.name}`, `must use ${DATE_FORMAT}`);
    }
    if (type === 'rich-text') {
      if (field.options?.format !== 'markdown') fail(`${context}.${field.name}`, 'must use Markdown rich text');
    }
  }
}

function validateCollection(entry, allEntries, components) {
  const context = `collection ${entry.name}`;
  requireString(entry.path, `${context}.path`);
  if (entry.path.startsWith('/') || entry.path.includes('..')) fail(`${context}.path`, 'must be a repository-relative path');
  if (!CONTENT_FORMATS.has(entry.format)) fail(`${context}.format`, `has unsupported format "${entry.format}"`);
  if (entry.subfolders !== undefined) requireBoolean(entry.subfolders, `${context}.subfolders`);
  if (!isObject(entry.operations)) fail(`${context}.operations`, 'must be configured');
  for (const key of ['create', 'rename', 'delete']) requireBoolean(entry.operations[key], `${context}.operations.${key}`);
  if (entry.operations.rename !== false || entry.operations.delete !== false) {
    fail(context, 'must disable rename and delete to protect stable references');
  }
  if (entry.filename === undefined) fail(context, 'must define a filename policy');
  const filename = typeof entry.filename === 'string' ? entry.filename : entry.filename?.template;
  requireString(filename, `${context}.filename`);
  const paths = fieldPathSet(entry.fields);
  validateTemplate(filename, paths, `${context}.filename`, { allowPrimary: true });
  if (typeof entry.filename === 'object') {
    if (!['false', 'true', 'create'].includes(String(entry.filename.field))) {
      fail(`${context}.filename.field`, 'must be false, true, or create');
    }
  }
  if (entry.view) {
    requireObject(entry.view, `${context}.view`);
    if (entry.view.primary !== undefined && !paths.has(entry.view.primary)) fail(`${context}.view.primary`, `references unknown field "${entry.view.primary}"`);
    for (const key of ['fields', 'sort']) {
      if (entry.view[key] !== undefined) {
        if (!Array.isArray(entry.view[key])) fail(`${context}.view.${key}`, 'must be a list');
        for (const value of entry.view[key]) {
          requireString(value, `${context}.view.${key}`);
          if (!paths.has(value)) fail(`${context}.view.${key}`, `references unknown field "${value}"`);
        }
      }
    }
    if (entry.view.search !== undefined) {
      if (!Array.isArray(entry.view.search)) fail(`${context}.view.search`, 'must be a list');
      for (const value of entry.view.search) requireString(value, `${context}.view.search`);
    }
  }
  validateFields(entry.fields, `${context}.fields`, new Set(allEntries.filter(item => item.type === 'collection').map(item => item.name)), components);
}

function validateFile(entry, allEntries, components) {
  const context = `file ${entry.name}`;
  requireString(entry.path, `${context}.path`);
  if (entry.path.startsWith('/') || entry.path.includes('..')) fail(`${context}.path`, 'must be a repository-relative path');
  if (!CONTENT_FORMATS.has(entry.format)) fail(`${context}.format`, `has unsupported format "${entry.format}"`);
  if (!isObject(entry.operations)) fail(`${context}.operations`, 'must be configured');
  for (const key of ['create', 'rename', 'delete']) requireBoolean(entry.operations[key], `${context}.operations.${key}`);
  if (entry.operations.rename !== false || entry.operations.delete !== false) fail(context, 'must disable rename and delete');
  validateFields(entry.fields, `${context}.fields`, new Set(allEntries.filter(item => item.type === 'collection').map(item => item.name)), components);
}

export function validatePagesCmsConfig(config) {
  requireObject(config, 'configuration');
  requireObject(config.media, 'media');
  if (config.media.input !== 'assets/images/uploads') fail('media.input', 'must be assets/images/uploads');
  if (config.media.output !== '/assets/images/uploads') fail('media.output', 'must be /assets/images/uploads');
  if (!Array.isArray(config.media.categories) || !config.media.categories.includes('image')) fail('media.categories', 'must allow image uploads');
  if (config.media.rename !== 'safe') fail('media.rename', 'must use safe filename normalization');
  if (config.settings?.content?.merge !== true) fail('settings.content.merge', 'must be true so automation-owned fields survive CMS edits');

  const entries = collectPagesContent(config);
  const names = new Set();
  const paths = new Set();
  for (const entry of entries) {
    if (names.has(entry.name)) fail('content', `contains duplicate entry name "${entry.name}"`);
    names.add(entry.name);
    if (entry.type === 'group') {
      if (!Array.isArray(entry.items) || entry.items.length === 0) fail(`group ${entry.name}.items`, 'must be a non-empty list');
      continue;
    }
    if (paths.has(entry.path)) fail('content', `maps more than one entry to "${entry.path}"`);
    paths.add(entry.path);
    if (entry.type === 'collection') validateCollection(entry, entries, config.components || {});
    else if (entry.type === 'file') validateFile(entry, entries, config.components || {});
    else fail(`content entry ${entry.name}`, `has unsupported type "${entry.type}"`);
  }

  const categoryCollections = ['modathon_mods', 'madness_mods', 'modjam_mods'];
  for (const name of categoryCollections) {
    const entry = entries.find(candidate => candidate.name === name);
    const category = entry?.fields?.find(field => field.name === 'category');
    const values = category?.options?.values || [];
    if (values.length !== STANDARD_MOD_CATEGORIES.size || !values.every(value => STANDARD_MOD_CATEGORIES.has(value))) {
      fail(`collection ${name}.category`, 'must expose exactly the shared standard mod categories');
    }
  }
  return entries;
}

function field(entry, name) {
  return entry?.fields?.find(candidate => candidate.name === name);
}

function optionNames(entry, name) {
  return (field(entry, name)?.options?.values || []).map((option, index) => optionValue(option, `${entry.name}.${name}.options.values[${index}]`));
}

function assertSetEqual(actual, expected, context) {
  const left = new Set(actual);
  const right = new Set(expected);
  const missing = [...right].filter(value => !left.has(value));
  const stale = [...left].filter(value => !right.has(value));
  if (missing.length || stale.length) {
    fail(context, `does not match current data (missing: ${missing.join(', ') || 'none'}; stale: ${stale.join(', ') || 'none'})`);
  }
}

export function validatePagesCmsData(config, sources) {
  const entries = collectPagesContent(config);
  const byName = new Map(entries.filter(entry => entry.type !== 'group').map(entry => [entry.name, entry]));
  const expectedCategories = [...STANDARD_MOD_CATEGORIES];
  for (const name of ['modathon_mods', 'madness_mods', 'modjam_mods']) {
    assertSetEqual(optionNames(byName.get(name), 'category'), expectedCategories, `${name}.category`);
  }

  const themeIds = (sources.madnessEvents.events || []).flatMap(event => (event.themes || []).map(theme => theme.id));
  assertSetEqual(optionNames(byName.get('madness_mods'), 'themeId'), themeIds, 'madness_mods.themeId');

  const teamField = field(byName.get('madness_mods'), 'team');
  if (teamField?.options?.value !== 'Team {fields.name}') fail('madness_mods.team', 'must store the public Team-prefixed value');
  const teamValues = sources.madnessTeamRecords.map(team => `Team ${team.name}`);
  const modTeamValues = sources.madnessModRecords.map(mod => mod.team).filter(Boolean);
  assertSetEqual([...new Set(modTeamValues)], [...new Set(teamValues.filter(value => modTeamValues.includes(value)))], 'madness_mods.team references');

  const eventField = field(byName.get('modjam_mods'), 'eventId');
  if (eventField?.options?.value !== '{name}') fail('modjam_mods.eventId', 'must store the stable event filename token');
  assertSetEqual(
    sources.modjamEventRecords.map(event => event.id),
    sources.modjamEventFiles.map(filePath => path.basename(filePath, '.json')),
    'modjam event filenames',
  );

  const postcardEntries = sources.postcards.map(postcard => postcard.entryId);
  const entryIds = sources.modjamModRecords.map(mod => mod.id);
  if (postcardEntries.some(entryId => !entryIds.includes(entryId))) fail('modjam_postcards.entryId', 'contains an unknown ModJam entry');
  return { entries, themeIds, teamValues, entryIds };
}

export async function loadPagesCmsConfig(configPath = PAGES_CONFIG_PATH) {
  let source;
  try {
    source = await readFile(configPath, 'utf8');
  } catch (error) {
    throw new Error(`Could not read ${path.relative(process.cwd(), configPath)}: ${error.message}`);
  }
  let config;
  try {
    config = yaml.load(source);
  } catch (error) {
    throw new Error(`Pages CMS configuration is not valid YAML: ${error.message}`);
  }
  validatePagesCmsConfig(config);
  return config;
}
