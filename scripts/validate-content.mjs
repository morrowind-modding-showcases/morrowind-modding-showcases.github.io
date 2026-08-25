import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
  GENERATED_MADNESS_MODS_PATH,
  GENERATED_MADNESS_SCORES_PATH,
  GENERATED_MADNESS_TEAMS_PATH,
  GENERATED_MODJAM_MODS_PATH,
  GENERATED_MODJAM_POSTCARDS_PATH,
  GENERATED_MODDERS_PATH,
  GENERATED_MODS_PATH,
  GENERATED_ORDER_SCORES_PATH,
  MADNESS_EVENTS_PATH,
  MODATHON_EVENTS_PATH,
  MODJAM_EVENTS_PATH,
  assertLosslessBuild,
  buildContentDocuments,
  canonicalJson,
  generatedAchievementPath,
  loadGeneratedAchievementDocuments,
  loadContentSources,
  readJson,
  relativePath,
  validateGeneratedSiteDocuments,
} from './content-lib.mjs';
import { loadResourcesDocument } from './build-resources-page.mjs';
import { loadPagesCmsConfig, validatePagesCmsData } from './pages-cms-lib.mjs';

export async function main({ checkGenerated = process.argv.includes('--check-generated') } = {}) {
  const sources = await loadContentSources();
  const pagesConfig = await loadPagesCmsConfig();
  validatePagesCmsData(pagesConfig, sources);
  await loadResourcesDocument();
  const documents = buildContentDocuments(sources);
  validateGeneratedSiteDocuments(documents);
  assertLosslessBuild(sources, documents);

  const reparsedBuild = Object.fromEntries(
    Object.entries(documents).map(([key, value]) => [key, JSON.parse(canonicalJson(value))]),
  );
  validateGeneratedSiteDocuments(reparsedBuild, 'reparsed build output');

  const generatedEntries = [
    ['modsDocument', GENERATED_MODS_PATH],
    ['moddersDocument', GENERATED_MODDERS_PATH],
    ['madnessScoresDocument', GENERATED_MADNESS_SCORES_PATH],
    ['orderScoresDocument', GENERATED_ORDER_SCORES_PATH],
    ['modathonEventsDocument', MODATHON_EVENTS_PATH],
    ['modjamEventsDocument', MODJAM_EVENTS_PATH],
    ['modjamModsDocument', GENERATED_MODJAM_MODS_PATH],
    ['madnessModsDocument', GENERATED_MADNESS_MODS_PATH],
    ['madnessTeamsDocument', GENERATED_MADNESS_TEAMS_PATH],
    ['madnessEventsDocument', MADNESS_EVENTS_PATH],
    ['postcardsDocument', GENERATED_MODJAM_POSTCARDS_PATH],
  ];
  const currentDocuments = Object.fromEntries(await Promise.all(
    generatedEntries.map(async ([key, filePath]) => [key, await readJson(filePath)]),
  ));
  currentDocuments.achievementDocuments = (await loadGeneratedAchievementDocuments()).records;
  validateGeneratedSiteDocuments(currentDocuments, 'checked-in generated content');

  if (checkGenerated) {
    if (currentDocuments.achievementDocuments.length !== documents.achievementDocuments.length) {
      throw new Error(
        'Public Modathon achievement-year files do not match content sources; '
        + 'run "node scripts/build-content.mjs"',
      );
    }
    for (const [key, filePath] of generatedEntries) {
      if (!isDeepStrictEqual(currentDocuments[key], documents[key])) {
        throw new Error(`${relativePath(filePath)} is stale; run "node scripts/build-content.mjs"`);
      }
    }
    for (const [index, document] of documents.achievementDocuments.entries()) {
      if (!isDeepStrictEqual(currentDocuments.achievementDocuments[index], document)) {
        const filePath = generatedAchievementPath(document.event.year);
        throw new Error(`${relativePath(filePath)} is stale; run "node scripts/build-content.mjs"`);
      }
    }
  }

  console.log(
    `Validated ${sources.modFiles.length + sources.modjamModFiles.length
    + sources.madnessModFiles.length} mod files, `
    + `${sources.madnessTeamFiles.length} team files, ${sources.madnessEventFiles.length} event files, `
    + `${sources.modathonEventFiles.length} Modathon event files, `
    + `${sources.modjamEventFiles.length} Modjam event files, `
    + `${sources.postcardFiles.length} postcard files, ${sources.modderFiles.length} modder files, `
    + `${sources.achievementFiles.length} achievement files, `
    + 'references, generated schemas, and lossless JSON round trips.',
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
