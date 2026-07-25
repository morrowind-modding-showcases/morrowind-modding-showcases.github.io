import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PublishingValidationError,
  buildModathonUpdate,
  loadPublishingDirectory,
  parseCsv,
  splitIdList,
  validatePublishedMedia,
} from './import-modathon-publishing.mjs';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = path.join(scriptsDirectory, 'fixtures', 'publishing', 'modathon-2027');
const schemaPath = path.resolve(scriptsDirectory, '..', 'publishing', 'schema-v1.json');

function baseline(overrides = {}) {
  return {
    nexusStats: {
      generated: '2026-07-24T00:00:00.000Z',
      game: 'morrowind',
      mods: {
        2026: [{
          name: 'Existing Historical Mod',
          authors: ['Historical Modder'],
          category: 'Quests',
          url: 'https://www.nexusmods.com/morrowind/mods/59999',
        }],
      },
      ...(overrides.nexusStats || {}),
    },
    modders: {
      modders: [{
        name: 'Historical Modder',
        url: 'https://www.nexusmods.com/profile/HistoricalModder',
        avatar: null,
      }],
      ...(overrides.modders || {}),
    },
    achievements: overrides.achievements ?? null,
  };
}

async function publishingFixture() {
  return loadPublishingDirectory(fixtureDirectory, { schemaPath });
}

test('CSV parsing preserves quoted commas, escaped quotes, and line breaks', () => {
  const parsed = parseCsv('id,description\r\none,"Comma, quote ""and"" line\nbreak"\r\n');
  assert.deepEqual(parsed.headers, ['id', 'description']);
  assert.deepEqual(parsed.rows, [{
    id: 'one',
    description: 'Comma, quote "and" line\nbreak',
  }]);
});

test('ID lists accept native Google Sheets chips and legacy semicolon values', () => {
  assert.deepEqual(splitIdList('first-modder, second-modder'), ['first-modder', 'second-modder']);
  assert.deepEqual(splitIdList('first-modder; second-modder'), ['first-modder', 'second-modder']);
});

test('the Modathon fixture satisfies the versioned publishing schema', async () => {
  const publishing = await publishingFixture();
  assert.equal(publishing.schema.schemaVersion, 1);
  assert.equal(publishing.sheets.Events[0].event_id, 'modathon-2027');
  assert.equal(publishing.sheets.Entries.length, 2);
  assert.equal(publishing.sheets.Achievements.length, 2);
});

test('publishing tabs ignore partially filled rows with blank primary IDs', async () => {
  const sourceDirectory = await mkdtemp(path.join(os.tmpdir(), 'mms-blank-publishing-row-'));
  await cp(fixtureDirectory, sourceDirectory, { recursive: true });
  const entriesPath = path.join(sourceDirectory, 'Entries.csv');
  const entries = await readFile(entriesPath, 'utf8');
  await writeFile(entriesPath, `${entries},,,,,,,,owner note,\n`);

  const publishing = await loadPublishingDirectory(sourceDirectory, { schemaPath });
  assert.equal(publishing.sheets.Entries.length, 2);
});

test('withdrawn historical entries may document an unavailable Nexus URL', async () => {
  const sourceDirectory = await mkdtemp(path.join(os.tmpdir(), 'mms-withdrawn-entry-'));
  await cp(fixtureDirectory, sourceDirectory, { recursive: true });
  const entriesPath = path.join(sourceDirectory, 'Entries.csv');
  const entries = await readFile(entriesPath, 'utf8');
  await writeFile(
    entriesPath,
    `${entries}modathon-2027,modathon-2027-003,Unavailable Archive,,ashlander-one,Unknown,,,Archived source URL is unavailable,withdrawn\n`,
  );

  const publishing = await loadPublishingDirectory(sourceDirectory, { schemaPath });
  assert.equal(publishing.sheets.Entries.at(-1).status, 'withdrawn');
  assert.equal(publishing.sheets.Entries.at(-1).nexus_url, '');
});

test('a draft import creates a new year without changing historical years', async () => {
  const publishing = await publishingFixture();
  const current = baseline();
  const result = buildModathonUpdate(publishing, current, {
    eventId: 'modathon-2027',
    mode: 'draft',
    generatedAt: '2027-06-03T00:00:00.000Z',
  });

  assert.deepEqual(result.nexusStats.mods['2026'], current.nexusStats.mods['2026']);
  assert.deepEqual(result.nexusStats.mods['2027'].map(mod => mod.name), [
    'The Clockwork Netch',
    'Vivec Rooftop Gardens',
  ]);
  assert.deepEqual(result.nexusStats.mods['2027'][1].authors, [
    'Ashlander One',
    'Telvanni Two',
  ]);
  assert.equal(result.achievements.event.year, 2027);
  assert.deepEqual(result.achievements.achievements[0].unlockedBy, [
    'Ashlander One',
    'Telvanni Two',
  ]);
  assert.equal(result.achievements.achievements[0].unlockedCount, 2);
  assert.ok(result.modders.modders.some(modder => modder.name === 'Ashlander One'));
  assert.ok(result.modders.modders.some(modder => modder.name === 'Telvanni Two'));
  assert.equal(result.warnings.length, 1);
});

test('a repeated import retains Nexus-derived metadata for matching mod IDs', async () => {
  const publishing = await publishingFixture();
  const current = baseline({
    nexusStats: {
      generated: '2027-05-15T00:00:00.000Z',
      game: 'morrowind',
      mods: {
        2027: [{
          name: 'Old title',
          authors: ['Old author'],
          category: 'Unknown',
          url: 'https://www.nexusmods.com/morrowind/mods/60002',
          downloads: 123,
          uniqueDownloads: 100,
          endorsements: 12,
          pictureUrl: 'https://staticdelivery.nexusmods.com/example.webp',
          available: true,
          nexusCategory: 'Cities, Towns, Villages',
        }],
      },
    },
  });
  const result = buildModathonUpdate(publishing, current, {
    eventId: 'modathon-2027',
    mode: 'draft',
  });
  const gardens = result.nexusStats.mods['2027'].find(mod => mod.name === 'Vivec Rooftop Gardens');

  assert.equal(gardens.category, 'Towns and Cities');
  assert.equal(gardens.downloads, 123);
  assert.equal(gardens.pictureUrl, 'https://staticdelivery.nexusmods.com/example.webp');
  assert.equal(result.summary.retainedNexusMetadataCount, 1);
});

test('a repeated import preserves historical aliases and applies sheet category overrides', async () => {
  const publishing = await publishingFixture();
  publishing.sheets.Entries[0].category = 'Landscape or Landmass';
  const current = baseline({
    nexusStats: {
      mods: {
        2027: [
          {
            name: 'The Clockwork Netch',
            authors: ['Ashlander1'],
            category: 'Landscape or Landmass',
            url: 'https://www.nexusmods.com/morrowind/mods/60001',
            nexusCategory: 'Gameplay',
          },
          {
            name: 'Vivec Rooftop Gardens',
            authors: ['Ashlander One', 'Telvanni Two'],
            category: 'Towns and Cities',
            url: 'https://www.nexusmods.com/morrowind/mods/60002',
          },
        ],
      },
    },
    achievements: {
      achievements: [{
        id: 'first-steps',
        unlockedBy: ['Ashlander1'],
      }],
    },
  });

  const result = buildModathonUpdate(publishing, current, {
    eventId: 'modathon-2027',
    mode: 'draft',
  });

  assert.deepEqual(result.nexusStats.mods['2027'][0].authors, ['Ashlander1']);
  assert.equal(result.nexusStats.mods['2027'][0].category, 'Landscape or Landmass');
  assert.equal(result.nexusStats.mods['2027'][0].nexusCategory, 'Gameplay');
  assert.deepEqual(
    result.achievements.achievements[0].unlockedBy,
    ['Ashlander1', 'Telvanni Two'],
  );
});

test('the Dietbob canonical row consolidates its explicitly named alias profile', async () => {
  const publishing = await publishingFixture();
  const person = publishing.sheets.Modders.find(
    person => person.person_id === 'ashlander-one',
  );
  person.display_name = 'Dietbob196045';
  person.aliases = 'dietbob';
  person.nexus_profile_url = 'https://www.nexusmods.com/profile/dietbob196045';
  const current = baseline({
    modders: {
      modders: [
        {
          name: 'Historical Modder',
          url: 'https://www.nexusmods.com/profile/HistoricalModder',
          avatar: null,
        },
        {
          name: 'Dietbob196045',
          url: 'https://www.nexusmods.com/profile/dietbob196045',
          avatar: 'https://avatars.nexusmods.com/100001/100',
          aliases: ['Dietbob-196045'],
        },
        {
          name: 'dietbob',
          url: null,
          avatar: null,
        },
      ],
    },
  });

  const result = buildModathonUpdate(publishing, current, {
    eventId: 'modathon-2027',
    mode: 'draft',
  });
  const matchingProfiles = result.modders.modders.filter(modder => (
    ['Dietbob196045', 'dietbob'].includes(modder.name)
  ));

  assert.equal(matchingProfiles.length, 1);
  assert.equal(matchingProfiles[0].name, 'Dietbob196045');
  assert.deepEqual(matchingProfiles[0].aliases, [
    'Dietbob-196045',
    'dietbob',
  ]);
  assert.ok(result.modders.modders.some(modder => modder.name === 'Historical Modder'));
});

test('profile consolidation does not absorb URL-only or loosely normalized matches', async () => {
  const publishing = await publishingFixture();
  const person = publishing.sheets.Modders.find(
    row => row.person_id === 'ashlander-one',
  );
  person.display_name = 'ARavenOfManyHats';
  person.aliases = '';
  person.nexus_profile_url = 'https://www.nexusmods.com/profile/ARavenOfManyHats';
  const current = baseline({
    modders: {
      modders: [
        {
          name: 'ARavenOfManyHats',
          url: 'https://www.nexusmods.com/profile/ARavenOfManyHats',
          avatar: 'https://avatars.nexusmods.com/100001/100',
        },
        {
          name: 'A Raven of Many Hats',
          url: 'https://www.nexusmods.com/profile/ARavenOfManyHats',
          avatar: 'https://avatars.nexusmods.com/100001/100',
        },
      ],
    },
  });

  const result = buildModathonUpdate(publishing, current, {
    eventId: 'modathon-2027',
    mode: 'draft',
  });

  assert.ok(result.modders.modders.some(modder => modder.name === 'ARavenOfManyHats'));
  assert.ok(result.modders.modders.some(modder => modder.name === 'A Raven of Many Hats'));
});

test('archived imports accept historical source URLs and duplicate Nexus IDs', async () => {
  const publishing = await publishingFixture();
  publishing.sheets.Events[0].status = 'archived';
  publishing.sheets.Entries[0].title = 'Archive Mirror';
  publishing.sheets.Entries[0].nexus_url = (
    'https://modding-openmw.gitlab.io/example/archive-mirror/'
  );
  publishing.sheets.Entries[0].status = 'published';
  publishing.sheets.Entries[1].title = 'Duplicate A';
  publishing.sheets.Entries[1].nexus_url = (
    'https://www.nexusmods.com/morrowind/mods/52960'
  );
  publishing.sheets.Entries.push({
    ...publishing.sheets.Entries[1],
    entry_id: 'modathon-2027-003',
    title: 'Duplicate B',
  });
  const current = baseline({
    nexusStats: {
      mods: {
        2027: [
          {
            name: 'Duplicate B',
            authors: ['Telvanni Two'],
            category: 'Items',
            url: 'https://www.nexusmods.com/morrowind/mods/52960',
            downloads: 222,
          },
          {
            name: 'Archive Mirror',
            authors: ['Ashlander One'],
            category: 'Quests',
            url: 'https://modding-openmw.gitlab.io/example/archive-mirror/',
            nexusCategory: 'Archived source',
          },
          {
            name: 'Duplicate A',
            authors: ['Telvanni Two'],
            category: 'Items',
            url: 'https://www.nexusmods.com/morrowind/mods/52960',
            downloads: 111,
          },
        ],
      },
    },
  });

  const result = buildModathonUpdate(publishing, current, {
    eventId: 'modathon-2027',
    mode: 'publish',
  });
  const mods = result.nexusStats.mods['2027'];

  assert.equal(mods[0].url, publishing.sheets.Entries[0].nexus_url);
  assert.equal(mods[0].nexusCategory, 'Archived source');
  assert.equal(mods[1].downloads, 111);
  assert.equal(mods[2].downloads, 222);
});

test('active imports still require unique Morrowind Nexus mod URLs', async () => {
  const publishing = await publishingFixture();
  publishing.sheets.Entries[0].nexus_url = (
    'https://modding-openmw.gitlab.io/example/current-entry/'
  );
  publishing.sheets.Entries.push({
    ...publishing.sheets.Entries[1],
    entry_id: 'modathon-2027-003',
  });

  assert.throws(
    () => buildModathonUpdate(publishing, baseline(), {
      eventId: 'modathon-2027',
      mode: 'draft',
    }),
    error => (
      error instanceof PublishingValidationError
      && error.messages.some(message => message.includes(
        'modathon-2027-001: nexus_url must be a Morrowind Nexus mod URL',
      ))
      && error.messages.some(message => message.includes(
        'modathon-2027-003: duplicate Nexus mod ID 60002',
      ))
    ),
  );
});

test('replacing an existing year with fewer entries requires explicit approval', async () => {
  const publishing = await publishingFixture();
  const current = baseline({
    nexusStats: {
      generated: '2027-05-15T00:00:00.000Z',
      game: 'morrowind',
      mods: {
        2027: [60001, 60002, 60003].map(id => ({
          name: `Existing ${id}`,
          authors: ['Ashlander One'],
          category: 'Unknown',
          url: `https://www.nexusmods.com/morrowind/mods/${id}`,
        })),
      },
    },
  });

  assert.throws(
    () => buildModathonUpdate(publishing, current, {
      eventId: 'modathon-2027',
      mode: 'draft',
    }),
    error => (
      error instanceof PublishingValidationError
      && error.messages.some(message => message.includes('--allow-removals'))
    ),
  );
});

test('final imports require published event rows and published media', async () => {
  const publishing = await publishingFixture();
  publishing.sheets.Media.find(
    media => media.media_id === 'modathon-2027-hidden-engineer',
  ).status = 'needed';
  assert.throws(
    () => buildModathonUpdate(publishing, baseline(), {
      eventId: 'modathon-2027',
      mode: 'publish',
    }),
    error => (
      error instanceof PublishingValidationError
      && error.messages.some(message => message.includes('event status'))
      && error.messages.some(message => message.includes('media must be published'))
    ),
  );
});

test('final imports accept unreleased media for never-unlocked hidden achievements', async () => {
  const publishing = await publishingFixture();
  publishing.sheets.Events[0].status = 'published';
  publishing.sheets.Media.find(media => media.media_id === 'modathon-2027-first-steps').status = 'published';

  const result = buildModathonUpdate(publishing, baseline(), {
    eventId: 'modathon-2027',
    mode: 'publish',
  });
  const hidden = result.achievements.achievements.find(
    achievement => achievement.id === 'hidden-engineer',
  );

  assert.equal(hidden.unlockedCount, 0);
  assert.equal(Object.hasOwn(hidden, 'imageUrl'), false);
});

test('site-prefixed achievement paths are normalized to the Modathon directory', async () => {
  const publishing = await publishingFixture();
  const achievementMedia = publishing.sheets.Media.find(
    media => media.media_id === 'modathon-2027-first-steps',
  );
  achievementMedia.published_path = (
    `modathon/${achievementMedia.published_path}`
  );

  const result = buildModathonUpdate(publishing, baseline(), {
    eventId: 'modathon-2027',
    mode: 'draft',
  });
  const achievement = result.achievements.achievements.find(
    candidate => candidate.id === 'first-steps',
  );

  assert.equal(
    achievement.imageUrl,
    'assets/images/achievements/2027/first-steps.webp',
  );
});

test('unreleased media is rejected for unlocked or visible achievements', async () => {
  const publishing = await publishingFixture();
  const hidden = publishing.sheets.Achievements.find(
    achievement => achievement.achievement_id === 'hidden-engineer',
  );
  hidden.unlocker_ids = 'ashlander-one';

  assert.throws(
    () => buildModathonUpdate(publishing, baseline(), {
      eventId: 'modathon-2027',
      mode: 'draft',
    }),
    error => (
      error instanceof PublishingValidationError
      && error.messages.some(message => message.includes(
        'unreleased media is only allowed for never-unlocked hidden achievements',
      ))
    ),
  );

  hidden.unlocker_ids = '';
  hidden.group = 'standard';
  assert.throws(
    () => buildModathonUpdate(publishing, baseline(), {
      eventId: 'modathon-2027',
      mode: 'draft',
    }),
    error => (
      error instanceof PublishingValidationError
      && error.messages.some(message => message.includes(
        'unreleased media is only allowed for never-unlocked hidden achievements',
      ))
    ),
  );
});

test('draft imports report missing achievement media without writing it', async () => {
  const publishing = await publishingFixture();
  const result = buildModathonUpdate(publishing, baseline(), {
    eventId: 'modathon-2027',
    mode: 'draft',
  });
  const missing = await validatePublishedMedia(result, {
    repoRoot: path.join(scriptsDirectory, 'fixtures', 'empty-repository'),
    strict: false,
  });
  assert.equal(missing.length, 1);
  assert.ok(missing.every(message => message.includes('missing assets/images/achievements/2027/')));
});
