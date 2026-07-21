import { readFile, readdir, writeFile } from 'node:fs/promises';

const postcardDirectory = new URL('../modjam/assets/postcards/thumbnail/', import.meta.url);
const manifestUrl = new URL('../modjam/data/postcards.json', import.meta.url);
const existing = JSON.parse(await readFile(manifestUrl, 'utf8'));
const detailsByFile = new Map(existing.map((postcard) => [postcard.file, postcard]));
const files = (await readdir(postcardDirectory))
  .filter((file) => file.toLowerCase().endsWith('.webp'))
  .sort((left, right) => left.localeCompare(right));
const mixedCaseFile = files.find((file) => file !== file.toLowerCase());
if (mixedCaseFile) throw new Error(`Postcard filenames must be lowercase: ${mixedCaseFile}`);
const manifest = files.map((file) => detailsByFile.get(file) || { file });

await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Synced ${manifest.length} Modjam postcards.`);
