// Refreshes Nexus metadata for every Nexus-hosted mod used by the site.
// Modathon receives the complete stats/category payload; ModJam and Madness
// receive the primary Nexus picture without losing their event categories.
// Usage: NEXUS_API_KEY=... node scripts/fetch-nexus-stats.mjs
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import yaml from 'js-yaml';
import categoryApi from '../modathon/nexus-categories.js';
import {
  MODS_METADATA_PATH,
  canonicalJson,
  loadContentSources,
} from './content-lib.mjs';
import { loadWikiMods } from './wiki-content-lib.mjs';

const { normalizeNexusModCategory } = categoryApi;

const GAME = 'morrowind';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const DATA_SOURCES = [
  {
    key: 'modathon',
    relativePath: 'content/modathon/mods',
    includeStats: true,
    contentSource: true,
    records: content => content.modRecords,
    files: content => content.modFiles,
  },
  {
    key: 'modjam',
    relativePath: 'content/modjam/mods',
    includeStats: false,
    contentSource: true,
    records: content => content.modjamModRecords,
    files: content => content.modjamModFiles,
  },
  {
    key: 'madness',
    relativePath: 'content/madness/mods',
    includeStats: false,
    contentSource: true,
    records: content => content.madnessModRecords,
    files: content => content.madnessModFiles,
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
      matches.push({
        mod,
        includeStats: source.includeStats,
        ...(source.includeWikiMetadata === true ? { includeWikiMetadata: true } : {}),
      });
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

  for (const { mod, includeStats, includeWikiMetadata } of targets) {
    if (includeStats) {
      const siteCategory = String(mod.category || '').trim()
        || normalizeNexusModCategory(nexusCategory, mod.url);
      delete mod.status;
      delete mod.error;
      Object.assign(mod, {
        downloads: data.mod_downloads ?? 0,
        uniqueDownloads: data.mod_unique_downloads ?? 0,
        endorsements: data.endorsement_count ?? 0,
        available: data.available !== false,
        nexusCategory,
        category: siteCategory,
      });
    }

    if (pictureUrl) mod.pictureUrl = pictureUrl;
    else delete mod.pictureUrl;

    if (includeWikiMetadata) {
      const summary = typeof data.summary === 'string' ? data.summary.trim() : '';
      if (summary) mod.description = summary;
      if (pictureUrl) mod.picture_url = pictureUrl;
      delete mod.pictureUrl;
    }
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
  const [content, wikiEntries] = await Promise.all([loadContentSources(), loadWikiMods()]);
  const contentSources = DATA_SOURCES.map(source => {
    const mods = source.records(content);
    return {
      ...source,
      content,
      files: source.files(content),
      mods,
      originals: mods.map(mod => structuredClone(mod)),
    };
  });
  return [
    ...contentSources,
    {
      key: 'wiki',
      relativePath: 'wiki/content/mods',
      includeStats: false,
      includeWikiMetadata: true,
      contentSource: false,
      content,
      files: wikiEntries.map(entry => entry.filePath),
      mods: wikiEntries.map(entry => entry.frontmatter),
      entries: wikiEntries,
      originals: wikiEntries.map(entry => structuredClone(entry.frontmatter)),
    },
  ];
}

async function writeSources(sources) {
  await Promise.all(sources.map(async source => {
    const writes = source.mods.flatMap((mod, index) => (
      isDeepStrictEqual(mod, source.originals[index])
        ? []
        : [source.includeWikiMetadata
          ? (() => {
              const entry = source.entries[index];
              const oldDescription = typeof source.originals[index].description === 'string'
                ? source.originals[index].description.trim()
                : '';
              const body = entry.body.trim();
              const migratedStub = 'This wiki entry was migrated from the TES3 Mod Map and is currently a stub.';
              const replaceBody = body === '' || body === migratedStub || (oldDescription && body === oldDescription);
              const nextBody = replaceBody && typeof mod.description === 'string'
                ? `\n${mod.description.trim()}\n`
                : entry.body;
              const sourceText = `---\n${yaml.dump(mod, {
                lineWidth: -1,
                noRefs: true,
                forceQuotes: true,
                quotingType: '"',
              })}---${nextBody}`;
              return writeFile(source.files[index], sourceText, 'utf8');
            })()
          : writeFile(source.files[index], canonicalJson(mod), 'utf8')]
    ));
    await Promise.all(writes);
  }));
  const metadata = sources[0].content.metadata;
  metadata.generated = new Date().toISOString();
  metadata.game = GAME;
  await writeFile(MODS_METADATA_PATH, canonicalJson(metadata), 'utf8');
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
