// Refreshes Nexus metadata for every Nexus-hosted mod used by the site.
// Modathon receives the complete stats/category payload; Modjam and Madness
// receive the primary Nexus picture without losing their event categories.
// Usage: NEXUS_API_KEY=... node scripts/fetch-nexus-stats.mjs
import { appendFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import categoryApi from '../modathon/nexus-categories.js';
import {
  MODS_METADATA_PATH,
  canonicalJson,
  loadContentSources,
} from './content-lib.mjs';

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
    for (const [index, mod] of source.mods.entries()) {
      const nexusId = nexusIdFor(mod.url);
      if (!nexusId) continue;
      const matches = modsByNexusId.get(nexusId) || [];
      matches.push({
        mod,
        includeStats: source.includeStats,
        source: source.key,
        file: source.files?.[index],
      });
      modsByNexusId.set(nexusId, matches);
    }
  }
  return modsByNexusId;
}

function httpsPictureUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

export function applyNexusMetadata(targets, data, categoriesById = new Map()) {
  // A malformed response is not confirmation that Nexus has removed an image.
  if (!data || typeof data !== 'object' || Array.isArray(data)
      || !Object.hasOwn(data, 'picture_url')) {
    throw new Error('Invalid Nexus metadata: missing picture_url field');
  }
  const nexusCategory = categoriesById.get(String(data.category_id)) || null;
  const pictureUrl = httpsPictureUrl(data.picture_url);
  if (data.picture_url !== null && data.picture_url !== '' && !pictureUrl) {
    throw new Error('Invalid Nexus metadata: invalid picture_url');
  }

  for (const { mod, includeStats } of targets) {
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
  }
}

function markUnavailable(targets, statusOrError, logger) {
  for (const { mod, includeStats } of targets) {
    // Modjam and Madness do not have availability/stat fields. Their failures
    // are recorded in the refresh report and logs, without changing event data.
    // In particular, never remove pictureUrl on a failed request.
    if (!includeStats) continue;
    if ('status' in statusOrError) delete mod.error;
    else delete mod.status;
    Object.assign(mod, { available: false, ...statusOrError });
  }
  for (const target of targets) {
    const reason = 'status' in statusOrError
      ? `HTTP ${statusOrError.status}` : statusOrError.error;
    logTarget(logger, target, `${reason}, ${target.mod.pictureUrl
      ? 'retaining previous pictureUrl' : 'no previous pictureUrl to retain'}`, true);
  }
}

function logTarget(logger, target, message, warning = false) {
  const { mod, source } = target;
  logger[warning ? 'warn' : 'log'](
    `[${source}] ${nexusIdFor(mod.url)} ${mod.title || mod.name}: ${message}`,
  );
}

async function loadSources() {
  const content = await loadContentSources();
  return DATA_SOURCES.map(source => {
    const mods = source.records(content);
    return {
      ...source,
      content,
      files: source.files(content),
      mods,
      originals: mods.map(mod => structuredClone(mod)),
    };
  });
}

export async function writeSources(sources, metadataPath = MODS_METADATA_PATH) {
  await Promise.all(sources.map(async source => {
    const writes = source.mods.flatMap((mod, index) => (
      isDeepStrictEqual(mod, source.originals[index])
        ? []
        : [writeFile(source.files[index], canonicalJson(mod), 'utf8')]
    ));
    await Promise.all(writes);
  }));
  const metadata = sources[0].content.metadata;
  metadata.generated = new Date().toISOString();
  metadata.game = GAME;
  await writeFile(metadataPath, canonicalJson(metadata), 'utf8');
}

// Injectable IO lets tests exercise the actual request/retry loop without a key
// or network access. One request updates every site record referring to that ID.
export async function refreshNexusSources(sources, {
  key,
  fetchImpl = fetch,
  sleepImpl = sleep,
  logger = console,
} = {}) {
  if (!key) throw new Error('NEXUS_API_KEY is not set');

  const modsByNexusId = buildNexusIndex(sources);
  const report = {
    generatedAt: new Date().toISOString(),
    uniqueMods: modsByNexusId.size,
    processedMods: 0,
    failedMods: 0,
    sources: {},
    entries: [],
  };
  for (const source of sources) {
    const nexusCount = source.mods.filter(mod => nexusIdFor(mod.url)).length;
    report.sources[source.key] = { checked: 0, withPictures: 0, updated: 0, missing: 0, failed: 0 };
    logger.log(`${source.key}: ${nexusCount} Nexus mod entries`);
  }
  logger.log(`Found ${modsByNexusId.size} unique Nexus mods site-wide`);

  const headers = {
    apikey: key,
    'application-name': 'morrowind-modding-showcases',
    'application-version': '1.1',
  };
  // The v1 API has no standalone categories endpoint; the game info response
  // carries the category list.
  const gameResponse = await fetchImpl(
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
  logger.log(`Found ${categoriesById.size} Nexus categories`);

  for (const [id, targets] of modsByNexusId) {
    const previousPictures = targets.map(({ mod }) => mod.pictureUrl);
    let failure;
    let status;
    let attempt = 0;
    while (true) {
      attempt++;
      status = undefined;
      try {
        const response = await fetchImpl(`https://api.nexusmods.com/v1/games/${GAME}/mods/${id}.json`, {
          headers,
        });
        status = response.status;
        if (response.status === 429 && attempt <= 3) {
          logger.warn(`429 on ${id}, backing off 60s (retry ${attempt}/3)`);
          await sleepImpl(60_000);
          continue;
        }
        if (response.ok) {
          applyNexusMetadata(targets, await response.json(), categoriesById);
        } else {
          failure = { status: response.status };
        }
      } catch (error) {
        failure = { error: String(error) };
      }
      break;
    }
    if (failure) {
      markUnavailable(targets, failure, logger);
      report.failedMods++;
    }
    for (const [index, target] of targets.entries()) {
      const { source, file, mod } = target;
      const outcome = failure ? 'request-failed'
        : !mod.pictureUrl ? 'missing'
          : mod.pictureUrl !== previousPictures[index] ? 'updated' : 'unchanged';
      const summary = report.sources[source];
      summary.checked++;
      if (httpsPictureUrl(mod.pictureUrl)) summary.withPictures++;
      if (outcome === 'updated') {
        summary.updated++;
        logTarget(logger, target, 'picture_url updated');
      } else if (outcome === 'missing') {
        summary.missing++;
        logTarget(logger, target, `Nexus returned no picture_url${previousPictures[index]
          ? ', removed previous pictureUrl' : ''}`, true);
      } else if (failure) {
        summary.failed++;
      }
      report.entries.push({
        source,
        id,
        title: mod.title || mod.name,
        eventId: mod.eventId,
        year: mod.year,
        file,
        outcome,
        status,
        ...failure,
        pictureUrl: mod.pictureUrl || null,
        retainedPreviousPicture: Boolean(failure && previousPictures[index]),
      });
    }
    report.processedMods++;
    if (report.processedMods % 100 === 0) logger.log(`${report.processedMods}/${modsByNexusId.size}…`);
    await sleepImpl(300);
  }

  logger.log(formatNexusSummary(report));
  logger.log(`${report.processedMods} Nexus mods processed; ${report.failedMods} unavailable or failed`);
  return report;
}

export function formatNexusSummary(report) {
  return Object.entries(report.sources).map(([source, summary]) => (
    `${source[0].toUpperCase()}${source.slice(1)} Nexus images:\n`
    + `${summary.checked} Nexus entries checked\n`
    + `${summary.withPictures} with picture URLs\n`
    + `${summary.updated} updated\n`
    + `${summary.missing} missing from Nexus\n`
    + `${summary.failed} request failures`
  )).join('\n\n');
}

export async function main() {
  const key = process.env.NEXUS_API_KEY;
  if (!key) throw new Error('NEXUS_API_KEY is not set');
  const sources = await loadSources();
  const report = await refreshNexusSources(sources, { key });
  // Preserve diagnostics separately from the strict public content schemas.
  // Actions uploads this even if later content validation prevents a commit.
  if (process.env.NEXUS_REPORT_PATH) {
    await writeFile(process.env.NEXUS_REPORT_PATH, canonicalJson(report), 'utf8');
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n\`\`\`text\n${formatNexusSummary(report)}\n\`\`\`\n`, 'utf8');
  }
  await writeSources(sources);
  console.log(`Updated ${sources.map(source => source.relativePath).join(', ')}`);
  return report;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
