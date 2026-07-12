// Fetches downloads/endorsements for every Nexus-hosted mod referenced in
// assets/data/*-mods.json and writes assets/data/nexus-stats.json.
// Usage: NEXUS_API_KEY=... node scripts/fetch-nexus-stats.mjs
import { readFile, readdir, writeFile } from 'node:fs/promises';

const KEY = process.env.NEXUS_API_KEY;
if (!KEY) {
  console.error('NEXUS_API_KEY is not set');
  process.exit(1);
}

const DIR = 'assets/data';
const GAME = 'morrowind';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Collect every unique Nexus mod id across all year files
const ids = new Set();
for (const f of await readdir(DIR)) {
  if (!/^\d{4}-mods\.json$/.test(f)) continue;
  const d = JSON.parse(await readFile(`${DIR}/${f}`, 'utf8'));
  for (const m of d.mods || []) {
    const match = (m.url || '').match(/nexusmods\.com\/morrowind\/mods\/(\d+)/i);
    if (match) ids.add(match[1]);
  }
}
console.log(`Found ${ids.size} unique Nexus mod ids`);

const out = { generated: new Date().toISOString(), game: GAME, mods: {} };
let done = 0, failed = 0;

for (const id of ids) {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      const r = await fetch(`https://api.nexusmods.com/v1/games/${GAME}/mods/${id}.json`, {
        headers: { apikey: KEY, 'application-name': 'modathon-replay', 'application-version': '1.0' },
      });
      if (r.status === 429 && attempt <= 3) {
        console.warn(`429 on ${id}, backing off 60s`);
        await sleep(60_000);
        continue;
      }
      if (r.ok) {
        const j = await r.json();
        out.mods[id] = {
          name: j.name,
          downloads: j.mod_downloads ?? 0,
          uniqueDownloads: j.mod_unique_downloads ?? 0,
          endorsements: j.endorsement_count ?? 0,
          available: j.available !== false,
        };
      } else {
        out.mods[id] = { available: false, status: r.status };
        failed++;
      }
    } catch (e) {
      out.mods[id] = { available: false, error: String(e) };
      failed++;
    }
    break;
  }
  done++;
  if (done % 100 === 0) console.log(`${done}/${ids.size}…`);
  await sleep(300); // stay well under Nexus rate limits (~2500/day)
}

await writeFile(`${DIR}/nexus-stats.json`, JSON.stringify(out, null, 1));
console.log(`Wrote ${DIR}/nexus-stats.json — ${done} mods, ${failed} unavailable/failed`);
