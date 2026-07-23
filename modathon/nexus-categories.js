(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ModathonCategories = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const CATEGORIES = Object.freeze([
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
  ]);

  const aliasesByCategory = {
    Quests: [
      'Quest Mods',
      'Quests and Adventures',
      'Quest and Faction Mods',
      'Quests/Companions',
      'Guilds/Factions',
    ],
    'Landscape or Landmass': [
      'Landscape Overhauls and New Landmasses',
      'Landmass & Landscape Mods',
      'Landscape and Landmass Mods',
      'New Locations and Landscape Additions',
      'Landmass Mods',
      'New Lands and Landscape Overhaul Mods',
      'Landmass and Landscape Mods',
      'New Lands',
      'Atmospheric/Unique Locations',
    ],
    'NPCs and Creatures': [
      'Companion, Creature and NPC Mods',
      'NPCs',
      'NPC, Companion and Creature Mods',
      'Companion & Creature Mods',
      'Companion and NPC Mods',
      'Creature and Companion Mods',
      'Companions',
      'NPC and Creature Mods',
      'Creature and NPC Mods',
      'Creatures',
      'Companion Mods',
      'Creature Mods',
    ],
    'Graphics, Animations, or Audio': [
      'Graphics Mods',
      'Graphic Replacers and Enhancers',
      'Graphics and Audio Mods',
      'Models and Textures',
      'Graphics Replacers and Graphics Mods',
      'Audio and Music Mods',
      'Graphics Replacers',
      'Graphics Mods, Replacers and Shaders',
      'Sound and Music Mods',
      'Graphics',
      'Animations',
      'Audio',
      'Audio Mods',
      'Animation Mods',
      'Music Mods',
    ],
    'Player Home': [
      'House Mods',
      'Player Homes',
      'Player Home and House Mods',
    ],
    Items: [
      'Items Mods',
      'Armor, Artifacts, Weapons, and New Item Mods',
      'New Items and Loot (General)',
      'New Items and Crafting Mods',
      'Weapon, Armor and Clothing Mods',
      'Items, Objects, and Clothes',
      'Armor and Clothing Mods',
      'Armour',
      'Items',
      'Books and Scrolls',
      'Weapons',
      'Weapons and Armour',
    ],
    'Gameplay, Patch, or UI': [
      'Gameplay Mods',
      'Gameplay',
      'Gameplay and UI Mods',
      'Gameplay Mods (MWSE)',
      'Gameplay Mods (Vanilla Morrowind - No Requirements)',
      'Gameplay Mods (Cloud Storage MWSE Addons)',
      'Patches and Bug Fixes',
      'User Interface',
      'UI Mods',
      'UI Mods and HUD Extensions',
      'Gameplay Mods (No Requirements)',
      'UI Mods (MWSE)',
      'Magic',
      'Overhauls',
      'Gameplay Mods (OpenMW)',
      'UI and HUD Mods',
      'Gameplay Mods (TES3MP)',
      'Multiplayer Mods',
      'Skills and Attributes',
      'Patches',
      'Cheats and God items',
      'Gameplay Mods (OpenMW and MWSE - Optional Versions Available)',
    ],
    'Character Customization': [
      'Races, Classes, and Birthsigns',
      'Body, Face, and Hair',
      'Character Mods (Races, Faces, Hairs)',
    ],
    'Towns and Cities': [
      'Town Mods',
      'Towns and Cities',
      'Town and City Mods',
      'Towns and Villages',
      'Buildings',
    ],
    Dungeon: [
      'Dungeon Mods',
      'Dungeon and Location Mods',
      'Dungeons and Locations',
      'Dungeon and Landmass Mods',
      'Dungeons',
    ],
    Immersion: [
      'Immersion Mods',
      'Immersion',
      'Miscellaneous',
      'Misc Mods',
      'Joke Mods',
    ],
    'Resource or Utility': [
      "Modder's Resources",
      'Modder Resources and Utilities',
      "Modder's Resources and Utilities",
      'Modder Resources',
      'Utilities',
      'Modders Resources and Tutorials',
      'Modders Resources',
    ],
    Unknown: [],
  };

  const keyOf = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const categoryByAlias = new Map();
  const categoryOverridesByModId = Object.freeze({
    48240: 'Landscape or Landmass',
    59176: 'Landscape or Landmass',
  });

  for (const category of CATEGORIES) {
    categoryByAlias.set(keyOf(category), category);
    for (const alias of aliasesByCategory[category]) {
      const key = keyOf(alias);
      const existing = categoryByAlias.get(key);
      if (existing && existing !== category) {
        throw new Error(`Nexus category alias "${alias}" maps to both "${existing}" and "${category}"`);
      }
      categoryByAlias.set(key, category);
    }
  }

  function normalizeNexusCategory(rawCategory) {
    const key = keyOf(rawCategory);
    return categoryByAlias.get(key) || 'Unknown';
  }

  function normalizeNexusModCategory(rawCategory, modUrl) {
    const modId = String(modUrl || '').match(/\/mods\/(\d+)(?:[/?#]|$)/i)?.[1];
    return categoryOverridesByModId[modId] || normalizeNexusCategory(rawCategory);
  }

  return Object.freeze({
    CATEGORIES,
    normalizeNexusCategory,
    normalizeNexusModCategory,
  });
}));
