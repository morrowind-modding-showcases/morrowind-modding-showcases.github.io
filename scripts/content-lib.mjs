import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const CONTENT_ROOT = path.join(REPO_ROOT, 'content');
export const MODATHON_MODS_ROOT = path.join(CONTENT_ROOT, 'modathon', 'mods');
export const MODATHON_METADATA_PATH = path.join(CONTENT_ROOT, 'modathon', 'mods-metadata.json');
export const MODJAM_MODS_ROOT = path.join(CONTENT_ROOT, 'modjam', 'mods');
export const MODJAM_METADATA_PATH = path.join(CONTENT_ROOT, 'modjam', 'mods-metadata.json');
export const MODJAM_POSTCARDS_ROOT = path.join(CONTENT_ROOT, 'modjam', 'postcards');
export const MADNESS_MODS_ROOT = path.join(CONTENT_ROOT, 'madness', 'mods');
export const MADNESS_TEAMS_ROOT = path.join(CONTENT_ROOT, 'madness', 'teams');
export const MODDERS_ROOT = path.join(CONTENT_ROOT, 'modders');

// Backward-compatible aliases used by the Nexus updater and older helper scripts.
export const MODS_ROOT = MODATHON_MODS_ROOT;
export const MODS_METADATA_PATH = MODATHON_METADATA_PATH;

export const GENERATED_MODS_PATH = path.join(
  REPO_ROOT,
  'modathon',
  'assets',
  'data',
  'modathon-mods.json',
);
export const GENERATED_MODDERS_PATH = path.join(REPO_ROOT, 'assets', 'data', 'modders.json');
export const GENERATED_MODJAM_MODS_PATH = path.join(REPO_ROOT, 'modjam', 'data', 'modjam-mods.json');
export const GENERATED_MODJAM_POSTCARDS_PATH = path.join(REPO_ROOT, 'modjam', 'data', 'postcards.json');
export const GENERATED_MADNESS_MODS_PATH = path.join(REPO_ROOT, 'madness', 'data', 'madness-mods.json');
export const GENERATED_MADNESS_TEAMS_PATH = path.join(REPO_ROOT, 'madness', 'data', 'madness-teams.json');
export const MODJAM_EVENTS_PATH = path.join(REPO_ROOT, 'modjam', 'data', 'modjam-event.json');
export const MADNESS_EVENTS_PATH = path.join(REPO_ROOT, 'madness', 'data', 'madness-event.json');

const MODATHON_MOD_FIELDS = new Set([
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
  'error',
]);
const MODDER_FIELDS = new Set(['id', 'name', 'nexusProfileUrl', 'avatarUrl', 'aliases']);
const MODJAM_MOD_FIELDS = new Set([
  'id',
  'title',
  'url',
  'authors',
  'themes',
  'category',
  'placement',
  'placementLabel',
  'awards',
  'awardPlacardUrl',
  'pictureUrl',
]);
const MADNESS_MOD_FIELDS = new Set([
  'name',
  'url',
  'team',
  'category',
  'place',
  'notes',
  'pictureUrl',
]);
const MADNESS_TEAM_FIELDS = new Set(['name', 'place', 'mods', 'members']);
const POSTCARD_FIELDS = new Set(['file', 'entryId', 'caption', 'captionPosition']);
const REQUIRED_MODATHON_MOD_FIELDS = ['name', 'authors', 'category', 'url'];
const REQUIRED_MODDER_FIELDS = ['id', 'name'];
const INTEGER_MOD_FIELDS = ['downloads', 'uniqueDownloads', 'endorsements', 'status'];
const STRING_MOD_FIELDS = ['nexusCategory', 'pictureUrl', 'showcaseUrl', 'error'];
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const eventIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
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

function assertOptionalString(value, key, context, { allowNull = false } = {}) {
  if (!Object.hasOwn(value, key)) return;
  if (allowNull && value[key] === null) return;
  if (typeof value[key] !== 'string') fail(`${context}.${key}`, 'must be a string');
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

function assertOptionalNullableUrl(value, key, context, options) {
  if (!Object.hasOwn(value, key) || value[key] === null || value[key] === '') return;
  assertHttpUrl(value[key], `${context}.${key}`, options);
}

function assertStringArray(value, context, { required = false } = {}) {
  if (!Array.isArray(value)) fail(context, 'must be an array');
  if (required && value.length === 0) fail(context, 'must not be empty');
  value.forEach((item, index) => assertNonEmptyString(item, `${context}[${index}]`));
}

function assertYear(value, context) {
  if (!Number.isInteger(value) || value < 2015 || value > 2100) {
    fail(context, 'must be an integer from 2015 through 2100');
  }
}

export function identityKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '');
}

export function validateMod(mod, context) {
  assertPlainObject(mod, context);
  assertExactFields(mod, MODATHON_MOD_FIELDS, context);

  for (const field of REQUIRED_MODATHON_MOD_FIELDS) {
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

  for (const field of STRING_MOD_FIELDS) assertOptionalString(mod, field, context);
  if (Object.hasOwn(mod, 'pictureUrl')) {
    assertHttpUrl(mod.pictureUrl, `${context}.pictureUrl`, { allowSitePath: true });
  }
  if (Object.hasOwn(mod, 'showcaseUrl')) assertHttpUrl(mod.showcaseUrl, `${context}.showcaseUrl`);
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
  if (Object.hasOwn(modder, 'aliases')) assertStringArray(modder.aliases, `${context}.aliases`);
}

function validateModjamMod(mod, context) {
  assertPlainObject(mod, context);
  assertExactFields(mod, MODJAM_MOD_FIELDS, context);
  for (const field of ['id', 'title', 'authors', 'themes', 'category']) {
    if (!Object.hasOwn(mod, field)) fail(context, `is missing required field "${field}"`);
  }
  assertNonEmptyString(mod.id, `${context}.id`);
  if (!idPattern.test(mod.id)) fail(`${context}.id`, 'must use lowercase letters, numbers, and hyphens');
  assertNonEmptyString(mod.title, `${context}.title`);
  assertOptionalNullableUrl(mod, 'url', context);
  if (!Array.isArray(mod.authors) || !mod.authors.length) fail(`${context}.authors`, 'must be a non-empty array');
  mod.authors.forEach((author, index) => {
    assertPlainObject(author, `${context}.authors[${index}]`);
    assertExactFields(author, new Set(['id']), `${context}.authors[${index}]`);
    assertNonEmptyString(author.id, `${context}.authors[${index}].id`);
  });
  assertStringArray(mod.themes, `${context}.themes`);
  assertNonEmptyString(mod.category, `${context}.category`);
  for (const field of ['placement', 'placementLabel']) {
    assertOptionalString(mod, field, context, { allowNull: true });
  }
  if (Object.hasOwn(mod, 'awards')) assertStringArray(mod.awards, `${context}.awards`);
  assertOptionalNullableUrl(mod, 'awardPlacardUrl', context, { allowSitePath: true });
  assertOptionalNullableUrl(mod, 'pictureUrl', context, { allowSitePath: true });
}

function validateMadnessMod(mod, context) {
  assertPlainObject(mod, context);
  assertExactFields(mod, MADNESS_MOD_FIELDS, context);
  if (!Object.hasOwn(mod, 'name')) fail(context, 'is missing required field "name"');
  assertNonEmptyString(mod.name, `${context}.name`);
  for (const field of ['team', 'category', 'place', 'notes']) {
    assertOptionalString(mod, field, context);
  }
  assertOptionalNullableUrl(mod, 'url', context);
  assertOptionalNullableUrl(mod, 'pictureUrl', context, { allowSitePath: true });
}

function validateMadnessTeam(team, context, { generated = false } = {}) {
  assertPlainObject(team, context);
  assertExactFields(team, MADNESS_TEAM_FIELDS, context);
  for (const field of ['name', 'mods', 'members']) {
    if (!Object.hasOwn(team, field)) fail(context, `is missing required field "${field}"`);
  }
  assertNonEmptyString(team.name, `${context}.name`);
  assertOptionalString(team, 'place', context);
  if (!Array.isArray(team.mods)) fail(`${context}.mods`, 'must be an array');
  team.mods.forEach((mod, index) => {
    const modContext = `${context}.mods[${index}]`;
    assertPlainObject(mod, modContext);
    assertExactFields(mod, new Set(generated ? ['name', 'url'] : ['name']), modContext);
    assertNonEmptyString(mod.name, `${modContext}.name`);
    if (generated) assertOptionalNullableUrl(mod, 'url', modContext);
  });
  if (!Array.isArray(team.members) || !team.members.length) fail(`${context}.members`, 'must be a non-empty array');
  team.members.forEach((member, index) => {
    const memberContext = `${context}.members[${index}]`;
    assertPlainObject(member, memberContext);
    assertExactFields(member, new Set(['id']), memberContext);
    assertNonEmptyString(member.id, `${memberContext}.id`);
  });
}

function validatePostcard(postcard, context) {
  assertPlainObject(postcard, context);
  assertExactFields(postcard, POSTCARD_FIELDS, context);
  assertNonEmptyString(postcard.file, `${context}.file`);
  assertNonEmptyString(postcard.entryId, `${context}.entryId`);
  assertOptionalString(postcard, 'caption', context);
  assertOptionalString(postcard, 'captionPosition', context);
}

export function validateModsMetadata(metadata, context = relativePath(MODATHON_METADATA_PATH)) {
  assertPlainObject(metadata, context);
  const keys = Object.keys(metadata);
  if (!isDeepStrictEqual(keys, ['generated', 'game'])) {
    fail(context, 'must contain exactly "generated" and "game", in that order');
  }
  assertNonEmptyString(metadata.generated, `${context}.generated`);
  if (Number.isNaN(Date.parse(metadata.generated))) fail(`${context}.generated`, 'must be an ISO-compatible timestamp');
  if (metadata.game !== 'morrowind') fail(`${context}.game`, 'must equal "morrowind"');
}

function validateModjamMetadata(metadata, context = relativePath(MODJAM_METADATA_PATH)) {
  assertPlainObject(metadata, context);
  if (!isDeepStrictEqual(Object.keys(metadata), ['generatedAt', 'listedModderCount'])) {
    fail(context, 'must contain exactly "generatedAt" and "listedModderCount", in that order');
  }
  assertNonEmptyString(metadata.generatedAt, `${context}.generatedAt`);
  if (Number.isNaN(Date.parse(metadata.generatedAt))) {
    fail(`${context}.generatedAt`, 'must be an ISO-compatible timestamp');
  }
  if (!Number.isInteger(metadata.listedModderCount) || metadata.listedModderCount < 0) {
    fail(`${context}.listedModderCount`, 'must be a non-negative integer');
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

async function loadRecordFiles(directory, validate, transform = value => value) {
  const fileNames = await listJsonFiles(directory, relativePath(directory));
  const records = [];
  const files = [];
  for (const fileName of fileNames) {
    const filePath = path.join(directory, fileName);
    const value = await readJson(filePath);
    validate(value, relativePath(filePath));
    records.push(transform(value));
    files.push(filePath);
  }
  return { records, files };
}

function groupedRecords(records, keyFor, valueFor) {
  const groups = new Map();
  records.forEach((record) => {
    const key = String(keyFor(record));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(valueFor(record));
  });
  return groups;
}

export async function loadContentSources() {
  const [metadata, modjamMetadata, modjamEvents, madnessEvents] = await Promise.all([
    readJson(MODATHON_METADATA_PATH),
    readJson(MODJAM_METADATA_PATH),
    readJson(MODJAM_EVENTS_PATH),
    readJson(MADNESS_EVENTS_PATH),
  ]);
  validateModsMetadata(metadata);
  validateModjamMetadata(modjamMetadata);

  const [
    modathonSource,
    modderSource,
    modjamSource,
    madnessModSource,
    madnessTeamSource,
    postcardSource,
  ] = await Promise.all([
    loadRecordFiles(MODATHON_MODS_ROOT, (record, context) => {
      assertPlainObject(record, context);
      assertYear(record.year, `${context}.year`);
      const { year: _year, ...mod } = record;
      validateMod(mod, context);
    }),
    loadRecordFiles(MODDERS_ROOT, validateModder),
    loadRecordFiles(MODJAM_MODS_ROOT, (record, context) => {
      assertPlainObject(record, context);
      assertNonEmptyString(record.eventId, `${context}.eventId`);
      if (!eventIdPattern.test(record.eventId)) fail(`${context}.eventId`, 'must use lowercase letters, numbers, and hyphens');
      const { eventId: _eventId, ...mod } = record;
      validateModjamMod(mod, context);
    }),
    loadRecordFiles(MADNESS_MODS_ROOT, (record, context) => {
      assertPlainObject(record, context);
      assertYear(record.year, `${context}.year`);
      const { year: _year, ...mod } = record;
      validateMadnessMod(mod, context);
    }),
    loadRecordFiles(MADNESS_TEAMS_ROOT, (record, context) => {
      assertPlainObject(record, context);
      assertYear(record.year, `${context}.year`);
      const { year: _year, ...team } = record;
      validateMadnessTeam(team, context);
    }),
    loadRecordFiles(MODJAM_POSTCARDS_ROOT, validatePostcard),
  ]);

  const modderIds = new Map();
  modderSource.records.forEach((modder, index) => {
    const filePath = modderSource.files[index];
    const fileId = path.basename(filePath, '.json');
    if (fileId !== modder.id) {
      fail(relativePath(filePath), `filename must match stable ID "${modder.id}.json"`);
    }
    if (modderIds.has(modder.id)) {
      fail(relativePath(filePath), `duplicates stable modder ID also used by ${modderIds.get(modder.id)}`);
    }
    modderIds.set(modder.id, relativePath(filePath));
  });

  const modsByYear = groupedRecords(
    modathonSource.records,
    record => record.year,
    record => {
      const { year: _year, ...mod } = record;
      return mod;
    },
  );
  const modjamModsByEvent = groupedRecords(
    modjamSource.records,
    record => record.eventId,
    record => {
      const { eventId: _eventId, ...mod } = record;
      return mod;
    },
  );
  const madnessModsByYear = groupedRecords(
    madnessModSource.records,
    record => record.year,
    record => {
      const { year: _year, ...mod } = record;
      return mod;
    },
  );
  const madnessTeamsByYear = groupedRecords(
    madnessTeamSource.records,
    record => record.year,
    record => {
      const { year: _year, ...team } = record;
      return team;
    },
  );

  validateAuthorReferences(modsByYear, modderSource.records);
  validateIdReferences(
    modjamSource.records.flatMap(record => record.authors.map(author => author.id)),
    modderIds,
    'Modjam authors',
  );
  validateIdReferences(
    madnessTeamSource.records.flatMap(record => record.members.map(member => member.id)),
    modderIds,
    'Madness team members',
  );

  const eventIds = new Set((modjamEvents.events || []).map(event => event.id));
  for (const eventId of modjamModsByEvent.keys()) {
    if (!eventIds.has(eventId)) fail(relativePath(MODJAM_MODS_ROOT), `references unknown Modjam event "${eventId}"`);
  }
  const entryIds = new Set(modjamSource.records.map(record => record.id));
  postcardSource.records.forEach((postcard, index) => {
    if (!entryIds.has(postcard.entryId)) {
      fail(relativePath(postcardSource.files[index]), `references unknown Modjam entry "${postcard.entryId}"`);
    }
  });

  return {
    metadata,
    modjamMetadata,
    modjamEvents,
    madnessEvents,
    modsByYear,
    modders: modderSource.records,
    modRecords: modathonSource.records,
    modFiles: modathonSource.files,
    modderFiles: modderSource.files,
    modjamModsByEvent,
    modjamModRecords: modjamSource.records,
    modjamModFiles: modjamSource.files,
    madnessModsByYear,
    madnessModRecords: madnessModSource.records,
    madnessModFiles: madnessModSource.files,
    madnessTeamsByYear,
    madnessTeamRecords: madnessTeamSource.records,
    madnessTeamFiles: madnessTeamSource.files,
    postcards: postcardSource.records,
    postcardFiles: postcardSource.files,
  };
}

function validateIdReferences(ids, knownIds, context) {
  ids.forEach((id, index) => {
    if (!knownIds.has(id)) fail(`${context}[${index}]`, `references unknown central modder ID "${id}"`);
  });
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
            `content/modathon/mods record ${modIndex + 1} (${year}).authors[${authorIndex}]`,
            `does not resolve to a central modder name or alias: ${JSON.stringify(author)}`,
          );
        }
      });
    });
  }
}

function buildModjamSummary(events, listedModderCount) {
  const entries = events.flatMap(event => event.mods || []);
  const modderCount = new Set(
    entries.flatMap(entry => (entry.authors || []).map(author => author.id || author)),
  ).size;
  return {
    eventCount: events.length,
    entryCount: entries.length,
    modderCount,
    listedModderCount: Math.min(listedModderCount, modderCount),
    placementCount: entries.filter(entry => entry.placement).length,
    judgeAwardCount: entries.reduce(
      (count, entry) => count + (Array.isArray(entry.awards) ? entry.awards.length : 0),
      0,
    ),
    placardCount: entries.filter(entry => entry.awardPlacardUrl).length,
    categories: [...new Set(entries.map(entry => entry.category).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right)),
  };
}

export function buildContentDocuments(sources) {
  const mods = {};
  for (const [year, records] of [...sources.modsByYear].sort(([a], [b]) => Number(a) - Number(b))) {
    mods[year] = records;
  }

  const sortedModders = sources.modders.slice().sort((left, right) => (
    modderCollator.compare(left.name, right.name)
    || compareFileNames(left.id, right.id)
  ));

  const modjamEventOrder = (sources.modjamEvents.events || []).map(event => event.id);
  const modjamEvents = modjamEventOrder.map(id => ({
    id,
    mods: sources.modjamModsByEvent.get(id) || [],
  }));

  const madnessYears = [...new Set([
    ...(sources.madnessEvents.events || []).map(event => String(event.year)),
    ...sources.madnessModsByYear.keys(),
    ...sources.madnessTeamsByYear.keys(),
  ])].sort((left, right) => Number(left) - Number(right));
  const madnessModsDocument = {
    years: madnessYears.map(year => ({
      year: Number(year),
      mods: sources.madnessModsByYear.get(String(year)) || [],
    })),
  };
  const modsByYearAndName = new Map(madnessModsDocument.years.map(group => [
    group.year,
    new Map(group.mods.map(mod => [mod.name, mod])),
  ]));
  const madnessTeamsDocument = {
    years: madnessYears.map(year => ({
      year: Number(year),
      teams: (sources.madnessTeamsByYear.get(String(year)) || []).map(team => ({
        ...team,
        mods: team.mods.map(mod => ({
          name: mod.name,
          url: modsByYearAndName.get(Number(year))?.get(mod.name)?.url ?? null,
        })),
      })),
    })),
  };

  return {
    modsDocument: {
      generated: sources.metadata.generated,
      game: sources.metadata.game,
      mods,
    },
    moddersDocument: { modders: sortedModders },
    modjamModsDocument: {
      generatedAt: sources.modjamMetadata.generatedAt,
      summary: buildModjamSummary(modjamEvents, sources.modjamMetadata.listedModderCount),
      events: modjamEvents,
    },
    madnessModsDocument,
    madnessTeamsDocument,
    postcardsDocument: { postcards: sources.postcards },
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
  if (!Array.isArray(moddersDocument.modders)) fail(`${context} modder document.modders`, 'must be an array');
  const ids = new Set();
  moddersDocument.modders.forEach((modder, index) => {
    validateModder(modder, `${context} modder record ${index + 1}`);
    if (ids.has(modder.id)) fail(`${context} modder document`, `duplicates stable ID "${modder.id}"`);
    ids.add(modder.id);
  });
  validateAuthorReferences(modsByYear, moddersDocument.modders);
}

export function validateGeneratedSiteDocuments(documents, context = 'generated content') {
  validateGeneratedDocuments(documents.modsDocument, documents.moddersDocument, context);

  const { modjamModsDocument, madnessModsDocument, madnessTeamsDocument, postcardsDocument } = documents;
  assertPlainObject(modjamModsDocument, `${context} Modjam mods`);
  if (!isDeepStrictEqual(Object.keys(modjamModsDocument), ['generatedAt', 'summary', 'events'])) {
    fail(`${context} Modjam mods`, 'must contain exactly "generatedAt", "summary", and "events"');
  }
  if (!Array.isArray(modjamModsDocument.events)) fail(`${context} Modjam mods.events`, 'must be an array');
  const modjamIds = new Set();
  modjamModsDocument.events.forEach((group, groupIndex) => {
    assertPlainObject(group, `${context} Modjam event group ${groupIndex + 1}`);
    if (!isDeepStrictEqual(Object.keys(group), ['id', 'mods'])) {
      fail(`${context} Modjam event group ${groupIndex + 1}`, 'must contain exactly "id" and "mods"');
    }
    assertNonEmptyString(group.id, `${context} Modjam event group ${groupIndex + 1}.id`);
    if (!Array.isArray(group.mods)) fail(`${context} Modjam ${group.id}.mods`, 'must be an array');
    group.mods.forEach((mod, index) => {
      validateModjamMod(mod, `${context} Modjam ${group.id} record ${index + 1}`);
      if (modjamIds.has(mod.id)) fail(`${context} Modjam mods`, `duplicates entry ID "${mod.id}"`);
      modjamIds.add(mod.id);
    });
  });

  for (const [label, document, listName, validate] of [
    ['Madness mods', madnessModsDocument, 'mods', validateMadnessMod],
    ['Madness teams', madnessTeamsDocument, 'teams', (team, itemContext) => (
      validateMadnessTeam(team, itemContext, { generated: true })
    )],
  ]) {
    assertPlainObject(document, `${context} ${label}`);
    if (!isDeepStrictEqual(Object.keys(document), ['years'])) {
      fail(`${context} ${label}`, 'must contain exactly "years"');
    }
    if (!Array.isArray(document.years)) fail(`${context} ${label}.years`, 'must be an array');
    document.years.forEach((group, groupIndex) => {
      assertPlainObject(group, `${context} ${label} year ${groupIndex + 1}`);
      if (!isDeepStrictEqual(Object.keys(group), ['year', listName])) {
        fail(`${context} ${label} year ${groupIndex + 1}`, `must contain exactly "year" and "${listName}"`);
      }
      assertYear(group.year, `${context} ${label} year ${groupIndex + 1}.year`);
      if (!Array.isArray(group[listName])) fail(`${context} ${label} ${group.year}.${listName}`, 'must be an array');
      group[listName].forEach((record, index) => validate(
        record,
        `${context} ${label} ${group.year} record ${index + 1}`,
      ));
    });
  }

  assertPlainObject(postcardsDocument, `${context} postcards`);
  if (!isDeepStrictEqual(Object.keys(postcardsDocument), ['postcards'])) {
    fail(`${context} postcards`, 'must contain exactly "postcards"');
  }
  if (!Array.isArray(postcardsDocument.postcards)) fail(`${context} postcards.postcards`, 'must be an array');
  postcardsDocument.postcards.forEach((postcard, index) => (
    validatePostcard(postcard, `${context} postcard ${index + 1}`)
  ));
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
  for (const group of documents.modjamModsDocument.events) {
    if (!isDeepStrictEqual(group.mods, sources.modjamModsByEvent.get(group.id) || [])) {
      fail('content build', `changed Modjam records while grouping event ${group.id}`);
    }
  }
  for (const group of documents.madnessModsDocument.years) {
    if (!isDeepStrictEqual(group.mods, sources.madnessModsByYear.get(String(group.year)) || [])) {
      fail('content build', `changed Madness mod records while grouping year ${group.year}`);
    }
  }
  const expectedPostcards = sources.postcards;
  if (!isDeepStrictEqual(documents.postcardsDocument.postcards, expectedPostcards)) {
    fail('content build', 'changed postcard records while assembling the manifest');
  }

  for (const [label, value] of [
    ['Modathon', documents.modsDocument],
    ['modder', documents.moddersDocument],
    ['Modjam', documents.modjamModsDocument],
    ['Madness mods', documents.madnessModsDocument],
    ['Madness teams', documents.madnessTeamsDocument],
    ['postcard', documents.postcardsDocument],
  ]) {
    const reparsed = JSON.parse(canonicalJson(value));
    if (!isDeepStrictEqual(reparsed, value)) {
      fail('content build', `${label} data changed during its JSON round trip`);
    }
  }
}
