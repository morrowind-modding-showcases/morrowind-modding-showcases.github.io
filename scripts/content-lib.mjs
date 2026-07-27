import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const CONTENT_ROOT = path.join(REPO_ROOT, 'content');
export const MODS_ROOT = path.join(CONTENT_ROOT, 'mods');
export const MODDERS_ROOT = path.join(CONTENT_ROOT, 'modders');
export const MODS_METADATA_PATH = path.join(CONTENT_ROOT, 'mods-metadata.json');
export const GENERATED_MODS_PATH = path.join(
  REPO_ROOT,
  'modathon',
  'assets',
  'data',
  'modathon-mods.json',
);
export const GENERATED_MODDERS_PATH = path.join(
  REPO_ROOT,
  'assets',
  'data',
  'modders.json',
);

const MOD_FIELDS = new Set([
  'name',
  'authors',
  'category',
  'url',
  'downloads',
  'uniqueDownloads',
  'endorsements',
  'available',
  'nexusCategory',
  'pictureUrl',
  'showcaseUrl',
  'status',
  // The Nexus updater can add this when a request fails before receiving an
  // HTTP response. It is not present in the current snapshot.
  'error',
]);
const MODDER_FIELDS = new Set([
  'id',
  'name',
  'nexusProfileUrl',
  'avatarUrl',
  'aliases',
]);
const REQUIRED_MOD_FIELDS = ['name', 'authors', 'category', 'url'];
const REQUIRED_MODDER_FIELDS = ['id', 'name'];
const INTEGER_MOD_FIELDS = ['downloads', 'uniqueDownloads', 'endorsements', 'status'];
const STRING_MOD_FIELDS = ['nexusCategory', 'pictureUrl', 'showcaseUrl', 'error'];
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const yearPattern = /^\d{4}$/;
const modderCollator = new Intl.Collator('en-US', {
  sensitivity: 'variant',
  numeric: true,
});

export function relativePath(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join('/');
}

export function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function readJson(filePath) {
  let source;
  try {
    source = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Could not read ${relativePath(filePath)}: ${error.message}`);
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`Invalid JSON in ${relativePath(filePath)}: ${error.message}`);
  }
}

function fail(context, message) {
  throw new Error(`${context}: ${message}`);
}

function assertPlainObject(value, context) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(context, 'must be a JSON object');
  }
}

function assertExactFields(value, allowedFields, context) {
  const unexpected = Object.keys(value).filter(key => !allowedFields.has(key));
  if (unexpected.length) {
    fail(context, `has unsupported field${unexpected.length === 1 ? '' : 's'}: ${unexpected.join(', ')}`);
  }
}

function assertNonEmptyString(value, context) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(context, 'must be a non-empty string');
  }
}

function assertHttpUrl(value, context, { allowSitePath = false } = {}) {
  if (allowSitePath && typeof value === 'string' && value.startsWith('/')) return;
  assertNonEmptyString(value, context);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(context, 'must be a valid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    fail(context, 'must use http:// or https://');
  }
}

function assertOptionalString(value, key, context) {
  if (Object.hasOwn(value, key) && typeof value[key] !== 'string') {
    fail(`${context}.${key}`, 'must be a string');
  }
}

function assertOptionalNullableUrl(value, key, context, options) {
  if (!Object.hasOwn(value, key) || value[key] === null || value[key] === '') return;
  assertHttpUrl(value[key], `${context}.${key}`, options);
}

function assertStringArray(value, context, { required = false } = {}) {
  if (!Array.isArray(value)) fail(context, 'must be an array');
  if (required && value.length === 0) fail(context, 'must not be empty');
  value.forEach((item, index) => assertNonEmptyString(item, `${context}[${index}]`));
}

export function identityKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '');
}

export function validateMod(mod, context) {
  assertPlainObject(mod, context);
  assertExactFields(mod, MOD_FIELDS, context);

  for (const field of REQUIRED_MOD_FIELDS) {
    if (!Object.hasOwn(mod, field)) fail(context, `is missing required field "${field}"`);
  }

  assertNonEmptyString(mod.name, `${context}.name`);
  assertStringArray(mod.authors, `${context}.authors`, { required: true });
  assertNonEmptyString(mod.category, `${context}.category`);
  assertHttpUrl(mod.url, `${context}.url`);

  for (const field of INTEGER_MOD_FIELDS) {
    if (!Object.hasOwn(mod, field)) continue;
    if (!Number.isInteger(mod[field]) || mod[field] < 0) {
      fail(`${context}.${field}`, 'must be a non-negative integer');
    }
  }

  if (Object.hasOwn(mod, 'available') && typeof mod.available !== 'boolean') {
    fail(`${context}.available`, 'must be a boolean');
  }

  for (const field of STRING_MOD_FIELDS) {
    assertOptionalString(mod, field, context);
  }
  if (Object.hasOwn(mod, 'pictureUrl')) {
    assertHttpUrl(mod.pictureUrl, `${context}.pictureUrl`, { allowSitePath: true });
  }
  if (Object.hasOwn(mod, 'showcaseUrl')) {
    assertHttpUrl(mod.showcaseUrl, `${context}.showcaseUrl`);
  }
}

export function validateModder(modder, context) {
  assertPlainObject(modder, context);
  assertExactFields(modder, MODDER_FIELDS, context);

  for (const field of REQUIRED_MODDER_FIELDS) {
    if (!Object.hasOwn(modder, field)) fail(context, `is missing required field "${field}"`);
  }

  assertNonEmptyString(modder.id, `${context}.id`);
  if (!idPattern.test(modder.id)) {
    fail(`${context}.id`, 'must contain lowercase letters, numbers, and single hyphens only');
  }
  assertNonEmptyString(modder.name, `${context}.name`);
  assertOptionalNullableUrl(modder, 'nexusProfileUrl', context);
  assertOptionalNullableUrl(modder, 'avatarUrl', context, { allowSitePath: true });

  if (Object.hasOwn(modder, 'aliases')) {
    assertStringArray(modder.aliases, `${context}.aliases`);
  }
}

export function validateModsMetadata(metadata, context = relativePath(MODS_METADATA_PATH)) {
  assertPlainObject(metadata, context);
  const keys = Object.keys(metadata);
  if (!isDeepStrictEqual(keys, ['generated', 'game'])) {
    fail(context, 'must contain exactly "generated" and "game", in that order');
  }
  assertNonEmptyString(metadata.generated, `${context}.generated`);
  if (Number.isNaN(Date.parse(metadata.generated))) {
    fail(`${context}.generated`, 'must be an ISO-compatible timestamp');
  }
  if (metadata.game !== 'morrowind') {
    fail(`${context}.game`, 'must equal "morrowind"');
  }
}

function compareFileNames(left, right) {
  const a = left.toLocaleLowerCase('en-US');
  const b = right.toLocaleLowerCase('en-US');
  return a < b ? -1 : a > b ? 1 : left < right ? -1 : left > right ? 1 : 0;
}

async function listJsonFiles(directory, context) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Could not read ${relativePath(directory)}: ${error.message}`);
  }

  const unexpected = entries.filter(entry => !entry.isFile() || path.extname(entry.name) !== '.json');
  if (unexpected.length) {
    fail(context, `contains unsupported entries: ${unexpected.map(entry => entry.name).join(', ')}`);
  }

  const collisions = new Map();
  for (const entry of entries) {
    const key = entry.name.toLocaleLowerCase('en-US');
    const names = collisions.get(key) || [];
    names.push(entry.name);
    collisions.set(key, names);
  }
  const duplicateNames = [...collisions.values()].filter(names => names.length > 1);
  if (duplicateNames.length) {
    fail(context, `has case-insensitive filename collisions: ${duplicateNames.flat().join(', ')}`);
  }

  return entries.map(entry => entry.name).sort(compareFileNames);
}

export async function loadContentSources() {
  const metadata = await readJson(MODS_METADATA_PATH);
  validateModsMetadata(metadata);

  let yearEntries;
  try {
    yearEntries = await readdir(MODS_ROOT, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Could not read ${relativePath(MODS_ROOT)}: ${error.message}`);
  }
  const unexpected = yearEntries.filter(entry => !entry.isDirectory() || !yearPattern.test(entry.name));
  if (unexpected.length) {
    fail(relativePath(MODS_ROOT), `contains unsupported entries: ${unexpected.map(entry => entry.name).join(', ')}`);
  }

  const modsByYear = new Map();
  const modFiles = [];
  for (const yearEntry of yearEntries.sort((a, b) => Number(a.name) - Number(b.name))) {
    const yearDirectory = path.join(MODS_ROOT, yearEntry.name);
    const fileNames = await listJsonFiles(yearDirectory, relativePath(yearDirectory));
    const mods = [];
    for (const fileName of fileNames) {
      const filePath = path.join(yearDirectory, fileName);
      const mod = await readJson(filePath);
      validateMod(mod, relativePath(filePath));
      mods.push(mod);
      modFiles.push(filePath);
    }
    modsByYear.set(yearEntry.name, mods);
  }

  const modderFileNames = await listJsonFiles(MODDERS_ROOT, relativePath(MODDERS_ROOT));
  const modders = [];
  const modderFiles = [];
  const ids = new Map();
  for (const fileName of modderFileNames) {
    const filePath = path.join(MODDERS_ROOT, fileName);
    const modder = await readJson(filePath);
    validateModder(modder, relativePath(filePath));
    const fileId = path.basename(fileName, '.json');
    if (fileId !== modder.id) {
      fail(relativePath(filePath), `filename must match stable ID "${modder.id}.json"`);
    }
    if (ids.has(modder.id)) {
      fail(relativePath(filePath), `duplicates stable modder ID also used by ${ids.get(modder.id)}`);
    }
    ids.set(modder.id, relativePath(filePath));
    modders.push(modder);
    modderFiles.push(filePath);
  }

  validateAuthorReferences(modsByYear, modders);
  return { metadata, modsByYear, modders, modFiles, modderFiles };
}

export function validateAuthorReferences(modsByYear, modders) {
  const references = new Map();
  for (const modder of modders) {
    for (const name of [modder.name, ...(modder.aliases || [])]) {
      const key = identityKey(name);
      if (!key) fail(`modder ${modder.id}`, `has an unusable name or alias: ${JSON.stringify(name)}`);
      const ids = references.get(key) || new Set();
      ids.add(modder.id);
      references.set(key, ids);
    }
  }

  for (const [name, ids] of references) {
    if (ids.size > 1) {
      fail('central modder registry', `name/alias key "${name}" is ambiguous across IDs: ${[...ids].join(', ')}`);
    }
  }

  for (const [year, mods] of modsByYear) {
    mods.forEach((mod, modIndex) => {
      mod.authors.forEach((author, authorIndex) => {
        if (!references.has(identityKey(author))) {
          fail(
            `content/mods/${year} record ${modIndex + 1}.authors[${authorIndex}]`,
            `does not resolve to a central modder name or alias: ${JSON.stringify(author)}`,
          );
        }
      });
    });
  }
}

export function buildContentDocuments({ metadata, modsByYear, modders }) {
  const mods = {};
  for (const [year, records] of [...modsByYear].sort(([a], [b]) => Number(a) - Number(b))) {
    mods[year] = records;
  }

  const sortedModders = modders.slice().sort((left, right) => (
    modderCollator.compare(left.name, right.name)
    || compareFileNames(left.id, right.id)
  ));

  return {
    modsDocument: {
      generated: metadata.generated,
      game: metadata.game,
      mods,
    },
    moddersDocument: {
      modders: sortedModders,
    },
  };
}

export function validateGeneratedDocuments(modsDocument, moddersDocument, context = 'generated content') {
  assertPlainObject(modsDocument, `${context} Modathon document`);
  if (!isDeepStrictEqual(Object.keys(modsDocument), ['generated', 'game', 'mods'])) {
    fail(`${context} Modathon document`, 'must contain exactly "generated", "game", and "mods"');
  }
  validateModsMetadata(
    { generated: modsDocument.generated, game: modsDocument.game },
    `${context} Modathon metadata`,
  );
  assertPlainObject(modsDocument.mods, `${context} Modathon document.mods`);

  const modsByYear = new Map();
  for (const [year, mods] of Object.entries(modsDocument.mods)) {
    if (!yearPattern.test(year)) fail(`${context} Modathon document.mods`, `has invalid year "${year}"`);
    if (!Array.isArray(mods)) fail(`${context} Modathon document.mods.${year}`, 'must be an array');
    mods.forEach((mod, index) => validateMod(mod, `${context} Modathon ${year} record ${index + 1}`));
    modsByYear.set(year, mods);
  }

  assertPlainObject(moddersDocument, `${context} modder document`);
  if (!isDeepStrictEqual(Object.keys(moddersDocument), ['modders'])) {
    fail(`${context} modder document`, 'must contain exactly "modders"');
  }
  if (!Array.isArray(moddersDocument.modders)) {
    fail(`${context} modder document.modders`, 'must be an array');
  }
  const ids = new Set();
  moddersDocument.modders.forEach((modder, index) => {
    validateModder(modder, `${context} modder record ${index + 1}`);
    if (ids.has(modder.id)) fail(`${context} modder document`, `duplicates stable ID "${modder.id}"`);
    ids.add(modder.id);
  });
  validateAuthorReferences(modsByYear, moddersDocument.modders);
}

export function assertLosslessBuild(sources, documents) {
  const expectedMods = Object.fromEntries(sources.modsByYear);
  if (!isDeepStrictEqual(documents.modsDocument.mods, expectedMods)) {
    fail('content build', 'changed Modathon records while grouping them by year');
  }
  const expectedModders = sources.modders.slice().sort((left, right) => (
    modderCollator.compare(left.name, right.name)
    || compareFileNames(left.id, right.id)
  ));
  if (!isDeepStrictEqual(documents.moddersDocument.modders, expectedModders)) {
    fail('content build', 'changed modder records while assembling the registry');
  }

  for (const [label, value] of [
    ['Modathon', documents.modsDocument],
    ['modder', documents.moddersDocument],
  ]) {
    const reparsed = JSON.parse(canonicalJson(value));
    if (!isDeepStrictEqual(reparsed, value)) {
      fail('content build', `${label} data changed during its JSON round trip`);
    }
  }
}

