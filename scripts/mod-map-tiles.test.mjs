import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

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
