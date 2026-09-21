import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  MADNESS_EVENTS_ROOT,
  canonicalJson,
  relativePath,
  validateMadnessEventSource,
} from './content-lib.mjs';

// Pages CMS sanitizes [] away even with merge enabled, and JSON.stringify
// omits the EOF newline. Normalize only this collection's source contract.
export async function normalizeMadnessEvents({ directory = MADNESS_EVENTS_ROOT } = {}) {
  const entries = await readdir(directory, { withFileTypes: true });
  const updates = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || path.extname(entry.name) !== '.json') continue;
    const filePath = path.join(directory, entry.name);
    const source = await readFile(filePath, 'utf8');
    const document = JSON.parse(source);
    const context = relativePath(filePath);
    validateMadnessEventSource(document, context);
    if (Object.hasOwn(document, 'themes') && !Array.isArray(document.themes)) {
      throw new Error(`${context}.themes must be an array`);
    }
    if (!Object.hasOwn(document, 'themes')) {
      // Put the restored field after season without reordering existing keys.
      const fields = Object.entries(document);
      fields.splice(fields.findIndex(([key]) => key === 'season') + 1, 0, ['themes', []]);
      updates.push({ filePath, output: canonicalJson(Object.fromEntries(fields)) });
    } else {
      const output = canonicalJson(document);
      if (source.replaceAll('\r\n', '\n') !== output) updates.push({ filePath, output });
    }
  }

  // Validate the whole batch before writing, so bad data is never repaired away.
  for (const { filePath, output } of updates) await writeFile(filePath, output, 'utf8');
  return updates.map(({ filePath }) => filePath);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  normalizeMadnessEvents().then(paths => {
    console.log(`Normalized ${paths.length} Madness event source(s).`);
    for (const filePath of paths) console.log(relativePath(filePath));
  }).catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
