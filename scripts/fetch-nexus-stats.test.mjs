import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import {
  applyNexusMetadata,
  buildNexusIndex,
  formatNexusSummary,
  nexusIdFor,
  refreshNexusSources,
  writeSources,
} from './fetch-nexus-stats.mjs';
import { buildContentDocuments, canonicalJson, loadContentSources } from './content-lib.mjs';

const [modjamApp, modjamStyles, madnessPage, madnessStyles] = await Promise.all([
  readFile(new URL('../modjam/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../modjam/style.css', import.meta.url), 'utf8'),
  readFile(new URL('../madness/mods.html', import.meta.url), 'utf8'),
  readFile(new URL('../madness/style.css', import.meta.url), 'utf8'),
]);

test('the daily Nexus workflow tracks all three mod datasets and cannot edit the wiki', async () => {
  const [updater, workflow, deployWorkflow] = await Promise.all([
    readFile(new URL('./fetch-nexus-stats.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/nexus-stats.yml', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8'),
  ]);
  const updaterPaths = [
    'content/modathon/mods',
    'content/modjam/mods',
    'content/madness/mods',
  ];

  for (const dataPath of updaterPaths) {
    assert.match(updater, new RegExp(dataPath.replaceAll('/', '\\/').replaceAll('.', '\\.')));
  }
  assert.match(workflow, /git add content/);
  assert.doesNotMatch(updater, /wiki-content-lib|wiki\/content/);
  assert.doesNotMatch(workflow, /sync:wiki-events|git add[^\r\n]*wiki/);
  assert.match(workflow, /git status --short -- wiki/);
  assert.match(deployWorkflow, /workflow_run:[\s\S]*?Refresh Nexus stats/);
  assert.doesNotMatch(deployWorkflow, /pages-build-deployment/);
  assert.match(deployWorkflow, /workflow_run\.conclusion == 'success'/);
  assert.doesNotMatch(workflow, /git add .*modjam\/data\/modjam-mods\.json/);
  assert.doesNotMatch(workflow, /git add .*madness\/data\/madness-mods\.json/);
  assert.doesNotMatch(workflow, /git add .*modathon\/assets\/data\/modathon-mods\.json/);
  assert.match(workflow, /NEXUS_REPORT_PATH: \$\{\{ runner\.temp \}\}\/nexus-refresh-report\.json/);
  assert.match(workflow, /name: Save Nexus refresh diagnostics\s+if: always\(\)/);
  assert.ok(workflow.indexOf('name: Save Nexus refresh diagnostics') < workflow.indexOf('name: Validate refreshed data'));
  assert.doesNotMatch(modjamApp, /api\.nexusmods\.com|NEXUS_API_KEY/);
});

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
    { key: 'modathon', includeStats: true, mods: [modathon] },
    { key: 'modjam', includeStats: false, mods: [modjam, external] },
  ]);

  assert.equal(index.size, 1);
  assert.deepEqual(index.get('50000'), [
    { mod: modathon, includeStats: true, source: 'modathon', file: undefined },
    { mod: modjam, includeStats: false, source: 'modjam', file: undefined },
  ]);
});

test('adds pictures everywhere but preserves event-specific categories and stats', () => {
  const modathon = { category: 'Player Home', status: 404 };
  const modjam = { category: 'Quest Mods' };
  const madness = { category: 'Player Home', themeId: 'player-home' };
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

  assert.equal(modathon.category, 'Player Home');
  assert.equal(modathon.nexusCategory, 'Quests and Adventures');
  assert.equal(modathon.downloads, 120);
  assert.equal(modathon.pictureUrl, pictureUrl);
  assert.equal('status' in modathon, false);
  assert.deepEqual(modjam, { category: 'Quest Mods', pictureUrl });
  assert.deepEqual(madness, {
    category: 'Player Home',
    themeId: 'player-home',
    pictureUrl,
  });
});

test('uses the normalized Nexus category only when a Modathon category is missing', () => {
  const modathon = { url: 'https://www.nexusmods.com/morrowind/mods/50000' };

  applyNexusMetadata([
    { mod: modathon, includeStats: true },
  ], {
    category_id: 7,
    picture_url: null,
  }, new Map([['7', 'Quests and Adventures']]));

  assert.equal(modathon.category, 'Quests');
  assert.equal(modathon.nexusCategory, 'Quests and Adventures');
});

const oldPicture = 'https://staticdelivery.nexusmods.com/mods/100/images/59956/59956-old.png';
const newPicture = oldPicture.replace('-old.png', '-new.png');
const modUrl = id => `https://www.nexusmods.com/morrowind/mods/${id}`;
const sourceFor = (key, mods) => ({ key, includeStats: key === 'modathon', mods });

async function runRefresh(sources, respond) {
  const requests = [];
  const waits = [];
  const logs = [];
  const warnings = [];
  const report = await refreshNexusSources(sources, {
    key: 'test-only-key',
    fetchImpl: async (url, options) => {
      assert.equal(options.headers.apikey, 'test-only-key');
      if (url === 'https://api.nexusmods.com/v1/games/morrowind.json') {
        return Response.json({ categories: [{ category_id: 7, name: 'Quests and Adventures' }] });
      }
      const id = url.match(/\/mods\/(\d+)\.json$/)?.[1];
      assert.ok(id, `unexpected request: ${url}`);
      requests.push(id);
      return respond(id, requests.length);
    },
    sleepImpl: async ms => { waits.push(ms); },
    logger: { log: message => logs.push(message), warn: message => warnings.push(message) },
  });
  assert.doesNotMatch(JSON.stringify({ report, logs, warnings }), /test-only-key/);
  return { report, requests, waits, logs, warnings };
}

test('one HTTP request enriches shared Modathon, Modjam, and Madness records', async () => {
  const modathon = { name: 'Shared', url: modUrl(59956), category: 'Player Home', error: 'old failure', status: 503 };
  const modjam = { title: 'Shared', url: modUrl(59956), eventId: 'summer-2026', category: 'Quests', awards: ['Award'] };
  const madness = { name: 'Shared', url: modUrl(59956), year: 2026, category: 'Items', themeId: 'family' };
  const beforeJam = structuredClone(modjam);
  const beforeMadness = structuredClone(madness);
  const { report, requests } = await runRefresh([
    sourceFor('modathon', [modathon]), sourceFor('modjam', [modjam]), sourceFor('madness', [madness]),
  ], () => Response.json({
    picture_url: newPicture.replace('https:', 'http:'), category_id: 7,
    mod_downloads: 120, mod_unique_downloads: 80, endorsement_count: 12, available: true,
  }));
  assert.deepEqual(requests, ['59956']);
  assert.deepEqual(modjam, { ...beforeJam, pictureUrl: newPicture });
  assert.deepEqual(madness, { ...beforeMadness, pictureUrl: newPicture });
  assert.deepEqual(modathon, {
    name: 'Shared', url: modUrl(59956), category: 'Player Home', nexusCategory: 'Quests and Adventures',
    downloads: 120, uniqueDownloads: 80, endorsements: 12, available: true, pictureUrl: newPicture,
  });
  assert.equal(report.uniqueMods, 1);
  assert.equal(report.entries.length, 3);
  for (const summary of Object.values(report.sources)) {
    assert.deepEqual(summary, { checked: 1, withPictures: 1, updated: 1, missing: 0, failed: 0 });
  }
});

for (const [label, respond, expectedStatus] of [
  ['HTTP 503', () => Response.json({}, { status: 503 }), 503],
  ['network error', () => { throw new TypeError('fetch failed'); }, undefined],
  ['invalid JSON', () => new Response('{not-json'), 200],
  ['missing picture field', () => Response.json({ message: 'unexpected payload' }), 200],
  ['invalid picture URL', () => Response.json({ picture_url: 'https:///' }), 200],
]) {
  test(`${label} retains existing images and records failures for all sections`, async () => {
    const sources = ['modjam', 'madness', 'modathon'].map(key => sourceFor(key, [{
      title: 'Arcane Accident', url: modUrl(59956), category: 'Player Home', pictureUrl: oldPicture,
    }]));
    const jamBefore = structuredClone(sources[0].mods[0]);
    const { report, warnings } = await runRefresh(sources, respond);
    assert.deepEqual(sources[0].mods[0], jamBefore);
    assert.deepEqual(sources[1].mods[0], jamBefore);
    assert.equal(sources[2].mods[0].available, false);
    assert.equal(sources[2].mods[0].pictureUrl, oldPicture);
    assert.equal(report.failedMods, 1);
    for (const entry of report.entries) {
      assert.equal(entry.outcome, 'request-failed');
      assert.equal(entry.status, expectedStatus);
      assert.equal(entry.retainedPreviousPicture, true);
    }
    assert.deepEqual(report.sources.modjam, { checked: 1, withPictures: 1, updated: 0, missing: 0, failed: 1 });
    assert.match(warnings[0], /\[modjam\] 59956 Arcane Accident: .+, retaining previous pictureUrl/);
  });
}

test('confirmed null or empty Nexus pictures are cleared and distinguished from request failures', async () => {
  for (const picture_url of [null, '']) {
    const mod = { title: 'Arcane Accident', url: modUrl(59956), pictureUrl: oldPicture };
    const { report, warnings } = await runRefresh([sourceFor('modjam', [mod])], () => Response.json({ picture_url }));
    assert.equal(Object.hasOwn(mod, 'pictureUrl'), false);
    assert.equal(report.entries[0].outcome, 'missing');
    assert.equal(report.entries[0].status, 200);
    assert.deepEqual(report.sources.modjam, { checked: 1, withPictures: 0, updated: 0, missing: 1, failed: 0 });
    assert.match(warnings[0], /Nexus returned no picture_url, removed previous pictureUrl/);
  }
});

test('429 retries retain the existing three 60-second backoffs and recover when possible', async () => {
  for (const recovers of [true, false]) {
    const mod = { title: 'Arcane Accident', url: modUrl(59956), pictureUrl: oldPicture };
    const { requests, waits, report } = await runRefresh([sourceFor('modjam', [mod])], (_id, attempt) => (
      recovers && attempt === 4
        ? Response.json({ picture_url: newPicture }) : Response.json({}, { status: 429 })
    ));
    assert.deepEqual(requests, Array(4).fill('59956'));
    assert.deepEqual(waits, [60_000, 60_000, 60_000, 300]);
    assert.equal(mod.pictureUrl, recovers ? newPicture : oldPicture);
    assert.equal(report.failedMods, recovers ? 0 : 1);
    assert.equal(report.entries[0].status, recovers ? 200 : 429);
  }
});

test('summary counts entries accurately and only logs changed or problematic pictures', async () => {
  const mods = [1, 2, 3, 4].map(id => ({ title: `Mod ${id}`, url: modUrl(id) }));
  mods[0].pictureUrl = oldPicture;
  const { report, logs, warnings } = await runRefresh([sourceFor('modjam', mods)], id => {
    if (id === '4') return Response.json({}, { status: 503 });
    return Response.json({ picture_url: id === '1' ? oldPicture : id === '2' ? newPicture : null });
  });
  assert.deepEqual(report.sources.modjam, { checked: 4, withPictures: 2, updated: 1, missing: 1, failed: 1 });
  assert.deepEqual(logs.filter(line => line.startsWith('[modjam]')), ['[modjam] 2 Mod 2: picture_url updated']);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /no picture_url/);
  assert.match(warnings[1], /HTTP 503, no previous pictureUrl to retain/);
  assert.equal(formatNexusSummary(report), 'Modjam Nexus images:\n4 Nexus entries checked\n2 with picture URLs\n1 updated\n1 missing from Nexus\n1 request failures');
});

test('Summer 2026 records without images survive the request, source write, build, and card rendering pipeline', async t => {
  const content = await loadContentSources();
  const mods = content.modjamModRecords.filter(mod => mod.eventId === 'summer-2026').map(mod => {
    const copy = structuredClone(mod);
    delete copy.pictureUrl;
    return copy;
  });
  for (const id of ['59956', '59935', '59951']) assert.ok(mods.some(mod => nexusIdFor(mod.url) === id));
  const directory = await mkdtemp(path.join(os.tmpdir(), 'nexus-modjam-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = {
    ...sourceFor('modjam', mods),
    files: mods.map(mod => path.join(directory, `${mod.id}.json`)),
    originals: structuredClone(mods),
    content: { metadata: { game: 'morrowind' } },
  };
  await Promise.all(source.files.map((file, index) => writeFile(file, canonicalJson(mods[index]))));
  const { report } = await runRefresh([source], id => Response.json({
    picture_url: `http://staticdelivery.nexusmods.com/mods/100/images/${id}/${id}-fixture.png`,
    category_id: 7,
  }));
  await writeSources([source], path.join(directory, 'metadata.json'));
  const reloaded = await Promise.all(source.files.map(async file => JSON.parse(await readFile(file, 'utf8'))));
  reloaded.forEach((mod, index) => {
    const { pictureUrl, ...eventData } = mod;
    assert.deepEqual(eventData, source.originals[index]);
    assert.equal(pictureUrl, `https://staticdelivery.nexusmods.com/mods/100/images/${nexusIdFor(mod.url)}/${nexusIdFor(mod.url)}-fixture.png`);
  });
  content.modjamModsByEvent.set('summer-2026', reloaded.map(({ eventId, ...mod }) => mod));
  const generated = JSON.parse(canonicalJson(buildContentDocuments(content).modjamModsDocument));
  const entries = generated.events.find(event => event.id === 'summer-2026').mods;
  assert.deepEqual(entries.map(mod => mod.pictureUrl), reloaded.map(mod => mod.pictureUrl));
  assert.equal(report.sources.modjam.updated, mods.length);

  // Execute the real card image renderer; no API or local image asset is needed.
  const sandbox = {
    URL, location: { origin: 'https://example.org' }, console,
    document: { getElementById() { return {}; }, addEventListener() {}, querySelectorAll() { return []; } },
    window: { addEventListener() {} }, fetch() { return new Promise(() => {}); },
  };
  vm.runInNewContext(modjamApp.replace(/\}\)\(\);\s*$/, 'globalThis.renderPicture = entryPicture;\n})();'), sandbox);
  for (const entry of entries) {
    const event = content.modjamEvents.events.find(event => event.id === 'summer-2026');
    assert.ok(sandbox.renderPicture({ ...entry, event }).includes(`src="${entry.pictureUrl}"`));
  }
});

test('checked-in Modjam and Madness Nexus pictures are valid when supplied', async () => {
  const [modjam, madness] = await Promise.all([
    readFile(new URL('../modjam/data/modjam-mods.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../madness/data/madness-mods.json', import.meta.url), 'utf8')
      .then(JSON.parse)
      .then(data => data.years),
  ]);
  const datasets = [
    ['Modjam', modjam.events.flatMap(event => event.mods)],
    ['Madness', madness.flatMap(year => year.mods)],
  ];

  for (const [name, records] of datasets) {
    const nexusMods = records.filter(mod => nexusIdFor(mod.url));
    const pictured = nexusMods.filter(mod => mod.pictureUrl);

    for (const mod of pictured) {
      const nexusId = nexusIdFor(mod.url);
      const picture = new URL(mod.pictureUrl);
      assert.equal(picture.protocol, 'https:');
      assert.equal(picture.hostname, 'staticdelivery.nexusmods.com');
      assert.match(picture.pathname, new RegExp(`/${nexusId}(?:/|-)`), `${name} picture must match its Nexus mod`);
    }
  }
});

test('Modjam entry cards render lazy Nexus pictures with a resilient fallback', () => {
  assert.match(modjamApp, /entryPicture\(entry\)/);
  assert.match(modjamApp, /safeUrl\(entry\.pictureUrl\)/);
  assert.match(modjamApp, /class="entry-card-picture/);
  assert.match(modjamApp, /loading="lazy" decoding="async"/);
  assert.match(modjamApp, /\.entry-card-picture img/);
  assert.match(modjamStyles, /\.entry-card-picture\s*\{/);
  assert.match(modjamStyles, /object-fit:\s*cover/);
});

test('Madness mod rows render responsive Nexus thumbnails with a fallback', () => {
  assert.match(madnessPage, /value="\{\{ m\.pictureUrl \}\}"/);
  assert.match(madnessPage, /class="mm-mod-picture"/);
  assert.match(madnessPage, /onError="\{\{ m\.imageError \}\}"/);
  assert.match(madnessPage, /noPicture:\s*!pictureUrl/);
  assert.match(madnessStyles, /\.mm-mod-row\s*\{/);
  assert.match(madnessStyles, /\.mm-mod-picture img\s*\{/);
  assert.match(madnessStyles, /@media \(max-width:\s*600px\)/);
});
