import { access, mkdir, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
  CONTENT_ROOT,
  GENERATED_MADNESS_MODS_PATH,
  GENERATED_MADNESS_TEAMS_PATH,
  GENERATED_MODDERS_PATH,
  GENERATED_MODJAM_MODS_PATH,
  GENERATED_MODJAM_POSTCARDS_PATH,
  GENERATED_MODS_PATH,
  MADNESS_EVENTS_PATH,
  MADNESS_EVENTS_ROOT,
  MADNESS_MODS_ROOT,
  MADNESS_TEAMS_ROOT,
  MODATHON_ACHIEVEMENTS_ROOT,
  MODATHON_EVENTS_PATH,
  MODATHON_EVENTS_ROOT,
  MODATHON_METADATA_PATH,
  MODATHON_MODS_ROOT,
  MODDERS_ROOT,
  MODJAM_METADATA_PATH,
  MODJAM_EVENTS_PATH,
  MODJAM_EVENTS_ROOT,
  MODJAM_MODS_ROOT,
  MODJAM_POSTCARDS_ROOT,
  canonicalJson,
  loadGeneratedAchievementDocuments,
  readJson,
  relativePath,
  validateGeneratedSiteDocuments,
} from './content-lib.mjs';

const LEGACY_MODS_ROOT = path.join(CONTENT_ROOT, 'mods');
const LEGACY_METADATA_PATH = path.join(CONTENT_ROOT, 'mods-metadata.json');

function slug(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function nexusId(url) {
  return String(url || '').match(/nexusmods\.com\/morrowind\/mods\/(\d+)/i)?.[1] || '';
}

function numberedFileName(prefix, index, stablePart, width = 4) {
  return `${prefix}-${String(index + 1).padStart(width, '0')}-${stablePart || 'record'}.json`;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function existingJsonFiles(directory) {
  if (!(await exists(directory))) return [];
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries
    .filter(entry => entry.isFile() && path.extname(entry.name) === '.json')
    .map(entry => path.join(entry.parentPath || entry.path, entry.name));
}

async function mapLimit(values, limit, callback) {
  const items = [...values];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await callback(items[index], index);
    }
  });
  await Promise.all(workers);
}

function addPlannedFile(plan, seenNames, filePath, value) {
  const collisionKey = filePath.toLocaleLowerCase('en-US');
  if (seenNames.has(collisionKey)) {
    throw new Error(
      `Filename collision: ${relativePath(filePath)} conflicts with ${relativePath(seenNames.get(collisionKey))}`,
    );
  }
  seenNames.set(collisionKey, filePath);
  plan.set(filePath, value);
}

async function preflight(plan) {
  const conflicts = [];
  await mapLimit(plan, 32, async ([filePath, value]) => {
    if (!(await exists(filePath))) return;
    let current;
    try {
      current = await readJson(filePath);
    } catch (error) {
      conflicts.push(error.message);
      return;
    }
    if (!isDeepStrictEqual(current, value)) {
      conflicts.push(`${relativePath(filePath)} already exists with different content`);
    }
  });

  const plannedNames = new Set([...plan.keys()].map(filePath => filePath.toLocaleLowerCase('en-US')));
  for (const directory of [
    MODATHON_MODS_ROOT,
    MODATHON_ACHIEVEMENTS_ROOT,
    MODATHON_EVENTS_ROOT,
    MODJAM_MODS_ROOT,
    MODJAM_EVENTS_ROOT,
    MADNESS_EVENTS_ROOT,
    MADNESS_MODS_ROOT,
    MADNESS_TEAMS_ROOT,
    MODJAM_POSTCARDS_ROOT,
    MODDERS_ROOT,
  ]) {
    for (const filePath of await existingJsonFiles(directory)) {
      if (!plannedNames.has(filePath.toLocaleLowerCase('en-US'))) {
        conflicts.push(`${relativePath(filePath)} is not part of the migration output`);
      }
    }
  }

  if (conflicts.length) {
    throw new Error(`Migration stopped without overwriting conflicting files:\n- ${conflicts.join('\n- ')}`);
  }
}

export async function main() {
  const [
    modathonEventsDocument,
    modjamEventsDocument,
    modsDocument,
    moddersDocument,
    modjamModsDocument,
    madnessModsDocument,
    madnessTeamsDocument,
    madnessEventsDocument,
    postcardsDocument,
    achievementDocuments,
  ] = await Promise.all([
    readJson(MODATHON_EVENTS_PATH),
    readJson(MODJAM_EVENTS_PATH),
    readJson(GENERATED_MODS_PATH),
    readJson(GENERATED_MODDERS_PATH),
    readJson(GENERATED_MODJAM_MODS_PATH),
    readJson(GENERATED_MADNESS_MODS_PATH),
    readJson(GENERATED_MADNESS_TEAMS_PATH),
    readJson(MADNESS_EVENTS_PATH),
    readJson(GENERATED_MODJAM_POSTCARDS_PATH),
    loadGeneratedAchievementDocuments().then(source => source.records),
  ]);
  validateGeneratedSiteDocuments({
    modathonEventsDocument,
    modjamEventsDocument,
    modsDocument,
    moddersDocument,
    modjamModsDocument,
    madnessModsDocument,
    madnessTeamsDocument,
    madnessEventsDocument,
    postcardsDocument,
    achievementDocuments,
  }, 'migration input');

  const plan = new Map();
  const seenNames = new Map();
  addPlannedFile(plan, seenNames, MODATHON_METADATA_PATH, {
    generated: modsDocument.generated,
    game: modsDocument.game,
  });
  addPlannedFile(plan, seenNames, MODJAM_METADATA_PATH, {
    generatedAt: modjamModsDocument.generatedAt,
    listedModderCount: modjamModsDocument.summary.listedModderCount,
  });

  for (const event of modathonEventsDocument.events || []) {
    const { name: _name, ...sourceEvent } = event;
    addPlannedFile(
      plan,
      seenNames,
      path.join(MODATHON_EVENTS_ROOT, `${event.year}.json`),
      {
        schemaVersion: modathonEventsDocument.schemaVersion,
        eventType: modathonEventsDocument.eventType,
        ...sourceEvent,
      },
    );
  }

  for (const event of modjamEventsDocument.events || []) {
    const {
      id,
      label: _label,
      name: _name,
      competitionLabel: _competitionLabel,
      competitionNote: _competitionNote,
      ...sourceEvent
    } = event;
    addPlannedFile(
      plan,
      seenNames,
      path.join(MODJAM_EVENTS_ROOT, `${id}.json`),
      {
        schemaVersion: modjamEventsDocument.schemaVersion,
        eventType: modjamEventsDocument.eventType,
        ...sourceEvent,
      },
    );
  }

  for (const event of madnessEventsDocument.events || []) {
    const { name: _name, ...sourceEvent } = event;
    addPlannedFile(
      plan,
      seenNames,
      path.join(MADNESS_EVENTS_ROOT, `${event.year}.json`),
      {
        schemaVersion: madnessEventsDocument.schemaVersion,
        eventType: madnessEventsDocument.eventType,
        ...sourceEvent,
      },
    );
  }

  for (const document of achievementDocuments) {
    for (const achievement of document.achievements) {
      addPlannedFile(
        plan,
        seenNames,
        path.join(
          MODATHON_ACHIEVEMENTS_ROOT,
          String(document.event.year),
          `${document.event.year}-${achievement.id}.json`,
        ),
        {
          schemaVersion: document.schemaVersion,
          year: document.event.year,
          ...achievement,
        },
      );
    }
  }

  for (const [year, mods] of Object.entries(modsDocument.mods)) {
    mods.forEach((mod, index) => {
      addPlannedFile(
        plan,
        seenNames,
        path.join(
          MODATHON_MODS_ROOT,
          year,
          numberedFileName(year, index, nexusId(mod.url) || slug(mod.name)),
        ),
        { year: Number(year), ...mod },
      );
    });
  }

  modjamModsDocument.events.forEach((event, eventIndex) => {
    event.mods.forEach((mod, modIndex) => {
      addPlannedFile(
        plan,
        seenNames,
        path.join(
          MODJAM_MODS_ROOT,
          event.id,
          numberedFileName(
            String(eventIndex + 1).padStart(2, '0'),
            modIndex,
            mod.id,
            3,
          ),
        ),
        { eventId: event.id, ...mod },
      );
    });
  });

  madnessModsDocument.years.forEach((group) => {
    group.mods.forEach((mod, index) => {
      addPlannedFile(
        plan,
        seenNames,
        path.join(
          MADNESS_MODS_ROOT,
          String(group.year),
          numberedFileName(group.year, index, nexusId(mod.url) || slug(mod.name), 3),
        ),
        { year: Number(group.year), ...mod },
      );
    });
  });

  madnessTeamsDocument.years.forEach((group) => {
    group.teams.forEach((team, index) => {
      addPlannedFile(
        plan,
        seenNames,
        path.join(
          MADNESS_TEAMS_ROOT,
          numberedFileName(group.year, index, slug(team.name), 3),
        ),
        {
          year: Number(group.year),
          ...team,
          mods: team.mods.map(mod => ({ name: mod.name })),
        },
      );
    });
  });

  postcardsDocument.postcards.forEach((postcard, index) => {
    addPlannedFile(
      plan,
      seenNames,
      path.join(
        MODJAM_POSTCARDS_ROOT,
        `${String(index + 1).padStart(3, '0')}-${slug(path.parse(postcard.file).name)}.json`,
      ),
      postcard,
    );
  });

  for (const modder of moddersDocument.modders) {
    addPlannedFile(plan, seenNames, path.join(MODDERS_ROOT, `${modder.id}.json`), modder);
  }

  await preflight(plan);
  await mkdir(CONTENT_ROOT, { recursive: true });
  await mapLimit(plan, 32, async ([filePath, value]) => {
    await mkdir(path.dirname(filePath), { recursive: true });
    if (!(await exists(filePath))) await writeFile(filePath, canonicalJson(value), 'utf8');
  });

  // These are the two superseded Modathon source locations. Both targets are
  // explicit descendants of CONTENT_ROOT and are fully recoverable from git.
  if (await exists(LEGACY_MODS_ROOT)) await rm(LEGACY_MODS_ROOT, { recursive: true });
  if (await exists(LEGACY_METADATA_PATH)) await unlink(LEGACY_METADATA_PATH);

  console.log(
    `Migrated ${Object.values(modsDocument.mods).flat().length} Modathon mods, `
    + `${modjamModsDocument.events.flatMap(event => event.mods).length} Modjam mods, `
    + `${madnessModsDocument.years.flatMap(group => group.mods).length} Madness mods, `
    + `${madnessTeamsDocument.years.flatMap(group => group.teams).length} Madness teams, `
    + `${postcardsDocument.postcards.length} postcards, `
    + `${moddersDocument.modders.length} modders, and `
    + `${madnessEventsDocument.events.length} Madness events, and `
    + `${achievementDocuments.flatMap(document => document.achievements).length} achievement source files.`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
