// Fetches downloads and endorsements for every Nexus-hosted mod referenced in
// modathon/assets/data/*-mods.json and writes the daily JSON snapshot.
// Usage: NEXUS_API_KEY=... node scripts/fetch-nexus-stats.mjs
import { readFile, readdir, writeFile } from 'node:fs/promises';

const KEY = process.env.NEXUS_API_KEY;
if (!KEY) {
  console.error('NEXUS_API_KEY is not set');
  process.exit(1);
}

const DIR = 'modathon/assets/data';
const GAME = 'morrowind';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const ids = new Set();
for (const file of await readdir(DIR)) {
  if (!/^\d{4}-mods\.json$/.test(file)) continue;
  const data = JSON.parse(await readFile(`${DIR}/${file}`, 'utf8'));
  for (const mod of data.mods || []) {
    const match = (mod.url || '').match(/nexusmods\.com\/morrowind\/mods\/(\d+)/i);
    if (match) ids.add(match[1]);
  }
}
console.log(`Found ${ids.size} unique Nexus mod ids`);

const out = { generated: new Date().toISOString(), game: GAME, mods: {} };
let done = 0;
let failed = 0;

for (const id of ids) {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      const response = await fetch(`https://api.nexusmods.com/v1/games/${GAME}/mods/${id}.json`, {
        headers: {
          apikey: KEY,
          'application-name': 'modathon-replay',
          'application-version': '1.0',
        },
      });
      if (response.status === 429 && attempt <= 3) {
        console.warn(`429 on ${id}, backing off 60s`);
        await sleep(60_000);
        continue;
      }
      if (response.ok) {
        const data = await response.json();
        out.mods[id] = {
          name: data.name,
          downloads: data.mod_downloads ?? 0,
          uniqueDownloads: data.mod_unique_downloads ?? 0,
          endorsements: data.endorsement_count ?? 0,
          available: data.available !== false,
        };
      } else {
        out.mods[id] = { available: false, status: response.status };
        failed++;
      }
    } catch (error) {
      out.mods[id] = { available: false, error: String(error) };
      failed++;
    }
    break;
  }
  done++;
  if (done % 100 === 0) console.log(`${done}/${ids.size}…`);
  await sleep(300);
}

await writeFile(`${DIR}/nexus-stats.json`, JSON.stringify(out, null, 1));
console.log(`Wrote ${DIR}/nexus-stats.json — ${done} mods, ${failed} unavailable or failed`);
