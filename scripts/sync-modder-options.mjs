import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadModderRecords } from './content-lib.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PAGES_CONFIG_PATH = path.join(REPO_ROOT, '.pages.yml');

const OPTIONS_START = '# MODDER_ID_OPTIONS_START';
const OPTIONS_END = '# MODDER_ID_OPTIONS_END';

function normalizedOptions(modders) {
  const ids = new Set();
  return modders
    .map((modder, index) => {
      if (!modder || typeof modder !== 'object' || Array.isArray(modder)) {
        throw new Error(`Cannot add invalid modder option at index ${index}.`);
      }
      if (typeof modder.id !== 'string' || modder.id.trim() !== modder.id || !modder.id) {
        throw new Error(`Cannot add invalid modder ID ${JSON.stringify(modder.id)} to Pages CMS.`);
      }
      if (typeof modder.name !== 'string' || modder.name.trim() !== modder.name || !modder.name) {
        throw new Error(`Cannot add invalid modder name ${JSON.stringify(modder.name)} to Pages CMS.`);
      }
      if (ids.has(modder.id)) throw new Error(`Cannot add duplicate modder ID ${JSON.stringify(modder.id)} to Pages CMS.`);
      ids.add(modder.id);
      return { id: modder.id, name: modder.name };
    })
    .sort((left, right) => (
      left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
      || left.id.localeCompare(right.id)
    ));
}

export function syncModderOptionsSource(source, modders) {
  const lineEnding = source.includes('\r\n') ? '\r\n' : '\n';
  const startCount = source.split(OPTIONS_START).length - 1;
  const endCount = source.split(OPTIONS_END).length - 1;
  if (startCount !== 1 || endCount !== 1) {
    throw new Error('Pages CMS must contain exactly one modder ID option block.');
  }

  const markerPattern = new RegExp(
    `^(\\s*)${OPTIONS_START}${lineEnding}[\\s\\S]*?^\\1${OPTIONS_END}`,
    'm',
  );
  const match = source.match(markerPattern);
  if (!match) throw new Error('Pages CMS modder ID option markers are missing or malformed.');

  const indent = match[1];
  const optionIndent = `${indent}  `;
  const propertyIndent = `${optionIndent}  `;
  const optionLines = normalizedOptions(modders).flatMap(modder => [
    `${optionIndent}- name: ${JSON.stringify(modder.id)}`,
    `${propertyIndent}label: ${JSON.stringify(modder.name)}`,
  ]);
  const replacement = [
    `${indent}${OPTIONS_START}`,
    `${indent}values:`,
    ...optionLines,
    `${indent}${OPTIONS_END}`,
  ].join(lineEnding);
  return source.replace(markerPattern, replacement);
}

export async function syncModderOptions() {
  const [modders, configSource] = await Promise.all([
    loadModderRecords(),
    readFile(PAGES_CONFIG_PATH, 'utf8'),
  ]);
  const updatedConfig = syncModderOptionsSource(configSource, modders);
  if (updatedConfig !== configSource) await writeFile(PAGES_CONFIG_PATH, updatedConfig, 'utf8');
  return { changed: updatedConfig !== configSource, modderCount: modders.length };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  syncModderOptions()
    .then(({ changed, modderCount }) => {
      console.log(`${changed ? 'Updated' : 'Checked'} Pages CMS with ${modderCount} modder choices.`);
    })
    .catch(error => {
      console.error(error.message || error);
      process.exitCode = 1;
    });
}
