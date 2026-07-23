import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import categoryApi from '../modathon/nexus-categories.js';

const {
  CATEGORIES,
  normalizeNexusCategory,
  normalizeNexusModCategory,
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

test('the snapshot preserves raw labels and exposes only normalized labels', async () => {
  const snapshot = JSON.parse(await readFile('modathon/assets/data/nexus-stats.json', 'utf8'));
  const canonical = new Set(CATEGORIES);

  for (const [year, mods] of Object.entries(snapshot.mods)) {
    for (const mod of mods) {
      const rawCategory = String(mod.nexusCategory || '').trim();
      const category = String(mod.category || '').trim();
      assert.ok(canonical.has(category), `${year} ${mod.name} has non-canonical category ${category}`);
      if (rawCategory) {
        assert.equal(category, normalizeNexusModCategory(rawCategory, mod.url), `${year} ${mod.name} is normalized incorrectly`);
      } else {
        assert.equal(category, 'Unknown', `${year} ${mod.name} has no source category but is not Unknown`);
      }
    }
  }
});
