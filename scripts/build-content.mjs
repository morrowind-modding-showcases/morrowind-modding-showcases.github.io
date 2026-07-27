import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  GENERATED_MODDERS_PATH,
  GENERATED_MODS_PATH,
  assertLosslessBuild,
  buildContentDocuments,
  canonicalJson,
  loadContentSources,
  relativePath,
  validateGeneratedDocuments,
} from './content-lib.mjs';

export async function buildContent() {
  const sources = await loadContentSources();
  const documents = buildContentDocuments(sources);
  validateGeneratedDocuments(documents.modsDocument, documents.moddersDocument);
  assertLosslessBuild(sources, documents);
  return { sources, ...documents };
}

export async function main() {
  const { sources, modsDocument, moddersDocument } = await buildContent();
  await Promise.all([
    writeFile(GENERATED_MODS_PATH, canonicalJson(modsDocument), 'utf8'),
    writeFile(GENERATED_MODDERS_PATH, canonicalJson(moddersDocument), 'utf8'),
  ]);
  console.log(
    `Built ${relativePath(GENERATED_MODS_PATH)} from ${sources.modFiles.length} records `
    + `and ${relativePath(GENERATED_MODDERS_PATH)} from ${sources.modderFiles.length} records.`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

