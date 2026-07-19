import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  applyNexusMetadata,
  buildNexusIndex,
  nexusIdFor,
} from './fetch-nexus-stats.mjs';

test('extracts Morrowind Nexus IDs from historical URL variants', () => {
  assert.equal(nexusIdFor('http://www.nexusmods.com/morrowind/mods/44653/?'), '44653');
  assert.equal(nexusIdFor('https://www.nexusmods.com/morrowind/mods/52300?tab=description'), '52300');
  assert.equal(nexusIdFor('https://example.com/morrowind/mods/52300'), '');
});

test('builds one site-wide Nexus index with every matching entry attached', () => {
  const modathon = { url: 'https://www.nexusmods.com/morrowind/mods/50000' };
  const modjam = { url: 'https://www.nexusmods.com/morrowind/mods/50000?tab=files' };
  const external = { url: 'https://example.com/mod.zip' };
  const index = buildNexusIndex([
    { includeStats: true, mods: [modathon] },
    { includeStats: false, mods: [modjam, external] },
  ]);

  assert.equal(index.size, 1);
  assert.deepEqual(index.get('50000'), [
    { mod: modathon, includeStats: true },
    { mod: modjam, includeStats: false },
  ]);
});

test('adds pictures everywhere but preserves event-specific categories and stats', () => {
  const modathon = { category: 'Old category', status: 404 };
  const modjam = { category: 'Quest Mods' };
  const madness = { category: 'House Mods' };
  const pictureUrl = 'https://staticdelivery.nexusmods.com/example.jpg';

  applyNexusMetadata([
    { mod: modathon, includeStats: true },
    { mod: modjam, includeStats: false },
    { mod: madness, includeStats: false },
  ], {
    category_id: 7,
    mod_downloads: 120,
    mod_unique_downloads: 80,
    endorsement_count: 12,
    available: true,
    picture_url: pictureUrl.replace('https:', 'http:'),
  }, new Map([['7', 'Quests and Adventures']]));

  assert.equal(modathon.category, 'Quests');
  assert.equal(modathon.downloads, 120);
  assert.equal(modathon.pictureUrl, pictureUrl);
  assert.equal('status' in modathon, false);
  assert.deepEqual(modjam, { category: 'Quest Mods', pictureUrl });
  assert.deepEqual(madness, { category: 'House Mods', pictureUrl });
});

test('checked-in ModJam and Madness entries have matching Nexus pictures where available', async () => {
  const [modjam, madness] = await Promise.all([
    readFile(new URL('../modjam/data/modjams.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../madness/data/mods-by-year.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  const datasets = [
    ['ModJam', modjam.events.flatMap(event => event.entries)],
    ['Madness', madness.flatMap(year => year.mods)],
  ];

  for (const [name, records] of datasets) {
    const nexusMods = records.filter(mod => nexusIdFor(mod.url));
    const pictured = nexusMods.filter(mod => mod.pictureUrl);
    assert.ok(pictured.length / nexusMods.length >= 0.95, `${name} picture coverage fell below 95%`);

    for (const mod of pictured) {
      const nexusId = nexusIdFor(mod.url);
      const picture = new URL(mod.pictureUrl);
      assert.equal(picture.protocol, 'https:');
      assert.equal(picture.hostname, 'staticdelivery.nexusmods.com');
      assert.match(picture.pathname, new RegExp(`/${nexusId}(?:/|-)`));
    }
  }
});
