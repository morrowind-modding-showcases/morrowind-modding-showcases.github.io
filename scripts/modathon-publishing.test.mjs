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
    achievements: null,
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
  assert.equal(result.warnings.length, 2);
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
  assert.equal(missing.length, 2);
  assert.ok(missing.every(message => message.includes('missing assets/images/achievements/2027/')));
});
