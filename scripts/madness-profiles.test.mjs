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
const references = MmsModders.inferMadnessReferences(teamsDocument);
const modathonReferences = MmsModders.inferModathonReferences(modathonMods, registry);
const modathonIds = new Set(MmsModders.referenceIds(modathonReferences));
const modders = MmsModders.resolveProfiles(registry, references).map(profile => ({
  id: profile.id,
  name: profile.name,
  profileUrl: profile.nexusProfileUrl,
  avatar: profile.avatarUrl,
  modathonProfile: modathonIds.has(profile.id)
    ? `https://darkelfmodding.com/modathon/modder/${profile.id}`
    : null,
}));
const teams = MmsModders.hydrateMadnessTeams(
  teamsDocument,
  registry,
);
const mods = JSON.parse(
  fs.readFileSync(new URL('../madness/data/madness-mods.json', import.meta.url), 'utf8'),
).years;
const profiles = MadnessProfiles.buildProfiles(modders, teams, mods);

test('builds a profile for every unique Madness team member', () => {
  const uniqueMembers = new Set(teams.flatMap(year => year.teams.flatMap(team => team.members.map(member => member.name))));
  assert.equal(profiles.length, uniqueMembers.size);
  assert.ok(profiles.length >= 123);
  assert.ok(MadnessProfiles.findProfile(profiles, 'Lord Zarcon'));
  assert.ok(MadnessProfiles.findProfile(profiles, 'DaisyHasACat'));
});

test('derives team history, clean submissions, placements, and repeat partners', () => {
  const greatness = MadnessProfiles.findProfile(profiles, 'Greatness7');
  assert.ok(greatness.totalCompetitions >= 6);
  assert.ok(greatness.submissions.length >= 14);
  assert.ok([2016, 2017, 2018].every(year => greatness.highestPlaceYears.includes(year)));
  assert.equal(greatness.highestPlace, '1st Place');
  assert.ok(greatness.submissions.every(mod => !MadnessProfiles.isPlacementSentinel(mod)));
  assert.equal(greatness.submissions.find(mod => mod.name === 'Andrano Retribution').url, null);
  const remiros = greatness.frequentPartners.find(partner => partner.name === 'Remiros');
  assert.ok(remiros.count >= 3);
  assert.ok([2018, 2022, 2023].every(year => remiros.years.includes(year)));
  const placements = new Map(
    greatness.placementSummary.map(place => [place.place, place.count]),
  );
  assert.ok(placements.get('1ST PLACE') >= 6);
  assert.ok(placements.get('2ND PLACE') >= 5);
  assert.ok(placements.get('3RD PLACE') >= 1);
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

test('stores later team standings as team places instead of fake mods', () => {
  const dramaKwama = teams.find(year => year.year === 2018).teams.find(team => team.name === 'Drama Kwama');
  assert.equal(dramaKwama.place, '1st Place');
  assert.equal(MadnessProfiles.getTeamPlace(dramaKwama), '1st Place');
  assert.equal(dramaKwama.mods.filter(MadnessProfiles.isPlacementSentinel).length, 0);
});

test('Madness profiles include their cross-site Modathon links', () => {
  const lordZarcon = modders.find(profile => profile.name === 'Lord Zarcon');
  assert.equal(
    lordZarcon.modathonProfile,
    'https://darkelfmodding.com/modathon/modder/lord-zarcon',
  );
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
