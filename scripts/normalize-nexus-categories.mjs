import { readFile, writeFile } from 'node:fs/promises';
import categoryApi from '../modathon/nexus-categories.js';

const SNAPSHOT = 'modathon/assets/data/nexus-stats.json';
const { normalizeNexusCategory } = categoryApi;
const out = JSON.parse(await readFile(SNAPSHOT, 'utf8'));

if (!out.mods || typeof out.mods !== 'object' || Array.isArray(out.mods)) {
  throw new Error(`${SNAPSHOT} must contain a year-grouped "mods" object`);
}

let normalizedCount = 0;
let unknownCount = 0;

for (const mods of Object.values(out.mods)) {
  for (const mod of mods) {
    const rawCategory = String(mod.nexusCategory ?? mod.category ?? '').trim();
    const normalized = normalizeNexusCategory(rawCategory);
    if (rawCategory) mod.nexusCategory = rawCategory;
    else delete mod.nexusCategory;
    mod.category = normalized;
    if (normalized === 'Unknown') unknownCount++;
    normalizedCount++;
  }
}

await writeFile(SNAPSHOT, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Normalized ${normalizedCount} mods; ${unknownCount} use the Unknown category`);
