// Refreshes categories, downloads, endorsements, and the primary "Hot Files"
// image for every Nexus-hosted mod in the year-grouped site dataset and writes
// the daily JSON snapshot in place.
// Usage: NEXUS_API_KEY=... node scripts/fetch-nexus-stats.mjs
import { readFile, writeFile } from 'node:fs/promises';

const KEY = process.env.NEXUS_API_KEY;
if (!KEY) {
  console.error('NEXUS_API_KEY is not set');
  process.exit(1);
}

const SNAPSHOT = 'modathon/assets/data/nexus-stats.json';
const GAME = 'morrowind';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const out = JSON.parse(await readFile(SNAPSHOT, 'utf8'));
if (!out.mods || typeof out.mods !== 'object' || Array.isArray(out.mods)) {
  throw new Error(`${SNAPSHOT} must contain a year-grouped "mods" object`);
}

const modsByNexusId = new Map();
for (const [year, mods] of Object.entries(out.mods)) {
  if (!/^\d{4}$/.test(year) || !Array.isArray(mods)) {
    throw new Error(`${SNAPSHOT} has an invalid calendar-year group: ${year}`);
  }
  for (const mod of mods) {
    const match = (mod.url || '').match(/nexusmods\.com\/morrowind\/mods\/(\d+)/i);
    if (!match) continue;
    const matches = modsByNexusId.get(match[1]) || [];
    matches.push(mod);
    modsByNexusId.set(match[1], matches);
  }
}
console.log(`Found ${modsByNexusId.size} unique Nexus mods`);

const headers = {
  apikey: KEY,
  'application-name': 'modathon-legacy',
  'application-version': '1.0',
};
const categoriesResponse = await fetch(
  `https://api.nexusmods.com/v1/games/${GAME}/categories.json`,
  { headers },
);
if (!categoriesResponse.ok) {
  throw new Error(`Could not fetch Nexus categories: HTTP ${categoriesResponse.status}`);
}
const categories = await categoriesResponse.json();
if (!Array.isArray(categories)) {
  throw new Error('Nexus categories response was not an array');
}
const categoriesById = new Map(categories.map(category => [
  String(category.category_id),
  category.name,
]));
console.log(`Found ${categoriesById.size} Nexus categories`);

let done = 0;
let failed = 0;

for (const [id, mods] of modsByNexusId) {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      const response = await fetch(`https://api.nexusmods.com/v1/games/${GAME}/mods/${id}.json`, {
        headers,
      });
      if (response.status === 429 && attempt <= 3) {
        console.warn(`429 on ${id}, backing off 60s`);
        await sleep(60_000);
        continue;
      }
      if (response.ok) {
        const data = await response.json();
        const stats = {
          downloads: data.mod_downloads ?? 0,
          uniqueDownloads: data.mod_unique_downloads ?? 0,
          endorsements: data.endorsement_count ?? 0,
          available: data.available !== false,
          category: categoriesById.get(String(data.category_id)) || null,
        };
        const pictureUrl = typeof data.picture_url === 'string'
          ? data.picture_url.replace(/^http:/i, 'https:')
          : '';
        for (const mod of mods) {
          delete mod.status;
          delete mod.error;
          Object.assign(mod, stats);
          if (pictureUrl.startsWith('https://')) mod.pictureUrl = pictureUrl;
          else delete mod.pictureUrl;
        }
      } else {
        for (const mod of mods) {
          delete mod.error;
          Object.assign(mod, { available: false, status: response.status });
        }
        failed++;
      }
    } catch (error) {
      for (const mod of mods) {
        delete mod.status;
        Object.assign(mod, { available: false, error: String(error) });
      }
      failed++;
    }
    break;
  }
  done++;
  if (done % 100 === 0) console.log(`${done}/${modsByNexusId.size}…`);
  await sleep(300);
}

out.generated = new Date().toISOString();
out.game = GAME;
await writeFile(SNAPSHOT, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote ${SNAPSHOT} — ${done} Nexus mods, ${failed} unavailable or failed`);
