import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const sharedNav = await readFile(new URL('nav.js', root), 'utf8');

test('the shared site switcher links every site section', () => {
  const expectedSites = [
    ['/', 'Home'],
    ['/modjam/', 'ModJam'],
    ['/modathon/', 'Modathon'],
    ['/madness/', 'Madness'],
    ['/map/', 'TES3 Mod Map'],
  ];

  for (const [href, label] of expectedSites) {
    assert.match(sharedNav, new RegExp(`href: '${href.replaceAll('/', '\\/')}', label: '${label}'`));
  }

  assert.match(sharedNav, /<details>/);
  assert.match(sharedNav, /aria-current="page"/);
  assert.match(sharedNav, /event\.key !== 'Escape'/);
  assert.match(sharedNav, /event\.composedPath/);
});

test('every published site section loads and mounts the switcher', async () => {
  const directPages = [
    ['index.html', './nav.js', 'main'],
    ['modjam/index.html', '../nav.js', 'modjam'],
    ['modathon/index.html', '../nav.js', 'modathon'],
    ['map/index.html', '../nav.js', 'map'],
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

test('ModJam no longer duplicates cross-site links in its footer', async () => {
  const html = await readFile(new URL('modjam/index.html', root), 'utf8');
  const footer = html.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)?.[0] || '';
  assert.doesNotMatch(footer, /href="\/(?:modathon|madness)\//);
  assert.doesNotMatch(footer, /aria-label="Elsewhere"/);
});
