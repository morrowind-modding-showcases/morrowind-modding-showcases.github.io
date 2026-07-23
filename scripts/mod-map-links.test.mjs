import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import mapLinks from '../assets/mod-map-links.js';

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

test('every generated event-site map link resolves to the same map mod', async () => {
  const [snapshot, madness, modjam, modMap, locationData] = await Promise.all([
    readFile('modathon/assets/data/nexus-stats.json', 'utf8').then(JSON.parse),
    readFile('madness/data/mods-by-year.json', 'utf8').then(JSON.parse),
    readFile('modjam/data/modjams.json', 'utf8').then(JSON.parse),
    readFile('map/data/mods.json', 'utf8').then(JSON.parse),
    readFile('map/data/locations.json', 'utf8').then(JSON.parse),
  ]);
  const mappedModsById = mapLinks.mappedModsById(modMap);
  const sites = [
    { name: 'Modathon', mods: Object.values(snapshot.mods).flat(), expectedLinks: 55 },
    { name: 'Madness', mods: madness.flatMap(year => year.mods), expectedLinks: 19 },
    { name: 'Modjam', mods: modjam.events.flatMap(event => event.entries), expectedLinks: 5 },
  ];

  for (const site of sites) {
    const linked = site.mods
      .map(mod => ({ mod, url: mapLinks.mapUrlFor(mod.url, mappedModsById) }))
      .filter(entry => entry.url);
    assert.equal(linked.length, site.expectedLinks, `${site.name} map-link coverage changed`);
    for (const { mod, url } of linked) {
      const title = mod.name || mod.title;
      const params = new URL(url, 'https://darkelfmodding.com').searchParams;
      const id = params.get('mod');
      const mapped = mapLinks.findMappedMod(modMap.mods, id);
      assert.ok(mapped, `${title} links to a missing map mod`);
      assert.equal(mapLinks.nexusModId(mapped.url), mapLinks.nexusModId(mod.url));
      const location = params.get('location');
      assert.ok(mapped.locations.includes(location), `${title} links to an unrelated location`);
      const normalizedLocation = location.trim().toLowerCase();
      assert.ok(
        locationData.locations.some(entry =>
          String(entry.cell || '').trim().toLowerCase() === normalizedLocation ||
          String(entry.name || '').trim().toLowerCase() === normalizedLocation),
        `${title} links to a location without a map marker`,
      );
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
});
