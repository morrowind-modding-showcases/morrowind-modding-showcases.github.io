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
    assignedTitle: evaluation.displayName || null,
    assignedBaseTitle: evaluation.selected?.name || null,
    qualifiers: evaluation.qualifiers.map(qualifier => ({
      axisId: qualifier.axisId,
      name: qualifier.name,
    })),
    possibleTitles: evaluation.eligible.map(title => ({
      name: title.name,
      priority: title.priority,
    })),
  };
}

function printModders(results) {
  const titledCount = results.filter(result => result.assignedTitle).length;
  console.log('MODDER TITLE POSSIBILITIES');
  console.log('Higher priority means rarer; the highest-priority eligible title is assigned.');
  console.log(`Known modders: ${results.length} | assigned: ${titledCount} | no eligible title: ${results.length - titledCount}`);
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
}

function printAssignments(results, titleConfig) {
  const titledCount = results.filter(result => result.assignedTitle).length;
  const titlesByRarity = [...titleConfig.titles].sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
  const baseAssignmentGroups = titlesByRarity.map(title => ({
    title,
    assignees: results
      .filter(result => result.assignedBaseTitle === title.name)
      .map(result => result.name),
  }));
  const assignedBaseTitleCount = baseAssignmentGroups.filter(group => group.assignees.length > 0).length;
  const unassignedBaseGroups = baseAssignmentGroups.filter(group => group.assignees.length === 0);
  const priorityByBaseTitle = new Map(titleConfig.titles.map(title => [title.name, title.priority]));
  const combinations = new Map();
  for (const result of results.filter(result => result.assignedTitle)) {
    if (!combinations.has(result.assignedTitle)) combinations.set(result.assignedTitle, {
      name: result.assignedTitle,
      priority: priorityByBaseTitle.get(result.assignedBaseTitle) || 0,
      assignees: [],
    });
    combinations.get(result.assignedTitle).assignees.push(result.name);
  }
  const assignmentGroups = [...combinations.values()]
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
  const usedQualifierNames = new Set(results.flatMap(result => result.qualifiers.map(qualifier => qualifier.name)));
  const unassignedQualifiers = (titleConfig.qualifierAxes || []).flatMap(axis => (axis.qualifiers || [])
    .filter(qualifier => !usedQualifierNames.has(qualifier.name))
    .map(qualifier => ({ axis: axis.label, qualifier })));

  console.log('ASSIGNED MODDER TITLES');
  console.log('Each modder appears once beneath their rarest base title and qualifying title parts.');
  console.log(`Assigned modders: ${titledCount} | no eligible title: ${results.length - titledCount}`);
  console.log(`Distinct title combinations: ${assignmentGroups.length} | duplicate assignments: ${titledCount - assignmentGroups.length}`);
  console.log(`Assigned base titles: ${assignedBaseTitleCount} | unassigned base titles: ${unassignedBaseGroups.length}`);
  console.log('');

  for (const { name, priority, assignees } of assignmentGroups) {
    console.log(`${name} [base priority ${priority}]`);
    console.log(`  assigned to (${assignees.length}):`);
    assignees.forEach(name => console.log('    - ' + name));
    console.log('');
  }

  console.log('UNASSIGNED BASE TITLES');
  console.log('No modder was assigned any of these base titles.');
  console.log(`Unassigned base titles (${unassignedBaseGroups.length}):`);
  if (unassignedBaseGroups.length === 0) console.log('  none');
  else unassignedBaseGroups.forEach(({ title }) => console.log(`  - ${title.name} [priority ${title.priority}]`));
  console.log('');

  console.log('UNASSIGNED QUALIFIERS');
  console.log('No modder matched any of these title parts.');
  console.log(`Unassigned qualifiers (${unassignedQualifiers.length}):`);
  if (unassignedQualifiers.length === 0) console.log('  none');
  else unassignedQualifiers.forEach(({ axis, qualifier }) => console.log(`  - ${qualifier.name} [${axis}]`));
}

const { modders, titleConfig } = buildModders();
const results = modders.map(record => auditRecord(record, titleConfig)).sort((a, b) => a.name.localeCompare(b.name));

const reportFlag = process.argv.indexOf('--report');
const report = reportFlag >= 0 ? process.argv[reportFlag + 1] : 'modders';
if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 2));
else if (report === 'modders') printModders(results);
else if (report === 'assignments') printAssignments(results, titleConfig);
else throw new Error('Unknown report type: ' + report);
