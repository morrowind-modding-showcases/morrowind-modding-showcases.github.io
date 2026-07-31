import assert from 'node:assert/strict';
import test from 'node:test';

import matter from 'gray-matter';
import yaml from 'js-yaml';

import { generateMapData, validateWikiMods, validateWikiProject } from './wiki-content-lib.mjs';

const base = {
  title: 'Example Mod',
  description: 'A test mod.',
  authors: ['Example Author'],
  url: 'https://www.nexusmods.com/morrowind/mods/12345',
  categories: ['Dungeon'],
  tags: ['example'],
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
  assert.deepEqual(result.errors, []);
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
