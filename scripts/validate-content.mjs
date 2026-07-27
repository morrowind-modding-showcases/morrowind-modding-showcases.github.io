import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
  GENERATED_MODDERS_PATH,
  GENERATED_MODS_PATH,
  assertLosslessBuild,
  buildContentDocuments,
  canonicalJson,
  loadContentSources,
  readJson,
  relativePath,
  validateGeneratedDocuments,
} from './content-lib.mjs';

export async function main({ checkGenerated = process.argv.includes('--check-generated') } = {}) {
  const sources = await loadContentSources();
  const documents = buildContentDocuments(sources);
  validateGeneratedDocuments(documents.modsDocument, documents.moddersDocument);
  assertLosslessBuild(sources, documents);

  const reparsedBuild = {
    modsDocument: JSON.parse(canonicalJson(documents.modsDocument)),
    moddersDocument: JSON.parse(canonicalJson(documents.moddersDocument)),
  };
  validateGeneratedDocuments(
    reparsedBuild.modsDocument,
    reparsedBuild.moddersDocument,
    'reparsed build output',
  );

  const [currentMods, currentModders] = await Promise.all([
    readJson(GENERATED_MODS_PATH),
    readJson(GENERATED_MODDERS_PATH),
  ]);
  validateGeneratedDocuments(currentMods, currentModders, 'checked-in generated content');

  if (checkGenerated) {
    if (!isDeepStrictEqual(currentMods, documents.modsDocument)) {
      throw new Error(
        `${relativePath(GENERATED_MODS_PATH)} is stale; run "node scripts/build-content.mjs"`,
      );
    }
    if (!isDeepStrictEqual(currentModders, documents.moddersDocument)) {
      throw new Error(
        `${relativePath(GENERATED_MODDERS_PATH)} is stale; run "node scripts/build-content.mjs"`,
      );
    }
  }

  console.log(
    `Validated ${sources.modFiles.length} mod files, ${sources.modderFiles.length} modder files, `
    + 'author references, generated schemas, and lossless JSON round trips.',
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

