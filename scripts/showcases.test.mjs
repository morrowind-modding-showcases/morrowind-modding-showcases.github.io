import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('showcase links use canonical Nexus mod names and YouTube watch URLs', async () => {
  const [snapshot, showcaseData] = await Promise.all([
    readFile('modathon/assets/data/nexus-stats.json', 'utf8').then(JSON.parse),
    readFile('modathon/assets/data/showcases.json', 'utf8').then(JSON.parse),
  ]);

  const nexusNames = new Set(
    Object.values(snapshot.mods).flatMap(mods => mods.map(mod => mod.name)),
  );
  const showcases = showcaseData.showcases;

  assert.ok(showcases && !Array.isArray(showcases) && typeof showcases === 'object');
  assert.ok(Object.keys(showcases).length > 0, 'showcase data is empty');

  for (const [modName, showcaseUrl] of Object.entries(showcases)) {
    assert.ok(nexusNames.has(modName), `${modName} does not exactly match a Nexus mod name`);
    assert.equal(typeof showcaseUrl, 'string', `${modName} has a non-string showcase URL`);

    const url = new URL(showcaseUrl);
    assert.equal(url.protocol, 'https:', `${modName} does not use HTTPS`);
    assert.equal(url.hostname, 'www.youtube.com', `${modName} does not link to YouTube`);
    assert.equal(url.pathname, '/watch', `${modName} does not use a YouTube watch URL`);
    assert.match(url.searchParams.get('v') || '', /^[\w-]{11}$/, `${modName} has an invalid video ID`);
  }
});
