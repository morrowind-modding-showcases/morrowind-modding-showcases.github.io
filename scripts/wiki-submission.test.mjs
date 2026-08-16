import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import matter from 'gray-matter';
import yaml from 'js-yaml';

import {
  decodeWorkflowPayload,
  encodeWorkflowPayload,
  sha256Hex,
} from './wiki-submission-codec.mjs';
import {
  applyWikiSubmission,
  publicPullRequestMetadata,
  resolveRepositoryTarget,
} from './wiki-submission-lib.mjs';
import {
  isSafeEditTargetPath,
  isValidWikiFilename,
  slugifyWikiFilename,
  validateSubmissionPayload,
} from './wiki-submission-schema.mjs';
import { serializeWikiMarkdown } from './wiki-content-lib.mjs';

const vocabularies = {
  categories: ['Dungeon'],
  events: ['Morrowind Modathon 2026'],
  mapLocations: ['Balmora'],
  modSlugs: ['target-mod'],
};

function markdown(body = 'A real article body.\n') {
  return `---\ntitle: "Browser preview only"\n---\n${body}`;
}

function newModPayload(overrides = {}) {
  return {
    schemaVersion: 2,
    submissionId: '123e4567-e89b-42d3-a456-426614174000',
    kind: 'new-mod',
    contributorName: 'Anonymous Editor',
    notes: '',
    createdAt: '2026-08-04T12:00:00.000Z',
    changes: {
      slug: 'example-mod',
      title: 'Example Mod',
      authors: ['First Author'],
      url: 'https://www.nexusmods.com/morrowind/mods/60000',
      picture_url: '',
      showcase_url: '',
      categories: ['Dungeon'],
      events: ['Morrowind Modathon 2026'],
      map_enabled: true,
      map_locations: ['Balmora'],
      map_exterior_edits: [],
    },
    generatedMarkdown: markdown(),
    ...overrides,
  };
}

function editModPayload(source, changes = {}) {
  return {
    ...newModPayload(),
    kind: 'edit-mod',
    target: {
      path: 'wiki/content/mods/example-mod.md',
      baseSha256: '',
    },
    changes: {
      ...newModPayload().changes,
      ...changes,
    },
  };
}

async function tempRepo() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wiki-submission-'));
  await mkdir(path.join(root, 'wiki', 'content', 'mods'), { recursive: true });
  await mkdir(path.join(root, 'wiki', 'content', 'locations'), {
    recursive: true,
  });
  return root;
}

test('mod slug generation removes diacritics and filename validation enforces single hyphens', () => {
  assert.equal(slugifyWikiFilename('  Crème brûlée — Redux!  '), 'creme-brulee-redux');
  assert.equal(isValidWikiFilename('creme-brulee-redux'), true);
  for (const invalid of ['Uppercase', '-leading', 'trailing-', 'two--hyphens', 'has space', '']) {
    assert.equal(isValidWikiFilename(invalid), false, invalid);
  }
});

test('safe edit paths allow only individual mod and nested location Markdown files', () => {
  assert.equal(isSafeEditTargetPath('wiki/content/mods/akulakhan-city.md'), true);
  assert.equal(isSafeEditTargetPath('wiki/content/locations/vivec/arena-pit.md'), true);
  for (const invalid of [
    '/wiki/content/mods/test.md',
    'wiki\\content\\mods\\test.md',
    'wiki/content/mods/../test.md',
    'wiki/content/mods/index.md',
    'wiki/content/locations/index.md',
    'wiki/content/mods/test.txt',
    'content/mods/test.md',
  ])
    assert.equal(isSafeEditTargetPath(invalid), false, invalid);
});

test('safe filesystem resolution remains inside the expected wiki directory', async () => {
  const root = await tempRepo();
  try {
    assert.equal(
      resolveRepositoryTarget(root, 'wiki/content/mods/example-mod.md', 'new-mod'),
      path.join(root, 'wiki', 'content', 'mods', 'example-mod.md'),
    );
    assert.throws(() => resolveRepositoryTarget(root, 'wiki/content/mods/../escape.md', 'new-mod'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('new mod import reconstructs trusted Markdown with draft false, one category, no tags, and no starter heading', async () => {
  const root = await tempRepo();
  try {
    const result = await applyWikiSubmission(newModPayload(), {
      repoRoot: root,
      vocabularies,
    });
    const source = await readFile(path.join(root, result.repositoryPath), 'utf8');
    const parsed = matter(source, {
      engines: { yaml: value => yaml.load(value) },
    });
    assert.equal(parsed.data.draft, false);
    assert.deepEqual(parsed.data.categories, ['Dungeon']);
    assert.equal('tags' in parsed.data, false);
    assert.equal('description' in parsed.data, false);
    assert.equal(parsed.content, 'A real article body.\n');
    assert.doesNotMatch(source, /# (?:Description|Location)/u);
    assert.match(source, /\n---\nA real article body\./u);
    assert.deepEqual(result.repositoryPaths, [result.repositoryPath, result.contributionPath]);
    assert.deepEqual(
      JSON.parse(await readFile(path.join(root, result.contributionPath), 'utf8')),
      {
        schemaVersion: 1,
        submissionId: '123e4567-e89b-42d3-a456-426614174000',
        contributor: 'Anonymous Editor',
        submittedAt: '2026-08-04T12:00:00.000Z',
        kind: 'new-mod',
        pagePath: 'wiki/content/mods/example-mod.md',
        pageTitle: 'Example Mod',
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('new mod submissions preserve validated component and relationship frontmatter', async () => {
  const root = await tempRepo();
  try {
    const payload = newModPayload();
    payload.changes.components = [{
      id: 'target-patch',
      name: 'Target patch',
      type: 'patch',
      plugins: ['Target Patch.esp'],
      relations: [{ type: 'patch_for', target: 'target-mod' }],
      map_locations: ['Balmora'],
      map_exterior_edits: [{ cell: '2, 3', landscape: false, references: 8 }],
      notes: 'Install after the target mod.',
    }];
    await applyWikiSubmission(payload, { repoRoot: root, vocabularies });
    const parsed = matter(
      await readFile(path.join(root, 'wiki', 'content', 'mods', 'example-mod.md'), 'utf8'),
      { engines: { yaml: value => yaml.load(value) } },
    );
    assert.deepEqual(parsed.data.components, payload.changes.components);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('submission components reject unknown types, duplicate IDs, and malformed relation targets', () => {
  const payload = newModPayload();
  payload.changes.components = [{
    id: 'same',
    name: 'First',
    type: 'patch',
    plugins: [],
    relations: [{ type: 'patch_for', target: 'target-mod' }],
    map_locations: [],
    notes: '',
  }, {
    id: 'same',
    name: 'Second',
    type: 'unsupported',
    plugins: [],
    relations: [],
    map_locations: [],
    notes: '',
  }];
  assert.throws(() => validateSubmissionPayload(payload), /duplicate component ID|unsupported/u);

  payload.changes.components = [{
    ...payload.changes.components[0],
    relations: [{ type: 'patch_for', target: 'Not a slug' }],
  }];
  assert.throws(() => validateSubmissionPayload(payload), /filename slug/u);
});

test('existing mod edits preserve unknown frontmatter, tags, draft, filename, and exact body proposal', async () => {
  const root = await tempRepo();
  try {
    const file = path.join(root, 'wiki', 'content', 'mods', 'example-mod.md');
    const current = serializeWikiMarkdown(
      {
        title: 'Old title',
        description: 'Legacy SEO override.',
        authors: ['Old Author'],
        url: 'https://example.com/old-download',
        categories: ['Dungeon'],
        tags: ['hidden-tag'],
        map_enabled: false,
        map_locations: [],
        draft: true,
        events: ['Retired Event'],
        some_future_property: { keep: true },
      },
      'Old body.\n',
    );
    await writeFile(file, current);
    const payload = editModPayload(current, {
      title: 'Updated title',
      authors: [],
      url: 'https://example.com/new-download',
      events: ['Retired Event'],
      map_enabled: false,
      map_locations: [],
    });
    delete payload.changes.slug;
    payload.target.baseSha256 = await sha256Hex(new TextEncoder().encode(current));
    payload.generatedMarkdown = markdown('Updated body.\n');
    const result = await applyWikiSubmission(payload, {
      repoRoot: root,
      vocabularies,
    });
    assert.equal(result.repositoryPath, 'wiki/content/mods/example-mod.md');
    const parsed = matter(await readFile(file, 'utf8'), {
      engines: { yaml: value => yaml.load(value) },
    });
    assert.deepEqual(parsed.data.tags, ['hidden-tag']);
    assert.equal(parsed.data.draft, true);
    assert.deepEqual(parsed.data.some_future_property, { keep: true });
    assert.equal(parsed.data.title, 'Updated title');
    assert.equal('description' in parsed.data, false);
    assert.equal(parsed.data.url, 'https://example.com/new-download');
    assert.equal(parsed.content, 'Updated body.\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('location edits preserve map_id, icon, level, explorer_title, draft, unknown fields, and hidden entrance metadata by source index', async () => {
  const root = await tempRepo();
  try {
    const file = path.join(root, 'wiki', 'content', 'locations', 'example-cell.md');
    const current = serializeWikiMarkdown(
      {
        title: 'Example Cell',
        cell: 'Example Cell',
        region: 'Old Region',
        x: 1,
        y: 2,
        map_id: 10,
        icon: 14,
        level: 15,
        explorer_title: 'Example',
        draft: false,
        unknown: 'preserved',
        additional_entrances: [
          { map_id: 11, x: 3, y: 4, level: 15, secret: 'first' },
          { map_id: 12, x: 5, y: 6, level: 16.5, secret: 'second' },
        ],
      },
      'Old location body.\n',
    );
    await writeFile(file, current);
    const payload = {
      schemaVersion: 1,
      submissionId: '123e4567-e89b-42d3-a456-426614174001',
      kind: 'edit-location',
      contributorName: 'Location Editor',
      notes: '',
      createdAt: '2026-08-04T12:00:00.000Z',
      target: {
        path: 'wiki/content/locations/example-cell.md',
        baseSha256: await sha256Hex(new TextEncoder().encode(current)),
      },
      changes: {
        cell: 'Renamed Cell',
        region: '',
        x: -20,
        y: 30,
        uesp_wiki: 'https://en.uesp.net/wiki/Morrowind:Renamed_Cell',
        additional_entrances: [{ sourceIndex: 1, x: -5, y: -6, region: 'New Region' }],
      },
      generatedMarkdown: markdown('Updated location body.\n'),
    };
    await applyWikiSubmission(payload, {
      repoRoot: root,
      vocabularies,
    });
    const parsed = matter(await readFile(file, 'utf8'), {
      engines: { yaml: value => yaml.load(value) },
    });
    assert.equal(parsed.data.map_id, 10);
    assert.equal(parsed.data.icon, 14);
    assert.equal(parsed.data.level, 15);
    assert.equal(parsed.data.explorer_title, 'Example');
    assert.equal(parsed.data.draft, false);
    assert.equal(parsed.data.unknown, 'preserved');
    assert.deepEqual(parsed.data.additional_entrances, [
      {
        map_id: 12,
        x: -5,
        y: -6,
        level: 16.5,
        secret: 'second',
        region: 'New Region',
      },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('stale SHA-256 edits are rejected before writing', async () => {
  const root = await tempRepo();
  try {
    const file = path.join(root, 'wiki', 'content', 'mods', 'example-mod.md');
    await writeFile(file, serializeWikiMarkdown({ title: 'Now', draft: false }, 'Current.'));
    const payload = editModPayload();
    delete payload.changes.slug;
    payload.target.baseSha256 = 'a'.repeat(64);
    await assert.rejects(applyWikiSubmission(payload, { repoRoot: root, vocabularies }), /stale SHA-256/u);
    assert.match(await readFile(file, 'utf8'), /Current\./u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('creating a mod refuses an existing file', async () => {
  const root = await tempRepo();
  try {
    await writeFile(path.join(root, 'wiki', 'content', 'mods', 'example-mod.md'), 'existing');
    await assert.rejects(applyWikiSubmission(newModPayload(), { repoRoot: root, vocabularies }), /already exists/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('controlled category, event, and map-location values are independently enforced', async () => {
  for (const [property, value, pattern] of [
    ['categories', ['Uncontrolled'], /categories/u],
    ['events', ['Unknown Event'], /events/u],
    ['map_locations', ['Unknown Place'], /map_locations/u],
  ]) {
    const root = await tempRepo();
    try {
      const payload = newModPayload();
      payload.changes[property] = value;
      await assert.rejects(applyWikiSubmission(payload, { repoRoot: root, vocabularies }), pattern);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test('map-enabled submissions without a location are rejected by the strict schema', () => {
  const payload = newModPayload();
  payload.changes.map_locations = [];
  assert.throws(() => validateSubmissionPayload(payload), /at least one/u);
});

test('map-enabled submissions preserve structured exterior edits without wiki location pages', () => {
  const payload = newModPayload();
  payload.changes.map_locations = [];
  payload.changes.map_exterior_edits = [
    { cell: '12, 11', landscape: true, references: 0 },
    { cell: '-3, 4', landscape: false, references: 50 },
    { cell: '2, 3', landscape: false, references: 0 },
  ];
  const validated = validateSubmissionPayload(payload);
  assert.deepEqual(validated.changes.map_exterior_edits, payload.changes.map_exterior_edits);

  payload.changes.map_exterior_edits = [{ cell: '12,11', landscape: true, references: 0 }];
  assert.throws(() => validateSubmissionPayload(payload), /canonical signed X, Y/u);
  payload.changes.map_exterior_edits = [{ cell: '90, 90', landscape: false, references: 2 }];
  assert.throws(() => validateSubmissionPayload(payload), /outside the TES3 Mod Map/u);
  payload.changes.map_exterior_edits = [{ cell: '12, 11', landscape: false, references: 0 }];
  assert.deepEqual(
    validateSubmissionPayload(payload).changes.map_exterior_edits,
    payload.changes.map_exterior_edits,
  );
});

test('new mod submissions create doormarker-derived location articles in the same change set', async () => {
  const root = await tempRepo();
  try {
    const payload = newModPayload();
    payload.schemaVersion = 3;
    payload.changes.map_locations.push('Example Cavern');
    payload.changes.new_locations = [{
      slug: 'example-cavern',
      cell: 'Example Cavern',
      region: 'Ashlands',
      x: -1234,
      y: 4568,
      additional_entrances: [{ x: -1200, y: 4500, region: 'Ashlands' }],
      description: 'A newly built cavern reached through an exterior door.',
    }];
    const result = await applyWikiSubmission(payload, {
      repoRoot: root,
      vocabularies,
    });
    assert.deepEqual(result.repositoryPaths, [
      'wiki/content/mods/example-mod.md',
      'wiki/content/locations/example-cavern.md',
      result.contributionPath,
    ]);
    const parsed = matter(
      await readFile(path.join(root, 'wiki', 'content', 'locations', 'example-cavern.md'), 'utf8'),
      { engines: { yaml: value => yaml.load(value) } },
    );
    assert.equal(parsed.data.title, 'Example Cavern');
    assert.equal(parsed.data.cell, 'Example Cavern');
    assert.equal(parsed.data.region, 'Ashlands');
    assert.equal(parsed.data.x, -1234);
    assert.equal(parsed.data.y, 4568);
    assert.equal(parsed.data.icon, 100);
    assert.equal(parsed.data.level, 16.5);
    assert.equal(parsed.data.mod_added, true);
    assert.equal(parsed.data.mod_added_by, 'example-mod');
    assert.ok(Number.isInteger(parsed.data.map_id));
    assert.ok(parsed.data.map_id >= 1_000_000_000);
    assert.equal(parsed.data.additional_entrances.length, 1);
    assert.notEqual(
      parsed.data.additional_entrances[0].map_id,
      parsed.data.map_id,
    );
    assert.equal(
      parsed.content,
      'A newly built cavern reached through an exterior door.\n',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('new location payloads require descriptions, safe generated slugs, and map coverage', () => {
  const payload = newModPayload();
  payload.schemaVersion = 3;
  payload.changes.new_locations = [{
    slug: 'wrong-slug',
    cell: 'Example Cavern',
    region: 'Ashlands',
    x: 1,
    y: 2,
    additional_entrances: [],
    description: '',
  }];
  assert.throws(() => validateSubmissionPayload(payload), /slug must match|description|map coverage/u);
  payload.changes.new_locations[0].slug = 'example-cavern';
  payload.changes.new_locations[0].description = 'Description.';
  assert.throws(() => validateSubmissionPayload(payload), /map coverage/u);
});

test('mod submissions persist distant mod-added placements as plugin-specific variants', async () => {
  const root = await tempRepo();
  try {
    const locationPath = path.join(root, 'wiki', 'content', 'locations', 'example-cavern.md');
    await writeFile(
      locationPath,
      serializeWikiMarkdown(
        {
          title: 'Example Cavern',
          map_id: 1_500_000_001,
          cell: 'Example Cavern',
          region: 'Ashlands',
          x: 0,
          y: 0,
          icon: 100,
          level: 16.5,
          mod_added: true,
          mod_added_by: 'target-mod',
          draft: false,
        },
        'Original location article.\n',
      ),
    );
    const payload = newModPayload();
    payload.schemaVersion = 4;
    payload.changes.map_locations.push('Example Cavern');
    payload.changes.new_locations = [];
    payload.changes.location_variants = [
      {
        cell: 'Example Cavern',
        mode: 'variant',
        plugin: 'Example.esp',
        component_id: '',
        x: 100,
        y: 0,
        region: 'Ashlands',
        additional_entrances: [{ x: 120, y: 20, region: 'Ashlands' }],
      },
    ];
    const controlled = {
      ...vocabularies,
      mapLocations: [...vocabularies.mapLocations, 'Example Cavern'],
    };
    const result = await applyWikiSubmission(payload, {
      repoRoot: root,
      vocabularies: controlled,
    });
    assert.ok(result.repositoryPaths.includes('wiki/content/locations/example-cavern.md'));
    const parsed = matter(await readFile(locationPath, 'utf8'), {
      engines: { yaml: value => yaml.load(value) },
    });
    assert.equal(parsed.data.x, 0);
    assert.equal(parsed.data.y, 0);
    assert.deepEqual(parsed.data.location_variants, [
      {
        mod: 'example-mod',
        plugin: 'Example.esp',
        x: 100,
        y: 0,
        region: 'Ashlands',
        entrances: [{ x: 120, y: 20, region: 'Ashlands' }],
      },
    ]);
    assert.equal(parsed.content, 'Original location article.\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('promoting a distant placement keeps the former main geometry as one variant', async () => {
  const root = await tempRepo();
  try {
    const locationPath = path.join(root, 'wiki', 'content', 'locations', 'example-cavern.md');
    await writeFile(
      locationPath,
      serializeWikiMarkdown(
        {
          title: 'Example Cavern',
          map_id: 1_500_000_002,
          cell: 'Example Cavern',
          region: 'Ashlands',
          x: 0,
          y: 0,
          icon: 100,
          level: 16.5,
          mod_added: true,
          mod_added_by: 'target-mod',
          additional_entrances: [
            {
              map_id: 1_500_000_020,
              x: 10,
              y: 10,
              level: 16.5,
              region: 'Ashlands',
            },
            {
              map_id: 1_500_000_021,
              x: 20,
              y: 20,
              level: 16.5,
              region: 'Ashlands',
              source: { mod: 'another-mod', plugin: 'Doors.esp' },
            },
          ],
          draft: false,
        },
        'Original location article.\n',
      ),
    );
    const payload = newModPayload();
    payload.schemaVersion = 4;
    payload.changes.map_locations.push('Example Cavern');
    payload.changes.new_locations = [];
    payload.changes.location_variants = [
      {
        cell: 'Example Cavern',
        mode: 'main',
        plugin: 'Example.esp',
        component_id: '',
        x: 100,
        y: 0,
        region: 'West Gash',
        additional_entrances: [],
      },
    ];
    const controlled = {
      ...vocabularies,
      mapLocations: [...vocabularies.mapLocations, 'Example Cavern'],
    };
    await applyWikiSubmission(payload, {
      repoRoot: root,
      vocabularies: controlled,
    });
    const parsed = matter(await readFile(locationPath, 'utf8'), {
      engines: { yaml: value => yaml.load(value) },
    });
    assert.equal(parsed.data.x, 100);
    assert.equal(parsed.data.y, 0);
    assert.equal(parsed.data.region, 'West Gash');
    assert.deepEqual(parsed.data.main_location_source, {
      mod: 'example-mod',
      plugin: 'Example.esp',
    });
    assert.deepEqual(parsed.data.location_variants, [
      {
        mod: 'target-mod',
        x: 0,
        y: 0,
        region: 'Ashlands',
        entrances: [{ x: 10, y: 10, region: 'Ashlands' }],
      },
    ]);
    assert.deepEqual(parsed.data.additional_entrances, [
      {
        map_id: 1_500_000_021,
        x: 20,
        y: 20,
        level: 16.5,
        region: 'Ashlands',
        source: { mod: 'another-mod', plugin: 'Doors.esp' },
      },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the importer retains nearby plugin placements as explicit variants', async () => {
  const root = await tempRepo();
  try {
    await writeFile(
      path.join(root, 'wiki', 'content', 'locations', 'example-cavern.md'),
      serializeWikiMarkdown(
        {
          title: 'Example Cavern',
          map_id: 1_500_000_003,
          cell: 'Example Cavern',
          region: 'Ashlands',
          x: 0,
          y: 0,
          icon: 100,
          level: 16.5,
          mod_added: true,
          mod_added_by: 'target-mod',
          draft: false,
        },
        'Original location article.\n',
      ),
    );
    const payload = newModPayload();
    payload.schemaVersion = 4;
    payload.changes.map_locations.push('Example Cavern');
    payload.changes.new_locations = [];
    payload.changes.location_variants = [
      {
        cell: 'Example Cavern',
        mode: 'variant',
        plugin: 'Example.esp',
        component_id: '',
        x: 99,
        y: 0,
        region: 'Ashlands',
        additional_entrances: [],
      },
    ];
    await applyWikiSubmission(payload, {
      repoRoot: root,
      vocabularies: {
        ...vocabularies,
        mapLocations: [...vocabularies.mapLocations, 'Example Cavern'],
      },
    });
    const parsed = matter(
      await readFile(path.join(root, 'wiki', 'content', 'locations', 'example-cavern.md'), 'utf8'),
      { engines: { yaml: value => yaml.load(value) } },
    );
    assert.equal(parsed.data.location_variants[0].x, 99);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('location choices can add plugin-sourced entrances without moving the main geometry', async () => {
  const root = await tempRepo();
  try {
    const locationPath = path.join(root, 'wiki', 'content', 'locations', 'example-cavern.md');
    await writeFile(
      locationPath,
      serializeWikiMarkdown(
        {
          title: 'Example Cavern',
          map_id: 1_500_000_004,
          cell: 'Example Cavern',
          region: 'Ashlands',
          x: 0,
          y: 0,
          icon: 100,
          level: 16.5,
          mod_added: true,
          mod_added_by: 'target-mod',
          additional_entrances: [
            {
              map_id: 1_500_000_030,
              x: 30,
              y: 30,
              level: 16.5,
              source: { mod: 'example-mod', plugin: 'Example.esp' },
            },
            {
              map_id: 1_500_000_031,
              x: 35,
              y: 35,
              level: 16.5,
              source: { mod: 'another-mod', plugin: 'Doors.esp' },
            },
          ],
          location_variants: [
            {
              mod: 'example-mod',
              plugin: 'Example.esp',
              x: 25,
              y: 25,
            },
          ],
          draft: false,
        },
        'Original location article.\n',
      ),
    );
    const payload = newModPayload();
    payload.schemaVersion = 4;
    payload.changes.map_locations.push('Example Cavern');
    payload.changes.new_locations = [];
    payload.changes.location_variants = [
      {
        cell: 'Example Cavern',
        mode: 'entrance',
        plugin: 'Example.esp',
        component_id: '',
        x: 40,
        y: 50,
        region: 'Ashlands',
        additional_entrances: [{ x: 60, y: 70, region: 'West Gash' }],
      },
    ];
    payload.changes.map_location_changes = [
      {
        cell: 'Example Cavern',
        mode: 'entrance',
        plugin: 'Example.esp',
      },
    ];
    await applyWikiSubmission(payload, {
      repoRoot: root,
      vocabularies: {
        ...vocabularies,
        mapLocations: [...vocabularies.mapLocations, 'Example Cavern'],
      },
    });
    const location = matter(await readFile(locationPath, 'utf8'), {
      engines: { yaml: value => yaml.load(value) },
    }).data;
    assert.equal(location.x, 0);
    assert.equal(location.y, 0);
    assert.deepEqual(
      location.additional_entrances.map(entrance => ({
        x: entrance.x,
        y: entrance.y,
        region: entrance.region,
        source: entrance.source,
      })),
      [
        {
          x: 35,
          y: 35,
          region: undefined,
          source: { mod: 'another-mod', plugin: 'Doors.esp' },
        },
        {
          x: 40,
          y: 50,
          region: 'Ashlands',
          source: { mod: 'example-mod', plugin: 'Example.esp' },
        },
        {
          x: 60,
          y: 70,
          region: 'West Gash',
          source: { mod: 'example-mod', plugin: 'Example.esp' },
        },
      ],
    );
    assert.equal(location.location_variants, undefined);
    const mod = matter(
      await readFile(path.join(root, 'wiki', 'content', 'mods', 'example-mod.md'), 'utf8'),
      { engines: { yaml: value => yaml.load(value) } },
    ).data;
    assert.deepEqual(mod.map_location_changes, [
      {
        cell: 'Example Cavern',
        mode: 'entrance',
        plugin: 'Example.esp',
      },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('version-4 submissions allow only one proposed main geometry per location', () => {
  const payload = newModPayload();
  payload.schemaVersion = 4;
  payload.changes.map_locations.push('Example Cavern');
  payload.changes.new_locations = [];
  payload.changes.location_variants = ['First.esp', 'Second.esp'].map((plugin, index) => ({
    cell: 'Example Cavern',
    mode: 'main',
    plugin,
    component_id: '',
    x: 100 + index * 100,
    y: 0,
    region: 'Ashlands',
    additional_entrances: [],
  }));
  assert.throws(
    () => validateSubmissionPayload(payload),
    /more than one main location/u,
  );
});

test('submission components reject main because the mod page represents the main plugin', () => {
  const payload = newModPayload();
  payload.changes.components = [{
    id: 'main',
    name: 'Main plugin',
    type: 'main',
    plugins: ['Example.esp'],
    relations: [],
    map_locations: [],
    map_exterior_edits: [],
    notes: '',
  }];
  assert.throws(() => validateSubmissionPayload(payload), /type is unsupported/u);
});

test('queued version-1 exterior cells normalize to landscape-only edits', () => {
  const payload = newModPayload();
  payload.schemaVersion = 1;
  payload.changes.map_locations = [];
  delete payload.changes.map_exterior_edits;
  payload.changes.map_exterior_cells = ['12, 11'];
  const validated = validateSubmissionPayload(payload);
  assert.deepEqual(validated.changes.map_exterior_edits, [
    { cell: '12, 11', landscape: true, references: 0 },
  ]);
});

test('map-enabled submissions may keep all coverage on components', () => {
  const payload = newModPayload();
  payload.changes.map_locations = [];
  payload.changes.components = [{
    id: 'translation',
    name: 'Translation',
    type: 'translation',
    plugins: ['Translation.esp'],
    relations: [],
    map_locations: [],
    map_exterior_edits: [{ cell: '12, 11', landscape: true, references: 0 }],
    notes: '',
  }];
  const validated = validateSubmissionPayload(payload);
  assert.deepEqual(validated.changes.components[0].map_exterior_edits, [
    { cell: '12, 11', landscape: true, references: 0 },
  ]);
  payload.changes.map_enabled = false;
  assert.throws(
    () => validateSubmissionPayload(payload),
    /Map-disabled mods must not include map locations or exterior cells/u,
  );
});

test('strict schema errors identify missing and unexpected fields', () => {
  const payload = newModPayload();
  delete payload.changes.map_exterior_edits;
  payload.changes.legacy_map_cell = '20, 3';

  assert.throws(
    () => validateSubmissionPayload(payload),
    /changes has missing field: "map_exterior_edits"; unexpected field: "legacy_map_cell"\./u,
  );
});

test('legacy queued descriptions remain valid but are discarded during normalization', () => {
  const payload = newModPayload();
  payload.changes.description = 'Legacy SEO override.';
  const validated = validateSubmissionPayload(payload);
  assert.equal('description' in validated.changes, false);
});

test('new mod filenames must match the slug generated from the title', () => {
  const payload = newModPayload();
  payload.changes.slug = 'custom-filename';
  assert.throws(() => validateSubmissionPayload(payload), /generated automatically/u);
});

test('download URLs are required complete HTTP(S) URLs for new and edited mods', () => {
  for (const kind of ['new-mod', 'edit-mod']) {
    const payload = kind === 'new-mod' ? newModPayload() : editModPayload();
    if (kind === 'edit-mod') delete payload.changes.slug;
    payload.changes.url = '';
    assert.throws(() => validateSubmissionPayload(payload), /url/u);
    payload.changes.url = 'not-a-url';
    assert.throws(() => validateSubmissionPayload(payload), /HTTP\(S\)/u);
  }
});

test('public submission schema excludes new-location creation', () => {
  const payload = newModPayload({ kind: 'new-location' });
  assert.throws(() => validateSubmissionPayload(payload), /kind is unsupported/u);
});

test('workflow payloads round trip and reject malformed or corrupted data', async () => {
  const payload = {
    schemaVersion: 1,
    body: Array.from({ length: 2_000 }, (_, index) => `${index}-${crypto.randomUUID()}`).join('|'),
  };
  const encoded = await encodeWorkflowPayload(payload);
  assert.match(encoded, /^WIKI_SUBMISSION_V1\.[a-f0-9]{64}\.[A-Za-z0-9_-]+$/u);
  assert.deepEqual(await decodeWorkflowPayload(encoded), payload);
  await assert.rejects(decodeWorkflowPayload('not-an-envelope'), /malformed/u);
  const corrupted = encoded.replace(
    /\.([A-Za-z0-9_-])(?=[A-Za-z0-9_-]*$)/u,
    (_match, first) => `.${first === 'A' ? 'B' : 'A'}`,
  );
  await assert.rejects(decodeWorkflowPayload(corrupted), /corrupt|digest|compression/u);
});

test('public PR metadata points to the public record without rendering untrusted contributor text', () => {
  const payload = newModPayload({
    contributorName: 'Private Name',
    notes: 'Private notes',
  });
  const metadata = publicPullRequestMetadata(payload);
  const source = JSON.stringify(metadata);
  assert.match(metadata.title, /Example Mod/u);
  assert.match(metadata.body, /public contributor record/u);
  assert.doesNotMatch(source, /Private Name|Private notes|generatedMarkdown|submissionId/u);
});

test('public contributor names are required and reject markup or control characters', () => {
  for (const contributorName of ['', 'A', '<script>', 'Line one\nLine two']) {
    assert.throws(
      () => validateSubmissionPayload(newModPayload({ contributorName })),
      /contributorName/u,
    );
  }
  assert.equal(
    validateSubmissionPayload(newModPayload({ contributorName: '  Example Editor  ' })).contributorName,
    'Example Editor',
  );
});

test('wiki import workflow restores only the intended pages and contribution record after validation', async () => {
  const workflow = await readFile(new URL('../.github/workflows/import-wiki-submission.yml', import.meta.url), 'utf8');
  const orderedSteps = [
    'Verify intended contribution files changed',
    'Preserve intended contribution files',
    'Run normal validation and builds',
    'Restore only the intended contribution changes',
    'Recheck change scope after validation',
    'Commit the intended contribution files',
  ];
  let previousIndex = -1;
  for (const stepName of orderedSteps) {
    const index = workflow.indexOf(`- name: ${stepName}`);
    assert.ok(index > previousIndex, `${stepName} must remain in its security-sensitive order`);
    previousIndex = index;
  }

  assert.match(workflow, /paths_file="\$RUNNER_TEMP\/wiki-submission-paths\.txt"/u);
  assert.match(workflow, /mapfile -t expected < "\$EXPECTED_PATHS_FILE"/u);
  assert.match(workflow, /preserved_archive="\$RUNNER_TEMP\/intended-wiki-submission\.tar"/u);
  assert.match(workflow, /tar -cf "\$preserved_archive" -- "\$\{expected\[@\]\}"/u);
  assert.match(workflow, /git reset --hard HEAD/u);
  assert.match(workflow, /git clean -fd(?:\r?\n)/u);
  assert.doesNotMatch(workflow, /git clean -fd[xX]/u);
  assert.match(workflow, /tar -xf "\$PRESERVED_ARCHIVE" -C "\$GITHUB_WORKSPACE"/u);
  assert.doesNotMatch(workflow, /Remove normal transient compatibility rebuilds/u);
  assert.equal((workflow.match(/echo "Actual changed paths:"/gu) ?? []).length, 2);
  assert.match(workflow, /git add -- "\$\{expected\[@\]\}"/u);
  assert.match(workflow, /"\$\{#staged\[@\]\}" -eq "\$\{#expected\[@\]\}"/u);
  assert.match(workflow, /encoded_submission:/u);
  assert.match(workflow, /WIKI_SUBMISSION_PAYLOAD: \$\{\{ inputs\.encoded_submission \}\}/u);
  assert.doesNotMatch(workflow, /issue_number|WIKI_QUEUE_TOKEN|moderation issue/iu);
});
