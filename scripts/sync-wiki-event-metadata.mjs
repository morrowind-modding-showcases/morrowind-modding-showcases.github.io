import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  REPO_ROOT,
  loadWikiMods,
  serializeWikiMarkdown,
  stableUniqueStrings,
} from './wiki-content-lib.mjs';

const nexusIdFor = value => String(value ?? '').match(/nexusmods\.com\/morrowind\/mods\/(\d+)/i)?.[1] ?? '';

async function jsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async entry => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return jsonFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.json') ? [entryPath] : [];
  }))).flat();
}

async function readRecords(relativeDirectory) {
  const files = await jsonFiles(path.join(REPO_ROOT, relativeDirectory));
  return Promise.all(files.map(file => readFile(file, 'utf8').then(JSON.parse)));
}

async function loadEventSourceRecords() {
  const [modathon, modjam, madness, madnessTeams, registry] = await Promise.all([
    readRecords('content/modathon/mods'),
    readRecords('content/modjam/mods'),
    readRecords('content/madness/mods'),
    readRecords('content/madness/teams'),
    readFile(path.join(REPO_ROOT, 'assets', 'data', 'modders.json'), 'utf8').then(JSON.parse),
  ]);
  return { modathon, modjam, madness, madnessTeams, registry };
}

export const modathonEventLabel = record => `Morrowind Modathon ${record.year}`;
export const modjamEventLabel = record => {
  const [season, year] = String(record.eventId ?? '').split('-');
  return `${season ? season[0].toUpperCase() + season.slice(1) : 'Morrowind'} Modjam ${year ?? ''}`.trim();
};
export const madnessEventLabel = record => `Morrowind Modding Madness ${record.year}`;

export async function buildCanonicalEventLabels() {
  const { modathon, modjam, madness } = await loadEventSourceRecords();
  return stableUniqueStrings([
    ...modathon.map(modathonEventLabel),
    ...modjam.map(modjamEventLabel),
    ...madness.map(madnessEventLabel),
  ]);
}

function addEvent(index, record, label, authors = []) {
  const id = nexusIdFor(record.url);
  if (!id) return;
  const metadata = index.get(id) ?? { events: [], authors: [], pictureUrl: null, showcaseUrl: null };
  metadata.events.push(label);
  metadata.authors.push(...authors);
  if (!metadata.pictureUrl && typeof record.pictureUrl === 'string' && record.pictureUrl.trim()) {
    metadata.pictureUrl = record.pictureUrl.trim().replace(/^http:/i, 'https:');
  }
  if (!metadata.showcaseUrl && typeof record.showcaseUrl === 'string' && record.showcaseUrl.trim()) {
    metadata.showcaseUrl = record.showcaseUrl.trim();
  }
  index.set(id, metadata);
}

export async function buildEventMetadataIndex() {
  const { modathon, modjam, madness, madnessTeams, registry } = await loadEventSourceRecords();
  const profilesById = new Map((registry.modders ?? []).map(profile => [profile.id, profile]));
  const profileName = reference => {
    const id = typeof reference === 'string' ? reference : reference?.id;
    return profilesById.get(id)?.name ?? (typeof reference?.name === 'string' ? reference.name : '');
  };
  const madnessTeamName = value => String(value ?? '').replace(/^team\s+/i, '').trim().toLocaleLowerCase('en-US');
  const madnessTeamByKey = new Map(madnessTeams.map(team => [`${team.year}\0${madnessTeamName(team.name)}`, team]));
  const index = new Map();
  for (const record of modathon) {
    const authors = (record.authors ?? []).map(author => typeof author === 'string' ? author : author?.name).filter(Boolean);
    addEvent(index, record, modathonEventLabel(record), authors);
  }
  for (const record of modjam) {
    addEvent(index, record, modjamEventLabel(record), (record.authors ?? []).map(profileName).filter(Boolean));
  }
  for (const record of madness) {
    const team = madnessTeamByKey.get(`${record.year}\0${madnessTeamName(record.team)}`);
    addEvent(
      index,
      record,
      madnessEventLabel(record),
      (team?.members ?? []).map(profileName).filter(Boolean),
    );
  }
  for (const metadata of index.values()) {
    metadata.events = stableUniqueStrings(metadata.events);
    metadata.authors = stableUniqueStrings(metadata.authors);
  }
  return index;
}

export async function syncWikiEventMetadata() {
  const [mods, eventIndex] = await Promise.all([loadWikiMods(), buildEventMetadataIndex()]);
  let changed = 0;
  for (const mod of mods) {
    const id = nexusIdFor(mod.frontmatter.url);
    const metadata = eventIndex.get(id);
    const next = { ...mod.frontmatter, events: metadata?.events ?? [] };
    if (metadata?.authors.length) next.authors = metadata.authors;
    if (!next.picture_url && metadata?.pictureUrl) next.picture_url = metadata.pictureUrl;
    if (!next.showcase_url && metadata?.showcaseUrl) next.showcase_url = metadata.showcaseUrl;
    const before = JSON.stringify(mod.frontmatter);
    const malformedDelimiter = typeof mod.source === 'string' && /^---\S/m.test(mod.source);
    if (before === JSON.stringify(next) && !malformedDelimiter) continue;
    const source = serializeWikiMarkdown(next, mod.body);
    await writeFile(mod.filePath, source, 'utf8');
    changed++;
  }
  return { changed, total: mods.length, eventMods: mods.filter(mod => eventIndex.has(nexusIdFor(mod.frontmatter.url))).length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await syncWikiEventMetadata();
  console.log(`Synced event metadata for ${result.eventMods} of ${result.total} wiki mods; ${result.changed} files changed.`);
}
