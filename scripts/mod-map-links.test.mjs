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

test('component-specific locations participate in parent mod deep links', () => {
  const mapped = new Map([['48257', {
    locations: [],
    component_locations: [{
      id: 'tr',
      name: 'TR version',
      type: 'variant',
      locations: ['Old Ebonheart'],
    }],
    exterior_cells: [],
  }]]);
  assert.deepEqual(mapLinks.allModLocations(mapped.get('48257')), ['Old Ebonheart']);
  assert.equal(
    mapLinks.mapUrlFor('https://www.nexusmods.com/morrowind/mods/48257', mapped),
    '/map/?mod=48257&location=Old%20Ebonheart',
  );
});

test('component-specific exterior cells participate in parent mod deep links', () => {
  const mapped = new Map([['48257', {
    locations: [],
    exterior_cells: [],
    component_locations: [{
      id: 'translation',
      name: 'Translation',
      type: 'translation',
      locations: [],
      exterior_cells: [[12, 11]],
      effective_locations: [],
      effective_exterior_cells: [[12, 11]],
    }],
  }]]);
  assert.deepEqual(mapLinks.allModExteriorCells(mapped.get('48257')), [[12, 11]]);
  assert.equal(
    mapLinks.mapUrlFor('https://www.nexusmods.com/morrowind/mods/48257', mapped),
    '/map/?mod=48257&cell=12%2C11',
  );
});

test('cell coverage groups components beneath one parent mod', () => {
  const firstMod = { id: 'first', name: 'First mod' };
  const secondMod = { id: 'second', name: 'Second mod' };
  const patch = { id: 'patch', name: 'Patch', type: 'patch' };
  const optional = { id: 'optional', name: 'Optional trees', type: 'optional' };
  assert.deepEqual(mapLinks.groupCoveragesByMod([
    { mod: firstMod, component: null },
    { mod: firstMod, component: patch },
    { mod: firstMod, component: optional },
    { mod: firstMod, component: patch },
    { mod: secondMod, component: null },
  ]), [
    { mod: firstMod, includesMain: true, components: [patch, optional] },
    { mod: secondMod, includesMain: true, components: [] },
  ]);
});

test('exterior cell heat colors use a logarithmic 1-to-100 scale capped at red', () => {
  assert.equal(mapLinks.exteriorHeatPosition(1), 0);
  assert.equal(mapLinks.exteriorHeatPosition(10), 0.5);
  assert.equal(mapLinks.exteriorHeatPosition(100), 1);
  assert.equal(mapLinks.exteriorHeatPosition(101), 1);
  assert.equal(mapLinks.exteriorHeatPosition(Number.POSITIVE_INFINITY), 1);
  assert.ok(
    mapLinks.exteriorHeatPosition(2) - mapLinks.exteriorHeatPosition(1) >
    mapLinks.exteriorHeatPosition(100) - mapLinks.exteriorHeatPosition(99),
  );
  assert.equal(mapLinks.exteriorHeatColor(1), '#39d8ae');
  assert.equal(mapLinks.exteriorHeatColor(10), '#f2cf3a');
  assert.equal(mapLinks.exteriorHeatColor(100), '#ff3d57');
  assert.equal(mapLinks.exteriorHeatColor(1000), '#ff3d57');
  assert.equal(new Set([1, 2, 3, 10, 30, 100].map(mapLinks.exteriorHeatColor)).size, 6);
});

test('the map exposes blended logarithmic exterior heat, clicking, and cell search', async () => {
  const [script, style, html] = await Promise.all([
    readFile('map/js/map.js', 'utf8'),
    readFile('map/css/map.css', 'utf8'),
    readFile('map/index.html', 'utf8'),
  ]);
  assert.match(script, /class ExteriorCellOverlay|const ExteriorCellOverlay/u);
  assert.match(script, /filter = `blur/u);
  assert.doesNotMatch(script, /fillEnclosedCoverageHoles|coverage-hole:/u);
  assert.match(script, /getImageData/u);
  assert.match(script, /const surface = \(surfaceWidth, surfaceHeight\)/u);
  assert.match(script, /getImageData\(0, 0, maskWidth, maskHeight\)/u);
  assert.match(script, /mapForLayer\.on\("moveend zoomend"/u);
  assert.doesNotMatch(script, /mapForLayer\.on\("move zoom resize viewreset"/u);
  assert.match(script, /Smooth one seamless union/u);
  assert.match(script, /const mask = hardenMask\(soft\.canvas\)/u);
  assert.match(script, /const baseMask = maskFor\(actualRects\)/u);
  assert.match(script, /outline\.context\.globalCompositeOperation = "destination-out"/u);
  assert.match(script, /paintHeatMap/u);
  assert.match(script, /const heat = hardenMask\(smoothHeat\.canvas\)/u);
  assert.match(script, /blur\(\$\{mask\.smoothing\}px\)/u);
  assert.match(script, /complete curve instead of leaving clear/u);
  assert.match(script, /drawHeatOutline/u);
  assert.match(script, /exteriorHeatColor\([\s\S]*?visibleExteriorMods\(rect\.entry\)\.length/u);
  assert.match(script, /globalCompositeOperation = "destination-in"/u);
  assert.doesNotMatch(script, /const conflicts =|const conflictColor =|const hatch =/u);
  assert.match(script, /openExteriorPopup/u);
  assert.match(script, /type: "cell"/u);
  assert.match(script, /exteriorOverlay\.refreshSelection\(\)/u);
  assert.match(script, /setExteriorOverlayVisible/u);
  assert.match(script, /component_locations/u);
  assert.match(script, /component\.exterior_cells/u);
  assert.match(script, /mergePrefixedLocations\(\s*component\.locations/u);
  assert.doesNotMatch(script, /component\.effective_locations/u);
  assert.match(script, /visibleExteriorCoverages\(entry\)/u);
  assert.match(script, /if \(!activeMod\) return coverage\.component === null/u);
  assert.match(script, /visibleLocationCoverages\(entry\)/u);
  assert.match(script, /if \(activeMod\) return visibleLocationCoverages\(entry\)\.length > 0/u);
  assert.match(script, /const coverages = visibleLocationCoverages\(entry\)/u);
  assert.match(script, /const locs = selectedLocationEntries\(\)/u);
  assert.match(script, /refreshActiveLocationStyles\(\)/u);
  assert.match(script, /popup-component/u);
  assert.match(script, /groupCoveragesByMod\(coverages\)/u);
  assert.match(script, /data-main-landscape/u);
  assert.match(script, /data-component-landscape/u);
  assert.match(script, /activeComponentLandscapeKeys = new Set\(\)/u);
  assert.match(script, /activeMainLandscapeVisible = false/u);
  assert.match(script, /requestedParams\.get\("component"\)/u);
  assert.match(script, /if \(!exteriorOverlayVisible\) return null/u);
  assert.match(style, /\.exterior-cell-overlay/u);
  assert.match(style, /\.heat-ramp/u);
  assert.match(style, /linear-gradient\([\s\S]*?#39d8ae[\s\S]*?#ff3d57/u);
  assert.doesNotMatch(style, /repeating-linear-gradient/u);
  assert.match(html, /id="exterior-overlay-toggle"[^>]*checked/u);
  assert.match(html, /id="landscape-layers"[^>]*hidden/u);
  assert.match(html, /Component layers/u);
  assert.match(html, /Exterior edits/u);
  assert.match(html, /log scale/u);
  assert.match(html, /100\+/u);
  assert.doesNotMatch(html, /Multiple mods/u);
});

test('component exterior-cell links isolate that component on the map', async () => {
  const source = await readFile('wiki/quartz/components/ModDetails.tsx', 'utf8');
  assert.match(
    source,
    /component\.mapExteriorCells[\s\S]*?&component=\$\{encodeURIComponent\(component\.id\)\}&cell=/u,
  );
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
        assert.ok(mapLinks.allModLocations(mapped).includes(location), `${title} links to an unrelated location`);
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
