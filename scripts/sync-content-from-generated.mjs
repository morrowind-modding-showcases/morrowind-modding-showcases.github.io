// Reconciles trusted legacy importer output back into the per-record source
// tree. Normal editors and deployments should use build-content.mjs instead.
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
  GENERATED_MODDERS_PATH,
  GENERATED_MODS_PATH,
  MODDERS_ROOT,
  MODS_METADATA_PATH,
  MODS_ROOT,
  canonicalJson,
  loadContentSources,
  readJson,
  relativePath,
  validateGeneratedDocuments,
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

function modMatchKey(mod) {
  return String(mod.url || '').trim().toLocaleLowerCase('en-US');
}

function filesByYear(sources) {
  const result = new Map();
  let offset = 0;
  for (const [year, mods] of sources.modsByYear) {
    result.set(year, sources.modFiles.slice(offset, offset + mods.length));
    offset += mods.length;
  }
  return result;
}

function nextModPath(year, mod, usedPaths, nextOrder) {
  const stablePart = nexusId(mod.url) || slug(mod.name) || 'mod';
  while (true) {
    const name = `${String(nextOrder.value).padStart(4, '0')}-${stablePart}.json`;
    nextOrder.value += 1;
    const filePath = path.join(MODS_ROOT, year, name);
    const key = filePath.toLocaleLowerCase('en-US');
    if (!usedPaths.has(key)) {
      usedPaths.add(key);
      return filePath;
    }
  }
}

export async function main() {
  const [sources, modsDocument, moddersDocument] = await Promise.all([
    loadContentSources(),
    readJson(GENERATED_MODS_PATH),
    readJson(GENERATED_MODDERS_PATH),
  ]);
  validateGeneratedDocuments(modsDocument, moddersDocument, 'legacy importer output');

  const sourceFilesByYear = filesByYear(sources);
  const planned = new Map();
  const usedPaths = new Set([
    ...sources.modFiles,
    ...sources.modderFiles,
    MODS_METADATA_PATH,
  ].map(filePath => filePath.toLocaleLowerCase('en-US')));

  planned.set(MODS_METADATA_PATH, {
    generated: modsDocument.generated,
    game: modsDocument.game,
  });

  for (const [year, newMods] of Object.entries(modsDocument.mods)) {
    const oldMods = sources.modsByYear.get(year) || [];
    const oldFiles = sourceFilesByYear.get(year) || [];
    const availableByKey = new Map();
    oldMods.forEach((mod, index) => {
      const key = modMatchKey(mod);
      const matches = availableByKey.get(key) || [];
      matches.push(oldFiles[index]);
      availableByKey.set(key, matches);
    });
    const highestOrder = oldFiles.reduce((highest, filePath) => {
      const order = Number(path.basename(filePath).match(/^(\d+)-/)?.[1] || 0);
      return Math.max(highest, order);
    }, 0);
    const nextOrder = { value: highestOrder + 1 };

    for (const mod of newMods) {
      const matches = availableByKey.get(modMatchKey(mod)) || [];
      const filePath = matches.shift()
        || nextModPath(year, mod, usedPaths, nextOrder);
      planned.set(filePath, mod);
    }
  }

  for (const modder of moddersDocument.modders) {
    planned.set(path.join(MODDERS_ROOT, `${modder.id}.json`), modder);
  }

  const currentSourceFiles = [
    ...sources.modFiles,
    ...sources.modderFiles,
  ];
  const staleFiles = currentSourceFiles.filter(filePath => !planned.has(filePath));

  for (const [filePath, value] of planned) {
    let current = null;
    try {
      current = await readJson(filePath);
    } catch (error) {
      if (!error.message.startsWith('Could not read ')) throw error;
    }
    if (current !== null && isDeepStrictEqual(current, value)) continue;
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, canonicalJson(value), 'utf8');
  }
  for (const filePath of staleFiles) {
    await unlink(filePath);
  }

  console.log(
    `Synchronized ${Object.values(modsDocument.mods).flat().length} mods and `
    + `${moddersDocument.modders.length} modders from trusted generated importer output; `
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

