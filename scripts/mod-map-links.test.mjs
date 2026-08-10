import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import mapLinks from '../assets/mod-map-links.js';
import {
  generateLocationMapData,
  generateMapData,
  loadWikiLocations,
  loadWikiMods,
} from './wiki-content-lib.mjs';

test('comma-prefixed sublocations merge into an explicitly listed parent location', () => {
  assert.deepEqual(
    mapLinks.mergePrefixedLocations([
      "Kogoruhn, Charma's Breath",
      'Kogoruhn',
      "Kogoruhn, Dome of Pollock's Eve",
      'Kogoruhn Temple of Fey',
    ]),
    ['Kogoruhn', 'Kogoruhn Temple of Fey'],
  );
  assert.deepEqual(
    mapLinks.mergePrefixedLocations(['Vivec, Hlaalu', 'Vivec, Redoran', 'Vivec, St. Delyn']),
    ['Vivec, Hlaalu', 'Vivec, Redoran', 'Vivec, St. Delyn'],
  );
  assert.deepEqual(
    mapLinks.mergePrefixedLocations(['Vivec, Hlaalu, Plaza', 'Vivec, Hlaalu']),
    ['Vivec, Hlaalu'],
  );
});

test('Nexus mod URLs produce stable TES3 Mod Map deep links', () => {
  const ids = new Set(['48257']);

  assert.equal(
    mapLinks.mapUrlFor('https://www.nexusmods.com/morrowind/mods/48257', ids),
    '/map/?mod=48257',
  );
  assert.equal(mapLinks.mapUrlFor('https://www.nexusmods.com/morrowind/mods/99999', ids), '');
  assert.equal(mapLinks.mapUrlFor('', ids), '');
  assert.equal(mapLinks.mapUrlFor('https://example.com/morrowind/mods/48257', ids), '');
});

test('exterior cell metadata is normalized and supports map deep links without wiki locations', () => {
  assert.deepEqual(
    mapLinks.normalizeExteriorCells([[12, 11], ' -3, 4 ', [12, 11], ['bad', 2]]),
    [[12, 11], [-3, 4]],
  );
  const mapped = new Map([['48257', {
    locations: [],
    exterior_cells: [[12, 11]],
  }]]);
  assert.equal(
    mapLinks.mapUrlFor('https://www.nexusmods.com/morrowind/mods/48257', mapped),
    '/map/?mod=48257&cell=12%2C11',
  );
});

test('the map exposes blended exterior coverage, conflict styling, clicking, and cell search', async () => {
  const [script, style, html] = await Promise.all([
    readFile('map/js/map.js', 'utf8'),
    readFile('map/css/map.css', 'utf8'),
    readFile('map/index.html', 'utf8'),
  ]);
  assert.match(script, /class ExteriorCellOverlay|const ExteriorCellOverlay/u);
  assert.match(script, /filter = `blur/u);
  assert.match(script, /fillEnclosedCoverageHoles/u);
  assert.match(script, /getImageData/u);
  assert.match(script, /const surface = \(surfaceWidth, surfaceHeight\)/u);
  assert.match(script, /getImageData\(0, 0, maskWidth, maskHeight\)/u);
  assert.match(script, /mapForLayer\.on\("moveend zoomend"/u);
  assert.doesNotMatch(script, /mapForLayer\.on\("move zoom resize viewreset"/u);
  assert.match(script, /coverage-hole:/u);
  assert.match(script, /drawMaskOutline/u);
  assert.match(script, /globalCompositeOperation = "destination-in"/u);
  assert.match(script, /entry\.mods\.length > 1/u);
  assert.match(script, /openExteriorPopup/u);
  assert.match(script, /type: "cell"/u);
  assert.match(script, /exteriorOverlay\.setActiveMod\(mod\)/u);
  assert.match(script, /setExteriorOverlayVisible/u);
  assert.match(script, /if \(!exteriorOverlayVisible\) return null/u);
  assert.match(style, /\.exterior-cell-overlay/u);
  assert.match(style, /repeating-linear-gradient/u);
  assert.match(html, /id="exterior-overlay-toggle"[^>]*checked/u);
  assert.match(html, /Exterior edit/u);
  assert.match(html, /Multiple mods/u);
});

test('wiki slugs resolve directly while existing Nexus ID links remain supported', () => {
  const mods = [{
    id: 'example-mod',
    wiki_slug: 'example-mod',
    url: 'https://www.nexusmods.com/morrowind/mods/48257',
  }];
  assert.equal(mapLinks.findMappedMod(mods, 'example-mod'), mods[0]);
  assert.equal(mapLinks.findMappedMod(mods, '48257'), mods[0]);
});

test('every generated event-site map link resolves to the same map mod', async () => {
  const [snapshot, madness, modjam, modMap, locationData] = await Promise.all([
    readFile('modathon/assets/data/modathon-mods.json', 'utf8').then(JSON.parse),
    readFile('madness/data/madness-mods.json', 'utf8').then(JSON.parse).then(data => data.years),
    readFile('modjam/data/modjam-mods.json', 'utf8').then(JSON.parse),
    loadWikiMods().then(generateMapData),
    loadWikiLocations().then(generateLocationMapData),
  ]);
  const mappedModsById = mapLinks.mappedModsById(modMap);
  const sites = [
    { name: 'Modathon', mods: Object.values(snapshot.mods).flat() },
    { name: 'Madness', mods: madness.flatMap(year => year.mods) },
    { name: 'Modjam', mods: modjam.events.flatMap(event => event.mods) },
  ];

  for (const site of sites) {
    const linked = site.mods
      .map(mod => ({ mod, url: mapLinks.mapUrlFor(mod.url, mappedModsById) }))
      .filter(entry => entry.url);
    for (const { mod, url } of linked) {
      const title = mod.name || mod.title;
      const params = new URL(url, 'https://darkelfmodding.com').searchParams;
      const id = params.get('mod');
      const mapped = mapLinks.findMappedMod(modMap.mods, id);
      assert.ok(mapped, `${title} links to a missing map mod`);
      assert.equal(mapLinks.nexusModId(mapped.url), mapLinks.nexusModId(mod.url));
      const location = params.get('location');
      if (location) {
        assert.ok(mapped.locations.includes(location), `${title} links to an unrelated location`);
        const normalizedLocation = location.trim().toLowerCase();
        assert.ok(
          locationData.locations.some(entry =>
            String(entry.cell || '').trim().toLowerCase() === normalizedLocation ||
            String(entry.name || '').trim().toLowerCase() === normalizedLocation),
          `${title} links to a location without a map marker`,
        );
      } else {
        const cell = mapLinks.normalizeExteriorCells([params.get('cell')])[0];
        assert.ok(cell, `${title} has no map focus`);
        assert.ok(
          mapLinks.normalizeExteriorCells(mapped.exterior_cells).some(
            candidate => candidate[0] === cell[0] && candidate[1] === cell[1],
          ),
          `${title} links to an unrelated exterior cell`,
        );
      }
    }
  }
});

test('Madness and Modjam render TES3 Mod Map links in archive and profile views', async () => {
  const [madnessMods, madnessTeams, madnessModder, madnessProfiles, modjamIndex, modjamApp] = await Promise.all([
    readFile('madness/mods.html', 'utf8'),
    readFile('madness/teams.html', 'utf8'),
    readFile('madness/modder.html', 'utf8'),
    readFile('madness/profile-data.js', 'utf8'),
    readFile('modjam/index.html', 'utf8'),
    readFile('modjam/app.js', 'utf8'),
  ]);

  for (const source of [madnessMods, madnessTeams, madnessModder, modjamIndex]) {
    assert.match(source, /assets\/mod-map-links\.js/);
  }
  for (const source of [madnessMods, madnessTeams, madnessModder, modjamApp]) {
    assert.match(source, /Tes3ModMapLinks\.mapUrlFor/);
  }
  assert.match(madnessProfiles, /mapUrl: detail \? detail\.mapUrl/);
  assert.match(madnessMods, /class="mm-map-link" href="\{\{ m\.mapUrl \}\}"/);
  assert.match(madnessTeams, /class="mm-map-link" href="\{\{ md\.mapUrl \}\}"/);
  assert.match(madnessModder, /class="mm-map-link" href="\{\{ mod\.mapUrl \}\}"/);
  assert.match(modjamApp, /class="entry-map-link"/);
  assert.match(modjamApp, /class="entry-card-title"><h3>' \+ title \+ '<\/h3>' \+ mapLink \+ showcaseLink/);
  assert.match(modjamApp, /var cardBadges = placementBadge\(entry\);/);
});
