import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const MadnessProfiles = require('../madness/profile-data.js');
const MmsModders = require('../assets/modder-registry.js');
const registry = JSON.parse(fs.readFileSync(new URL('../assets/data/modders.json', import.meta.url), 'utf8'));
const teamsDocument = JSON.parse(
  fs.readFileSync(new URL('../madness/data/madness-teams.json', import.meta.url), 'utf8'),
);
const modathonMods = JSON.parse(
  fs.readFileSync(new URL('../modathon/assets/data/modathon-mods.json', import.meta.url), 'utf8'),
);
const modjamMods = JSON.parse(
  fs.readFileSync(new URL('../modjam/data/modjam-mods.json', import.meta.url), 'utf8'),
);
const modjamJudges = JSON.parse(
  fs.readFileSync(new URL('../modjam/data/judges.json', import.meta.url), 'utf8'),
);
const avatarManifest = JSON.parse(
  fs.readFileSync(new URL('../assets/data/modder-avatars.json', import.meta.url), 'utf8'),
);
const modderPageSource = fs.readFileSync(
  new URL('../madness/modder.html', import.meta.url),
  'utf8',
);
const modderRosterSource = fs.readFileSync(
  new URL('../madness/modders.html', import.meta.url),
  'utf8',
);
const teamsPageSource = fs.readFileSync(
  new URL('../madness/teams.html', import.meta.url),
  'utf8',
);
const references = MmsModders.inferMadnessReferences(teamsDocument);
const modathonReferences = MmsModders.inferModathonReferences(modathonMods, registry);
const modathonIds = new Set(MmsModders.referenceIds(modathonReferences));
const modjamReferences = MmsModders.inferModjamReferences(modjamMods, modjamJudges);
const modjamIds = new Set(MmsModders.referenceIds(modjamReferences));
const modders = MmsModders.resolveProfiles(registry, references).map(profile => ({
  id: profile.id,
  name: profile.name,
  profileUrl: profile.nexusProfileUrl,
  avatar: MmsModders.localAvatarUrl(profile.avatarUrl, avatarManifest),
  modathonProfile: modathonIds.has(profile.id)
    ? `https://darkelfmodding.com/modathon/modder/${profile.id}`
    : null,
  modjamProfile: modjamIds.has(profile.id)
    ? `https://darkelfmodding.com/modjam/modder/${profile.id}`
    : null,
}));
const teams = MmsModders.hydrateMadnessTeams(
  teamsDocument,
  registry,
  avatarManifest,
);
const mods = JSON.parse(
  fs.readFileSync(new URL('../madness/data/madness-mods.json', import.meta.url), 'utf8'),
).years;
const profiles = MadnessProfiles.buildProfiles(modders, teams, mods);

test('builds a profile for every unique Madness team member', () => {
  const uniqueMembers = new Set(teams.flatMap(year => year.teams.flatMap(team => team.members.map(member => member.name))));
  assert.equal(profiles.length, uniqueMembers.size);
  for (const member of uniqueMembers) {
    assert.ok(MadnessProfiles.findProfile(profiles, member), `${member} must have a Madness profile`);
  }
});

test('uses the shared same-origin avatar cache for Madness-only modders', () => {
  const lightsourced = MadnessProfiles.findProfile(profiles, 'Lightsourced');
  assert.equal(
    lightsourced.avatar,
    avatarManifest.avatars['28282110'],
  );
  assert.match(lightsourced.avatar, /^\/assets\/images\/modder-avatars\/28282110\./);

  for (const source of [modderPageSource, modderRosterSource]) {
    assert.match(source, /fetch\('\.\.\/assets\/data\/modder-avatars\.json'\)/);
    assert.match(source, /MmsModders\.localAvatarUrl\(profile\.avatarUrl, avatarData\)/);
    assert.match(source, /hydrateMadnessTeams\(teamsData, registry, avatarData\)/);
  }
  assert.match(teamsPageSource, /fetch\('\.\.\/assets\/data\/modder-avatars\.json'\)/);
  assert.match(teamsPageSource, /hydrateMadnessTeams\(teamsData, registry, avatarData\)/);

  const registryById = MmsModders.registryById(registry);
  for (const id of MmsModders.referenceIds(references)) {
    const profile = registryById.get(id);
    const userId = String(profile?.avatarUrl || '').match(
      /^https:\/\/avatars\.nexusmods\.com\/(\d+)\/100(?:[/?#].*)?$/i,
    )?.[1];
    if (!userId) continue;
    const cachedUrl = avatarManifest.avatars[userId];
    assert.ok(cachedUrl, `${profile.name} must have a same-origin cached avatar`);
    assert.ok(
      fs.existsSync(new URL(`..${cachedUrl}`, import.meta.url)),
      `${profile.name}'s cached avatar file must exist`,
    );
  }
});

test('derives team history, clean submissions, placements, and repeat partners', () => {
  const fixtureTeams = [
    {
      year: 2019,
      teams: [{
        name: 'First Team',
        place: '2nd Place',
        members: [{ name: 'Alice' }, { name: 'Bob' }],
        mods: [{ name: 'First Mod' }, { name: '3rd Place', url: null }],
      }],
    },
    {
      year: 2020,
      teams: [{
        name: 'Second Team',
        place: '1st Place',
        members: [{ name: 'Alice' }, { name: 'Bob' }],
        mods: [{ name: 'Second Mod' }],
      }],
    },
    {
      year: 2022,
      teams: [{
        name: 'Third Team',
        place: '1st Place',
        members: [{ name: 'Alice' }, { name: 'Bob' }],
        mods: [{ name: 'Third Mod' }],
      }],
    },
  ];
  const fixtureMods = [
    { year: 2019, mods: [{ name: 'First Mod', url: null, place: '2nd Place' }] },
    { year: 2020, mods: [{ name: 'Second Mod', url: 'https://example.com/second', place: '1st Place' }] },
    { year: 2022, mods: [{ name: 'Third Mod', url: 'https://example.com/third', place: '1st Place' }] },
  ];
  const fixtureProfiles = MadnessProfiles.buildProfiles(
    [{ name: 'Alice' }, { name: 'Bob' }],
    fixtureTeams,
    fixtureMods,
  );
  const alice = MadnessProfiles.findProfile(fixtureProfiles, 'Alice');

  assert.equal(alice.totalCompetitions, fixtureTeams.length);
  assert.equal(alice.submissions.length, fixtureMods.length);
  assert.deepEqual(alice.highestPlaceYears, [2020, 2022]);
  assert.equal(alice.highestPlace, '1st Place');
  assert.ok(alice.submissions.every(mod => !MadnessProfiles.isPlacementSentinel(mod)));
  assert.equal(alice.submissions.find(mod => mod.name === 'First Mod').url, null);
  const bob = alice.frequentPartners.find(partner => partner.name === 'Bob');
  assert.equal(bob.count, fixtureTeams.length);
  assert.deepEqual(bob.years, fixtureTeams.map(group => group.year));
  const placements = new Map(
    alice.placementSummary.map(place => [place.place, place.count]),
  );
  assert.equal(placements.get('1ST PLACE'), 2);
  assert.equal(placements.get('2ND PLACE'), 1);
});

test('treats the 2021 hiatus as consecutive Madness seasons', () => {
  assert.deepEqual(
    MadnessProfiles.longestStreak([2019, 2020, 2022, 2023], teams.map(year => year.year)),
    {
      count: 4,
      startYear: 2019,
      endYear: 2023,
      years: [2019, 2020, 2022, 2023]
    }
  );
});

test('uses explicit team standings without requiring fake mods', () => {
  const team = {
    name: 'Fixture Team',
    place: '1st Place',
    mods: [{ name: 'Fixture Mod', url: 'https://example.com/mod' }],
  };
  assert.equal(MadnessProfiles.getTeamPlace(team), '1st Place');
  assert.equal(team.mods.some(MadnessProfiles.isPlacementSentinel), false);
});

test('Madness profiles include their cross-site Modathon and ModJam links', () => {
  const lordZarcon = modders.find(profile => profile.name === 'Lord Zarcon');
  const melchior = MadnessProfiles.findProfile(profiles, 'Melchior Dahrk');
  assert.equal(
    lordZarcon.modathonProfile,
    'https://darkelfmodding.com/modathon/modder/lord-zarcon',
  );
  assert.equal(
    melchior.modjamProfile,
    'https://darkelfmodding.com/modjam/modder/melchior-dahrk',
  );
  for (const source of [modderPageSource, modderRosterSource]) {
    assert.match(source, /fetch\('\.\.\/modjam\/data\/modjam-mods\.json'\)/);
    assert.match(source, /fetch\('\.\.\/modjam\/data\/judges\.json'\)/);
    assert.match(source, /'\/modjam\/modder\/' \+ encodeURIComponent\(profile\.id\)/);
  }
  assert.match(modderPageSource, /value="\{\{ modjamProfile \}\}"/);
  assert.match(modderPageSource, /modjamProfile:\s*profile\.modjamProfile/);
  assert.match(modderRosterSource, /value="\{\{ m\.modjamProfile \}\}"/);
});

test('Madness profiles carry showcase URLs into submission groups', () => {
  const fixtureProfiles = MadnessProfiles.buildProfiles(
    [{ name: 'Showcase Modder' }],
    [{
      year: 2030,
      teams: [{
        name: 'Showcase Team',
        mods: [{ name: 'Showcase Mod' }],
        members: [{ name: 'Showcase Modder' }],
      }],
    }],
    [{
      year: 2030,
      mods: [{
        name: 'Showcase Mod',
        url: 'https://www.nexusmods.com/morrowind/mods/60000',
        showcaseUrl: 'https://www.youtube.com/watch?v=abcdefghijk',
      }],
    }],
  );
  const submission = fixtureProfiles[0].submissionGroups[0].mods[0];
  assert.equal(submission.showcaseUrl, 'https://www.youtube.com/watch?v=abcdefghijk');
  assert.equal(submission.showcaseLabel, 'Watch the MMS showcase for Showcase Mod');
});
