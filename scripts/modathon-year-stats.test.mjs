import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { dcComponentFrom } from './test-helpers.mjs';

const require = createRequire(import.meta.url);
const MmsModders = require('../assets/modder-registry.js');

test('yearly modder totals count unique release authors instead of achievement unlockers', async () => {
  const { Component } = await dcComponentFrom('../modathon/index.html');
  const component = new Component();
  const aliases = new Map([
    ['alice', 'alice'],
    ['old alice', 'alice'],
    ['bob', 'bob'],
  ]);

  const counts = component.releasedModderCountsByYear({
    2017: [
      { authors: [{ name: 'Alice', contributed: true }] },
      {
        authors: [
          { name: 'Old Alice', contributed: true },
          { name: 'Bob', contributed: false },
        ],
      },
      { authors: [{ name: 'Alice', contributed: true }] },
    ],
    2018: [
      { authors: [{ name: 'Bob', contributed: true }] },
    ],
  }, aliases);

  assert.deepEqual({ ...counts }, { 2017: 1, 2018: 1 });
});

test('published Modathon year totals match the unique canonical authors on releases', async () => {
  const { Component, html } = await dcComponentFrom('../modathon/index.html');
  const component = new Component();
  const [stats, registry] = await Promise.all([
    readFile(new URL('../modathon/assets/data/modathon-mods.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../assets/data/modders.json', import.meta.url), 'utf8').then(JSON.parse),
  ]);
  const profiles = MmsModders.asModathonProfiles(
    registry,
    MmsModders.inferModathonReferences(stats, registry),
  );
  const canonicalByAlias = new Map();
  const ambiguousAliases = new Set();

  for (const profile of profiles) {
    const canonicalKey = profile.name.trim().toLowerCase();
    const displayName = profile.name.replace(/\s*\(.*$/, '').replace(/\s+-\s+new profile$/i, '').trim();
    const profileName = (profile.url || '').match(/\/profile\/([^?/#]+)/i)?.[1] || '';
    const aliases = [...new Set([
      profile.name,
      displayName,
      profileName,
      ...(profile.aliases || []),
    ].map(alias => component.normalizeAuthor(alias)).filter(Boolean))];

    for (const alias of aliases) {
      if (ambiguousAliases.has(alias)) continue;
      const existingKey = canonicalByAlias.get(alias);
      if (existingKey && existingKey !== canonicalKey) {
        canonicalByAlias.delete(alias);
        ambiguousAliases.add(alias);
      } else {
        canonicalByAlias.set(alias, canonicalKey);
      }
    }
  }

  const counts = component.releasedModderCountsByYear(stats.mods, canonicalByAlias);

  assert.deepEqual({ ...counts }, {
    2015: 14,
    2016: 21,
    2017: 25,
    2018: 47,
    2019: 84,
    2020: 81,
    2021: 110,
    2022: 118,
    2023: 95,
    2024: 98,
    2025: 117,
    2026: 117,
  });
  assert.match(
    html,
    /const participantsByYear = this\.releasedModderCountsByYear\(modsByYear, canonicalByAlias\)/,
  );
  assert.doesNotMatch(html, /participantsByYear\[year\] = vals\.length/);
});
