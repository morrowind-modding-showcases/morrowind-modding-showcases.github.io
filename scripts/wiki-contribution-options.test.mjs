import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildCanonicalEventLabels,
  madnessEventLabel,
  modathonEventLabel,
  modjamEventLabel,
} from './sync-wiki-event-metadata.mjs';
import { generateWikiContributionOptions } from './generate-wiki-contribution-options.mjs';
import { loadControlledVocabularies, loadWikiMods, stableUniqueStrings } from './wiki-content-lib.mjs';

test('contribution options match controlled sources, contain existing slugs, and are deterministic', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wiki-options-'));
  const outputPath = path.join(directory, 'options.json');
  try {
    const [options, vocabularies, mods, events] = await Promise.all([
      generateWikiContributionOptions({ outputPath }),
      loadControlledVocabularies(),
      loadWikiMods(),
      buildCanonicalEventLabels(),
    ]);
    assert.deepEqual(options.categories, stableUniqueStrings(vocabularies.properties.categories));
    assert.deepEqual(options.mapLocations, stableUniqueStrings(vocabularies.map_locations));
    assert.deepEqual(options.events, stableUniqueStrings(events));
    assert.deepEqual(options.modSlugs, stableUniqueStrings(mods.map(mod => mod.slug)));
    assert.ok(options.modSlugs.includes('akulakhan-city'));
    const first = await readFile(outputPath, 'utf8');
    await generateWikiContributionOptions({ outputPath });
    assert.equal(await readFile(outputPath, 'utf8'), first);
    for (const values of [options.categories, options.events, options.mapLocations, options.modSlugs]) {
      assert.deepEqual(values, stableUniqueStrings(values));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('canonical event labels reuse Modathon, Modjam, and Madness naming rules', () => {
  assert.equal(modathonEventLabel({ year: 2026 }), 'Morrowind Modathon 2026');
  assert.equal(modjamEventLabel({ eventId: 'summer-2026' }), 'Summer Modjam 2026');
  assert.equal(madnessEventLabel({ year: 2026 }), 'Morrowind Modding Madness 2026');
});
