import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('showcase links use valid YouTube URLs', async () => {
  const [modathon, modjam, madness] = await Promise.all([
    readFile('modathon/assets/data/modathon-mods.json', 'utf8').then(JSON.parse),
    readFile('modjam/data/modjam-mods.json', 'utf8').then(JSON.parse),
    readFile('madness/data/madness-mods.json', 'utf8').then(JSON.parse),
  ]);
  const showcases = [
    ...Object.values(modathon.mods).flat(),
    ...modjam.events.flatMap(event => event.mods),
    ...madness.years.flatMap(year => year.mods),
  ].filter(mod => mod.showcaseUrl);

  assert.ok(showcases.length > 0, 'showcase data is empty');

  for (const { name, title, showcaseUrl } of showcases) {
    const modName = name || title;
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

test('Modjam and Madness render showcase actions anywhere their mods are listed', async () => {
  const [modjamApp, modjamStyles, madnessMods, madnessTeams, madnessModder, madnessProfiles, madnessStyles] = await Promise.all([
    readFile('modjam/app.js', 'utf8'),
    readFile('modjam/style.css', 'utf8'),
    readFile('madness/mods.html', 'utf8'),
    readFile('madness/teams.html', 'utf8'),
    readFile('madness/modder.html', 'utf8'),
    readFile('madness/profile-data.js', 'utf8'),
    readFile('madness/style.css', 'utf8'),
  ]);

  assert.match(modjamApp, /safeUrl\(entry\.showcaseUrl\)/);
  assert.match(modjamApp, /class="entry-showcase-link"/);
  assert.match(modjamStyles, /\.entry-showcase-link/);
  assert.match(modjamStyles, /\.entry-youtube-icon/);

  for (const source of [madnessMods, madnessTeams, madnessModder]) {
    assert.match(source, /class="mm-showcase-link"/);
    assert.match(source, /class="mm-youtube-icon"/);
  }
  assert.match(madnessProfiles, /showcaseUrl:/);
  assert.match(madnessProfiles, /showcaseLabel:/);
  assert.match(madnessStyles, /\.mm-showcase-link/);
  assert.match(madnessStyles, /\.mm-youtube-icon/);
});
