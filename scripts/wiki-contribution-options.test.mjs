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
import {
  COMPONENT_TYPES,
  RELATIONSHIP_TYPES,
  SITE_MOD_CATEGORIES,
  loadControlledVocabularies,
  loadWikiMods,
  stableUniqueStrings,
} from './wiki-content-lib.mjs';

test('contribution options match controlled sources, contain existing slugs, and are deterministic', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wiki-options-'));
  const outputPath = path.join(directory, 'options.json');
  try {
    // Each helper scans a large portion of the vault. Keep the scans sequential
    // so the test also runs on Windows hosts with conservative open-file limits.
    const options = await generateWikiContributionOptions({ outputPath });
    const vocabularies = await loadControlledVocabularies();
    const mods = await loadWikiMods();
    const events = await buildCanonicalEventLabels();
    assert.deepEqual(options.categories, SITE_MOD_CATEGORIES);
    assert.deepEqual(vocabularies.properties.categories, SITE_MOD_CATEGORIES);
    assert.deepEqual(vocabularies.pages.categories, SITE_MOD_CATEGORIES);
    assert.deepEqual(options.mapLocations, stableUniqueStrings(vocabularies.map_locations));
    assert.equal(options.schemaVersion, 5);
    assert.ok(options.modderProfiles.length > 0);
    assert.ok(options.modderProfiles.every(profile => profile.id && profile.name && Array.isArray(profile.aliases)));
    assert.ok(options.mapLocationDetails.length > 0);
    assert.ok(options.mapLocationDetails.every(location =>
      options.mapLocations.includes(location.cell)
      && Number.isFinite(location.x)
      && Number.isFinite(location.y)));
    assert.deepEqual(options.events, stableUniqueStrings(events));
    assert.deepEqual(options.modSlugs, stableUniqueStrings(mods.map(mod => mod.slug)));
    assert.ok(options.modSlugs.includes('akulakhan-city'));
    assert.ok(options.mods.some(mod => mod.slug === 'akulakhan-city' && mod.title));
    assert.ok(options.wikiPages.length > options.mods.length);
    assert.deepEqual(
      options.wikiPages.find(page => page.title === 'Balmora'),
      {
        path: 'locations/balmora',
        title: 'Balmora',
        type: 'location',
        aliases: [],
      },
    );
    assert.ok(
      options.wikiPages.some(
        page => page.type === 'mod' && page.path === 'mods/aspect-of-azura' && page.title === 'Aspect of Azura',
      ),
    );
    assert.deepEqual(options.componentTypes, COMPONENT_TYPES);
    assert.equal(options.componentTypes.includes('main'), false);
    assert.deepEqual(options.relationshipTypes, RELATIONSHIP_TYPES);
    assert.deepEqual(
      options.contributors,
      [...options.contributors].sort((left, right) =>
        left.localeCompare(right, 'en', { sensitivity: 'base', numeric: true })),
    );
    const first = await readFile(outputPath, 'utf8');
    await generateWikiContributionOptions({ outputPath });
    assert.equal(await readFile(outputPath, 'utf8'), first);
    assert.equal(new Set(options.categories).size, options.categories.length);
    for (const values of [options.events, options.mapLocations, options.modSlugs]) {
      assert.deepEqual(values, stableUniqueStrings(values));
    }
    assert.equal(
      new Set(options.contributors.map(value => value.normalize('NFKC').toLocaleLowerCase('en-US'))).size,
      options.contributors.length,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('contribution options publish a searchable, case-insensitive contributor list', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wiki-contributors-'));
  const outputPath = path.join(directory, 'options.json');
  try {
    const records = [
      { contributor: 'First Editor' },
      { contributor: 'first editor' },
      { contributor: 'Second Editor' },
    ];
    const options = await generateWikiContributionOptions({
      outputPath,
      loadContributions: async () => records,
      loadModders: async () => [],
    });
    assert.equal(options.schemaVersion, 5);
    assert.deepEqual(options.contributors, ['First Editor', 'Second Editor']);
    assert.deepEqual(options.modderProfiles, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('external suggestions come from history and disappear after an explicit profile link', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wiki-linked-contributors-'));
  const outputPath = path.join(directory, 'options.json');
  const records = [
    { contributor: 'Greatness7' },
    { contributor: ' greatness7 ' },
    { contributor: 'Some Dunmer' },
  ];
  try {
    const external = await generateWikiContributionOptions({
      outputPath,
      loadContributions: async () => records,
      loadModders: async () => [],
    });
    assert.deepEqual(external.contributors, ['Greatness7', 'Some Dunmer']);

    const linked = await generateWikiContributionOptions({
      outputPath,
      loadContributions: async () => records,
      loadModders: async () => [{
        id: 'greatness7',
        name: 'Greatness7',
        aliases: [],
        wiki: { contributorNames: ['greatness7'] },
      }],
    });
    assert.deepEqual(linked.contributors, ['Some Dunmer']);
    assert.deepEqual(linked.modderProfiles, [{
      id: 'greatness7',
      name: 'Greatness7',
      aliases: [],
    }]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('canonical event labels reuse Modathon, Modjam, and Madness naming rules', () => {
  assert.equal(modathonEventLabel({ year: 2026 }), 'Morrowind Modathon 2026');
  assert.equal(modjamEventLabel({ eventId: 'summer-2026' }), 'Summer Modjam 2026');
  assert.equal(modjamEventLabel({ id: 'winter-2025' }), 'Winter Modjam 2025');
  assert.equal(madnessEventLabel({ year: 2026 }), 'Morrowind Modding Madness 2026');
});

test('canonical event labels include contest events before any mods are submitted', async () => {
  const readJson = async filePath =>
    readFile(new URL(filePath, import.meta.url), 'utf8').then(JSON.parse);
  const [modathon, modjam, madness, labels] = await Promise.all([
    readJson('../modathon/assets/data/modathon-event.json'),
    readJson('../modjam/data/modjam-event.json'),
    readJson('../madness/data/madness-event.json'),
    buildCanonicalEventLabels(),
  ]);
  const defined = [
    ...modathon.events,
    ...modjam.events,
    ...madness.events,
  ].map(event => event.name);
  assert.ok(defined.length > 0);
  for (const name of defined) {
    assert.ok(
      labels.includes(name),
      `canonical event labels must include the contest site event "${name}"`,
    );
  }
});

test('the site build publishes generated contribution options after Quartz scans static files', async () => {
  const [packageSource, buildSiteSource] = await Promise.all([
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('build-site.mjs', import.meta.url), 'utf8'),
  ]);
  const buildCommand = JSON.parse(packageSource).scripts['build:site'];
  const quartzBuild = 'npm --prefix wiki run build';
  const publishedOptions =
    'node scripts/generate-wiki-contribution-options.mjs dist/wiki/static/contribution-options.json';
  const publishedHistory =
    'node scripts/wiki-contribution-data.mjs dist/wiki/static/contribution-history.json';

  assert.ok(buildCommand.indexOf(quartzBuild) >= 0);
  assert.ok(buildCommand.indexOf(publishedOptions) > buildCommand.indexOf(quartzBuild));
  assert.ok(buildCommand.indexOf(publishedHistory) > buildCommand.indexOf(publishedOptions));
  assert.doesNotMatch(buildSiteSource, /generateWikiContributionOptions/u);
});
