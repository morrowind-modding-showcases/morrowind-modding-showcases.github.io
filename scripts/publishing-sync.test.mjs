import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildPublishingUpdate,
  parseModjamResult,
} from './import-publishing.mjs';
import {
  PublishingValidationError,
  loadPublishingDirectory,
} from './import-modathon-publishing.mjs';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const MmsModders = require('../assets/modder-registry.js');
const fixtureDirectory = path.join(scriptsDirectory, 'fixtures', 'publishing', 'all-events');
const schemaPath = path.resolve(scriptsDirectory, '..', 'publishing', 'schema-v1.json');
const requiredSheets = ['Events', 'Modders', 'Entries', 'Achievements', 'Teams', 'Media'];

async function publishingFixture() {
  return loadPublishingDirectory(fixtureDirectory, { schemaPath, requiredSheets });
}

function baseline() {
  return {
    eventConfig: {
      modathon: {
        schemaVersion: 1,
        eventType: 'modathon',
        events: [{
          name: 'Morrowind Modathon 2026',
          year: 2026,
          timezoneLabel: 'UTC',
          countdown: {
            start: '2026-05-01T00:00:00.000Z',
            end: '2026-06-02T00:00:00.000Z',
            graceEnd: '2026-06-02T12:00:00.000Z',
            reset: '2026-07-01T00:00:00.000Z',
          },
          awards: [],
        }],
      },
      modjam: {
        schemaVersion: 1,
        eventType: 'modjam',
        events: [{
          id: 'winter-2020',
          label: 'Winter 2020',
          name: 'Winter Modjam 2020',
          season: 'Winter',
          year: 2020,
          banner: null,
          headers: [],
          resultsStreamUrl: null,
          competitionType: 'just-for-fun',
          competitionLabel: 'Just for fun',
          competitionNote: 'No ranked winner; prizes were awarded by random drawing.',
          hasJudgeAwards: false,
        }],
      },
      madness: {
        schemaVersion: 1,
        eventType: 'madness',
        events: [{
          name: 'Morrowind Modding Madness 2026',
          year: 2026,
          season: 10,
          timezoneLabel: 'UTC',
          countdown: {
            registrationOpen: '2026-09-01T00:00:00.000Z',
            competitionStart: '2026-10-01T00:00:00.000Z',
            submissionsClose: '2026-11-07T00:00:00.000Z',
            bugFixEnd: '2026-11-15T00:00:00.000Z',
          },
          registrationFormId: 'oldform',
        }],
      },
    },
    modathon: {
      nexusStats: {
        generated: '2026-07-24T00:00:00.000Z',
        game: 'morrowind',
        mods: {
          2026: [{
            name: 'Historical Modathon Entry',
            authors: ['Historical Modder'],
            category: 'Quests',
            url: 'https://www.nexusmods.com/morrowind/mods/59999',
          }],
        },
      },
      modders: {
        modders: [{
          name: 'Historical Modder',
          url: 'https://www.nexusmods.com/profile/HistoricalModder',
          avatar: null,
        }],
      },
      achievementsByYear: new Map([[2027, null]]),
    },
    modjam: {
      archive: {
        schemaVersion: 1,
        eventType: 'modjam',
        generatedAt: '2026-07-19T00:00:00.000Z',
        summary: {
          eventCount: 1,
          entryCount: 1,
          modderCount: 1,
          listedModderCount: 1,
          placementCount: 0,
          judgeAwardCount: 0,
          placardCount: 0,
          categories: ['Dungeon Mods'],
        },
        events: [{
          id: 'winter-2020',
          label: 'Winter 2020',
          name: 'Winter Modjam 2020',
          season: 'Winter',
          year: 2020,
          banner: null,
          headers: [],
          resultsStreamUrl: null,
          competitionType: 'just-for-fun',
          competitionLabel: 'Just for fun',
          competitionNote: 'No ranked winner; prizes were awarded by random drawing.',
          hasJudgeAwards: false,
          entries: [{
            id: 'winter-2020-01',
            title: 'Historical Modjam Entry',
            url: 'https://www.nexusmods.com/morrowind/mods/58001',
            authors: [{ id: 'historical-modder', name: 'Historical Modder' }],
            themes: ['Old Theme'],
            category: 'Dungeon Mods',
            placement: null,
            placementLabel: null,
            awards: [],
            awardPlacardUrl: null,
            pictureUrl: 'https://staticdelivery.nexusmods.com/mods/100/images/58001/example.png',
          }],
        }],
      },
      profiles: {
        generatedAt: '2026-07-19T00:00:00.000Z',
        modders: [{
          id: 'historical-modder',
          name: 'Historical Modder',
          profileSource: 'modder-export',
          nexusProfileUrl: 'https://www.nexusmods.com/profile/HistoricalModder',
          avatarUrl: null,
          modathonProfileUrl: null,
          madnessProfileUrl: null,
          firstModjam: 'Winter 2020',
          participations: ['Winter 2020'],
          listedModjamCount: 1,
          entryIds: ['winter-2020-01'],
          placementEntryIds: [],
          awardCount: 0,
        }],
      },
    },
    madness: {
      teamsByYear: [{
        year: 2026,
        teams: [{
          name: 'Historical Team',
          place: '1st Place',
          mods: [{
            name: 'Historical Madness Entry',
            url: 'https://www.nexusmods.com/morrowind/mods/59001',
          }],
          members: [{
            name: 'Historical Modder',
            profileUrl: 'https://www.nexusmods.com/profile/HistoricalModder',
            avatar: null,
          }],
        }],
      }],
      modsByYear: [{
        year: 2026,
        mods: [{
          name: 'Historical Madness Entry',
          url: 'https://www.nexusmods.com/morrowind/mods/59001',
          team: 'Team Historical Team',
          category: 'Quest Mods',
          place: '1st Place',
          notes: null,
          pictureUrl: 'https://staticdelivery.nexusmods.com/mods/100/images/59001/example.png',
        }],
      }],
      profiles: [{
        name: 'Historical Modder',
        profileUrl: 'https://www.nexusmods.com/profile/HistoricalModder',
        avatar: null,
        modathonProfile: null,
        firstYear: 2026,
        totalCompetitions: 1,
        years: [2026],
        highestPlace: 'First Place',
        highestPlaceYears: [2026],
      }],
    },
  };
}

function currentFromResult(result) {
  const centralModders = structuredClone(result.centralModders);
  const modjamArchive = structuredClone(result.modjam.archive);
  const storedModjam = structuredClone(MmsModders.separateModjamData(modjamArchive));
  const modjamProfiles = MmsModders.hydrateModjam(
    modjamArchive,
    centralModders,
    result.modjam.profiles,
    result.modathon.modders,
    result.madness.profiles,
  );
  return {
    eventConfig: structuredClone(result.eventConfig),
    centralModders,
    modathon: {
      nexusStats: structuredClone(result.modathon.nexusStats),
      modders: {
        modders: MmsModders.asModathonProfiles(
          centralModders,
          result.modathon.modders,
        ),
      },
      references: structuredClone(result.modathon.modders),
      achievementsByYear: new Map(
        [...result.modathon.achievementsByYear].map(([year, value]) => [
          year,
          structuredClone(value),
        ]),
      ),
    },
    modjam: {
      archive: modjamArchive,
      rawArchive: structuredClone(storedModjam.archive),
      rawMods: structuredClone(storedModjam.mods),
      profiles: modjamProfiles,
      references: structuredClone(result.modjam.profiles),
    },
    madness: {
      teamsByYear: MmsModders.hydrateMadnessTeams(
        result.madness.teamsByYear,
        centralModders,
      ),
      rawTeamsByYear: structuredClone(result.madness.teamsByYear),
      modsByYear: structuredClone(result.madness.modsByYear.years),
      rawModsByYear: structuredClone(result.madness.modsByYear),
      profiles: MmsModders.resolveProfiles(
        centralModders,
        result.madness.profiles,
      ).map(profile => ({
        id: profile.id,
        name: profile.name,
        profileUrl: profile.nexusProfileUrl,
        avatar: profile.avatarUrl,
      })),
      references: structuredClone(result.madness.profiles),
    },
  };
}

test('Modjam result cells support placements and semicolon-separated judge awards', () => {
  assert.deepEqual(
    parseModjamResult('First Place; Best Vacation Award; Best Guar Award'),
    {
      placement: 'first',
      placementLabel: 'First Place',
      awards: ['Best Vacation Award', 'Best Guar Award'],
    },
  );
});

test('one workbook sync updates all three sites and preserves unconnected history', async () => {
  const publishing = await publishingFixture();
  const result = buildPublishingUpdate(publishing, baseline(), {
    mode: 'publish',
    generatedAt: '2027-08-25T00:00:00.000Z',
  });

  assert.deepEqual(
    result.selectedEvents.map(event => event.event_id),
    ['modathon-2027', 'modjam-summer-2027', 'madness-2027'],
  );
  assert.deepEqual(Object.keys(result.modathon.nexusStats.mods), ['2026', '2027']);
  assert.equal(result.modathon.achievementsByYear.get(2027).achievements.length, 1);

  assert.deepEqual(
    result.modjam.archive.events.map(event => event.id),
    ['winter-2020', 'summer-2027'],
  );
  const modjamEntry = result.modjam.archive.events.at(-1).entries[0];
  assert.equal(modjamEntry.title, 'Ashlands Holiday');
  assert.equal(modjamEntry.placement, 'first');
  assert.deepEqual(modjamEntry.awards, ['Best Vacation Award']);

  assert.deepEqual(result.madness.teamsByYear.years.map(group => group.year), [2026, 2027]);
  assert.deepEqual(result.madness.modsByYear.years.map(group => group.year), [2026, 2027]);
  assert.equal(result.madness.teamsByYear.years.at(-1).teams[0].name, 'Redoran Builders');
  assert.equal(result.madness.modsByYear.years.at(-1).mods[0].team, 'Team Redoran Builders');

  assert.equal(result.eventConfig.modjam.events.at(-1).year, 2027);
  assert.equal(result.eventConfig.madness.events.at(-1).season, 11);
  assert.equal(result.eventConfig.modathon.events.at(-1).year, 2027);
  assert.equal(result.eventConfig.modathon.events.at(-1).countdown.start, '2027-05-01T00:00:00.000Z');
  assert.ok(result.changedFiles.includes('modathon/assets/data/modathon-event.json'));
  assert.ok(result.changedFiles.includes('modjam/data/modjam-event.json'));
  assert.ok(result.changedFiles.includes('madness/data/madness-event.json'));
  assert.ok(result.changedFiles.includes('modjam/data/modjam-mods.json'));
  assert.ok(result.changedFiles.includes('madness/data/madness-teams.json'));
});

test('site-prefixed Modjam media paths are normalized to the Modjam directory', async () => {
  const publishing = await publishingFixture();
  publishing.sheets.Media
    .filter(media => media.event_id === 'modjam-summer-2027')
    .forEach(media => {
      media.published_path = `modjam/${media.published_path}`;
    });

  const result = buildPublishingUpdate(publishing, baseline(), {
    mode: 'publish',
    generatedAt: '2027-08-25T00:00:00.000Z',
  });
  const event = result.modjam.archive.events.at(-1);

  assert.equal(event.banner, 'assets/banners/summer-2027.webp');
  assert.deepEqual(event.headers, ['assets/headers/header-summer.webp']);
  assert.ok(result.mediaPaths.some(media => (
    media.eventType === 'modjam'
    && media.relativePath === 'assets/banners/summer-2027.webp'
  )));
});

test('new Modjam events use the seasonal header when no header row exists', async () => {
  const publishing = await publishingFixture();
  publishing.sheets.Media = publishing.sheets.Media.filter(
    media => media.media_type !== 'header',
  );

  const result = buildPublishingUpdate(publishing, baseline(), {
    mode: 'publish',
    generatedAt: '2027-08-25T00:00:00.000Z',
  });

  assert.deepEqual(
    result.modjam.archive.events.at(-1).headers,
    ['assets/headers/header-summer.webp'],
  );
});

test('blank Modjam result cells do not erase existing judge awards', async () => {
  const publishing = await publishingFixture();
  const first = buildPublishingUpdate(publishing, baseline(), {
    mode: 'publish',
    generatedAt: '2027-08-25T00:00:00.000Z',
  });
  const edited = structuredClone(publishing);
  edited.sheets.Entries.find(
    entry => entry.entry_id === 'modjam-summer-2027-001',
  ).placement = '';

  const result = buildPublishingUpdate(edited, currentFromResult(first), {
    mode: 'publish',
    generatedAt: '2027-08-26T00:00:00.000Z',
  });

  assert.deepEqual(
    result.modjam.archive.events.at(-1).entries[0].awards,
    ['Best Vacation Award'],
  );
});

test('archived Modjam entries with unavailable URLs remain in the archive', async () => {
  const publishing = await publishingFixture();
  const event = publishing.sheets.Events.find(
    candidate => candidate.event_type === 'modjam',
  );
  const unavailable = publishing.sheets.Entries.find(
    entry => entry.event_id === event.event_id,
  );
  event.status = 'archived';
  unavailable.status = 'withdrawn';
  unavailable.nexus_url = '';

  const result = buildPublishingUpdate(publishing, baseline(), {
    mode: 'publish',
    generatedAt: '2027-08-25T00:00:00.000Z',
  });
  const archived = result.modjam.archive.events.at(-1);

  assert.equal(archived.entries.length, 2);
  assert.equal(
    archived.entries.find(entry => entry.id === unavailable.entry_id).url,
    null,
  );
});

test('legacy alias IDs and achievement-only group credits preserve historical names', async () => {
  const publishing = await publishingFixture();
  publishing.sheets.Modders.push(
    {
      person_id: 'ivanmaksymiv',
      display_name: 'IvanMaksymiv',
      aliases: 'Ivan Maksymiv aka Izendel;Izendel',
      nexus_profile_url: 'https://www.nexusmods.com/profile/IvanMaksymiv',
      avatar_url: '',
      status: 'active',
      notes: '',
    },
    {
      person_id: 'waspinator1988',
      display_name: 'Waspinator1988',
      aliases: 'Waspinator1998',
      nexus_profile_url: 'https://www.nexusmods.com/profile/Waspinator1998',
      avatar_url: '',
      status: 'active',
      notes: '',
    },
    {
      person_id: 'juidius',
      display_name: 'Juidius',
      aliases: 'Juidius Xentao',
      nexus_profile_url: 'https://www.nexusmods.com/profile/Juidius',
      avatar_url: '',
      status: 'active',
      notes: '',
    },
    {
      person_id: 'chim-el-abadal',
      display_name: 'Chim el-Abadal',
      aliases: 'Chim el-Adabal',
      nexus_profile_url: '',
      avatar_url: '',
      status: 'active',
      notes: '',
    },
  );
  publishing.sheets.Achievements[0].unlocker_ids = [
    'team-target-dummies',
    'ivan-maksymiv-aka-izendel',
    'waspinator1998',
    'juidius-xentao',
  ].join(', ');
  publishing.sheets.Teams[0].member_ids = 'chim-el-adabal';

  const result = buildPublishingUpdate(publishing, baseline(), {
    mode: 'publish',
    generatedAt: '2027-08-25T00:00:00.000Z',
  });

  assert.deepEqual(
    result.modathon.achievementsByYear.get(2027).achievements[0].unlockedBy,
    [
      'Team Target Dummies',
      'Ivan Maksymiv aka Izendel',
      'Waspinator1998',
      'Juidius Xentao',
    ],
  );
  const legacyAliasMember = result.madness.teamsByYear.years.at(-1).teams[0].members[0];
  assert.equal(legacyAliasMember.id, 'chim-el-abadal');
  assert.equal(
    result.centralModders.modders.find(profile => profile.id === legacyAliasMember.id).name,
    'Chim el-Abadal',
  );
  assert.equal(
    result.modathon.modders.modders.includes('team-target-dummies'),
    false,
  );
});

test('unknown entry authors and team members remain validation errors', async () => {
  const publishing = await publishingFixture();
  publishing.sheets.Entries[0].author_ids = 'missing-entry-author';
  publishing.sheets.Teams[0].member_ids = 'missing-team-member';

  assert.throws(
    () => buildPublishingUpdate(publishing, baseline(), { mode: 'publish' }),
    error => (
      error instanceof PublishingValidationError
      && error.messages.some(message => message.includes(
        'unknown author ID missing-entry-author',
      ))
      && error.messages.some(message => message.includes(
        'unknown member ID missing-team-member',
      ))
    ),
  );
});

test('repeating an unchanged workbook sync is idempotent', async () => {
  const publishing = await publishingFixture();
  const first = buildPublishingUpdate(publishing, baseline(), {
    mode: 'publish',
    generatedAt: '2027-08-25T00:00:00.000Z',
  });
  const repeated = buildPublishingUpdate(publishing, currentFromResult(first), {
    mode: 'publish',
    generatedAt: '2027-08-26T00:00:00.000Z',
  });

  assert.deepEqual(repeated.changedFiles, []);
  assert.equal(repeated.modathon.nexusStats.generated, first.modathon.nexusStats.generated);
  assert.equal(repeated.modjam.archive.generatedAt, first.modjam.archive.generatedAt);
});

test('publish mode ignores unfinished event templates while draft mode previews them', async () => {
  const publishing = await publishingFixture();
  publishing.sheets.Events.forEach(event => {
    event.status = 'draft';
  });

  const published = buildPublishingUpdate(publishing, baseline(), {
    mode: 'publish',
  });
  assert.deepEqual(published.selectedEvents, []);
  assert.deepEqual(published.changedFiles, []);

  const draft = buildPublishingUpdate(publishing, baseline(), {
    mode: 'draft',
  });
  assert.equal(draft.selectedEvents.length, 3);
  assert.ok(draft.changedFiles.includes('modjam/data/modjam-event.json'));
  assert.ok(draft.changedFiles.includes('modjam/data/modjam-mods.json'));
  assert.ok(draft.changedFiles.includes('madness/data/madness-teams.json'));
});

test('archived events may omit operational dates and registration forms', async () => {
  const publishing = await publishingFixture();
  for (const event of publishing.sheets.Events) {
    event.status = 'archived';
    for (const field of [
      'kickoff_at',
      'start_at',
      'end_at',
      'grace_end_at',
      'registration_at',
      'submissions_at',
      'bugfix_end_at',
    ]) {
      event[field] = '';
    }
    event.registration_form_id = '';
  }

  const current = baseline();
  const result = buildPublishingUpdate(publishing, current, {
    mode: 'publish',
    generatedAt: '2027-08-25T00:00:00.000Z',
  });

  assert.deepEqual(
    result.selectedEvents.map(event => event.event_id),
    ['modathon-2027', 'modjam-summer-2027', 'madness-2027'],
  );
  assert.deepEqual(result.eventConfig.modathon, current.eventConfig.modathon);
  assert.deepEqual(result.eventConfig.madness, current.eventConfig.madness);
  assert.equal(result.eventConfig.modjam.events.at(-1).year, 2027);
  assert.equal('countdown' in result.eventConfig.modjam.events.at(-1), false);
});

test('active events still require operational fields', async () => {
  const publishing = await publishingFixture();
  const modathon = publishing.sheets.Events.find(
    event => event.event_type === 'modathon',
  );
  const modjam = publishing.sheets.Events.find(
    event => event.event_type === 'modjam',
  );
  const madness = publishing.sheets.Events.find(
    event => event.event_type === 'madness',
  );
  modathon.start_at = '';
  modjam.kickoff_at = '';
  madness.registration_form_id = '';
  madness.registration_at = '';

  assert.throws(
    () => buildPublishingUpdate(publishing, baseline(), { mode: 'publish' }),
    error => (
      error instanceof PublishingValidationError
      && error.messages.some(message => message.includes(
        'modathon-2027: start_at is required',
      ))
      && error.messages.some(message => message.includes(
        'modjam-summer-2027: kickoff_at is required',
      ))
      && error.messages.some(message => message.includes(
        'madness-2027: registration_form_id is required',
      ))
      && error.messages.some(message => message.includes(
        'madness-2027: registration_at is required',
      ))
    ),
  );
});

test('dates supplied for archived events must still match the event year', async () => {
  const publishing = await publishingFixture();
  const modjam = publishing.sheets.Events.find(
    event => event.event_type === 'modjam',
  );
  modjam.status = 'archived';
  modjam.kickoff_at = '2026-08-20T23:00:00Z';
  modjam.start_at = '';
  modjam.end_at = '';

  assert.throws(
    () => buildPublishingUpdate(publishing, baseline(), { mode: 'publish' }),
    error => (
      error instanceof PublishingValidationError
      && error.messages.some(message => message.includes(
        'modjam-summer-2027: kickoff_at must occur in 2027',
      ))
    ),
  );
});

test('cell edits update existing Modathon, Modjam, and Madness records', async () => {
  const publishing = await publishingFixture();
  const first = buildPublishingUpdate(publishing, baseline(), {
    mode: 'publish',
    generatedAt: '2027-08-25T00:00:00.000Z',
  });
  const edited = structuredClone(publishing);
  edited.sheets.Achievements[0].unlocker_ids = 'ashlander-one;telvanni-two';
  edited.sheets.Entries.find(
    entry => entry.entry_id === 'modjam-summer-2027-001',
  ).title = 'Ashlands Holiday: Updated';
  edited.sheets.Teams[0].team_name = 'Redoran Renovators';

  const result = buildPublishingUpdate(edited, currentFromResult(first), {
    mode: 'publish',
    generatedAt: '2027-08-26T00:00:00.000Z',
  });

  assert.deepEqual(
    result.modathon.achievementsByYear.get(2027).achievements[0].unlockedBy,
    ['Ashlander One', 'Telvanni Two'],
  );
  assert.equal(
    result.modjam.archive.events.at(-1).entries[0].title,
    'Ashlands Holiday: Updated',
  );
  assert.equal(
    result.madness.modsByYear.years.at(-1).mods[0].team,
    'Team Redoran Renovators',
  );
  assert.ok(result.changedFiles.includes('modathon/assets/data/2027-achievements.json'));
  assert.ok(result.changedFiles.includes('modjam/data/modjam-mods.json'));
  assert.ok(result.changedFiles.includes('madness/data/madness-mods.json'));
});

test('Madness refreshes preserve aliases, placement sentinels, order, and deleted links', async () => {
  const publishing = await publishingFixture();
  const first = buildPublishingUpdate(publishing, baseline(), {
    mode: 'publish',
    generatedAt: '2027-08-25T00:00:00.000Z',
  });
  const current = currentFromResult(first);
  const team = current.madness.teamsByYear.at(-1).teams[0];
  team.place = null;
  team.mods.push({ name: '1st Place', url: null });
  team.members[0].name = 'Redoran3';
  current.madness.profiles.find(
    profile => profile.name === 'Redoran Three',
  ).name = 'Redoran3';
  current.madness.modsByYear.at(-1).mods[0].url = null;

  const edited = structuredClone(publishing);
  edited.sheets.Modders.find(
    person => person.person_id === 'redoran-three',
  ).aliases = 'Redoran3';
  edited.sheets.Teams[0].placement = '';
  edited.sheets.Entries.find(
    entry => entry.entry_id === 'madness-2027-001',
  ).notes = 'Mod Deleted by Redoran3';
  const madnessEntries = edited.sheets.Entries.filter(
    entry => entry.event_id === 'madness-2027',
  ).reverse();
  edited.sheets.Entries = [
    ...edited.sheets.Entries.filter(entry => entry.event_id !== 'madness-2027'),
    ...madnessEntries,
  ];

  const result = buildPublishingUpdate(edited, current, {
    mode: 'publish',
    generatedAt: '2027-08-26T00:00:00.000Z',
  });
  const refreshedTeam = MmsModders.hydrateMadnessTeams(
    result.madness.teamsByYear,
    result.centralModders,
  ).at(-1).teams[0];
  const refreshedMods = result.madness.modsByYear.years.at(-1).mods;
  const refreshedProfiles = MmsModders.resolveProfiles(
    result.centralModders,
    result.madness.profiles,
  );

  assert.equal(refreshedTeam.members[0].name, 'Redoran Three');
  assert.deepEqual(refreshedTeam.mods.at(-1), { name: '1st Place', url: null });
  assert.ok(refreshedProfiles.some(profile => profile.name === 'Redoran Three'));
  assert.ok(
    refreshedProfiles.find(profile => profile.name === 'Redoran Three').aliases.includes('Redoran3'),
  );
  assert.deepEqual(
    refreshedMods.map(mod => mod.name),
    ['Red Mountain Retreat', 'Clockwork Canton'],
  );
  assert.equal(refreshedMods[0].url, null);
});

test('connected event removals still require explicit approval', async () => {
  const publishing = await publishingFixture();
  const first = buildPublishingUpdate(publishing, baseline(), {
    mode: 'publish',
    generatedAt: '2027-08-25T00:00:00.000Z',
  });
  const reduced = structuredClone(publishing);
  reduced.sheets.Entries = reduced.sheets.Entries.filter(
    entry => entry.entry_id !== 'modjam-summer-2027-002',
  );

  assert.throws(
    () => buildPublishingUpdate(reduced, currentFromResult(first), {
      mode: 'publish',
    }),
    error => (
      error instanceof PublishingValidationError
      && error.messages.some(message => message.includes('--allow-removals'))
    ),
  );
  const approved = buildPublishingUpdate(reduced, currentFromResult(first), {
    mode: 'publish',
    allowRemovals: true,
  });
  assert.equal(approved.modjam.archive.events.at(-1).entries.length, 1);
});

test('the GitHub action syncs the workbook without an event ID input', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/update-event-data.yml', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(workflow, /event_id|EVENT_ID|--event/);
  assert.match(workflow, /node scripts\/import-publishing\.mjs/);
  assert.match(workflow, /modathon\/assets\/data\/modathon-event\.json/);
  assert.match(workflow, /modjam\/data\/modjam-event\.json/);
  assert.match(workflow, /madness\/data\/madness-event\.json/);
  assert.match(workflow, /modjam\/data\/modjam-mods\.json/);
  assert.match(workflow, /assets\/data\/modders\.json/);
  assert.match(workflow, /madness\/data\/madness-teams\.json/);
  assert.match(workflow, /madness\/data\/madness-mods\.json/);
});
