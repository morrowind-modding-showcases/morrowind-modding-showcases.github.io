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

test('every generated Modathon map link resolves to the same map mod', async () => {
  const [snapshot, modMap, locationData] = await Promise.all([
    readFile('modathon/assets/data/nexus-stats.json', 'utf8').then(JSON.parse),
    readFile('map/data/mods.json', 'utf8').then(JSON.parse),
    readFile('map/data/locations.json', 'utf8').then(JSON.parse),
  ]);
  const mappedModsById = mapLinks.mappedModsById(modMap);
  const modathonMods = Object.values(snapshot.mods).flat();
  const linked = modathonMods
    .map(mod => ({ mod, url: mapLinks.mapUrlFor(mod.url, mappedModsById) }))
    .filter(entry => entry.url);

  assert.ok(linked.length > 0, 'no Modathon mods are linked to the TES3 Mod Map');
  for (const { mod, url } of linked) {
    const params = new URL(url, 'https://darkelfmodding.com').searchParams;
    const id = params.get('mod');
    const mapped = mapLinks.findMappedMod(modMap.mods, id);
    assert.ok(mapped, `${mod.name} links to a missing map mod`);
    assert.equal(mapLinks.nexusModId(mapped.url), mapLinks.nexusModId(mod.url));
    const location = params.get('location');
    assert.ok(mapped.locations.includes(location), `${mod.name} links to an unrelated location`);
    const normalizedLocation = location.trim().toLowerCase();
    assert.ok(
      locationData.locations.some(entry =>
        String(entry.cell || '').trim().toLowerCase() === normalizedLocation ||
        String(entry.name || '').trim().toLowerCase() === normalizedLocation),
      `${mod.name} links to a location without a map marker`,
    );
  }
});
