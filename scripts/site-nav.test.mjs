import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const sharedNav = await readFile(new URL('nav.js', root), 'utf8');
const rootIndex = await readFile(new URL('index.html', root), 'utf8');
const modathonIndex = await readFile(new URL('modathon/index.html', root), 'utf8');
const modathonHistoryIndex = await readFile(new URL('modathon/history/index.html', root), 'utf8');
const modathonHistoryScript = await readFile(new URL('modathon/history/history.js', root), 'utf8');
const wikiDarkmodeScript = await readFile(
  new URL('wiki/quartz/components/scripts/darkmode.inline.ts', root),
  'utf8',
);

test('the shared site switcher links every site section', () => {
  const expectedSites = [
    ['/', 'Home'],
    ['/modjam/', 'Modjam'],
    ['/modathon/', 'Modathon'],
    ['/madness/', 'Madness'],
    ['/map/', 'TES3 Mod Map'],
    ['/wiki/', 'Mod Wiki'],
    ['/resources/', 'Resources'],
  ];

  for (const [href, label] of expectedSites) {
    assert.match(sharedNav, new RegExp(`href: '${href.replaceAll('/', '\\/')}', label: '${label}'`));
  }

  assert.match(sharedNav, /<details>/);
  assert.match(sharedNav, /aria-current="page"/);
  assert.match(sharedNav, /event\.key !== 'Escape'/);
  assert.match(sharedNav, /event\.composedPath/);
  assert.match(
    sharedNav,
    /:host\(\[current="wiki"\]\)[\s\S]{0,500}--switcher-font: "EB Garamond", Georgia, serif/,
  );
  assert.doesNotMatch(
    sharedNav,
    /:host\(\[current="wiki"\]\)[\s\S]{0,500}--switcher-font: Cinzel/,
  );
});

test('every published site section loads and mounts the switcher', async () => {
  const directPages = [
    ['index.html', './nav.js', 'main'],
    ['modjam/index.html', '../nav.js', 'modjam'],
    ['modathon/index.html', '../nav.js', 'modathon'],
    ['modathon/history/index.html', '../nav.js', 'modathon'],
    ['map/index.html', '../nav.js', 'map'],
    ['resources/index.html', '../nav.js', 'resources'],
  ];

  for (const [path, scriptPath, current] of directPages) {
    const html = await readFile(new URL(path, root), 'utf8');
    assert.match(html, new RegExp(`<script src="${scriptPath.replaceAll('.', '\\.') }" defer><\\/script>`));
    assert.match(html, new RegExp(`<mms-site-switcher current="${current}"`));
  }

  const madnessPages = [
    'madness/index.html',
    'madness/mods.html',
    'madness/modders.html',
    'madness/modder.html',
    'madness/teams.html',
    'madness/rules.html',
    'madness/register.html',
  ];

  for (const path of madnessPages) {
    const html = await readFile(new URL(path, root), 'utf8');
    assert.match(html, /<script src="\.\.\/nav\.js" defer><\/script>/);
    assert.match(html, /<madness-nav/);
  }

  const madnessNav = await readFile(new URL('madness/nav.js', root), 'utf8');
  assert.match(madnessNav, /<mms-site-switcher current="madness"><\/mms-site-switcher>/);
});

test('Modjam no longer duplicates cross-site links in its footer', async () => {
  const html = await readFile(new URL('modjam/index.html', root), 'utf8');
  const footer = html.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)?.[0] || '';
  assert.doesNotMatch(footer, /href="\/(?:modathon|madness)\//);
  assert.doesNotMatch(footer, /aria-label="Elsewhere"/);
});

test('wiki and Modathon synchronize their light and dark theme preferences', () => {
  assert.match(wikiDarkmodeScript, /localStorage\.setItem\("mmr-theme", theme === "dark" \? "night" : "day"\)/);
  assert.match(modathonIndex, /localStorage\.setItem\('theme', theme === 'night' \? 'dark' : 'light'\)/);
  assert.match(modathonHistoryIndex, /localStorage\.getItem\('theme'\)/);
  assert.match(modathonHistoryIndex, /localStorage\.setItem\('theme', theme === 'night' \? 'dark' : 'light'\)/);
  assert.match(modathonHistoryScript, /localStorage\.setItem\('theme', night \? 'dark' : 'light'\)/);
});

test('the landing page uses the working favicon and correct channel launch year', async () => {
  assert.match(rootIndex, /<link rel="icon" href="\/assets\/images\/icon\.png">/);
  assert.match(rootIndex, /<header[\s\S]*?<img src="assets\/images\/mms\.webp" alt=""/);
  assert.match(rootIndex, /href="https:\/\/darkelfmodding\.com\/wiki\/"[\s\S]*?<img src="assets\/images\/wiki-banner\.webp" alt="Morrowind Mod Wiki banner art"/);
  assert.match(rootIndex, /href="https:\/\/darkelfmodding\.com\/map\/" target="_blank" rel="noopener noreferrer"/);
  assert.match(rootIndex, /showcased since 2014/);
  assert.doesNotMatch(rootIndex, /showcased since 2015/);

  const [favicon, wikiBanner] = await Promise.all([
    readFile(new URL('assets/images/icon.png', root)),
    readFile(new URL('assets/images/wiki-banner.webp', root)),
  ]);
  assert.ok(favicon.length > 0);
  assert.ok(wikiBanner.length > 0);
});
