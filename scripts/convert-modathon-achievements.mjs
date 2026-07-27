#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const [, , requestedSourceDir, requestedDataDir = 'content/modathon/achievements'] = process.argv;

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
  const yearDir = path.join(dataDir, String(year));
  const [html, entries] = await Promise.all([
    readFile(sourcePath, 'utf8'),
    readdir(yearDir, { withFileTypes: true }),
  ]);
  const fileNames = entries
    .filter(entry => entry.isFile() && path.extname(entry.name) === '.json')
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right));
  const achievementFiles = await Promise.all(fileNames.map(async (fileName) => {
    const filePath = path.join(yearDir, fileName);
    return {
      filePath,
      achievement: JSON.parse(await readFile(filePath, 'utf8')),
    };
  }));
  const achievements = achievementFiles.map(record => record.achievement);
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
  const changedFiles = [];
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
      changedFiles.push(achievementFiles[index]);
      changed += 1;
    }
  });

  await Promise.all(changedFiles.map(({ filePath, achievement }) => (
    writeFile(filePath, `${JSON.stringify(achievement, null, 2)}\n`)
  )));
  return { year, changed, total: achievements.length };
}

const results = [];
for (const year of years) {
  results.push(await updateYear(year));
}

for (const result of results) {
  console.log(`${result.year}: updated ${result.changed} of ${result.total} achievements`);
}
