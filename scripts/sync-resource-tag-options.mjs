import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { collectResourceTags } from './resource-tags.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RESOURCES_DATA_PATH = path.join(REPO_ROOT, 'content', 'resources', 'resources.json');
export const PAGES_CONFIG_PATH = path.join(REPO_ROOT, '.pages.yml');

const OPTIONS_START = '# RESOURCE_TAG_OPTIONS_START';
const OPTIONS_END = '# RESOURCE_TAG_OPTIONS_END';

export function syncResourceTagOptionsSource(source, tags) {
  const lineEnding = source.includes('\r\n') ? '\r\n' : '\n';
  const startCount = source.split(OPTIONS_START).length - 1;
  const endCount = source.split(OPTIONS_END).length - 1;
  if (startCount !== 1 || endCount !== 1) {
    throw new Error('Pages CMS must contain exactly one Resource tag option block.');
  }
  const markerPattern = new RegExp(
    `^(\\s*)${OPTIONS_START}${lineEnding}[\\s\\S]*?^\\1${OPTIONS_END}`,
    'm',
  );
  const match = source.match(markerPattern);
  if (!match) throw new Error('Pages CMS resource tag option markers are missing or malformed.');

  const indent = match[1];
  const optionIndent = `${indent}  `;
  const replacement = [
    `${indent}${OPTIONS_START}`,
    `${indent}values:`,
    ...tags.map(tag => `${optionIndent}- ${JSON.stringify(tag)}`),
    `${indent}${OPTIONS_END}`,
  ].join(lineEnding);
  const updatedSource = source.replace(markerPattern, replacement);
  return updatedSource;
}

export async function syncResourceTagOptions() {
  const [documentSource, configSource] = await Promise.all([
    readFile(RESOURCES_DATA_PATH, 'utf8'),
    readFile(PAGES_CONFIG_PATH, 'utf8'),
  ]);
  const tags = collectResourceTags(JSON.parse(documentSource));
  for (const tag of tags) {
    if (
      typeof tag !== 'string'
      || tag !== tag.trim()
      || tag.length === 0
      || tag.length > 40
      || /[|\u0000-\u001f\u007f]/.test(tag)
    ) {
      throw new Error(`Cannot add invalid Resource tag ${JSON.stringify(tag)} to Pages CMS.`);
    }
  }
  const updatedConfig = syncResourceTagOptionsSource(configSource, tags);
  if (updatedConfig !== configSource) await writeFile(PAGES_CONFIG_PATH, updatedConfig, 'utf8');
  return { changed: updatedConfig !== configSource, tagCount: tags.length };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  syncResourceTagOptions()
    .then(({ changed, tagCount }) => {
      console.log(`${changed ? 'Updated' : 'Checked'} Pages CMS with ${tagCount} Resource tag choices.`);
    })
    .catch(error => {
      console.error(error.message || error);
      process.exitCode = 1;
    });
}
