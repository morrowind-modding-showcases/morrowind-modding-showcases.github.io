// Refreshes Nexus metadata for every Nexus-hosted mod used by the site.
// Modathon receives the complete stats/category payload; ModJam and Madness
// receive the primary Nexus picture without losing their event categories.
// Usage: NEXUS_API_KEY=... node scripts/fetch-nexus-stats.mjs
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import categoryApi from '../modathon/nexus-categories.js';

const { normalizeNexusCategory } = categoryApi;

const GAME = 'morrowind';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const DATA_SOURCES = [
  {
    key: 'modathon',
    relativePath: 'modathon/assets/data/nexus-stats.json',
    includeStats: true,
    records(data, sourcePath) {
      if (!data.mods || typeof data.mods !== 'object' || Array.isArray(data.mods)) {
        throw new Error(`${sourcePath} must contain a year-grouped "mods" object`);
      }
      return Object.entries(data.mods).flatMap(([year, mods]) => {
        if (!/^\d{4}$/.test(year) || !Array.isArray(mods)) {
          throw new Error(`${sourcePath} has an invalid calendar-year group: ${year}`);
        }
        return mods;
      });
    },
    finish(data) {
      data.generated = new Date().toISOString();
      data.game = GAME;
    },
  },
  {
    key: 'modjam',
    relativePath: 'modjam/data/modjams.json',
    includeStats: false,
    records(data, sourcePath) {
      if (!Array.isArray(data.events)) {
        throw new Error(`${sourcePath} must contain an "events" array`);
      }
      return data.events.flatMap((event, index) => {
        if (!Array.isArray(event.entries)) {
          throw new Error(`${sourcePath} event ${event.id || index} must contain an "entries" array`);
        }
        return event.entries;
      });
    },
  },
  {
    key: 'madness',
    relativePath: 'madness/data/mods-by-year.json',
    includeStats: false,
    records(data, sourcePath) {
      if (!Array.isArray(data)) {
        throw new Error(`${sourcePath} must contain an array of year groups`);
      }
      return data.flatMap((year, index) => {
        if (!Array.isArray(year.mods)) {
          throw new Error(`${sourcePath} year ${year.year || index} must contain a "mods" array`);
        }
        return year.mods;
      });
    },
  },
];

export function nexusIdFor(url) {
  return String(url || '').match(/nexusmods\.com\/morrowind\/mods\/(\d+)/i)?.[1] || '';
}

export function buildNexusIndex(sources) {
  const modsByNexusId = new Map();
  for (const source of sources) {
    for (const mod of source.mods) {
      const nexusId = nexusIdFor(mod.url);
      if (!nexusId) continue;
      const matches = modsByNexusId.get(nexusId) || [];
      matches.push({ mod, includeStats: source.includeStats });
      modsByNexusId.set(nexusId, matches);
    }
  }
  return modsByNexusId;
}

function httpsPictureUrl(value) {
  const pictureUrl = typeof value === 'string' ? value.replace(/^http:/i, 'https:') : '';
  return pictureUrl.startsWith('https://') ? pictureUrl : '';
}

export function applyNexusMetadata(targets, data, categoriesById) {
  const nexusCategory = categoriesById.get(String(data.category_id)) || null;
  const pictureUrl = httpsPictureUrl(data.picture_url);

  for (const { mod, includeStats } of targets) {
    if (includeStats) {
      delete mod.status;
      delete mod.error;
      Object.assign(mod, {
        downloads: data.mod_downloads ?? 0,
        uniqueDownloads: data.mod_unique_downloads ?? 0,
        endorsements: data.endorsement_count ?? 0,
        available: data.available !== false,
        nexusCategory,
        category: normalizeNexusCategory(nexusCategory),
      });
    }

    if (pictureUrl) mod.pictureUrl = pictureUrl;
    else delete mod.pictureUrl;
  }
}

function markUnavailable(targets, statusOrError) {
  for (const { mod, includeStats } of targets) {
    if (!includeStats) continue;
    if ('status' in statusOrError) delete mod.error;
    else delete mod.status;
    Object.assign(mod, { available: false, ...statusOrError });
  }
}

async function loadSources() {
  return Promise.all(DATA_SOURCES.map(async source => {
    const absolutePath = path.join(ROOT, ...source.relativePath.split('/'));
    const raw = await readFile(absolutePath, 'utf8');
    const data = JSON.parse(raw);
    const indentation = raw.match(/\n([ \t]+)\S/)?.[1] || '  ';
    const mods = source.records(data, source.relativePath);
    return { ...source, absolutePath, data, indentation, mods };
  }));
}

async function writeSources(sources) {
  await Promise.all(sources.map(source => {
    source.finish?.(source.data);
    return writeFile(
      source.absolutePath,
      `${JSON.stringify(source.data, null, source.indentation)}\n`,
    );
  }));
}

export async function main() {
  const key = process.env.NEXUS_API_KEY;
  if (!key) throw new Error('NEXUS_API_KEY is not set');

  const sources = await loadSources();
  const modsByNexusId = buildNexusIndex(sources);
  for (const source of sources) {
    const nexusCount = source.mods.filter(mod => nexusIdFor(mod.url)).length;
    console.log(`${source.key}: ${nexusCount} Nexus mod entries`);
  }
  console.log(`Found ${modsByNexusId.size} unique Nexus mods site-wide`);

  const headers = {
    apikey: key,
    'application-name': 'morrowind-modding-showcases',
    'application-version': '1.1',
  };
  // The v1 API has no standalone categories endpoint; the game info response
  // carries the category list.
  const gameResponse = await fetch(
    `https://api.nexusmods.com/v1/games/${GAME}.json`,
    { headers },
  );
  if (!gameResponse.ok) {
    throw new Error(`Could not fetch Nexus game info: HTTP ${gameResponse.status}`);
  }
  const categories = (await gameResponse.json()).categories;
  if (!Array.isArray(categories)) {
    throw new Error('Nexus game info response did not include a categories array');
  }
  const categoriesById = new Map(categories.map(category => [
    String(category.category_id),
    category.name,
  ]));
  console.log(`Found ${categoriesById.size} Nexus categories`);

  let done = 0;
  let failed = 0;

  for (const [id, targets] of modsByNexusId) {
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
          applyNexusMetadata(targets, await response.json(), categoriesById);
        } else {
          markUnavailable(targets, { status: response.status });
          failed++;
        }
      } catch (error) {
        markUnavailable(targets, { error: String(error) });
        failed++;
      }
      break;
    }
    done++;
    if (done % 100 === 0) console.log(`${done}/${modsByNexusId.size}…`);
    await sleep(300);
  }

  await writeSources(sources);
  console.log(`Updated ${sources.map(source => source.relativePath).join(', ')}`);
  console.log(`${done} Nexus mods processed; ${failed} unavailable or failed`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
