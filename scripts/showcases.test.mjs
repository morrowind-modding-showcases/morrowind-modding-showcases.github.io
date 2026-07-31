import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertYouTubeShowcaseUrl } from './content-lib.mjs';

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

  const errors = [];
  for (const { name, title, showcaseUrl } of showcases) {
    const modName = name || title;
    try {
      assertYouTubeShowcaseUrl(showcaseUrl, modName);
    } catch (error) {
      errors.push(error.message);
    }
  }
  assert.deepEqual(errors, [], `Invalid showcase links:\n${errors.join('\n')}`);
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
