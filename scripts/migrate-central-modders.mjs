#!/usr/bin/env node

import { access, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fromRoot = (...parts) => path.join(repoRoot, ...parts);
const readJson = async (...parts) => JSON.parse(await readFile(fromRoot(...parts), 'utf8'));
const writeJson = (...args) => {
  const value = args.pop();
  return writeFile(fromRoot(...args), `${JSON.stringify(value, null, 2)}\n`);
};

const centralPath = fromRoot('assets', 'data', 'modders.json');
try {
  await access(centralPath);
  console.log('Central modder registry already exists; no migration was needed.');
  process.exit(0);
} catch {
  // Continue with the one-time migration.
}

const [
  modathonData,
  modjamData,
  madnessProfiles,
  judgesData,
  modjamArchive,
  modjamMods,
  madnessTeams,
  madnessMods,
  postcards,
  showcasesData,
  nexusStats,
] = await Promise.all([
  readJson('modathon', 'assets', 'data', 'modders.json'),
  readJson('modjam', 'data', 'modders.json'),
  readJson('madness', 'data', 'modders.json'),
  readJson('modjam', 'data', 'judges.json'),
  readJson('modjam', 'data', 'modjams.json'),
  readJson('modjam', 'data', 'modjam-mods.json'),
  readJson('madness', 'data', 'teams-by-year.json'),
  readJson('madness', 'data', 'mods-by-year.json'),
  readJson('modjam', 'data', 'postcards.json'),
  readJson('modathon', 'assets', 'data', 'showcases.json'),
  readJson('modathon', 'assets', 'data', 'modathon-mods.json'),
]);

const slugify = value => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');
const identityKey = value => String(value || '')
  .normalize('NFKD')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');
const nexusUser = value => {
  try {
    return identityKey(new URL(value).pathname.match(/\/profile\/([^/]+)/i)?.[1] || '');
  } catch {
    return '';
  }
};
const avatarId = value => String(value || '').match(/avatars\.nexusmods\.com\/(\d+)/i)?.[1] || '';
const compact = values => values.filter(Boolean);

const nameUsage = new Map();
const addNameUsage = name => nameUsage.set(name, (nameUsage.get(name) || 0) + 1);
Object.values(nexusStats.mods || {}).flat().forEach(mod => (mod.authors || []).forEach(addNameUsage));
for (let year = 2015; year <= 2026; year += 1) {
  const achievements = await readJson('modathon', 'assets', 'data', `${year}-achievements.json`);
  achievements.achievements.flatMap(achievement => achievement.unlockedBy || []).forEach(addNameUsage);
}

const central = [];

function sourceValues(record) {
  return {
    names: compact([
      record.name,
      record.profileName,
      record.listedAs,
      ...(Array.isArray(record.aliases) ? record.aliases : []),
    ]),
    urls: compact([record.url, record.profileUrl, record.nexusProfileUrl]),
    avatars: compact([record.avatar, record.avatarUrl]),
  };
}

function matchingProfiles(record) {
  const values = sourceValues(record);
  const names = new Set(values.names.map(identityKey));
  const nexusUsers = new Set(values.urls.map(nexusUser).filter(Boolean));
  const avatarIds = new Set(values.avatars.map(avatarId).filter(Boolean));
  const requestedId = record.id || record.modderId || '';

  return central.filter(profile => (
    profile.id === requestedId
    || profile.names.some(name => names.has(identityKey(name)))
    || profile.urls.some(url => nexusUsers.has(nexusUser(url)))
    || profile.avatars.some(avatar => avatarIds.has(avatarId(avatar)))
  ));
}

function mergeProfile(record, source) {
  const matches = matchingProfiles(record);
  if (matches.length > 1) {
    throw new Error(`Ambiguous ${source} identity ${record.id || record.modderId || record.name}`);
  }

  const values = sourceValues(record);
  let profile = matches[0];
  if (!profile) {
    const name = record.name || record.profileName || record.listedAs;
    const id = record.id || record.modderId || slugify(name);
    if (!id || central.some(candidate => candidate.id === id)) {
      throw new Error(`Invalid or duplicate central modder ID: ${id}`);
    }
    profile = {
      id,
      name,
      names: [name],
      urls: [],
      avatars: [],
    };
    central.push(profile);
  }

  for (const name of values.names) {
    if (!profile.names.includes(name)) {
      profile.names.push(name);
    }
  }
  if (
    source === 'Modathon'
    && record.name
    && (nameUsage.get(record.name) || 0) > (nameUsage.get(profile.name) || 0)
  ) {
    profile.name = record.name;
  }
  for (const url of values.urls) {
    if (!profile.urls.includes(url)) profile.urls.push(url);
  }
  for (const avatar of values.avatars) {
    if (!profile.avatars.includes(avatar)) profile.avatars.push(avatar);
  }

  const requestedId = record.id || record.modderId;
  if (source === 'Modjam' && requestedId && requestedId !== profile.id) {
    throw new Error(`Existing ID ${requestedId} does not match central ID ${profile.id}`);
  }
  return profile;
}

const uniqueIds = records => [...new Set(records.map(record => record.id))];
const modathonReferences = modathonData.modders.map(record => mergeProfile(record, 'Modathon'));
const modjamReferences = modjamData.modders.map(record => mergeProfile(record, 'Modjam'));
const madnessReferences = madnessProfiles.map(record => mergeProfile(record, 'Madness'));
judgesData.judges.forEach(record => mergeProfile(record, 'judge'));

const registry = {
  modders: central.map(profile => {
    const aliases = profile.names.filter(name => name !== profile.name);
    return {
      id: profile.id,
      name: profile.name,
      nexusProfileUrl: profile.urls[0] || null,
      avatarUrl: profile.avatars[0] || null,
      ...(aliases.length ? { aliases } : {}),
    };
  }),
};
const registryById = new Map(registry.modders.map(profile => [profile.id, profile]));

const oldModjamIdMap = new Map(modjamData.modders.map(record => [
  record.id,
  mergeProfile(record, 'Modjam').id,
]));
const modjamModsByEventId = new Map(
  modjamMods.events.map(group => [group.id, group.mods]),
);
modjamArchive.events.forEach(event => {
  event.entries = modjamModsByEventId.get(event.id) || [];
  event.entries.forEach(entry => {
    entry.authors = entry.authors.map(author => {
      const id = oldModjamIdMap.get(author.id) || author.id;
      if (!registryById.has(id)) throw new Error(`Unknown Modjam author ID: ${id}`);
      return { id };
    });
  });
});

function centralIdFor(record) {
  const matches = matchingProfiles(record);
  if (matches.length !== 1) throw new Error(`Could not resolve Madness member ${record.name || record.id}`);
  return matches[0].id;
}

madnessTeams.forEach(group => {
  group.teams.forEach(team => {
    team.members = team.members.map(member => ({ id: centralIdFor(member) }));
  });
});

const judges = judgesData.judges.map(judge => {
  const id = centralIdFor(judge);
  return {
    modderId: id,
    listedAs: judge.listedAs,
  };
});
const showcases = Object.entries(showcasesData.showcases || {}).map(([name, url]) => ({ name, url }));
const separatedModjamArchive = {
  events: modjamArchive.events.map(({ entries, ...event }) => event),
};
const separatedModjamMods = {
  ...modjamMods,
  events: modjamArchive.events.map(event => ({
    id: event.id,
    mods: event.entries,
  })),
};

await Promise.all([
  writeJson('assets', 'data', 'modders.json', registry),
  writeJson('modathon', 'assets', 'data', 'modders.json', {
    modders: uniqueIds(modathonReferences),
  }),
  writeJson('modjam', 'data', 'modders.json', {
    generatedAt: modjamData.generatedAt,
    modders: uniqueIds(modjamReferences),
  }),
  writeJson('madness', 'data', 'modders.json', {
    modders: uniqueIds(madnessReferences),
  }),
  writeJson('modjam', 'data', 'judges.json', { judges }),
  writeJson('modjam', 'data', 'modjams.json', separatedModjamArchive),
  writeJson('modjam', 'data', 'modjam-mods.json', separatedModjamMods),
  writeJson('modjam', 'data', 'postcards.json', { postcards }),
  writeJson('modathon', 'assets', 'data', 'showcases.json', { showcases }),
  writeJson('madness', 'data', 'madness-teams.json', { years: madnessTeams }),
  writeJson('madness', 'data', 'madness-mods.json', { years: madnessMods }),
]);

await Promise.all([
  unlink(fromRoot('madness', 'data', 'teams-by-year.json')),
  unlink(fromRoot('madness', 'data', 'mods-by-year.json')),
]);

console.log(`Created ${registry.modders.length} central modder profiles.`);
console.log(`Modathon references: ${uniqueIds(modathonReferences).length}`);
console.log(`Modjam references: ${uniqueIds(modjamReferences).length}`);
console.log(`Madness references: ${uniqueIds(madnessReferences).length}`);
