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
    exterior_edits: [],
    component_locations: [{
      id: 'translation',
      name: 'Translation',
      type: 'translation',
      locations: [],
      exterior_edits: [{ x: 12, y: 11, landscape: false, references: 8 }],
      effective_locations: [],
      effective_exterior_edits: [{ x: 12, y: 11, landscape: false, references: 8 }],
    }],
  }]]);
  assert.deepEqual(mapLinks.allModExteriorCells(mapped.get('48257')), [[12, 11]]);
  assert.equal(
    mapLinks.mapUrlFor('https://www.nexusmods.com/morrowind/mods/48257', mapped),
    '/map/?mod=48257&cell=12%2C11',
  );
});

test('map locations group beneath their published parent settlement', () => {
  const balmora = { loc: { name: 'Balmora' } };
  const temple = { loc: { cell: 'Balmora, Temple', name: 'Temple' } };
  const guild = { loc: { cell: 'Balmora, Guild of Mages', name: 'Guild of Mages' } };
  const cave = { loc: { cell: 'Addamasartus', name: 'Addamasartus' } };

  assert.deepEqual(
    mapLinks.groupPrefixedLocations([temple, cave, balmora, guild]),
    [{ parent: balmora, locations: [balmora, temple, guild] }],
  );
  assert.deepEqual(
    mapLinks.groupPrefixedLocations([
      { name: 'Vivec, Hlaalu' },
      { name: 'Vivec, Hlaalu, Plaza' },
    ]),
    [{
      parent: { name: 'Vivec, Hlaalu' },
      locations: [
        { name: 'Vivec, Hlaalu' },
        { name: 'Vivec, Hlaalu, Plaza' },
      ],
    }],
  );
});

test("Ald-ruhn interior cells group beneath the Ald'ruhn settlement marker", () => {
  const settlement = { loc: { name: "Ald'ruhn" } };
  const temple = { loc: { cell: 'Ald-ruhn, Temple', name: 'Ald-ruhn, Temple' } };
  const guild = { loc: { cell: 'Ald-ruhn, Guild of Mages', name: 'Ald-ruhn, Guild of Mages' } };

  assert.deepEqual(
    mapLinks.groupPrefixedLocations([temple, settlement, guild]),
    [{ parent: settlement, locations: [settlement, temple, guild] }],
  );
  assert.equal(temple.loc.cell, 'Ald-ruhn, Temple');
});

test('mod-added settlements without a published marker synthesize a clustering container', () => {
  const sulBareth = { loc: { cell: "Bo-muul, Sul-Bareth's Shack", name: "Bo-muul, Sul-Bareth's Shack", x: -57929, y: -19531 } };
  const ghak = { loc: { cell: "Bo-muul, Ghak gro-Dulfish's Shack", name: "Bo-muul, Ghak gro-Dulfish's Shack", x: -58010, y: -19640 } };
  const baashi = { loc: { cell: "Bo-muul, Baashi's Shack", name: "Bo-muul, Baashi's Shack", x: -58100, y: -19700 } };

  assert.deepEqual(
    mapLinks.groupPrefixedLocations([sulBareth, ghak, baashi]),
    [{ parent: null, name: 'Bo-muul', locations: [sulBareth, ghak, baashi] }],
  );
});

test('vanilla cells aliased to their settlement name cluster with mod-added siblings', () => {
  const onyxHall = { loc: { cell: 'Tower of Tel Fyr, Onyx Hall', name: 'Tower of Tel Fyr, Onyx Hall', x: 124388, y: 15688 } };
  const arvas = { loc: { cell: 'Tel Fyr, Arvas House', name: 'Tel Fyr, Arvas House', x: 124500, y: 15750 } };

  assert.deepEqual(
    mapLinks.groupPrefixedLocations([onyxHall, arvas]),
    [{ parent: null, name: 'Tel Fyr', locations: [onyxHall, arvas] }],
  );
});

test('synthetic clusters prefer the deepest shared nearby prefix and skip scattered names', () => {
  const deck = { loc: { cell: 'Strange Shipwreck, Upper Level', name: 'Strange Shipwreck, Upper Level', x: 157299, y: 51229 } };
  const cabin = { loc: { cell: 'Strange Shipwreck, Cabin', name: 'Strange Shipwreck, Cabin', x: 157400, y: 51300 } };
  assert.deepEqual(
    mapLinks.groupPrefixedLocations([deck, cabin]),
    [{ parent: null, name: 'Strange Shipwreck', locations: [deck, cabin] }],
  );

  // Island-wide naming patterns sit too far apart to be one place.
  const barrow = { loc: { cell: 'Solstheim, Gyldenhul Barrow', name: 'Solstheim, Gyldenhul Barrow', x: 0, y: 0 } };
  const frossel = { loc: { cell: 'Solstheim, Frossel', name: 'Solstheim, Frossel', x: 99000, y: 0 } };
  assert.deepEqual(mapLinks.groupPrefixedLocations([barrow, frossel]), []);

  // Multi-segment prefixes keep their full name for the container marker.
  const caverns = { loc: { cell: 'Solstheim, Castle Karstaag, Caverns of Karstaag', name: 'Solstheim, Castle Karstaag, Caverns of Karstaag', x: 1000, y: 1000 } };
  const karstaag = { loc: { cell: 'Solstheim, Castle Karstaag, Dining Hall', name: 'Solstheim, Castle Karstaag, Dining Hall', x: 1100, y: 1100 } };
  assert.deepEqual(
    mapLinks.groupPrefixedLocations([caverns, karstaag]),
    [{
      parent: null,
      name: 'Solstheim, Castle Karstaag',
      locations: [caverns, karstaag],
    }],
  );

  // A lone orphan never gets a container of its own.
  const vas = { loc: { cell: 'Vas, Interior', name: 'Vas, Interior', x: 1000, y: 2000 } };
  assert.deepEqual(mapLinks.groupPrefixedLocations([vas]), []);
});

test('published parents win over synthesized containers for the same prefix', () => {
  const tower = { loc: { cell: 'Ald Redaynia, Tower', name: 'Ald Redaynia, Tower', x: -30635, y: 179348 } };
  const shack = { loc: { cell: "Ald Redaynia, Addaran's Shack", name: "Ald Redaynia, Addaran's Shack", x: -30700, y: 179420 } };
  const published = { loc: { name: 'Ald Redaynia' } };

  assert.deepEqual(
    mapLinks.groupPrefixedLocations([tower, shack, published]),
    [{ parent: published, locations: [published, tower, shack] }],
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

test('landscape heat is capped at 100 mods while reference heat is capped at 10000 edits', () => {
  assert.equal(mapLinks.landscapeHeatPosition(1), 0);
  assert.equal(mapLinks.landscapeHeatPosition(10), 0.5);
  assert.equal(mapLinks.landscapeHeatPosition(100), 1);
  assert.equal(mapLinks.landscapeHeatPosition(101), 1);
  assert.equal(mapLinks.landscapeHeatPosition(Number.POSITIVE_INFINITY), 1);
  assert.ok(
    mapLinks.landscapeHeatPosition(2) - mapLinks.landscapeHeatPosition(1) >
    mapLinks.landscapeHeatPosition(100) - mapLinks.landscapeHeatPosition(99),
  );
  assert.equal(mapLinks.landscapeHeatColor(1), '#39d8ae');
  assert.equal(mapLinks.landscapeHeatColor(10), '#f2cf3a');
  assert.equal(mapLinks.landscapeHeatColor(100), '#ff3d57');
  assert.equal(mapLinks.referenceHeatColor(100), '#f2cf3a');
  assert.equal(mapLinks.referenceHeatColor(10000), '#ff3d57');
  assert.equal(mapLinks.referenceHeatColor(100000), '#ff3d57');
  assert.ok(mapLinks.referenceHeatPosition(1) < mapLinks.referenceHeatPosition(50));
});

test('the map exposes mutually exclusive logarithmic exterior heat, clicking, and cell search', async () => {
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
  assert.match(script, /combinedExteriorHeatColor\([\s\S]*?visibleLandscapeMods\(rect\.entry\)\.length[\s\S]*?visibleReferenceCount\(rect\.entry\)/u);
  assert.match(script, /globalCompositeOperation = "destination-in"/u);
  assert.doesNotMatch(script, /const conflicts =|const conflictColor =|const hatch =/u);
  assert.match(script, /openExteriorPopup/u);
  assert.match(script, /type: "cell"/u);
  assert.match(script, /exteriorOverlay\.refreshSelection\(\)/u);
  assert.match(script, /setExteriorFilters/u);
  assert.match(script, /if \(nextLandscape && nextReferences\)/u);
  assert.match(script, /preferred === "references"\) nextLandscape = false/u);
  assert.match(script, /refreshExteriorFilters\("landscape"\)/u);
  assert.match(script, /refreshExteriorFilters\("references"\)/u);
  assert.match(script, /component_locations/u);
  assert.match(script, /component\.exterior_edits/u);
  assert.match(script, /mergePrefixedLocations\(\s*component\.locations/u);
  assert.doesNotMatch(script, /component\.effective_locations/u);
  assert.match(script, /visibleExteriorCoverages\(entry\)/u);
  assert.match(script, /if \(!activeMod\) return coverage\.component === null/u);
  assert.match(script, /visibleLocationCoverages\(entry\)/u);
  assert.match(script, /if \(visibleLocationCoverages\(entry\)\.length === 0\) return false/u);
  assert.match(script, /locationReplacementMatchesActiveFilter\(entry\)/u);
  assert.match(script, /locationSourceMatchesActiveFilter\(markerRecord\.source\)/u);
  assert.match(script, /const coverages = visibleLocationCoverages\(entry\)/u);
  assert.match(script, /const locs = selectedLocationEntries\(\)/u);
  assert.match(script, /refreshActiveLocationStyles\(\)/u);
  assert.match(script, /popup-component/u);
  assert.match(script, /groupCoveragesByMod\(coverages\)/u);
  assert.match(script, /const LOCATION_SPLIT_ZOOM = 4/u);
  assert.match(script, /groupPrefixedLocations\(entries\)/u);
  assert.match(script, /group\.locations\.flatMap\(\(entry\) => entry\.coverages\)/u);
  assert.match(script, /zoom < LOCATION_SPLIT_ZOOM/u);
  assert.match(script, /group && zoom >= LOCATION_SPLIT_ZOOM\) return true/u);
  assert.match(script, /const baseLocations = uniqueLocations\(mod\.locations\)/u);
  assert.match(script, /data-main-landscape/u);
  assert.match(script, /data-component-landscape/u);
  assert.match(script, /activeComponentLandscapeKeys = new Set\(\)/u);
  assert.match(script, /activeMainLandscapeVisible = false/u);
  assert.match(
    script,
    /function clearActiveVariantLandscapes[\s\S]*?component\.type === "variant"[\s\S]*?activeComponentLandscapeKeys\.delete\(key\)/u,
  );
  assert.match(
    script,
    /if \(component\.type === "variant"\) \{\s*clearActiveVariantLandscapes\(mod, key\);\s*activeMainLandscapeVisible = false;/u,
  );
  assert.match(script, /if \(input\.checked\) clearActiveVariantLandscapes\(mod\)/u);
  assert.match(script, /syncLandscapeLayerInputs\(\)/u);
  assert.match(script, /requestedParams\.get\("component"\)/u);
  assert.match(script, /if \(!landscapeFilterEnabled && !referenceFilterEnabled\) return null/u);
  assert.match(style, /\.exterior-cell-overlay/u);
  assert.match(style, /\.heat-ramp/u);
  assert.match(style, /linear-gradient\([\s\S]*?#39d8ae[\s\S]*?#ff3d57/u);
  assert.doesNotMatch(style, /repeating-linear-gradient/u);
  assert.match(html, /id="landscape-filter-toggle"[^>]*type="checkbox"(?![^>]*checked)/u);
  assert.match(html, /id="reference-filter-toggle"[^>]*type="checkbox"(?![^>]*checked)/u);
  assert.match(html, /id="landscape-layers"[^>]*hidden/u);
  assert.match(html, /Component layers/u);
  assert.match(html, /Exterior edits/u);
  assert.match(html, /log scale/u);
  assert.match(html, /100\+/u);
  assert.match(html, /10k\+/u);
  assert.doesNotMatch(html, /Multiple mods/u);
});

test('component exterior-cell links isolate that component on the map', async () => {
  const source = await readFile('wiki/quartz/components/ModDetails.tsx', 'utf8');
  assert.match(
    source,
    /component\.mapExteriorEdits[\s\S]*?&component=\$\{encodeURIComponent\(component\.id\)\}&cell=/u,
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
          mapLinks.allModExteriorCells(mapped).some(
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
