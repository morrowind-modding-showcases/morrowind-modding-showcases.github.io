import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import categoryApi from '../modathon/nexus-categories.js';

const {
  CATEGORIES,
  normalizeNexusCategory,
  normalizeNexusModCategory,
  resolveSiteCategory,
} = categoryApi;

const expectedCategories = [
  'Quests',
  'Landscape or Landmass',
  'NPCs and Creatures',
  'Graphics, Animations, or Audio',
  'Player Home',
  'Items',
  'Gameplay, Patch, or UI',
  'Character Customization',
  'Towns and Cities',
  'Dungeon',
  'Immersion',
  'Resource or Utility',
  'Unknown',
];

test('exports the canonical website categories in display order', () => {
  assert.deepEqual(CATEGORIES, expectedCategories);
});

test('uses the agreed precedence for mixed and miscellaneous Nexus labels', () => {
  const expected = new Map([
    ['Dungeon and Landmass Mods', 'Dungeon'],
    ['Quests/Companions', 'Quests'],
    ['Atmospheric/Unique Locations', 'Landscape or Landmass'],
    ['Buildings', 'Towns and Cities'],
    ['Overhauls', 'Gameplay, Patch, or UI'],
    ['Magic', 'Gameplay, Patch, or UI'],
    ['Skills and Attributes', 'Gameplay, Patch, or UI'],
    ['Multiplayer Mods', 'Gameplay, Patch, or UI'],
    ['Cheats and God items', 'Gameplay, Patch, or UI'],
    ['Miscellaneous', 'Immersion'],
    ['Misc Mods', 'Immersion'],
    ['Joke Mods', 'Immersion'],
  ]);

  for (const [rawCategory, category] of expected) {
    assert.equal(normalizeNexusCategory(rawCategory), category);
  }
});

test('keeps unmapped and missing labels in the Unknown category', () => {
  assert.equal(normalizeNexusCategory(''), 'Unknown');
  assert.equal(normalizeNexusCategory('Brand New Nexus Category'), 'Unknown');
});

test('uses curated landscape overrides for generically tagged Nexus overhauls', () => {
  assert.equal(
    normalizeNexusModCategory('Overhauls', 'https://www.nexusmods.com/morrowind/mods/48240'),
    'Landscape or Landmass',
  );
  assert.equal(
    normalizeNexusModCategory('Overhauls', 'https://www.nexusmods.com/morrowind/mods/59176'),
    'Landscape or Landmass',
  );
});

test('the Modathon page displays workbook categories instead of re-deriving them from Nexus', async () => {
  const [snapshot, page] = await Promise.all([
    readFile('modathon/assets/data/modathon-mods.json', 'utf8').then(JSON.parse),
    readFile('modathon/index.html', 'utf8'),
  ]);
  const expected = new Map([
    ['OAAB Odai Plateau', 'Player Home'],
    ['Boss Overhaul - Dagoth Ur', 'NPCs and Creatures'],
    ['Tamriel Debuilt', 'Landscape or Landmass'],
    ['The Tea Shop in Old Ebonheart', 'Towns and Cities'],
    ['Waters of Morrowind', 'Landscape or Landmass'],
  ]);
  const mods = Object.values(snapshot.mods).flat();

  assert.match(
    page,
    /resolveSiteCategory\(\s*mod\.category,\s*mod\.nexusCategory,\s*mod\.url,\s*\)/,
  );
  for (const [name, category] of expected) {
    const mod = mods.find(candidate => candidate.name === name);
    assert.ok(mod, `${name} is missing from the Modathon data`);
    assert.equal(resolveSiteCategory(mod.category, mod.nexusCategory, mod.url), category);
  }
});

test('the snapshot preserves raw Nexus labels and exposes only canonical site labels', async () => {
  const snapshot = JSON.parse(await readFile('modathon/assets/data/modathon-mods.json', 'utf8'));
  const canonical = new Set(CATEGORIES);

  for (const [year, mods] of Object.entries(snapshot.mods)) {
    for (const mod of mods) {
      const category = String(mod.category || '').trim();
      assert.ok(canonical.has(category), `${year} ${mod.name} has non-canonical category ${category}`);
      if (Object.hasOwn(mod, 'nexusCategory') && mod.nexusCategory !== null) {
        assert.equal(typeof mod.nexusCategory, 'string', `${year} ${mod.name} has an invalid raw Nexus category`);
        assert.ok(mod.nexusCategory.trim(), `${year} ${mod.name} has an empty raw Nexus category`);
      }
    }
  }
});
