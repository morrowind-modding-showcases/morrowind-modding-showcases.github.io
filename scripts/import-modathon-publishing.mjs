#!/usr/bin/env node

import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const REQUIRED_SHEETS = ['Events', 'Modders', 'Entries', 'Achievements', 'Media'];
const DERIVED_MOD_FIELDS = [
  'downloads',
  'uniqueDownloads',
  'endorsements',
  'available',
  'pictureUrl',
  'nexusCategory',
  'status',
  'error',
];

export class PublishingValidationError extends Error {
  constructor(messages) {
    super(messages.join('\n'));
    this.name = 'PublishingValidationError';
    this.messages = messages;
  }
}

export function parseCsv(source) {
  const text = String(source || '').replace(/^\uFEFF/, '');
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;

  function pushRecord() {
    record.push(field);
    field = '';
    if (record.some(value => value.trim())) records.push(record.map(value => value.trim()));
    record = [];
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field === '') {
      quoted = true;
    } else if (character === ',') {
      record.push(field);
      field = '';
    } else if (character === '\n') {
      pushRecord();
    } else if (character === '\r') {
      if (text[index + 1] === '\n') index += 1;
      pushRecord();
    } else {
      field += character;
    }
  }

  if (quoted) throw new PublishingValidationError(['CSV contains an unterminated quoted value']);
  if (field || record.length) pushRecord();
  if (!records.length) return { headers: [], rows: [] };

  const headers = records.shift();
  const duplicateHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicateHeaders.length) {
    throw new PublishingValidationError([`CSV has duplicate headers: ${[...new Set(duplicateHeaders)].join(', ')}`]);
  }

  const rows = records.map((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new PublishingValidationError([
        `CSV row ${rowIndex + 2} has ${values.length} values; expected ${headers.length}`,
      ]);
    }
    return Object.fromEntries(headers.map((header, columnIndex) => [header, values[columnIndex]]));
  });

  return { headers, rows };
}

export function splitList(value) {
  return String(value || '')
    .split(';')
    .map(item => item.trim())
    .filter(Boolean);
}

export function splitIdList(value) {
  return String(value || '')
    .split(/[;,]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateValue(value, column, location, errors) {
  if (!value) {
    if (column.required) errors.push(`${location}: ${column.name} is required`);
    return;
  }

  if (column.type === 'id' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    errors.push(`${location}: ${column.name} must use lowercase letters, numbers, and hyphens`);
  }
  if (column.type === 'id_list') {
    const invalid = splitIdList(value).filter(item => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item));
    if (invalid.length) errors.push(`${location}: ${column.name} contains invalid IDs: ${invalid.join(', ')}`);
  }
  if (column.type === 'integer' && !/^-?\d+$/.test(value)) {
    errors.push(`${location}: ${column.name} must be a whole number`);
  }
  if (column.type === 'datetime' && !Number.isFinite(Date.parse(value))) {
    errors.push(`${location}: ${column.name} must be an ISO date and time`);
  }
  if (column.type === 'url' && !isHttpUrl(value)) {
    errors.push(`${location}: ${column.name} must be an http or https URL`);
  }
  if (
    column.type === 'path'
    && (path.isAbsolute(value) || value.split(/[\\/]+/).includes('..'))
  ) {
    errors.push(`${location}: ${column.name} must be a repository-relative path`);
  }
  if (column.type === 'enum' && !column.values.includes(value)) {
    errors.push(`${location}: ${column.name} must be one of ${column.values.join(', ')}`);
  }
}

function validateSheet(sheetName, sheetSchema, parsed) {
  const errors = [];
  const expectedHeaders = sheetSchema.columns.map(column => column.name);
  if (JSON.stringify(parsed.headers) !== JSON.stringify(expectedHeaders)) {
    errors.push(
      `${sheetName}: headers must be exactly ${expectedHeaders.join(', ')}`,
    );
    return errors;
  }

  const seenKeys = new Set();
  parsed.rows.forEach((row, index) => {
    const location = `${sheetName} row ${index + 2}`;
    sheetSchema.columns.forEach(column => {
      const allowsUnavailableArchiveUrl = (
        sheetName === 'Entries'
        && row.status === 'withdrawn'
        && column.name === 'nexus_url'
      );
      validateValue(
        row[column.name],
        allowsUnavailableArchiveUrl ? { ...column, required: false } : column,
        location,
        errors,
      );
    });
    const key = sheetSchema.primaryKey.map(column => row[column]).join('\u0000');
    if (seenKeys.has(key)) errors.push(`${location}: duplicate primary key`);
    seenKeys.add(key);
  });
  return errors;
}

export async function loadPublishingDirectory(
  sourceDirectory,
  {
    schemaPath = path.resolve('publishing/schema-v1.json'),
    requiredSheets = REQUIRED_SHEETS,
  } = {},
) {
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const sheets = {};
  const errors = [];

  for (const sheetName of requiredSheets) {
    const sheetSchema = schema.sheets[sheetName];
    if (!sheetSchema) {
      errors.push(`Schema does not define ${sheetName}`);
      continue;
    }

    const filePath = path.join(sourceDirectory, sheetSchema.fileName);
    let parsed;
    try {
      parsed = parseCsv(await readFile(filePath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') errors.push(`${sheetName}: missing ${sheetSchema.fileName}`);
      else if (error instanceof PublishingValidationError) {
        errors.push(...error.messages.map(message => `${sheetName}: ${message}`));
      } else throw error;
      continue;
    }
    errors.push(...validateSheet(sheetName, sheetSchema, parsed));
    sheets[sheetName] = parsed.rows;
  }

  if (errors.length) throw new PublishingValidationError(errors);
  return { schema, sheets };
}

function identityKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '');
}

function normalizedUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    return url.href.replace(/\/+$/, '').toLocaleLowerCase('en-US');
  } catch {
    return '';
  }
}

export function nexusIdFor(value) {
  return String(value || '').match(/nexusmods\.com\/morrowind\/mods\/(\d+)/i)?.[1] || null;
}

function includeContentRow(row, mode, excludedStatuses) {
  if (mode === 'publish') return row.status === 'published';
  return !excludedStatuses.includes(row.status);
}

function preservedModMetadata(existing) {
  if (!existing) return {};
  return Object.fromEntries(
    DERIVED_MOD_FIELDS
      .filter(field => Object.hasOwn(existing, field))
      .map(field => [field, existing[field]]),
  );
}

function findExistingPersonIndex(modders, person) {
  const profileUrl = normalizedUrl(person.nexus_profile_url);
  if (profileUrl) {
    const byUrl = modders.findIndex(candidate => normalizedUrl(candidate.url) === profileUrl);
    if (byUrl >= 0) return byUrl;
  }

  const sourceNames = new Set(
    [person.display_name, ...splitList(person.aliases)].map(identityKey).filter(Boolean),
  );
  return modders.findIndex((candidate) => (
    [candidate.name, ...(candidate.aliases || [])]
      .map(identityKey)
      .some(name => sourceNames.has(name))
  ));
}

function upsertPeople(existingModders, sourcePeople, referencedPersonIds) {
  const modders = existingModders.map(modder => ({
    ...modder,
    ...(Array.isArray(modder.aliases) ? { aliases: [...modder.aliases] } : {}),
  }));

  for (const person of sourcePeople) {
    if (!referencedPersonIds.has(person.person_id)) continue;
    const sourceAliases = splitList(person.aliases);
    const existingIndex = findExistingPersonIndex(modders, person);

    if (existingIndex < 0) {
      const created = {
        name: person.display_name,
        url: person.nexus_profile_url || null,
        avatar: person.avatar_url || null,
      };
      if (sourceAliases.length) created.aliases = sourceAliases;
      modders.push(created);
      continue;
    }

    const existing = modders[existingIndex];
    const aliases = new Set([
      ...(existing.aliases || []),
      ...sourceAliases,
      ...(identityKey(existing.name) !== identityKey(person.display_name) ? [existing.name] : []),
    ]);
    aliases.delete(person.display_name);
    modders[existingIndex] = {
      ...existing,
      name: person.display_name,
      url: person.nexus_profile_url || existing.url || null,
      avatar: person.avatar_url || existing.avatar || null,
      ...(aliases.size ? { aliases: [...aliases] } : {}),
    };
  }

  return modders;
}

function validateEvent(event, errors) {
  if (event.event_type !== 'modathon') errors.push(`${event.event_id}: event_type must be modathon`);
  const year = Number(event.year);
  const dates = ['start_at', 'end_at', 'grace_end_at'].map(field => ({
    field,
    value: Date.parse(event[field]),
  }));
  dates.forEach(date => {
    if (!Number.isFinite(date.value)) errors.push(`${event.event_id}: ${date.field} is required for Modathon`);
    else if (new Date(date.value).getUTCFullYear() !== year) {
      errors.push(`${event.event_id}: ${date.field} must occur in ${year}`);
    }
  });
  if (dates.every(date => Number.isFinite(date.value))) {
    if (!(dates[0].value < dates[1].value && dates[1].value < dates[2].value)) {
      errors.push(`${event.event_id}: start_at, end_at, and grace_end_at must be in chronological order`);
    }
  }
}

export function buildModathonUpdate(
  publishing,
  current,
  {
    eventId,
    mode = 'draft',
    allowRemovals = false,
    generatedAt = new Date().toISOString(),
  },
) {
  if (!['draft', 'publish'].includes(mode)) {
    throw new PublishingValidationError([`Unsupported import mode: ${mode}`]);
  }

  const errors = [];
  const warnings = [];
  const { Events, Modders, Entries, Achievements, Media } = publishing.sheets;
  const event = Events.find(candidate => candidate.event_id === eventId);
  if (!event) throw new PublishingValidationError([`Events does not contain ${eventId}`]);
  validateEvent(event, errors);
  if (mode === 'publish' && event.status !== 'published') {
    errors.push(`${eventId}: final imports require the event status to be published`);
  }

  const peopleById = new Map(Modders.map(person => [person.person_id, person]));
  const mediaById = new Map(Media.map(item => [item.media_id, item]));
  const targetEntries = Entries
    .filter(row => row.event_id === eventId)
    .filter(row => includeContentRow(row, mode, ['withdrawn']));
  const targetAchievements = Achievements
    .filter(row => row.event_id === eventId)
    .filter(row => includeContentRow(row, mode, ['retired']));
  const referencedPersonIds = new Set();
  const seenNexusIds = new Set();

  targetEntries.forEach(entry => {
    const authorIds = splitIdList(entry.author_ids);
    if (!authorIds.length) errors.push(`${entry.entry_id}: at least one author_id is required`);
    authorIds.forEach(personId => {
      referencedPersonIds.add(personId);
      if (!peopleById.has(personId)) errors.push(`${entry.entry_id}: unknown author ID ${personId}`);
    });
    const nexusId = nexusIdFor(entry.nexus_url);
    if (!nexusId) errors.push(`${entry.entry_id}: nexus_url must be a Morrowind Nexus mod URL`);
    else if (seenNexusIds.has(nexusId)) errors.push(`${entry.entry_id}: duplicate Nexus mod ID ${nexusId}`);
    else seenNexusIds.add(nexusId);
  });

  targetAchievements.forEach(achievement => {
    splitIdList(achievement.unlocker_ids).forEach(personId => {
      referencedPersonIds.add(personId);
      if (!peopleById.has(personId)) errors.push(`${achievement.achievement_id}: unknown unlocker ID ${personId}`);
    });
    const media = mediaById.get(achievement.media_id);
    if (!media) {
      errors.push(`${achievement.achievement_id}: unknown media ID ${achievement.media_id}`);
    } else {
      if (media.event_id !== eventId) errors.push(`${achievement.achievement_id}: media belongs to another event`);
      if (media.media_type !== 'achievement') errors.push(`${achievement.achievement_id}: media must have type achievement`);
      if (mode === 'publish' && media.status !== 'published') {
        errors.push(`${achievement.achievement_id}: media must be published for a final import`);
      } else if (mode === 'draft' && media.status !== 'published') {
        warnings.push(`${achievement.achievement_id}: media is not published yet`);
      }
    }
  });

  const year = Number(event.year);
  const oldYearEntries = current.nexusStats.mods?.[String(year)] || [];
  if (oldYearEntries.length && targetEntries.length < oldYearEntries.length && !allowRemovals) {
    errors.push(
      `${eventId}: import has ${targetEntries.length} entries but the current year has `
      + `${oldYearEntries.length}; use --allow-removals only after reviewing the deletion`,
    );
  }

  if (errors.length) throw new PublishingValidationError(errors);

  const existingModsByNexusId = new Map(
    oldYearEntries
      .map(mod => [nexusIdFor(mod.url), mod])
      .filter(([nexusId]) => nexusId),
  );
  const mods = targetEntries.map(entry => {
    const authorIds = splitIdList(entry.author_ids);
    const authors = authorIds.map(personId => peopleById.get(personId).display_name);
    const existing = existingModsByNexusId.get(nexusIdFor(entry.nexus_url));
    return {
      name: entry.title,
      authors,
      category: entry.category,
      url: entry.nexus_url,
      ...preservedModMetadata(existing),
    };
  });

  const nextModsByYear = {
    ...(current.nexusStats.mods || {}),
    [String(year)]: mods,
  };
  const nexusStats = {
    ...current.nexusStats,
    generated: generatedAt,
    mods: Object.fromEntries(
      Object.entries(nextModsByYear).sort(([left], [right]) => Number(left) - Number(right)),
    ),
  };

  const achievementRecords = targetAchievements.map(achievement => {
    const media = mediaById.get(achievement.media_id);
    const unlockedBy = splitIdList(achievement.unlocker_ids)
      .map(personId => peopleById.get(personId).display_name);
    const record = {
      id: achievement.achievement_id,
      name: achievement.name,
      requirement: achievement.requirement,
    };
    if (achievement.mastery_name) record.masteryName = achievement.mastery_name;
    record.rarity = achievement.rarity || null;
    record.rarityKey = achievement.rarity_key;
    record.group = achievement.group;
    record.imageUrl = media.published_path.replaceAll('\\', '/');
    record.unlockedBy = unlockedBy;
    record.unlockedCount = unlockedBy.length;
    return record;
  });

  const achievements = {
    schemaVersion: 1,
    event: {
      name: 'Morrowind Modathon',
      year,
    },
    achievements: achievementRecords,
  };

  const modders = {
    ...current.modders,
    modders: upsertPeople(current.modders.modders || [], Modders, referencedPersonIds),
  };

  return {
    event,
    year,
    mode,
    nexusStats,
    modders,
    achievements,
    warnings,
    summary: {
      eventId,
      year,
      entryCount: mods.length,
      achievementCount: achievementRecords.length,
      referencedPersonCount: referencedPersonIds.size,
      retainedNexusMetadataCount: mods.filter(mod => (
        DERIVED_MOD_FIELDS.some(field => Object.hasOwn(mod, field))
      )).length,
    },
  };
}

export async function readCurrentModathonData(dataDirectory, year) {
  const [nexusStatsRaw, moddersRaw] = await Promise.all([
    readFile(path.join(dataDirectory, 'nexus-stats.json'), 'utf8'),
    readFile(path.join(dataDirectory, 'modders.json'), 'utf8'),
  ]);
  let achievements;
  try {
    achievements = JSON.parse(await readFile(path.join(dataDirectory, `${year}-achievements.json`), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    achievements = null;
  }
  return {
    nexusStats: JSON.parse(nexusStatsRaw),
    modders: JSON.parse(moddersRaw),
    achievements,
  };
}

export async function validatePublishedMedia(
  result,
  {
    repoRoot,
    strict = result.mode === 'publish',
  },
) {
  const missing = [];
  for (const achievement of result.achievements.achievements) {
    const absolutePath = path.resolve(repoRoot, 'modathon', achievement.imageUrl);
    const modathonRoot = path.resolve(repoRoot, 'modathon') + path.sep;
    if (!absolutePath.startsWith(modathonRoot)) {
      missing.push(`${achievement.id}: image path leaves the Modathon directory`);
      continue;
    }
    try {
      await access(absolutePath);
    } catch {
      missing.push(`${achievement.id}: missing ${achievement.imageUrl}`);
    }
  }
  if (strict && missing.length) throw new PublishingValidationError(missing);
  return missing;
}

export async function writeModathonUpdate(result, dataDirectory) {
  await Promise.all([
    writeFile(
      path.join(dataDirectory, 'nexus-stats.json'),
      `${JSON.stringify(result.nexusStats, null, 2)}\n`,
    ),
    writeFile(
      path.join(dataDirectory, 'modders.json'),
      `${JSON.stringify(result.modders, null, 2)}\n`,
    ),
    writeFile(
      path.join(dataDirectory, `${result.year}-achievements.json`),
      `${JSON.stringify(result.achievements, null, 2)}\n`,
    ),
  ]);
}

function parseArguments(argv) {
  const options = {
    sourceDirectory: null,
    eventId: null,
    mode: 'draft',
    dryRun: false,
    allowRemovals: false,
    dataDirectory: path.resolve('modathon/assets/data'),
    schemaPath: path.resolve('publishing/schema-v1.json'),
    repoRoot: path.resolve('.'),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('-') && !options.sourceDirectory) {
      options.sourceDirectory = path.resolve(argument);
    } else if (argument === '--event') {
      options.eventId = argv[++index];
    } else if (argument === '--mode') {
      options.mode = argv[++index];
    } else if (argument === '--data-dir') {
      options.dataDirectory = path.resolve(argv[++index]);
    } else if (argument === '--schema') {
      options.schemaPath = path.resolve(argv[++index]);
    } else if (argument === '--repo-root') {
      options.repoRoot = path.resolve(argv[++index]);
    } else if (argument === '--dry-run') {
      options.dryRun = true;
    } else if (argument === '--allow-removals') {
      options.allowRemovals = true;
    } else {
      throw new PublishingValidationError([`Unknown argument: ${argument}`]);
    }
  }

  if (!options.sourceDirectory || !options.eventId) {
    throw new PublishingValidationError([
      'Usage: node scripts/import-modathon-publishing.mjs <csv-directory> '
      + '--event <event-id> [--mode draft|publish] [--dry-run] [--allow-removals]',
    ]);
  }
  return options;
}

function printSummary(result, { dryRun, missingMedia }) {
  const summary = result.summary;
  console.log(`${summary.eventId} (${result.mode})`);
  console.log(`Entries: ${summary.entryCount}`);
  console.log(`Achievements: ${summary.achievementCount}`);
  console.log(`Referenced people: ${summary.referencedPersonCount}`);
  console.log(`Entries retaining Nexus metadata: ${summary.retainedNexusMetadataCount}`);
  [...result.warnings, ...missingMedia].forEach(warning => console.warn(`Warning: ${warning}`));
  console.log(dryRun ? 'Dry run complete; no files were changed.' : 'Modathon data files updated.');
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const publishing = await loadPublishingDirectory(options.sourceDirectory, {
    schemaPath: options.schemaPath,
  });
  const event = publishing.sheets.Events.find(candidate => candidate.event_id === options.eventId);
  if (!event) throw new PublishingValidationError([`Events does not contain ${options.eventId}`]);
  const current = await readCurrentModathonData(options.dataDirectory, Number(event.year));
  const result = buildModathonUpdate(publishing, current, {
    eventId: options.eventId,
    mode: options.mode,
    allowRemovals: options.allowRemovals,
  });
  const missingMedia = await validatePublishedMedia(result, {
    repoRoot: options.repoRoot,
  });
  if (!options.dryRun) await writeModathonUpdate(result, options.dataDirectory);
  printSummary(result, { dryRun: options.dryRun, missingMedia });
  return result;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch(error => {
    if (error instanceof PublishingValidationError) {
      error.messages.forEach(message => console.error(`Error: ${message}`));
      process.exitCode = 1;
      return;
    }
    throw error;
  });
}
