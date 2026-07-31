import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import matter from 'gray-matter';
import yaml from 'js-yaml';

import {
  generateLocationMapData,
  generateMapData,
  validateWikiLocations,
  validateWikiMods,
  validateWikiProject,
} from './wiki-content-lib.mjs';

const base = {
  title: 'Example Mod',
  description: 'A test mod.',
  authors: ['Example Author'],
  url: 'https://www.nexusmods.com/morrowind/mods/12345',
  categories: ['Dungeon'],
  tags: ['example'],
  events: ['Morrowind Modathon 2025'],
  map_enabled: true,
  map_locations: ['Balmora'],
  draft: false,
};

const wikiMod = (frontmatter, slug = 'example-mod') => ({
  filePath: `${slug}.md`,
  relativePath: `${slug}.md`,
  slug,
  frontmatter,
  body: 'Article body',
  parseError: null,
});

const vocabulary = { categories: ['Dungeon'], map_locations: ['Balmora', 'Caldera'] };

test('a valid published map mod is emitted with derived wiki and map URLs', () => {
  const mod = wikiMod(base);
  assert.deepEqual(validateWikiMods([mod], vocabulary), []);
  assert.deepEqual(generateMapData([mod]).mods, [{
    id: 'example-mod',
    wiki_slug: 'example-mod',
    name: 'Example Mod',
    title: 'Example Mod',
    authors: ['Example Author'],
    locations: ['Balmora'],
    categories: ['Dungeon'],
    tags: ['example'],
    events: ['Morrowind Modathon 2025'],
    wiki_url: '/wiki/mods/example-mod',
    map_url: '/map/?mod=example-mod',
    description: 'A test mod.',
    url: 'https://www.nexusmods.com/morrowind/mods/12345',
  }]);
});

test('wiki-only and draft mods are excluded from generated map data', () => {
  const wikiOnly = wikiMod({ ...base, map_enabled: false }, 'wiki-only-mod');
  const draft = wikiMod({ ...base, draft: true, map_locations: [] }, 'draft-mod');
  assert.deepEqual(validateWikiMods([wikiOnly, draft], vocabulary), []);
  assert.deepEqual(generateMapData([wikiOnly, draft]).mods, []);
});

test('unknown map locations produce a useful validation error', () => {
  const errors = validateWikiMods([
    wikiMod({ ...base, map_locations: ['Balmore'] }),
  ], vocabulary);
  assert.equal(errors.some(error => error.property === 'map_locations' && error.value === 'Balmore'), true);
  assert.equal(errors.some(error => error.expected?.includes('Balmora')), true);
});

test('unknown frontmatter is tolerated', () => {
  const errors = validateWikiMods([
    wikiMod({ ...base, some_future_property: 'test' }),
  ], vocabulary);
  assert.deepEqual(errors, []);
});

test('multiple map locations are preserved in generated data', () => {
  const data = generateMapData([
    wikiMod({ ...base, map_locations: ['Balmora', 'Caldera'] }),
  ]);
  assert.deepEqual(data.mods[0].locations, ['Balmora', 'Caldera']);
});

test('duplicate locations are rejected case-insensitively', () => {
  const errors = validateWikiMods([
    wikiMod({ ...base, map_locations: ['Balmora', 'balmora'] }),
  ], vocabulary);
  assert.equal(errors.some(error => error.message === 'Duplicate map location'), true);
});

test('the checked-in wiki, Pages CMS options, and map registry validate together', async () => {
  const result = await validateWikiProject();
  assert.equal(result.mods.length, 224);
  assert.equal(result.locations.length, 1206);
  assert.deepEqual(result.errors, []);
});

test('published location Markdown generates browser map geometry and a wiki URL', () => {
  const locations = [{
    relativePath: 'balmora.md',
    slug: 'balmora',
    parseError: null,
    frontmatter: {
      title: 'Balmora',
      map_id: 1226,
      region: 'West Gash',
      x: -23552,
      y: -16384,
      icon: 1,
      level: 10,
      uesp_wiki: 'Balmora',
      draft: false,
    },
  }];
  assert.deepEqual(validateWikiLocations(locations), []);
  assert.deepEqual(generateLocationMapData(locations).locations, [{
    id: 1226,
    name: 'Balmora',
    x: -23552,
    y: -16384,
    icon: 1,
    level: 10,
    wiki_url: '/wiki/locations/balmora',
    region: 'West Gash',
    wiki: 'Balmora',
  }]);
});

test('a Markdown editor round trip preserves lists, unknown frontmatter, and normal wiki syntax', () => {
  const body = '[[Internal Wiki Link]]\n\n**bold**\n\n*italic*\n\n# Heading\n\n- list\n';
  const source = `---\ntitle: Round Trip\nauthors:\n  - Author One\n  - Author Two\nsome_future_property: test\nmap_enabled: false\ndraft: false\n---${body}`;
  const parsed = matter(source, { engines: { yaml: value => yaml.load(value) } });
  const merged = { ...parsed.data, description: 'Changed through the form.' };
  const saved = `---\n${yaml.dump(merged, { lineWidth: -1, noRefs: true })}---${parsed.content}`;
  const reopened = matter(saved, { engines: { yaml: value => yaml.load(value) } });

  assert.deepEqual(reopened.data.authors, ['Author One', 'Author Two']);
  assert.equal(reopened.data.some_future_property, 'test');
  assert.equal(reopened.data.description, 'Changed through the form.');
  assert.equal(reopened.content, body);
});

test('wiki navigation, metadata cards, and map popups use the requested links and typography', async () => {
  const [home, siteNav, modDetails, customStyles, mapScript] = await Promise.all([
    readFile('wiki/content/index.md', 'utf8'),
    readFile('wiki/quartz/components/SiteNav.tsx', 'utf8'),
    readFile('wiki/quartz/components/ModDetails.tsx', 'utf8'),
    readFile('wiki/quartz/styles/custom.scss', 'utf8'),
    readFile('map/js/map.js', 'utf8'),
  ]);
  assert.match(home, /\[TES3 Mod Map\]\(https:\/\/darkelfmodding\.com\/map\/\)/);
  assert.doesNotMatch(home, /guides/i);
  assert.match(siteNav, /\/wiki\/locations\//);
  assert.match(siteNav, /https:\/\/darkelfmodding\.com\/map\//);
  assert.match(modDetails, />\s*Nexus\s*</);
  assert.match(modDetails, /mod-details-picture/);
  assert.match(modDetails, /modathon\/modder|modjam\/modder|madness\/modder/);
  assert.match(customStyles, /\.explorer[\s\S]*font-family: var\(--bodyFont\)/);
  assert.match(mapScript, /href="\$\{esc\(mod\.url\)\}"[^`]+\$\{esc\(mod\.name\)\}/);
  assert.match(mapScript, />wiki<\/a>/);
  assert.doesNotMatch(mapScript, />mod page/);
});

test('checked-in event metadata and the verified Nexus summary are present', async () => {
  const [eventMod, madnessMod, akulakhan] = await Promise.all([
    readFile('wiki/content/mods/akulakhans-best-chamber.md', 'utf8'),
    readFile('wiki/content/mods/andrano-ancestral-tomb-remastered.md', 'utf8'),
    readFile('wiki/content/mods/akulakhan-city.md', 'utf8'),
  ]);
  assert.match(eventMod, /Morrowind Modathon 2021/);
  assert.match(eventMod, /^picture_url:/m);
  assert.match(madnessMod, /- "Greatness7"[\s\S]*- "MatthewTheBagel"/);
  assert.match(akulakhan, /description: "Overhaul of Akulakhan's Chamber"/);
  assert.match(akulakhan, /---\r?\nOverhaul of Akulakhan's Chamber\r?\n$/);
  assert.doesNotMatch(akulakhan, /currently a stub/);
});
