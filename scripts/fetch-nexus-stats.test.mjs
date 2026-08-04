import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  applyNexusMetadata,
  buildNexusIndex,
  nexusIdFor,
} from './fetch-nexus-stats.mjs';

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
  assert.match(deployWorkflow, /workflow_run:[\s\S]*?pages-build-deployment/);
  assert.match(deployWorkflow, /workflow_run\.conclusion == 'success'/);
  assert.doesNotMatch(workflow, /git add .*modjam\/data\/modjam-mods\.json/);
  assert.doesNotMatch(workflow, /git add .*madness\/data\/madness-mods\.json/);
  assert.doesNotMatch(workflow, /git add .*modathon\/assets\/data\/modathon-mods\.json/);
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
  }, new Map([['7', 'Quests and Adventures']]));

  assert.equal(modathon.category, 'Quests');
  assert.equal(modathon.nexusCategory, 'Quests and Adventures');
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
