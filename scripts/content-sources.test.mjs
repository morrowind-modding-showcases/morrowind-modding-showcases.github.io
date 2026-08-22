import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  GENERATED_MADNESS_MODS_PATH,
  GENERATED_MADNESS_SCORES_PATH,
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
  canonicalModjamEvent,
  canonicalJson,
  loadContentSources,
  normalizeModjamMod,
  STANDARD_MOD_CATEGORIES,
  validateAchievementSource,
  validateGeneratedSiteDocuments,
  validateMadnessEvents,
  validateMadnessMod,
  validateMadnessTeamReferences,
  validateMadnessThemeReferences,
  validateModathonEvents,
  validateModjamEvents,
  validateModjamMod,
} from './content-lib.mjs';

const madnessScoreRules = JSON.parse(
  await readFile(new URL('../content/madness-score-rules.json', import.meta.url), 'utf8'),
);

test('per-record content rebuilds the checked-in compatibility data losslessly', async () => {
  const sources = await loadContentSources();
  const documents = buildContentDocuments(sources);
  validateGeneratedSiteDocuments(documents);
  assertLosslessBuild(sources, documents);

  const sourceInventories = [
    ['Modathon mods', sources.modFiles, sources.modRecords],
    ['Modathon achievements', sources.achievementFiles, sources.achievementRecords],
    ['Modathon events', sources.modathonEventFiles, sources.modathonEventRecords],
    ['Modjam mods', sources.modjamModFiles, sources.modjamModRecords],
    ['Modjam events', sources.modjamEventFiles, sources.modjamEventRecords],
    ['Madness mods', sources.madnessModFiles, sources.madnessModRecords],
    ['Madness teams', sources.madnessTeamFiles, sources.madnessTeamRecords],
    ['Madness events', sources.madnessEventFiles, sources.madnessEventRecords],
    ['postcards', sources.postcardFiles, sources.postcards],
    ['modders', sources.modderFiles, sources.modders],
  ];
  for (const [label, files, records] of sourceInventories) {
    assert.equal(files.length, records.length, `${label} must load one record per source file`);
  }

  const groupedInventories = [
    ['Modathon mods', sources.modsByYear, sources.modRecords],
    ['Modathon achievements', sources.achievementsByYear, sources.achievementRecords],
    ['Modjam mods', sources.modjamModsByEvent, sources.modjamModRecords],
    ['Madness mods', sources.madnessModsByYear, sources.madnessModRecords],
    ['Madness teams', sources.madnessTeamsByYear, sources.madnessTeamRecords],
  ];
  for (const [label, groups, records] of groupedInventories) {
    const groupedRecordCount = [...groups.values()]
      .reduce((total, groupRecords) => total + groupRecords.length, 0);
    assert.equal(groupedRecordCount, records.length, `${label} grouping must retain every record`);
  }
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
      `${sources.modjamModFiles[index]} must be stored in its Modjam event directory`,
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
    ['madnessScoresDocument', GENERATED_MADNESS_SCORES_PATH],
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

test('Modjam and Madness mods accept and generate optional showcase URLs', () => {
  const showcaseUrl = 'https://www.youtube.com/watch?v=abcdefghijk';
  assert.doesNotThrow(() => validateModjamMod({
    id: 'showcase-mod',
    title: 'Showcase Mod',
    authors: [{ id: 'showcase-modder' }],
    category: 'Unknown',
    showcaseUrl,
  }, 'Modjam fixture'));
  assert.doesNotThrow(() => validateMadnessMod({
    name: 'Showcase Mod',
    category: 'Unknown',
    showcaseUrl: 'https://youtu.be/abcdefghijk',
  }, 'Madness fixture'));
  assert.throws(
    () => validateModjamMod({
      id: 'broken-showcase',
      title: 'Broken Showcase',
      authors: [{ id: 'showcase-modder' }],
      category: 'Unknown',
      showcaseUrl: 'not a URL',
    }, 'Modjam fixture'),
    /showcaseUrl.*valid URL/,
  );
  assert.doesNotThrow(
    () => validateModjamMod({
      id: 'alternate-short-timestamp',
      title: 'Alternate Short Timestamp',
      authors: [{ id: 'showcase-modder' }],
      category: 'Unknown',
      showcaseUrl: 'https://youtu.be/abcdefghijk&t=90s',
    }, 'Modjam fixture'),
  );
  assert.doesNotThrow(() => validateModjamMod({
    id: 'no-showcase',
    title: 'No Showcase',
    authors: [{ id: 'showcase-modder' }],
    category: 'Unknown',
    showcaseUrl: '',
  }, 'Modjam fixture'));
  assert.throws(
    () => validateMadnessMod({
      name: 'Wrong Video Host',
      category: 'Unknown',
      showcaseUrl: 'https://vimeo.com/12345678901',
    }, 'Madness fixture'),
    /showcaseUrl.*YouTube watch or youtu\.be URL/,
  );

  const documents = buildContentDocuments({
    metadata: { generated: '2030-01-01T00:00:00.000Z', game: 'morrowind' },
    madnessScoreRules,
    modsByYear: new Map(),
    modders: [],
    modathonEvents: { events: [] },
    modjamMetadata: { generatedAt: '2030-01-01T00:00:00.000Z', listedModderCount: 1 },
    modjamEvents: { events: [{ id: 'summer-2030' }] },
    modjamModsByEvent: new Map([['summer-2030', [{
      id: 'showcase-mod',
      title: 'Showcase Mod',
      authors: [{ id: 'showcase-modder' }],
      category: 'Unknown',
      showcaseUrl,
    }]]]),
    madnessEvents: { events: [{ year: 2030 }] },
    madnessModsByYear: new Map([['2030', [{
      name: 'Showcase Mod',
      category: 'Unknown',
      team: 'Team Showcase',
      showcaseUrl,
    }]]]),
    madnessTeamsByYear: new Map([['2030', [{
      name: 'Showcase',
      mods: [{ name: 'Showcase Mod' }],
      members: [{ id: 'showcase-modder' }],
    }]]]),
    achievementYears: [],
    achievementsByYear: new Map(),
    postcards: [],
  });
  assert.equal(documents.modjamModsDocument.events[0].mods[0].showcaseUrl, showcaseUrl);
  assert.equal(documents.madnessModsDocument.years[0].mods[0].showcaseUrl, showcaseUrl);
  assert.equal(documents.madnessTeamsDocument.years[0].teams[0].mods[0].showcaseUrl, showcaseUrl);
});

test('Pages CMS-style Modjam sources generate legacy-compatible empty optional fields', () => {
  const pictureUrl = 'https://staticdelivery.nexusmods.com/mods/100/images/60001/example.png';
  const showcaseUrl = 'https://www.youtube.com/watch?v=abcdefghijk';
  const source = {
    eventId: 'summer-2030',
    title: 'Pages CMS Mod',
    url: 'https://www.nexusmods.com/morrowind/mods/60001',
    authors: [{ id: 'pages-cms-modder' }],
    category: 'Unknown',
    pictureUrl,
    showcaseUrl,
  };
  const { eventId, ...mod } = normalizeModjamMod(source);
  const documents = buildContentDocuments({
    metadata: { generated: '2030-01-01T00:00:00.000Z', game: 'morrowind' },
    madnessScoreRules,
    modsByYear: new Map(),
    modders: [],
    modathonEvents: { events: [] },
    modjamMetadata: { generatedAt: '2030-01-01T00:00:00.000Z', listedModderCount: 0 },
    modjamEvents: { events: [{ id: eventId }] },
    modjamModsByEvent: new Map([[eventId, [mod]]]),
    madnessEvents: { events: [] },
    madnessModsByYear: new Map(),
    madnessTeamsByYear: new Map(),
    achievementYears: [],
    achievementsByYear: new Map(),
    postcards: [],
  });

  assert.deepEqual(documents.modjamModsDocument.events[0].mods[0], {
    id: 'summer-2030-60001',
    title: 'Pages CMS Mod',
    url: source.url,
    authors: source.authors,
    category: 'Unknown',
    pictureUrl,
    showcaseUrl,
    placement: null,
    placementLabel: null,
    awards: [],
    awardPlacardUrl: null,
  });
});

test('CMS-derived fields and cross-record references remain safe for new records', () => {
  assert.doesNotThrow(() => validateAchievementSource({
    schemaVersion: 1,
    year: 2030,
    id: 'new-achievement',
    name: 'New Achievement',
    requirement: 'Complete the thing.',
    rarityKey: 'gold',
    group: 'standard',
    unlockedBy: [],
  }, 'fixture achievement'));

  const fallback = normalizeModjamMod({
    eventId: 'summer-2030',
    title: 'Stable Entry',
    url: '',
    authors: [{ id: 'fixture-modder' }],
    category: 'Unknown',
  }, 'content/modjam/mods/summer-2030/stable-entry.json');
  assert.equal(fallback.id, 'stable-entry');

  assert.throws(
    () => validateMadnessTeamReferences(
      [{ year: 2030, name: 'Entry', team: 'Team A' }],
      [{ year: 2030, name: 'A', mods: [] }],
    ),
    /does not list this mod/,
  );
});

test('schedule validation rejects malformed or out-of-order CMS timestamps', async () => {
  const sources = await loadContentSources();
  assert.doesNotThrow(() => validateModathonEvents(sources.modathonEvents, 'valid fixture'));

  const outOfOrder = structuredClone(sources.modathonEvents);
  const start = new Date(outOfOrder.events[0].countdown.start).getTime();
  outOfOrder.events[0].countdown.end = new Date(start - 1).toISOString();
  assert.throws(
    () => validateModathonEvents(outOfOrder, 'out-of-order fixture'),
    /countdown\.end.*must not be earlier than start/,
  );

  const invalid = structuredClone(sources.modathonEvents);
  invalid.events[0].countdown.start = '2030-02-30T00:00:00.000Z';
  assert.throws(
    () => validateModathonEvents(invalid, 'invalid fixture'),
    /countdown\.start.*real UTC timestamp/,
  );
});

test('Modjam events allow multiple redacted themes but reject duplicate revealed themes', () => {
  const eventDocument = {
    schemaVersion: 1,
    eventType: 'modjam',
    events: [{
      id: 'summer-2030',
      label: 'Summer 2030',
      name: 'Summer Modjam 2030',
      season: 'Summer',
      year: 2030,
      themes: ['[REDACTED]', '[REDACTED]', '[REDACTED]'],
      headers: ['https://example.com/header.webp'],
      competitionType: 'judged',
      competitionLabel: 'Judged competition',
      competitionNote: 'A judging panel selected the placed entries.',
    }],
  };
  assert.doesNotThrow(() => validateModjamEvents(eventDocument, 'fixture'));

  const duplicate = structuredClone(eventDocument);
  duplicate.events[0].themes = ['Ashlands', 'ashlands'];
  assert.throws(
    () => validateModjamEvents(duplicate, 'fixture'),
    /duplicates theme "ashlands"/,
  );
});

test('Modjam event generation trims CMS list values before publishing them', () => {
  const event = canonicalModjamEvent({
    season: 'Summer',
    year: 2030,
    themes: ['  Ashlands  ', 'Forgotten Lore', '[REDACTED]'],
    headers: ['https://example.com/header.webp'],
    competitionType: 'judged',
  });

  assert.deepEqual(event.themes, ['Ashlands', 'Forgotten Lore', '[REDACTED]']);
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
