import { readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  MODJAM_POSTCARDS_ROOT,
  canonicalJson,
  loadContentSources,
} from './content-lib.mjs';
import { main as buildContent } from './build-content.mjs';

const postcardDirectory = new URL('../modjam/assets/postcards/thumbnail/', import.meta.url);

function slug(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const existing = await loadContentSources();
const detailsByFile = new Map(existing.postcards.map((postcard, index) => [
  postcard.file,
  { postcard, filePath: existing.postcardFiles[index] },
]));
const files = (await readdir(postcardDirectory))
  .filter(file => file.toLowerCase().endsWith('.webp'))
  .sort((a, b) => a.localeCompare(b));
const mixedCaseFile = files.find(file => file !== file.toLowerCase());
if (mixedCaseFile) throw new Error(`Postcard filenames must be lowercase: ${mixedCaseFile}`);

const usedPaths = new Set(existing.postcardFiles.map(filePath => filePath.toLocaleLowerCase('en-US')));
const retainedPaths = new Set();
let added = 0;
for (const file of files) {
  const current = detailsByFile.get(file);
  if (current) {
    retainedPaths.add(current.filePath);
    continue;
  }
  const base = slug(path.parse(file).name) || 'postcard';
  let suffix = 1;
  let filePath;
  while (true) {
    filePath = path.join(MODJAM_POSTCARDS_ROOT, `${base}${suffix === 1 ? '' : `-${suffix}`}.json`);
    const key = filePath.toLocaleLowerCase('en-US');
    if (!usedPaths.has(key)) {
      usedPaths.add(key);
      break;
    }
    suffix += 1;
  }
  await writeFile(filePath, canonicalJson({ file, entryId: '' }), 'utf8');
  retainedPaths.add(filePath);
  added += 1;
}

const staleFiles = existing.postcardFiles.filter(filePath => !retainedPaths.has(filePath));
for (const filePath of staleFiles) await unlink(filePath);

if (added) {
  throw new Error(
    `Added ${added} postcard source file${added === 1 ? '' : 's'} without entry IDs. `
    + 'Set each entryId in Pages CMS or the JSON files, then run the content build.',
  );
}
await buildContent();
console.log(
  `Synced ${files.length} Modjam postcards; removed ${staleFiles.length} stale source `
  + `file${staleFiles.length === 1 ? '' : 's'}.`,
);
