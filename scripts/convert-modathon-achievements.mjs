#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const [, , requestedSourceDir, requestedDataDir = 'modathon/assets/data'] = process.argv;

if (!requestedSourceDir) {
  console.error('Usage: node scripts/convert-modathon-achievements.mjs <html-export-directory> [data-directory]');
  process.exit(1);
}

const sourceDir = path.resolve(requestedSourceDir);
const dataDir = path.resolve(requestedDataDir);
const years = Array.from({ length: 9 }, (_, index) => 2018 + index);

function decodeHtml(value) {
  const named = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
    ndash: '–',
    mdash: '—',
    hellip: '…',
    rsquo: '’',
    lsquo: '‘',
    rdquo: '”',
    ldquo: '“',
  };

  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (entity, key) => {
    if (key[0] === '#') {
      const hexadecimal = key[1].toLowerCase() === 'x';
      const number = Number.parseInt(key.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isFinite(number) ? String.fromCodePoint(number) : entity;
    }
    return named[key.toLowerCase()] ?? entity;
  });
}

function cleanText(fragment) {
  return decodeHtml(fragment
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRows(html) {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((rowMatch) => [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(cellMatch => cleanText(cellMatch[1]))
      // Google Sheets exports prepend a numbered row-header cell.
      .slice(1))
    .filter(cells => cells.some(Boolean));
}

function splitUnlockers(value) {
  if (!value) return [];

  // This historical display name contains a comma, which otherwise looks like
  // the delimiter used between achievement unlockers.
  const names = value
    .replaceAll('Come, Besnier', 'Come Besnier')
    .split(/\s*,\s*/)
    .map(name => name.trim())
    .filter(Boolean);
  const seen = new Set();
  return names.filter((name) => {
    const key = name.toLocaleLowerCase('en-US');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unlockerColumn(year) {
  return year <= 2020 ? 4 : 3;
}

async function updateYear(year) {
  const sourcePath = path.join(sourceDir, `Modathon ${year}.html`);
  const dataPath = path.join(dataDir, `${year}-achievements.json`);
  const [html, rawData] = await Promise.all([
    readFile(sourcePath, 'utf8'),
    readFile(dataPath, 'utf8'),
  ]);
  const data = JSON.parse(rawData);
  const achievements = data.achievements || [];
  const rows = parseRows(html);
  const headings = rows[1] || [];

  if (headings[0] !== 'Achievement Name' || headings[1] !== 'Requirement') {
    throw new Error(`${sourcePath} does not look like a Modathon achievement export`);
  }

  const achievementRows = rows.slice(2, 2 + achievements.length);
  if (achievementRows.length !== achievements.length) {
    throw new Error(
      `${sourcePath} contains ${achievementRows.length} achievement rows; expected ${achievements.length}`,
    );
  }

  let changed = 0;
  achievements.forEach((achievement, index) => {
    const row = achievementRows[index];
    if (row[0] !== achievement.name || row[1] !== achievement.requirement) {
      throw new Error(
        `${year} row ${index + 2} no longer matches ${achievement.id}: `
        + `${JSON.stringify([row[0], row[1]])}`,
      );
    }

    const unlockedBy = splitUnlockers(row[unlockerColumn(year)]);
    if (JSON.stringify(unlockedBy) !== JSON.stringify(achievement.unlockedBy || [])) {
      achievement.unlockedBy = unlockedBy;
      achievement.unlockedCount = unlockedBy.length;
      changed += 1;
    }
  });

  await writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`);
  return { year, changed, total: achievements.length };
}

const results = [];
for (const year of years) {
  results.push(await updateYear(year));
}

for (const result of results) {
  console.log(`${result.year}: updated ${result.changed} of ${result.total} achievements`);
}
