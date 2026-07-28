// Reconciles trusted importer output back into the per-record source tree.
// Normal editors and deployments should use build-content.mjs instead.
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
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
  loadContentSources,
  modjamEntryId,
  readJson,
  validateGeneratedSiteDocuments,
} from './content-lib.mjs';

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

function normalized(value) {
  return String(value || '').trim().toLocaleLowerCase('en-US');
}

function availableFiles(records, files, keyFor) {
  const result = new Map();
  records.forEach((record, index) => {
    const key = keyFor(record);
    const matches = result.get(key) || [];
    matches.push(files[index]);
    result.set(key, matches);
  });
  return result;
}

function claimPath(available, key, root, baseName, usedPaths) {
  const existing = available.get(key)?.shift();
  if (existing) return existing;

  let suffix = 1;
  while (true) {
    const fileName = `${baseName}${suffix === 1 ? '' : `-${suffix}`}.json`;
    const candidate = path.join(root, fileName);
    const collisionKey = candidate.toLocaleLowerCase('en-US');
    if (!usedPaths.has(collisionKey)) {
      usedPaths.add(collisionKey);
      return candidate;
    }
    suffix += 1;
  }
}

async function currentOrNull(filePath) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (!error.message.startsWith('Could not read ')) throw error;
    return null;
  }
}

export async function main() {
  const [
    sources,
    modathonEventsDocument,
    modjamEventsDocument,
    madnessEventsDocument,
    modsDocument,
    moddersDocument,
    modjamModsDocument,
    madnessModsDocument,
    madnessTeamsDocument,
    postcardsDocument,
    achievementDocuments,
  ] = await Promise.all([
    loadContentSources(),
    readJson(MODATHON_EVENTS_PATH),
    readJson(MODJAM_EVENTS_PATH),
    readJson(MADNESS_EVENTS_PATH),
    readJson(GENERATED_MODS_PATH),
    readJson(GENERATED_MODDERS_PATH),
    readJson(GENERATED_MODJAM_MODS_PATH),
    readJson(GENERATED_MADNESS_MODS_PATH),
    readJson(GENERATED_MADNESS_TEAMS_PATH),
    readJson(GENERATED_MODJAM_POSTCARDS_PATH),
    loadGeneratedAchievementDocuments().then(source => source.records),
  ]);
  validateGeneratedSiteDocuments({
    modsDocument,
    moddersDocument,
    modathonEventsDocument,
    modjamEventsDocument,
    modjamModsDocument,
    madnessModsDocument,
    madnessTeamsDocument,
    madnessEventsDocument,
    postcardsDocument,
    achievementDocuments,
  }, 'trusted importer output');

  const planned = new Map();
  const allSourceFiles = [
    ...sources.achievementFiles,
    ...(sources.modathonEventFiles || []),
    ...(sources.modjamEventFiles || []),
    ...(sources.madnessEventFiles || []),
    ...sources.modFiles,
    ...sources.modderFiles,
    ...sources.modjamModFiles,
    ...sources.madnessModFiles,
    ...sources.madnessTeamFiles,
    ...sources.postcardFiles,
  ];
  const usedPaths = new Set([
    ...allSourceFiles,
    MODATHON_METADATA_PATH,
    MODJAM_METADATA_PATH,
  ].map(filePath => filePath.toLocaleLowerCase('en-US')));

  planned.set(MODATHON_METADATA_PATH, {
    generated: modsDocument.generated,
    game: modsDocument.game,
  });
  planned.set(MODJAM_METADATA_PATH, {
    generatedAt: modjamModsDocument.generatedAt,
    listedModderCount: modjamModsDocument.summary.listedModderCount,
  });

  for (const event of modathonEventsDocument.events || []) {
    const { name: _name, ...sourceEvent } = event;
    planned.set(
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
    planned.set(
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
    planned.set(
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
      planned.set(
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

  const modathonAvailable = availableFiles(
    sources.modRecords,
    sources.modFiles,
    record => `${record.year}|${normalized(record.url)}`,
  );
  for (const [year, mods] of Object.entries(modsDocument.mods)) {
    for (const mod of mods) {
      const record = { year: Number(year), ...mod };
      const key = `${record.year}|${normalized(record.url)}`;
      const filePath = claimPath(
        modathonAvailable,
        key,
        path.join(MODATHON_MODS_ROOT, year),
        `${year}-${nexusId(mod.url) || slug(mod.name) || 'mod'}`,
        usedPaths,
      );
      planned.set(filePath, record);
    }
  }

  const modjamAvailable = availableFiles(
    sources.modjamModRecords,
    sources.modjamModFiles,
    record => `${record.eventId}|${record.id}`,
  );
  for (const group of modjamModsDocument.events) {
    for (const mod of group.mods) {
      const { themes: _themes, id, ...modWithoutThemes } = mod;
      const generatedId = modjamEntryId(group.id, mod.url);
      const canonicalId = generatedId || id;
      const record = {
        eventId: group.id,
        ...modWithoutThemes,
        ...(generatedId ? {} : { id }),
      };
      const key = `${record.eventId}|${canonicalId}`;
      const filePath = claimPath(
        modjamAvailable,
        key,
        path.join(MODJAM_MODS_ROOT, group.id),
        canonicalId,
        usedPaths,
      );
      planned.set(filePath, record);
    }
  }

  const madnessModKey = record => (
    `${record.year}|${normalized(record.url) || normalized(record.name)}`
  );
  const madnessModsAvailable = availableFiles(
    sources.madnessModRecords,
    sources.madnessModFiles,
    madnessModKey,
  );
  for (const group of madnessModsDocument.years) {
    for (const mod of group.mods) {
      const record = { year: Number(group.year), ...mod };
      const filePath = claimPath(
        madnessModsAvailable,
        madnessModKey(record),
        path.join(MADNESS_MODS_ROOT, String(group.year)),
        `${group.year}-${nexusId(mod.url) || slug(mod.name) || 'mod'}`,
        usedPaths,
      );
      planned.set(filePath, record);
    }
  }

  const madnessTeamKey = record => `${record.year}|${normalized(record.name)}`;
  const madnessTeamsAvailable = availableFiles(
    sources.madnessTeamRecords,
    sources.madnessTeamFiles,
    madnessTeamKey,
  );
  for (const group of madnessTeamsDocument.years) {
    for (const team of group.teams) {
      const record = {
        year: Number(group.year),
        ...team,
        mods: team.mods.map(mod => ({ name: mod.name })),
      };
      const filePath = claimPath(
        madnessTeamsAvailable,
        madnessTeamKey(record),
        MADNESS_TEAMS_ROOT,
        `${group.year}-${slug(team.name) || 'team'}`,
        usedPaths,
      );
      planned.set(filePath, record);
    }
  }

  const postcardsAvailable = availableFiles(
    sources.postcards,
    sources.postcardFiles,
    postcard => normalized(postcard.file),
  );
  for (const postcard of postcardsDocument.postcards) {
    const filePath = claimPath(
      postcardsAvailable,
      normalized(postcard.file),
      MODJAM_POSTCARDS_ROOT,
      slug(path.parse(postcard.file).name) || 'postcard',
      usedPaths,
    );
    planned.set(filePath, postcard);
  }

  for (const modder of moddersDocument.modders) {
    planned.set(path.join(MODDERS_ROOT, `${modder.id}.json`), modder);
  }

  const staleFiles = allSourceFiles.filter(filePath => !planned.has(filePath));
  for (const [filePath, value] of planned) {
    const current = await currentOrNull(filePath);
    if (current !== null && isDeepStrictEqual(current, value)) continue;
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, canonicalJson(value), 'utf8');
  }
  for (const filePath of staleFiles) await unlink(filePath);

  console.log(
    `Synchronized ${Object.values(modsDocument.mods).flat().length} Modathon mods, `
    + `${modjamModsDocument.events.flatMap(group => group.mods).length} Modjam mods, `
    + `${madnessModsDocument.years.flatMap(group => group.mods).length} Madness mods, `
    + `${madnessTeamsDocument.years.flatMap(group => group.teams).length} Madness teams, `
    + `${postcardsDocument.postcards.length} postcards, `
    + `${moddersDocument.modders.length} modders, and `
    + `${achievementDocuments.flatMap(document => document.achievements).length} achievements; `
    + `${staleFiles.length} stale source file${staleFiles.length === 1 ? '' : 's'} removed.`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
