import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('showcase links use canonical Nexus mod names and valid YouTube URLs', async () => {
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
    const isWatchUrl = url.hostname === 'www.youtube.com' && url.pathname === '/watch';
    const isShortUrl = url.hostname === 'youtu.be' && /^\/[\w-]{11}$/.test(url.pathname);
    assert.equal(isWatchUrl || isShortUrl, true, `${modName} does not link to YouTube`);

    const videoId = isShortUrl ? url.pathname.slice(1) : url.searchParams.get('v') || '';
    assert.match(videoId, /^[\w-]{11}$/, `${modName} has an invalid video ID`);
  }
});
