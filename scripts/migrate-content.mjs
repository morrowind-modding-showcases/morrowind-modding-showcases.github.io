import { access, mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import {
  CONTENT_ROOT,
  GENERATED_MODDERS_PATH,
  GENERATED_MODS_PATH,
  MODDERS_ROOT,
  MODS_METADATA_PATH,
  MODS_ROOT,
  canonicalJson,
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

function modFileName(mod, index) {
  const order = String(index + 1).padStart(4, '0');
  const stablePart = nexusId(mod.url) || slug(mod.name) || 'mod';
  return `${order}-${stablePart}.json`;
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
  for (const filePath of [
    ...(await existingJsonFiles(MODS_ROOT)),
    ...(await existingJsonFiles(MODDERS_ROOT)),
  ]) {
    if (!plannedNames.has(filePath.toLocaleLowerCase('en-US'))) {
      conflicts.push(`${relativePath(filePath)} is not part of the migration output`);
    }
  }
  if (await exists(MODS_METADATA_PATH)) {
    if (!plannedNames.has(MODS_METADATA_PATH.toLocaleLowerCase('en-US'))) {
      conflicts.push(`${relativePath(MODS_METADATA_PATH)} is not part of the migration output`);
    }
  }

  if (conflicts.length) {
    throw new Error(`Migration stopped without overwriting conflicting files:\n- ${conflicts.join('\n- ')}`);
  }
}

export async function main() {
  const [modsDocument, moddersDocument] = await Promise.all([
    readJson(GENERATED_MODS_PATH),
    readJson(GENERATED_MODDERS_PATH),
  ]);
  validateGeneratedDocuments(modsDocument, moddersDocument, 'migration input');

  const plan = new Map();
  const seenNames = new Map();
  addPlannedFile(
    plan,
    seenNames,
    MODS_METADATA_PATH,
    { generated: modsDocument.generated, game: modsDocument.game },
  );

  for (const [year, mods] of Object.entries(modsDocument.mods)) {
    mods.forEach((mod, index) => {
      addPlannedFile(
        plan,
        seenNames,
        path.join(MODS_ROOT, year, modFileName(mod, index)),
        mod,
      );
    });
  }

  for (const modder of moddersDocument.modders) {
    addPlannedFile(plan, seenNames, path.join(MODDERS_ROOT, `${modder.id}.json`), modder);
  }

  await preflight(plan);
  await mkdir(CONTENT_ROOT, { recursive: true });
  await mapLimit(plan, 32, async ([filePath, value]) => {
    await mkdir(path.dirname(filePath), { recursive: true });
    if (!(await exists(filePath))) {
      await writeFile(filePath, canonicalJson(value), 'utf8');
    }
  });

  console.log(
    `Migrated ${Object.values(modsDocument.mods).reduce((total, mods) => total + mods.length, 0)} mods `
    + `and ${moddersDocument.modders.length} modders into ${relativePath(CONTENT_ROOT)}.`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
