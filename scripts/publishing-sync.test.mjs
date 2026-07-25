import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
const fixtureDirectory = path.join(scriptsDirectory, 'fixtures', 'publishing', 'all-events');
const schemaPath = path.resolve(scriptsDirectory, '..', 'publishing', 'schema-v1.json');
const requiredSheets = ['Events', 'Modders', 'Entries', 'Achievements', 'Teams', 'Media'];

async function publishingFixture() {
  return loadPublishingDirectory(fixtureDirectory, { schemaPath, requiredSheets });
}

function baseline() {
  return {
    eventConfig: {
      schemaVersion: 1,
      modathon: {
        name: 'Morrowind Modathon',
        timezoneLabel: 'UTC',
        schedule: {
          start: { month: 5, day: 1, hour: 0, minute: 0 },
          end: { month: 6, day: 2, hour: 0, minute: 0 },
          graceEnd: { month: 6, day: 2, hour: 12, minute: 0 },
          reset: { month: 7, day: 1, hour: 0, minute: 0 },
        },
      },
      modjam: {
        name: 'Summer Modjam 2026',
        season: 'Summer',
        year: 2026,
        kickoffStart: '2026-08-21T23:00:00Z',
        start: '2026-08-22T00:00:00Z',
        end: '2026-08-24T00:00:00Z',
        timezoneLabel: 'UTC',
        participationBannerUrl: 'https://example.com/2026.png',
      },
      madness: {
        name: 'Morrowind Modding Madness 2026',
        year: 2026,
        seasonNumber: 10,
        registration: '2026-09-01T00:00:00Z',
        competition: '2026-10-01T00:00:00Z',
        submissions: '2026-11-07T00:00:00Z',
        bugFixEnd: '2026-11-15T00:00:00Z',
        timezoneLabel: 'UTC',
        registrationFormId: 'oldform',
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
  return {
    eventConfig: structuredClone(result.eventConfig),
    modathon: {
      nexusStats: structuredClone(result.modathon.nexusStats),
      modders: structuredClone(result.modathon.modders),
      achievementsByYear: new Map(
        [...result.modathon.achievementsByYear].map(([year, value]) => [
          year,
          structuredClone(value),
        ]),
      ),
    },
    modjam: {
      archive: structuredClone(result.modjam.archive),
      profiles: structuredClone(result.modjam.profiles),
    },
    madness: {
      teamsByYear: structuredClone(result.madness.teamsByYear),
      modsByYear: structuredClone(result.madness.modsByYear),
      profiles: structuredClone(result.madness.profiles),
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

  assert.deepEqual(result.madness.teamsByYear.map(group => group.year), [2026, 2027]);
  assert.deepEqual(result.madness.modsByYear.map(group => group.year), [2026, 2027]);
  assert.equal(result.madness.teamsByYear.at(-1).teams[0].name, 'Redoran Builders');
  assert.equal(result.madness.modsByYear.at(-1).mods[0].team, 'Team Redoran Builders');

  assert.equal(result.eventConfig.modjam.year, 2027);
  assert.equal(result.eventConfig.madness.seasonNumber, 11);
  assert.equal(result.eventConfig.modathon.schedule.start.month, 5);
  assert.ok(result.changedFiles.includes('assets/event-config.js'));
  assert.ok(result.changedFiles.includes('modjam/data/modjams.json'));
  assert.ok(result.changedFiles.includes('madness/data/teams-by-year.json'));
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
  assert.equal(
    result.madness.teamsByYear.at(-1).teams[0].members[0].name,
    'Chim el-Adabal',
  );
  assert.equal(
    result.modathon.modders.modders.some(
      modder => modder.name === 'Team Target Dummies',
    ),
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
  assert.ok(draft.changedFiles.includes('modjam/data/modjams.json'));
  assert.ok(draft.changedFiles.includes('madness/data/teams-by-year.json'));
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
  assert.deepEqual(result.eventConfig, current.eventConfig);
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
    result.madness.modsByYear.at(-1).mods[0].team,
    'Team Redoran Renovators',
  );
  assert.ok(result.changedFiles.includes('modathon/assets/data/2027-achievements.json'));
  assert.ok(result.changedFiles.includes('modjam/data/modjams.json'));
  assert.ok(result.changedFiles.includes('madness/data/mods-by-year.json'));
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
  assert.match(workflow, /assets\/event-config\.js/);
  assert.match(workflow, /modjam\/data\/modjams\.json/);
  assert.match(workflow, /madness\/data\/teams-by-year\.json/);
});
