import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const MadnessProfiles = require('../madness/profile-data.js');
const modders = JSON.parse(fs.readFileSync(new URL('../madness/data/modders.json', import.meta.url), 'utf8'));
const teams = JSON.parse(fs.readFileSync(new URL('../madness/data/teams-by-year.json', import.meta.url), 'utf8'));
const mods = JSON.parse(fs.readFileSync(new URL('../madness/data/mods-by-year.json', import.meta.url), 'utf8'));
const profiles = MadnessProfiles.buildProfiles(modders, teams, mods);

test('builds a profile for every unique Madness team member', () => {
  const uniqueMembers = new Set(teams.flatMap(year => year.teams.flatMap(team => team.members.map(member => member.name))));
  assert.equal(profiles.length, uniqueMembers.size);
  assert.equal(profiles.length, 123);
  assert.ok(MadnessProfiles.findProfile(profiles, 'Lord Zarcon'));
  assert.ok(MadnessProfiles.findProfile(profiles, 'DaisyHasACat'));
});

test('derives team history, clean submissions, placements, and repeat partners', () => {
  const greatness = MadnessProfiles.findProfile(profiles, 'Greatness7');
  assert.equal(greatness.totalCompetitions, 6);
  assert.equal(greatness.submissions.length, 14);
  assert.deepEqual(greatness.highestPlaceYears, [2016, 2017, 2018]);
  assert.equal(greatness.highestPlace, '1st Place');
  assert.ok(greatness.submissions.every(mod => !MadnessProfiles.isPlacementSentinel(mod)));
  assert.equal(greatness.submissions.find(mod => mod.name === 'Andrano Retribution').url, null);
  assert.deepEqual(
    greatness.frequentPartners.map(partner => [partner.name, partner.count, partner.years]),
    [['Remiros', 3, [2018, 2022, 2023]]]
  );
  assert.deepEqual(
    greatness.placementSummary.slice(0, 3).map(place => [place.place, place.count]),
    [['1ST PLACE', 6], ['2ND PLACE', 5], ['3RD PLACE', 1]]
  );
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

test('recovers later team standings from placement sentinel records', () => {
  const dramaKwama = teams.find(year => year.year === 2018).teams.find(team => team.name === 'Drama Kwama');
  assert.equal(dramaKwama.place, null);
  assert.equal(MadnessProfiles.getTeamPlace(dramaKwama), '1st Place');
  assert.equal(dramaKwama.mods.filter(MadnessProfiles.isPlacementSentinel).length, 1);
});

test('Madness profiles include their cross-site Modathon links', () => {
  const lordZarcon = modders.find(profile => profile.name === 'Lord Zarcon');
  assert.equal(
    lordZarcon.modathonProfile,
    'https://darkelfmodding.com/modathon/modder/lord-zarcon',
  );
});
