import { writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import categoryApi from '../modathon/nexus-categories.js';
import { canonicalJson, loadContentSources } from './content-lib.mjs';

const { normalizeNexusModCategory } = categoryApi;
const content = await loadContentSources();
const mods = [...content.modsByYear.values()].flat();
const originals = mods.map(mod => structuredClone(mod));

let normalizedCount = 0;
let unknownCount = 0;

for (const mod of mods) {
  const rawCategory = String(mod.nexusCategory ?? mod.category ?? '').trim();
  const normalized = normalizeNexusModCategory(rawCategory, mod.url);
  if (rawCategory) mod.nexusCategory = rawCategory;
  else delete mod.nexusCategory;
  mod.category = normalized;
  if (normalized === 'Unknown') unknownCount++;
  normalizedCount++;
}

await Promise.all(mods.flatMap((mod, index) => (
  isDeepStrictEqual(mod, originals[index])
    ? []
    : [writeFile(content.modFiles[index], canonicalJson(mod), 'utf8')]
)));
console.log(`Normalized ${normalizedCount} mods; ${unknownCount} use the Unknown category`);
