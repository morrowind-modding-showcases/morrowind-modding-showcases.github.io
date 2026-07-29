import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  GENERATED_MADNESS_MODS_PATH,
  GENERATED_MADNESS_TEAMS_PATH,
  GENERATED_MODJAM_MODS_PATH,
  GENERATED_MODJAM_POSTCARDS_PATH,
  GENERATED_MODDERS_PATH,
  GENERATED_MODS_PATH,
  MADNESS_EVENTS_PATH,
  MODATHON_EVENTS_PATH,
  MODJAM_EVENTS_PATH,
  assertLosslessBuild,
  buildContentDocuments,
  canonicalJson,
  loadContentSources,
  STANDARD_MOD_CATEGORIES,
  validateGeneratedSiteDocuments,
  validateMadnessEvents,
  validateMadnessMod,
  validateMadnessThemeReferences,
} from './content-lib.mjs';

test('per-record content rebuilds the checked-in compatibility data losslessly', async () => {
  const sources = await loadContentSources();
  const documents = buildContentDocuments(sources);
  validateGeneratedSiteDocuments(documents);
  assertLosslessBuild(sources, documents);

  assert.equal(sources.modFiles.length, 1941);
  assert.equal(sources.modjamModFiles.length, 164);
  assert.equal(sources.madnessModFiles.length, 89);
  assert.equal(sources.madnessTeamFiles.length, 55);
  assert.equal(sources.modathonEventFiles.length, 12);
  assert.equal(sources.modjamEventFiles.length, 10);
  assert.equal(sources.postcardFiles.length, 57);
  assert.equal(sources.modderFiles.length, 615);
  assert.deepEqual(
    Object.fromEntries([...sources.modsByYear].map(([year, mods]) => [year, mods.length])),
    {
      2015: 15,
      2016: 29,
      2017: 29,
      2018: 89,
      2019: 240,
      2020: 226,
      2021: 236,
      2022: 300,
      2023: 186,
      2024: 173,
      2025: 179,
      2026: 239,
    },
  );
  for (const [index, record] of sources.modRecords.entries()) {
    assert.equal(
      path.basename(path.dirname(sources.modFiles[index])),
      String(record.year),
      `${sources.modFiles[index]} must be stored in its record year directory`,
    );
  }
  for (const [index, record] of sources.achievementRecords.entries()) {
    assert.equal(
      path.basename(path.dirname(sources.achievementFiles[index])),
      String(record.year),
      `${sources.achievementFiles[index]} must be stored in its achievement year directory`,
    );
  }
  for (const [index, record] of sources.madnessModRecords.entries()) {
    assert.equal(
      path.basename(path.dirname(sources.madnessModFiles[index])),
      String(record.year),
      `${sources.madnessModFiles[index]} must be stored in its Madness year directory`,
    );
  }
  for (const [index, record] of sources.modjamModRecords.entries()) {
    assert.equal(
      path.basename(path.dirname(sources.modjamModFiles[index])),
      record.eventId,
      `${sources.modjamModFiles[index]} must be stored in its ModJam event directory`,
    );
    assert.equal(STANDARD_MOD_CATEGORIES.has(record.category), true);
    const nexusId = String(record.url || '')
      .match(/nexusmods\.com\/morrowind\/mods\/(\d+)(?:\D|$)/i)?.[1];
    if (nexusId) {
      assert.equal(
        record.id,
        `${record.eventId}-${nexusId.slice(-5).padStart(5, '0')}`,
        `${sources.modjamModFiles[index]} must derive its entry ID from the Nexus URL`,
      );
    }
  }
  for (const [files, generatedField] of [
    [sources.modathonEventFiles, 'name'],
    [sources.madnessEventFiles, 'name'],
    [sources.modjamEventFiles, 'id'],
  ]) {
    for (const filePath of files) {
      const source = JSON.parse(await readFile(filePath, 'utf8'));
      assert.equal(
        Object.hasOwn(source, generatedField),
        false,
        `${filePath} must omit generated field ${generatedField}`,
      );
    }
  }
  assert.ok(sources.modathonEvents.events.every(
    event => event.name === `Morrowind Modathon ${event.year}`,
  ));
  assert.ok(sources.madnessEvents.events.every(
    event => event.name === `Morrowind Modding Madness ${event.year}`,
  ));
  assert.ok(sources.modjamEvents.events.every(event => (
    event.id === `${event.season.toLowerCase()}-${event.year}`
    && event.label === `${event.season} ${event.year}`
  )));

  const generatedEntries = [
    ['modsDocument', GENERATED_MODS_PATH],
    ['moddersDocument', GENERATED_MODDERS_PATH],
    ['modathonEventsDocument', MODATHON_EVENTS_PATH],
    ['modjamEventsDocument', MODJAM_EVENTS_PATH],
    ['modjamModsDocument', GENERATED_MODJAM_MODS_PATH],
    ['madnessModsDocument', GENERATED_MADNESS_MODS_PATH],
    ['madnessTeamsDocument', GENERATED_MADNESS_TEAMS_PATH],
    ['madnessEventsDocument', MADNESS_EVENTS_PATH],
    ['postcardsDocument', GENERATED_MODJAM_POSTCARDS_PATH],
  ];
  for (const [key, filePath] of generatedEntries) {
    const generated = await readFile(filePath, 'utf8');
    assert.equal(generated.replaceAll('\r\n', '\n'), canonicalJson(documents[key]));
  }
});

test('content validation rejects duplicate IDs and broken author references', () => {
  const validMod = {
    name: 'Example',
    authors: [{ name: 'Known Author', contributed: true }],
    category: 'Unknown',
    url: 'https://example.com/mod',
  };
  const validModder = {
    id: 'known-author',
    name: 'Known Author',
  };
  const modsDocument = {
    generated: '2026-07-27T00:00:00.000Z',
    game: 'morrowind',
    mods: { 2026: [validMod] },
  };

  assert.throws(
    () => validateGeneratedSiteDocuments({
      modsDocument,
      moddersDocument: { modders: [validModder, structuredClone(validModder)] },
      modjamModsDocument: { generatedAt: '2026-07-27T00:00:00.000Z', summary: {}, events: [] },
      madnessModsDocument: { years: [] },
      madnessTeamsDocument: { years: [] },
      postcardsDocument: { postcards: [] },
    }, 'fixture'),
    /duplicates stable ID "known-author"/,
  );
  assert.throws(
    () => validateGeneratedSiteDocuments({
      modsDocument: {
        ...modsDocument,
        mods: {
          2026: [{
            ...validMod,
            authors: [{ name: 'Missing Author', contributed: true }],
          }],
        },
      },
      moddersDocument: { modders: [validModder] },
      modjamModsDocument: { generatedAt: '2026-07-27T00:00:00.000Z', summary: {}, events: [] },
      madnessModsDocument: { years: [] },
      madnessTeamsDocument: { years: [] },
      postcardsDocument: { postcards: [] },
    }, 'fixture'),
    /does not resolve to a central modder name or alias/,
  );
});

test('Madness validates standard categories and event-owned theme references', async () => {
  const sources = await loadContentSources();
  const eventsByYear = new Map(sources.madnessEvents.events.map(event => [
    event.year,
    new Set((event.themes || []).map(theme => theme.id)),
  ]));

  for (const record of sources.madnessModRecords) {
    assert.equal(
      STANDARD_MOD_CATEGORIES.has(record.category),
      true,
      `${record.year} ${record.name} must use a standard category`,
    );
    if (record.themeId) {
      assert.equal(
        eventsByYear.get(record.year)?.has(record.themeId),
        true,
        `${record.year} ${record.name} must reference a theme from its event`,
      );
    }
  }

  assert.throws(
    () => validateMadnessMod({
      name: 'Legacy category fixture',
      category: 'Item Mods',
    }, 'fixture'),
    /must be one of the standard mod categories/,
  );
  assert.throws(
    () => validateMadnessThemeReferences(
      [{
        year: 2025,
        name: 'Unknown theme fixture',
        category: 'Items',
        themeId: 'not-a-theme',
      }],
      sources.madnessEvents,
      ['fixture'],
    ),
    /references unknown Madness 2025 theme "not-a-theme"/,
  );
});

test('Madness theme definitions reject duplicate IDs and invalid week ranges', () => {
  const eventDocument = {
    schemaVersion: 1,
    eventType: 'madness',
    events: [{
      name: 'Morrowind Modding Madness 2030',
      year: 2030,
      season: 14,
      themes: [{
        id: 'single-week',
        name: 'Single Week',
        weekStart: 2,
        weekEnd: 2,
      }],
    }],
  };
  assert.doesNotThrow(() => validateMadnessEvents(eventDocument, 'fixture'));

  const missingThemes = structuredClone(eventDocument);
  delete missingThemes.events[0].themes;
  assert.throws(
    () => validateMadnessEvents(missingThemes, 'fixture'),
    /is missing required field "themes"/,
  );

  const duplicate = structuredClone(eventDocument);
  duplicate.events[0].themes.push({
    id: 'single-week',
    name: 'Duplicate',
    weekStart: 3,
    weekEnd: 4,
  });
  assert.throws(
    () => validateMadnessEvents(duplicate, 'fixture'),
    /duplicates theme ID "single-week"/,
  );

  for (const [field, value, message] of [
    ['weekStart', 0, /weekStart: must be a positive integer/],
    ['weekEnd', 0, /weekEnd: must be a positive integer/],
    ['weekEnd', 1, /weekEnd: cannot be less than weekStart/],
  ]) {
    const invalid = structuredClone(eventDocument);
    invalid.events[0].themes[0].weekStart = 2;
    invalid.events[0].themes[0].weekEnd = 2;
    invalid.events[0].themes[0][field] = value;
    assert.throws(() => validateMadnessEvents(invalid, 'fixture'), message);
  }
});
