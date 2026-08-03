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

test('yearly archive derives its heading and newest-first galleries from the available years', async () => {
  const { Component } = await dcComponentFrom('../modathon/index.html');
  const component = new Component();
  const years = Array.from({ length: 12 }, (_, index) => 2015 + index);
  component.db = {
    years: [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026],
    allYears: years,
    byKey: new Map(),
    yearData: {},
    modsByYear: {},
    winnerYears: [],
    winnersByYear: new Map(),
    participantsByYear: {},
    unlockEvents: 0,
    totalDefined: 0,
    totalMods: 0,
    totalDownloads: 0,
    hasNexus: false,
  };
  component.state.loading = false;
  component.state.view = 'home';
  component.heroBannerVals = () => ({});
  component.countdownVals = () => ({});
  component.reelVals = () => ({});
  component.winnerVals = () => ({});

  let values = component.renderVals();
  assert.equal(values.heroTitle, 'Twelve years of the May Modathon');
  assert.deepEqual(
    Array.from(values.yearTiles, tile => tile.year),
    years.toReversed(),
  );
  assert.deepEqual(
    Array.from(component.availableHeroBanners(), banner => banner.year),
    years.toReversed(),
  );

  component.db.allYears.push(2027);
  values = component.renderVals();
  assert.equal(values.heroTitle, 'Thirteen years of the May Modathon');
  assert.equal(values.yearTiles[0].year, 2027);
  assert.equal(component.availableHeroBanners()[0].year, 2027);
});

test('published Modathon references derive participant totals from the current records', async () => {
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

  const canonicalAuthorsByYear = ({ directOnly }) => Object.fromEntries(
    Object.entries(stats.mods).map(([year, mods]) => {
      const authors = new Set();
      for (const mod of mods) {
        for (const author of mod.authors) {
          if (directOnly && author.contributed === false) continue;
          const authorKey = component.normalizeAuthor(author);
          if (authorKey) authors.add(canonicalByAlias.get(authorKey) || authorKey);
        }
      }
      return [year, authors];
    }),
  );
  const creditedAuthorsByYear = canonicalAuthorsByYear({ directOnly: false });
  const directAuthorsByYear = canonicalAuthorsByYear({ directOnly: true });
  const countsFrom = authorsByYear => Object.fromEntries(
    Object.entries(authorsByYear).map(([year, authors]) => [year, authors.size]),
  );

  for (const [year, directAuthors] of Object.entries(directAuthorsByYear)) {
    const creditedAuthors = creditedAuthorsByYear[year];
    for (const author of directAuthors) {
      assert.equal(
        creditedAuthors.has(author),
        true,
        `${year} direct participant ${author} must also remain in credited authors`,
      );
    }
  }
  assert.deepEqual(
    { ...component.releasedModderCountsByYear(stats.mods, canonicalByAlias) },
    countsFrom(directAuthorsByYear),
  );
  assert.match(
    html,
    /const participantsByYear = this\.releasedModderCountsByYear\(modsByYear, canonicalByAlias\)/,
  );
  assert.doesNotMatch(html, /participantsByYear\[year\] = vals\.length/);
});
