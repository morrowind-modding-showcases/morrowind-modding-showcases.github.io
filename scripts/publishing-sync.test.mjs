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
