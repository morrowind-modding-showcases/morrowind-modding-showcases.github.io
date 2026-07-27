import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('showcase links use canonical Nexus mod names and YouTube watch URLs', async () => {
  const snapshot = JSON.parse(
    await readFile('modathon/assets/data/modathon-mods.json', 'utf8'),
  );
  const showcases = Object.values(snapshot.mods)
    .flat()
    .filter(mod => mod.showcaseUrl);

  assert.ok(Array.isArray(showcases));
  assert.ok(showcases.length > 0, 'showcase data is empty');

  for (const { name: modName, showcaseUrl } of showcases) {
    assert.equal(typeof showcaseUrl, 'string', `${modName} has a non-string showcase URL`);

    const url = new URL(showcaseUrl);
    assert.equal(url.protocol, 'https:', `${modName} does not use HTTPS`);
    assert.equal(url.hostname, 'www.youtube.com', `${modName} does not link to YouTube`);
    assert.equal(url.pathname, '/watch', `${modName} does not use a YouTube watch URL`);
    assert.match(url.searchParams.get('v') || '', /^[\w-]{11}$/, `${modName} has an invalid video ID`);
  }
});
