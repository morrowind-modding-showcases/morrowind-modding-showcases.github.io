import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  GENERATED_MADNESS_MODS_PATH,
  GENERATED_MADNESS_SCORES_PATH,
  GENERATED_MADNESS_TEAMS_PATH,
  GENERATED_MODJAM_MODS_PATH,
  GENERATED_MODJAM_POSTCARDS_PATH,
  GENERATED_MODDERS_PATH,
  GENERATED_MODS_PATH,
  MADNESS_EVENTS_PATH,
  MODATHON_EVENTS_PATH,
  MODJAM_EVENTS_PATH,
  assertLosslessBuild,
  buildContentDocuments,
  canonicalJson,
  generatedAchievementPath,
  loadContentSources,
  validateGeneratedSiteDocuments,
} from './content-lib.mjs';

export async function buildContent() {
  const sources = await loadContentSources();
  const documents = buildContentDocuments(sources);
  validateGeneratedSiteDocuments(documents);
  assertLosslessBuild(sources, documents);
  return { sources, ...documents };
}

export async function main() {
  const {
    sources,
    modsDocument,
    moddersDocument,
    madnessScoresDocument,
    modathonEventsDocument,
    modjamEventsDocument,
    modjamModsDocument,
    madnessModsDocument,
    madnessTeamsDocument,
    madnessEventsDocument,
    postcardsDocument,
    achievementDocuments,
  } = await buildContent();
  await Promise.all([
    writeFile(GENERATED_MODS_PATH, canonicalJson(modsDocument), 'utf8'),
    writeFile(GENERATED_MODDERS_PATH, canonicalJson(moddersDocument), 'utf8'),
    writeFile(GENERATED_MADNESS_SCORES_PATH, canonicalJson(madnessScoresDocument), 'utf8'),
    writeFile(MODATHON_EVENTS_PATH, canonicalJson(modathonEventsDocument), 'utf8'),
    writeFile(MODJAM_EVENTS_PATH, canonicalJson(modjamEventsDocument), 'utf8'),
    writeFile(GENERATED_MODJAM_MODS_PATH, canonicalJson(modjamModsDocument), 'utf8'),
    writeFile(GENERATED_MADNESS_MODS_PATH, canonicalJson(madnessModsDocument), 'utf8'),
    writeFile(GENERATED_MADNESS_TEAMS_PATH, canonicalJson(madnessTeamsDocument), 'utf8'),
    writeFile(MADNESS_EVENTS_PATH, canonicalJson(madnessEventsDocument), 'utf8'),
    writeFile(GENERATED_MODJAM_POSTCARDS_PATH, canonicalJson(postcardsDocument), 'utf8'),
    ...achievementDocuments.map(document => writeFile(
      generatedAchievementPath(document.event.year),
      canonicalJson(document),
      'utf8',
    )),
  ]);
  console.log(
    `Built public JSON from ${sources.modFiles.length} Modathon mods, `
    + `${sources.modjamModFiles.length} Modjam mods, `
    + `${sources.madnessModFiles.length} Madness mods, `
    + `${sources.madnessTeamFiles.length} Madness teams, `
    + `${sources.modathonEventFiles.length} Modathon events, `
    + `${sources.modjamEventFiles.length} Modjam events, `
    + `${sources.madnessEventFiles.length} Madness events, `
    + `${sources.postcardFiles.length} postcards, `
    + `${sources.modderFiles.length} modders, and `
    + `${sources.achievementFiles.length} Modathon achievements.`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
