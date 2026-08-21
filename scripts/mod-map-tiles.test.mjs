import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

import mapTiles from '../map/js/map-tiles.js';

const WORLD = Object.freeze({
  posLeft: -278528,
  posTop: 303104,
  posRight: 245760,
  posBottom: -221184,
});

test('map bounds expand to current location geometry but never shrink inside the native map', () => {
  assert.deepEqual(mapTiles.extendedWorldBounds(WORLD, []), {
    left: WORLD.posLeft,
    top: WORLD.posTop,
    right: WORLD.posRight,
    bottom: WORLD.posBottom,
  });

  const locations = [{
    x: WORLD.posRight + 8192,
    y: 0,
    entrances: [{ x: 0, y: WORLD.posBottom - 16384 }],
    variants: [{
      x: WORLD.posLeft - 4096,
      y: 0,
      entrances: [{ x: 0, y: WORLD.posTop + 32768 }],
    }],
  }];
  assert.deepEqual(mapTiles.extendedWorldBounds(WORLD, locations), {
    left: WORLD.posLeft - 4096,
    top: WORLD.posTop + 32768,
    right: WORLD.posRight + 8192,
    bottom: WORLD.posBottom - 16384,
  });

  assert.deepEqual(mapTiles.extendedWorldBounds(WORLD, locations.slice(1)), {
    left: WORLD.posLeft,
    top: WORLD.posTop,
    right: WORLD.posRight,
    bottom: WORLD.posBottom,
  });
});

test('tiles outside the native square reuse an existing blank blue-sea JPG', async () => {
  for (let zoom = 0; zoom <= 7; zoom += 1) {
    const width = 2 ** zoom;
    assert.equal(mapTiles.isNativeTile({ x: 0, y: 0, z: zoom }), true);
    assert.equal(mapTiles.isNativeTile({ x: width - 1, y: width - 1, z: zoom }), true);
    assert.equal(mapTiles.isNativeTile({ x: -1, y: 0, z: zoom }), false);
    assert.equal(mapTiles.isNativeTile({ x: width, y: 0, z: zoom }), false);
    await access(new URL(`../map/${mapTiles.blankSeaTileUrl(zoom)}`, import.meta.url));
  }

  assert.equal(mapTiles.blankSeaTileUrl(0), 'tiles/zoom2/morrowind-0-2.jpg');
  assert.equal(mapTiles.blankSeaTileUrl(1), 'tiles/zoom2/morrowind-0-2.jpg');
  assert.equal(mapTiles.blankSeaTileUrl(2), 'tiles/zoom2/morrowind-0-2.jpg');
  assert.equal(mapTiles.blankSeaTileUrl(3), 'tiles/zoom3/morrowind-0-0.jpg');
});

test('TES3 Mod Map mirrors every native UESP zoom level', async () => {
  const [worldData, mapSource, mirrorSource] = await Promise.all([
    readFile(new URL('../map/data/uesp-worlds-raw.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../map/js/map.js', import.meta.url), 'utf8'),
    readFile(new URL('../map/tools/mirror_tiles.sh', import.meta.url), 'utf8'),
  ]);
  const world = worldData.worlds[0];
  const maxNativeZoom = world.maxZoom - world.zoomOffset;

  assert.equal(maxNativeZoom, 7);
  assert.match(mapSource, new RegExp(`const MAX_ZOOM = ${maxNativeZoom};`));
  assert.match(mapSource, /const MIN_ZOOM = 0;/);
  assert.match(mirrorSource, new RegExp(`for z in ${
    Array.from({ length: maxNativeZoom + 1 }, (_, zoom) => zoom).join(' ')
  }; do`));

  for (let zoom = 0; zoom <= maxNativeZoom; zoom += 1) {
    const files = await readdir(new URL(`../map/tiles/zoom${zoom}/`, import.meta.url));
    const expectedWidth = 2 ** zoom;
    assert.equal(files.length, expectedWidth ** 2, `zoom ${zoom} should contain a complete tile square`);
    assert.ok(files.includes('morrowind-0-0.jpg'));
    assert.ok(files.includes(`morrowind-${expectedWidth - 1}-${expectedWidth - 1}.jpg`));
  }
});
