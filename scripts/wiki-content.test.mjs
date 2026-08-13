import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import matter from 'gray-matter';
import yaml from 'js-yaml';

import {
  canonicalMapLocations,
  generateLocationMapData,
  generateMapData,
  generateWikiData,
  groupedLocationFolderSlugs,
  locationFolderName,
  locationFolderSlug,
  organizedLocationExplorerTitle,
  organizedLocationTitle,
  serializeWikiMarkdown,
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
  map_exterior_cells: [],
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
    exterior_cells: [],
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

test('wiki URL frontmatter is treated as authored text', () => {
  const errors = validateWikiMods([
    wikiMod({
      ...base,
      url: 'download?id=123&source=pages-cms',
      picture_url: '/assets/images/uploads/example image.png',
    }),
  ], vocabulary);
  assert.deepEqual(errors, []);
});

test('Pages CMS does not impose URL patterns on wiki mod fields', async () => {
  const config = await readFile('.pages.yml', 'utf8');
  const collection = config.match(/      - name: wiki_mods[\s\S]*?(?=\r?\n {6}- name:|$)/)?.[0];
  assert.ok(collection, 'Wiki Mods collection must exist');

  for (const fieldName of ['url', 'picture_url', 'showcase_url']) {
    const field = collection.match(new RegExp(`          - name: ${fieldName}[\\s\\S]*?(?=\\r?\\n          - name:|$)`))?.[0];
    assert.ok(field, `${fieldName} field must exist`);
    assert.doesNotMatch(field, /pattern:/);
  }
});

test('Pages CMS exposes nested folders for location articles', async () => {
  const config = await readFile('.pages.yml', 'utf8');
  const collection = config.match(/      - name: wiki_locations[\s\S]*?(?=\r?\n {6}- name:|$)/)?.[0];
  assert.ok(collection, 'Wiki Locations collection must exist');
  assert.match(collection, /^        subfolders: true$/m);
});

test('multiple map locations are preserved in generated data', () => {
  const data = generateMapData([
    wikiMod({ ...base, map_locations: ['Balmora', 'Caldera'] }),
  ]);
  assert.deepEqual(data.mods[0].locations, ['Balmora', 'Caldera']);
});

test('an old mod without components keeps its map shape and gains only an implicit main component internally', () => {
  const mod = wikiMod(base);
  const mapRecord = generateMapData([mod]).mods[0];
  assert.equal('component_locations' in mapRecord, false);
  const normalized = generateWikiData([mod]).mods['example-mod'];
  assert.equal(normalized.components.length, 1);
  assert.deepEqual(normalized.components[0], {
    id: 'default',
    name: 'Default version',
    type: 'main',
    plugins: [],
    map_locations: [],
    map_exterior_cells: [],
    relations: [],
    implicit: true,
  });
});

test('a mod may expose multiple explicit variants without creating separate mod pages', () => {
  const mod = wikiMod({
    ...base,
    map_enabled: false,
    map_locations: [],
    components: [
      { id: 'vanilla', name: 'Vanilla version', type: 'variant', plugins: ['Example.esp'] },
      { id: 'tr', name: 'Tamriel Rebuilt version', type: 'variant', plugins: ['Example - TR.esp'] },
    ],
  });
  assert.deepEqual(validateWikiMods([mod], vocabulary), []);
  assert.deepEqual(
    generateWikiData([mod]).mods['example-mod'].components.map(component => component.id),
    ['vanilla', 'tr'],
  );
});

test('a translation on a separate page generates outgoing and reverse translation relationships', () => {
  const original = wikiMod({ ...base, map_enabled: false, map_locations: [] }, 'original-mod');
  const translation = wikiMod({
    ...base,
    title: 'Original Mod French',
    map_enabled: false,
    map_locations: [],
    components: [{
      id: 'fr',
      name: 'French translation',
      type: 'translation',
      plugins: ['Original Mod - FR.esp'],
      relations: [{ type: 'translation_of', target: 'original-mod' }],
    }],
  }, 'original-mod-french');
  const mods = [original, translation];
  assert.deepEqual(validateWikiMods(mods, vocabulary), []);
  const data = generateWikiData(mods);
  assert.equal(data.mods['original-mod-french'].outgoing_relationships[0].source_component, 'fr');
  assert.equal(data.mods['original-mod'].incoming_relationships[0].source_mod, 'original-mod-french');
});

test('a patch component may target one mod and reverse generation identifies its source component', () => {
  const target = wikiMod({ ...base, map_enabled: false, map_locations: [] }, 'beautiful-cities');
  const patch = wikiMod({
    ...base,
    title: 'Beautiful Cities Patch',
    map_enabled: false,
    map_locations: [],
    components: [{
      id: 'bc-patch',
      name: 'Beautiful Cities patch',
      type: 'patch',
      plugins: ['BC Patch.esp'],
      relations: [{ type: 'patch_for', target: 'beautiful-cities' }],
    }],
  }, 'beautiful-cities-patch');
  const data = generateWikiData([target, patch]);
  assert.deepEqual(data.mods['beautiful-cities'].incoming_relationships, [{
    type: 'patch_for',
    source_mod: 'beautiful-cities-patch',
    source_component: 'bc-patch',
    target_mod: 'beautiful-cities',
  }]);
});

test('one patch component may target multiple mods', () => {
  const first = wikiMod({ ...base, map_enabled: false, map_locations: [] }, 'first-mod');
  const second = wikiMod({ ...base, map_enabled: false, map_locations: [] }, 'second-mod');
  const patch = wikiMod({
    ...base,
    map_enabled: false,
    map_locations: [],
    components: [{
      id: 'shared-patch',
      name: 'Shared patch',
      type: 'patch',
      plugins: ['Shared Patch.esp'],
      relations: [
        { type: 'patch_for', target: 'first-mod' },
        { type: 'patch_for', target: 'second-mod' },
      ],
    }],
  }, 'shared-patch');
  const mods = [first, second, patch];
  assert.deepEqual(validateWikiMods(mods, vocabulary), []);
  const data = generateWikiData(mods);
  assert.equal(data.mods['shared-patch'].outgoing_relationships.length, 2);
  assert.equal(data.mods['first-mod'].incoming_relationships.length, 1);
  assert.equal(data.mods['second-mod'].incoming_relationships.length, 1);
});

test('one patch collection page may contain components for unrelated mods', () => {
  const first = wikiMod({ ...base, map_enabled: false, map_locations: [] }, 'first-mod');
  const second = wikiMod({ ...base, map_enabled: false, map_locations: [] }, 'second-mod');
  const collection = wikiMod({
    ...base,
    map_enabled: false,
    map_locations: [],
    components: [
      {
        id: 'first-patch', name: 'First patch', type: 'patch', plugins: ['First Patch.esp'],
        relations: [{ type: 'patch_for', target: 'first-mod' }],
      },
      {
        id: 'second-patch', name: 'Second patch', type: 'patch', plugins: ['Second Patch.esp'],
        relations: [{ type: 'patch_for', target: 'second-mod' }],
      },
    ],
  }, 'patch-collection');
  const data = generateWikiData([first, second, collection]);
  assert.equal(data.mods['first-mod'].incoming_relationships[0].source_component, 'first-patch');
  assert.equal(data.mods['second-mod'].incoming_relationships[0].source_component, 'second-patch');
});

test('relationships targeting nonexistent wiki mods are rejected with component context', () => {
  const errors = validateWikiMods([wikiMod({
    ...base,
    components: [{
      id: 'missing-patch',
      name: 'Missing patch',
      type: 'patch',
      relations: [{ type: 'patch_for', target: 'does-not-exist' }],
    }],
  })], vocabulary);
  assert.equal(errors.some(error =>
    error.property === 'components[0].relations[0].target'
    && error.message.includes('nonexistent')), true);
});

test('duplicate component IDs are rejected within their source mod', () => {
  const errors = validateWikiMods([wikiMod({
    ...base,
    components: [
      { id: 'same', name: 'First', type: 'main' },
      { id: 'same', name: 'Second', type: 'optional' },
    ],
  })], vocabulary);
  assert.equal(errors.some(error =>
    error.property === 'components[1].id' && error.message.includes('Duplicate component ID')), true);
});

test('unknown component and relationship types plus malformed component IDs are rejected', () => {
  const target = wikiMod({ ...base, map_enabled: false, map_locations: [] }, 'target-mod');
  const invalid = wikiMod({
    ...base,
    components: [{
      id: 'Not Valid',
      name: 'Invalid option',
      type: 'installer',
      relations: [{ type: 'depends_on', target: 'target-mod' }],
    }],
  }, 'invalid-components');
  const errors = validateWikiMods([target, invalid], vocabulary);
  assert.equal(errors.some(error => error.property === 'components[0].id' && error.message.includes('Malformed')), true);
  assert.equal(errors.some(error => error.property === 'components[0].type' && error.message.includes('Unknown')), true);
  assert.equal(errors.some(error => error.property === 'components[0].relations[0].type' && error.message.includes('Unknown')), true);
});

test('component-specific map locations are emitted separately from parent coverage', () => {
  const mod = wikiMod({
    ...base,
    map_enabled: true,
    map_locations: ['Balmora'],
    components: [{
      id: 'tr',
      name: 'TR version',
      type: 'variant',
      plugins: ['Example - TR.esp'],
      map_locations: ['Caldera'],
      map_exterior_cells: ['2, 3'],
    }],
  });
  assert.deepEqual(validateWikiMods([mod], vocabulary), []);
  const generated = generateMapData([mod]).mods[0];
  assert.deepEqual(generated.locations, ['Balmora']);
  assert.deepEqual(generated.component_locations, [{
    id: 'tr',
    name: 'TR version',
    type: 'variant',
    coverage_mode: 'replace',
    locations: ['Caldera'],
    exterior_cells: [[2, 3]],
    effective_locations: ['Caldera'],
    effective_exterior_cells: [[2, 3]],
  }]);
});

test('variant and translation coverage replaces parent landscape edits', () => {
  const mod = wikiMod({
    ...base,
    map_locations: ['Balmora'],
    map_exterior_cells: ['1, 2'],
    components: [
      {
        id: 'variant', name: 'Variant', type: 'variant',
        map_locations: ['Caldera'], map_exterior_cells: ['3, 4'],
      },
      {
        id: 'translation', name: 'Translation', type: 'translation',
        map_locations: ['Caldera'], map_exterior_cells: ['5, 6'],
      },
    ],
  });
  assert.deepEqual(validateWikiMods([mod], vocabulary), []);
  const components = generateMapData([mod]).mods[0].component_locations;
  for (const component of components) {
    assert.equal(component.coverage_mode, 'replace');
    assert.deepEqual(component.effective_locations, ['Caldera']);
    assert.equal(component.effective_exterior_cells.some(cell => cell[0] === 1 && cell[1] === 2), false);
  }
});

test('patch and optional coverage adds onto parent landscape edits', () => {
  const mod = wikiMod({
    ...base,
    map_locations: ['Balmora'],
    map_exterior_cells: ['1, 2'],
    components: [
      {
        id: 'patch', name: 'Patch', type: 'patch',
        map_locations: ['Caldera'], map_exterior_cells: ['3, 4'],
      },
      {
        id: 'optional', name: 'Optional', type: 'optional',
        map_locations: [], map_exterior_cells: [],
      },
    ],
  });
  assert.deepEqual(validateWikiMods([mod], vocabulary), []);
  const [patch, optional] = generateMapData([mod]).mods[0].component_locations;
  assert.equal(patch.coverage_mode, 'additive');
  assert.deepEqual(patch.effective_locations, ['Balmora', 'Caldera']);
  assert.deepEqual(patch.effective_exterior_cells, [[1, 2], [3, 4]]);
  assert.equal(optional.coverage_mode, 'additive');
  assert.deepEqual(optional.effective_locations, ['Balmora']);
  assert.deepEqual(optional.effective_exterior_cells, [[1, 2]]);
});

test('component exterior cells are validated with component context', () => {
  const errors = validateWikiMods([wikiMod({
    ...base,
    components: [{
      id: 'bad-map',
      name: 'Bad map',
      type: 'variant',
      map_exterior_cells: ['2,3', '90, 90'],
    }],
  })], vocabulary);
  assert.equal(errors.some(error =>
    error.property === 'components[0].map_exterior_cells'
    && error.message.includes('canonical')), true);
  assert.equal(errors.some(error =>
    error.property === 'components[0].map_exterior_cells'
    && error.message.includes('outside')), true);
});

test('patch relationships never inherit the geography of the mod they patch', () => {
  const target = wikiMod({ ...base, map_locations: ['Balmora'] }, 'mapped-target');
  const patch = wikiMod({
    ...base,
    title: 'Unmapped Patch',
    map_enabled: false,
    map_locations: [],
    components: [{
      id: 'patch',
      name: 'Patch',
      type: 'patch',
      plugins: ['Patch.esp'],
      relations: [{ type: 'patch_for', target: 'mapped-target' }],
    }],
  }, 'unmapped-patch');
  assert.deepEqual(validateWikiMods([target, patch], vocabulary), []);
  const generated = generateMapData([target, patch]);
  assert.deepEqual(generated.mods.map(mod => mod.wiki_slug), ['mapped-target']);
  assert.deepEqual(generated.mods[0].locations, ['Balmora']);
});

test('exterior cells are validated independently and emitted as numeric coordinates', () => {
  const mod = wikiMod({
    ...base,
    map_locations: [],
    map_exterior_cells: ['12, 11', '-3, 4'],
  });
  assert.deepEqual(validateWikiMods([mod], vocabulary), []);
  assert.deepEqual(generateMapData([mod]).mods[0].exterior_cells, [[12, 11], [-3, 4]]);

  const invalid = validateWikiMods([
    wikiMod({ ...base, map_locations: [], map_exterior_cells: ['12,11', '90, 90'] }),
  ], vocabulary);
  assert.equal(invalid.some(error => error.message.includes('canonical')), true);
  assert.equal(invalid.some(error => error.message.includes('outside')), true);
});

test('duplicate locations are rejected case-insensitively', () => {
  const errors = validateWikiMods([
    wikiMod({ ...base, map_locations: ['Balmora', 'balmora'] }),
  ], vocabulary);
  assert.equal(errors.some(error => error.message === 'Duplicate map location'), true);
});

test('the checked-in wiki, Pages CMS options, and map registry validate together', async () => {
  const result = await validateWikiProject();
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

test('one cell can generate several entrance markers without becoming several locations', () => {
  const location = {
    relativePath: 'assurdirapal.md',
    slug: 'assurdirapal',
    parseError: null,
    frontmatter: {
      title: 'Assurdirapal, Shrine',
      map_id: 645,
      cell: 'Assurdirapal, Shrine',
      region: 'Sheogorad',
      x: 597,
      y: 173764,
      icon: 14,
      level: 14,
      additional_entrances: [{ map_id: 646, x: 3839, y: 173031, level: 16.5 }],
      uesp_wiki: 'Assurdirapal',
      draft: false,
    },
  };

  assert.deepEqual(groupedLocationFolderSlugs([location]), new Set());
  assert.deepEqual(validateWikiLocations([location]), []);
  assert.deepEqual(generateLocationMapData([location]).locations, [{
    id: 645,
    name: 'Assurdirapal, Shrine',
    x: 597,
    y: 173764,
    icon: 14,
    level: 14,
    wiki_url: '/wiki/locations/assurdirapal',
    cell: 'Assurdirapal, Shrine',
    region: 'Sheogorad',
    wiki: 'Assurdirapal',
    entrances: [{ id: 646, x: 3839, y: 173031, level: 16.5 }],
  }]);
});

test('duplicate cell articles are rejected in favor of additional entrances', () => {
  const frontmatter = {
    title: 'Assurdirapal, Shrine',
    map_id: 645,
    cell: 'Assurdirapal, Shrine',
    region: 'Sheogorad',
    x: 597,
    y: 173764,
    icon: 14,
    level: 14,
    draft: false,
  };
  const duplicate = {
    ...frontmatter,
    map_id: 646,
    x: 3839,
    y: 173031,
  };
  const locations = [
    { relativePath: 'assurdirapal/one.md', slug: 'assurdirapal/one', parseError: null, frontmatter },
    { relativePath: 'assurdirapal/two.md', slug: 'assurdirapal/two', parseError: null, frontmatter: duplicate },
  ];

  assert.equal(
    validateWikiLocations(locations).some(error =>
      error.property === 'cell' && error.message.includes('additional_entrances')),
    true,
  );
});

test('comma-qualified location names derive their parent folder from the name', () => {
  assert.equal(locationFolderName({ cell: 'Rotheran, Arena', title: 'Arena' }), 'Rotheran');
  assert.equal(locationFolderSlug({ cell: 'Vivec, Arena Underworks', title: 'Arena Underworks' }), 'vivec');
  assert.equal(locationFolderSlug({ title: 'Boat Transport, Dagon Fel' }), 'dagon-fel');
  assert.equal(locationFolderSlug({ title: 'Silt Strider, Molag Mar' }), 'molag-mar');
  assert.equal(locationFolderSlug({ title: 'Balmora' }), null);
  assert.deepEqual(
    groupedLocationFolderSlugs([
      { cell: 'Vivec, Arena Underworks', title: 'Arena Underworks' },
      { cell: 'Vivec, Arena Pit', title: 'Arena Pit' },
      { cell: 'Rotheran, Arena', title: 'Arena' },
      { cell: 'Silt Strider, Molag Mar', title: 'Silt Strider, Molag Mar' },
    ]),
    new Set(['molag-mar', 'vivec']),
  );
  assert.equal(
    organizedLocationTitle({ title: 'Ald-Ruhn', cell: 'Silt Strider, Ald-Ruhn' }, true),
    'Silt Strider, Ald-Ruhn',
  );
  assert.equal(
    organizedLocationTitle({ title: 'Ashunartes', cell: 'Ashunartes, Shrine' }, true),
    'Ashunartes, Shrine',
  );
  assert.equal(
    organizedLocationExplorerTitle({ title: 'Lower Level', cell: 'Andasreth, Lower Level' }, true),
    'Lower Level',
  );
  assert.equal(
    organizedLocationExplorerTitle({ title: 'Molag Mar', cell: 'Silt Strider, Molag Mar' }, true),
    'Silt Strider',
  );
  assert.equal(
    organizedLocationTitle({ title: "Abassel's Yurt", cell: "Aidanat Camp, Abassel's Yurt" }, false),
    "Aidanat Camp, Abassel's Yurt",
  );
  assert.deepEqual(
    canonicalMapLocations([
      {
        title: 'Vivec, Arena Underworks',
        explorer_title: 'Arena Underworks',
        cell: 'Vivec, Arena Underworks',
        draft: false,
      },
      {
        title: 'Vivec, Arena Pit',
        explorer_title: 'Arena Pit',
        cell: 'Vivec, Arena Pit',
        draft: false,
      },
    ]),
    ['Arena Pit', 'Arena Underworks', 'Vivec, Arena Pit', 'Vivec, Arena Underworks'],
  );
});

test('location validation groups shared prefixes, flattens singletons, and emits nested wiki URLs', () => {
  const underworks = {
    title: 'Vivec, Arena Underworks',
    explorer_title: 'Arena Underworks',
    map_id: 430,
    cell: 'Vivec, Arena Underworks',
    region: 'Vivec',
    x: 33119,
    y: -84726,
    icon: 100,
    level: 16.5,
    draft: false,
  };
  const pit = {
    ...underworks,
    title: 'Vivec, Arena Pit',
    explorer_title: 'Arena Pit',
    map_id: 431,
    cell: 'Vivec, Arena Pit',
  };
  const flat = { relativePath: 'arena-underworks.md', slug: 'arena-underworks', parseError: null, frontmatter: underworks };
  const nestedPit = { relativePath: 'vivec/arena-pit.md', slug: 'vivec/arena-pit', parseError: null, frontmatter: pit };
  assert.equal(
    validateWikiLocations([flat, nestedPit]).some(error => error.message.includes('vivec/ folder')),
    true,
  );

  const nested = { ...flat, relativePath: 'vivec/arena-underworks.md', slug: 'vivec/arena-underworks' };
  assert.deepEqual(validateWikiLocations([nested, nestedPit]), []);
  assert.equal(
    generateLocationMapData([nested]).locations[0].wiki_url,
    '/wiki/locations/vivec/arena-underworks',
  );

  const singleton = {
    ...flat,
    relativePath: 'aidanat-camp-abassel-s-yurt.md',
    slug: 'aidanat-camp-abassel-s-yurt',
    frontmatter: {
      ...underworks,
      title: "Aidanat Camp, Abassel's Yurt",
      explorer_title: undefined,
      cell: "Aidanat Camp, Abassel's Yurt",
    },
  };
  assert.deepEqual(validateWikiLocations([singleton]), []);
});

test('a Markdown editor round trip preserves lists, unknown frontmatter, and normal wiki syntax', () => {
  const body = '[[Internal Wiki Link]]\n\n**bold**\n\n*italic*\n\n# Heading\n\n- list\n';
  const source = `---\ntitle: Round Trip\nauthors:\n  - Author One\n  - Author Two\nsome_future_property: test\nmap_enabled: false\ndraft: false\n---\n${body}`;
  const parsed = matter(source, { engines: { yaml: value => yaml.load(value) } });
  const merged = { ...parsed.data, description: 'Changed through the form.' };
  const saved = serializeWikiMarkdown(merged, parsed.content);
  const reopened = matter(saved, { engines: { yaml: value => yaml.load(value) } });

  assert.match(saved, /\n---\n\[\[Internal Wiki Link\]\]/);
  assert.doesNotMatch(saved, /^---\S/m);
  assert.deepEqual(reopened.data.authors, ['Author One', 'Author Two']);
  assert.equal(reopened.data.some_future_property, 'test');
  assert.equal(reopened.data.description, 'Changed through the form.');
  assert.equal(reopened.content, body);
});

test('wiki navigation, metadata cards, and map popups use the requested links and typography', async () => {
  const [siteNav, layout, head, modDetails, customStyles, mapScript, pageTitle, pageList, explorer, spaRouter, wikiLogo] = await Promise.all([
    readFile('wiki/quartz/components/SiteNav.tsx', 'utf8'),
    readFile('wiki/quartz.layout.ts', 'utf8'),
    readFile('wiki/quartz/components/Head.tsx', 'utf8'),
    readFile('wiki/quartz/components/ModDetails.tsx', 'utf8'),
    readFile('wiki/quartz/styles/custom.scss', 'utf8'),
    readFile('map/js/map.js', 'utf8'),
    readFile('wiki/quartz/components/PageTitle.tsx', 'utf8'),
    readFile('wiki/quartz/components/PageList.tsx', 'utf8'),
    readFile('wiki/quartz/components/Explorer.tsx', 'utf8'),
    readFile('wiki/quartz/components/scripts/spa.inline.ts', 'utf8'),
    readFile('wiki/quartz/static/wiki-logo.webp'),
  ]);
  assert.match(siteNav, /\/wiki\/mods\//);
  assert.match(siteNav, /\/wiki\/locations\//);
  assert.match(siteNav, /h\("mms-site-switcher", \{ current: "wiki" \}\)/);
  assert.doesNotMatch(siteNav, />Home<|\/wiki\/categories\/|\/wiki\/tags\/|TES3 Mod Map/);
  assert.match(layout, /header: \[Component\.SiteNav\(\)\]/);
  assert.equal((layout.match(/Component\.SiteNav\(\)/g) ?? []).length, 1);
  assert.match(head, /<script src="\/nav\.js" defer data-persist=""><\/script>/);
  assert.match(modDetails, />Links</);
  assert.match(modDetails, /aria-label="View on TES3 Mod Map"/);
  assert.match(modDetails, /class="mod-details-map-icon"/);
  assert.match(modDetails, /\.mod-details-map-icon::after[\s\S]*background: #1e1b19/);
  assert.match(modDetails, /aria-label="View on Nexus Mods"/);
  assert.match(modDetails, /aria-label="Watch the mod showcase on YouTube"/);
  assert.doesNotMatch(modDetails, />\s*View on (?:TES3 Mod Map|Nexus Mods)\s*</);
  assert.match(modDetails, /mod-details-picture/);
  assert.match(modDetails, /modathon\/modder|modjam\/modder|madness\/modder/);
  assert.match(modDetails, /href=\{profileUrl\}[\s\S]*target="_blank"[\s\S]*noopener noreferrer/);
  assert.match(customStyles, /\.explorer[\s\S]*font-family: var\(--bodyFont\)/);
  assert.match(pageTitle, /src="\/wiki\/static\/wiki-logo\.webp"/);
  assert.match(pageList, /\.section h3[\s\S]*font-family: var\(--bodyFont\)/);
  assert.match(pageList, /const sorter = sort \?\? byAlphabetical/);
  assert.doesNotMatch(pageList, /byDateAndAlphabeticalFolderFirst/);
  assert.match(explorer, /Folders and files share one alphabetical sequence/);
  assert.doesNotMatch(explorer, /!a\.isFolder && b\.isFolder/);
  assert.match(spaRouter, /url\.pathname === WIKI_ROOT \|\| url\.pathname\.startsWith/);
  assert.ok(wikiLogo.length > 0);
  assert.match(mapScript, /href="\$\{esc\(mod\.url\)\}"[^`]+\$\{esc\(mod\.name\)\}/);
  assert.match(mapScript, />wiki<\/a>/);
  assert.doesNotMatch(mapScript, />mod page/);
});
