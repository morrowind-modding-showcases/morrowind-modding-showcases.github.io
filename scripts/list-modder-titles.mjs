#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const dataDir = path.join(rootDir, 'modathon', 'assets', 'data');
const ModathonCategories = require(path.join(rootDir, 'modathon', 'nexus-categories.js'));
const ModathonTitles = require(path.join(rootDir, 'modathon', 'title-system.js'));

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const keyOf = name => String(name || '').trim().toLowerCase();
const normalizeAuthor = name => String(name || '').toLowerCase().replace(/0/g, 'o').replace(/[^a-z0-9]+/g, ' ').trim();

function aliasesFor(modder) {
  const displayName = modder.name.replace(/\s*\(.*$/, '').replace(/\s+-\s+new profile$/i, '').trim();
  const profileName = (modder.url || '').match(/\/profile\/([^?/#]+)/i)?.[1] || '';
  return [...new Set([modder.name, displayName, profileName].map(normalizeAuthor).filter(Boolean))];
}

function matchesAuthor(author, aliases) {
  const normalized = normalizeAuthor(author);
  const padded = ' ' + normalized + ' ';
  const compact = normalized.replace(/\s/g, '');
  return aliases.some(alias => {
    const compactAlias = alias.replace(/\s/g, '');
    return padded.includes(' ' + alias + ' ') || (compactAlias.length >= 6 && compact.includes(compactAlias));
  });
}

function buildModders() {
  const canonical = readJson(path.join(dataDir, 'modders.json')).modders || [];
  const nexusStats = readJson(path.join(dataDir, 'nexus-stats.json'));
  const titleConfig = readJson(path.join(dataDir, 'titles.json'));
  const titleErrors = ModathonTitles.validateConfig(titleConfig);
  if (titleErrors.length) throw new Error('Invalid title data:\n- ' + titleErrors.join('\n- '));

  const byKey = new Map();
  canonical.forEach(modder => byKey.set(keyOf(modder.name), {
    name: modder.name,
    url: modder.url,
    authorAliases: aliasesFor(modder),
    ach: [],
    mods: [],
  }));

  const achievementFiles = fs.readdirSync(dataDir).filter(file => /^\d{4}-achievements\.json$/.test(file)).sort();
  for (const file of achievementFiles) {
    const yearData = readJson(path.join(dataDir, file));
    const year = Number(yearData.event?.year || file.slice(0, 4));
    for (const achievement of yearData.achievements || []) {
      for (const name of achievement.unlockedBy || []) {
        const key = keyOf(name);
        if (!byKey.has(key)) {
          byKey.set(key, { name, url: null, authorAliases: aliasesFor({ name, url: null }), ach: [], mods: [] });
        }
        byKey.get(key).ach.push({ year, ...achievement });
      }
    }
  }

  for (const [yearText, mods] of Object.entries(nexusStats.mods || {})) {
    const year = Number(yearText);
    for (const mod of mods || []) {
      const category = ModathonCategories.normalizeNexusCategory(mod.nexusCategory ?? mod.category);
      const entry = { year, ...mod, category };
      const authors = Array.isArray(mod.authors) ? mod.authors : [mod.authors];
      for (const record of byKey.values()) {
        if (authors.some(author => matchesAuthor(author, record.authorAliases))) record.mods.push(entry);
      }
    }
  }

  return { modders: [...byKey.values()], titleConfig };
}

function auditRecord(record, titleConfig) {
  const evaluation = ModathonTitles.evaluate(titleConfig, record);
  return {
    name: record.name,
    assignedTitle: evaluation.selected?.name || null,
    possibleTitles: evaluation.eligible.map(title => ({
      name: title.name,
      priority: title.priority,
    })),
  };
}

function printText(results, titleConfig) {
  const titledCount = results.filter(result => result.assignedTitle).length;
  console.log('MODDER TITLE AUDIT');
  console.log('Higher priority means rarer; the highest-priority eligible title is assigned.');
  console.log(`Known modders: ${results.length} | assigned: ${titledCount} | no eligible title: ${results.length - titledCount}`);
  console.log('');
  console.log('MODDERS');
  console.log('=======');
  console.log('');

  for (const result of results) {
    console.log(result.name);
    console.log('  assigned: ' + (result.assignedTitle || 'none'));
    if (!result.possibleTitles.length) {
      console.log('  possible: none');
      console.log('');
      continue;
    }
    console.log(`  possible (${result.possibleTitles.length}):`);
    for (const title of result.possibleTitles) {
      console.log(`    - ${title.name} [priority ${title.priority}]`);
    }
    console.log('');
  }

  console.log('TITLE UNLOCKERS');
  console.log('===============');
  console.log('A modder appears under every title they qualify for, even when a rarer title is assigned.');
  console.log('');

  const titlesByRarity = [...titleConfig.titles].sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
  for (const title of titlesByRarity) {
    const unlockers = results
      .filter(result => result.possibleTitles.some(possible => possible.name === title.name))
      .map(result => result.name);
    console.log(`${title.name} [priority ${title.priority}]`);
    console.log(`  unlocked by (${unlockers.length}):`);
    if (unlockers.length === 0) console.log('    none');
    else unlockers.forEach(name => console.log('    - ' + name));
    console.log('');
  }
}

const { modders, titleConfig } = buildModders();
const results = modders.map(record => auditRecord(record, titleConfig)).sort((a, b) => a.name.localeCompare(b.name));

if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 2));
else printText(results, titleConfig);
