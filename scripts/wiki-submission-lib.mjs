import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import matter from 'gray-matter';
import yaml from 'js-yaml';

import { buildCanonicalEventLabels } from './sync-wiki-event-metadata.mjs';
import {
  contributionRecordForPayload,
  wikiContributionRepositoryPath,
  writeWikiContributionRecord,
} from './wiki-contribution-data.mjs';
import { sha256Hex } from './wiki-submission-codec.mjs';
import {
  REPO_ROOT,
  loadControlledVocabularies,
  loadWikiLocations,
  loadWikiMods,
  serializeWikiMarkdown,
} from './wiki-content-lib.mjs';
import {
  articleBodyFromGeneratedMarkdown,
  isSafeLocationTargetPath,
  isSafeModTargetPath,
  validateSubmissionPayload,
} from './wiki-submission-schema.mjs';

const normalized = value => String(value ?? '').trim().toLocaleLowerCase('en-US');

function deleteWhenBlank(record, key, value) {
  if (typeof value === 'string' && value.trim()) record[key] = value.trim();
  else delete record[key];
}

function parseWikiSource(source, label) {
  try {
    return matter(source, { engines: { yaml: value => yaml.load(value) } });
  } catch (error) {
    throw new Error(`${label} has invalid YAML frontmatter: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function pathInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative);
}

export function resolveRepositoryTarget(repoRoot, repositoryPath, kind) {
  const valid = kind === 'edit-location'
    ? isSafeLocationTargetPath(repositoryPath)
    : isSafeModTargetPath(repositoryPath);
  if (!valid) throw new Error('The submission target is not a permitted wiki article path.');
  const expectedDirectory = path.join(repoRoot, 'wiki', 'content', kind === 'edit-location' ? 'locations' : 'mods');
  const target = path.resolve(repoRoot, ...repositoryPath.split('/'));
  if (!pathInside(expectedDirectory, target)) throw new Error('The resolved submission target escapes the permitted wiki directory.');
  return target;
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadSubmissionVocabularies() {
  const [controlled, events, mods] = await Promise.all([
    loadControlledVocabularies(),
    buildCanonicalEventLabels(),
    loadWikiMods(),
  ]);
  return {
    categories: controlled.properties.categories,
    events,
    mapLocations: controlled.map_locations,
    modSlugs: mods.map(mod => mod.slug),
  };
}

function requireControlledValues(values, controlled, label, legacy = []) {
  const allowed = new Set([...controlled, ...legacy].map(normalized));
  for (const value of values) {
    if (!allowed.has(normalized(value))) throw new Error(`${label} contains an uncontrolled value: ${value}`);
  }
}

function validateModVocabularies(payload, vocabularies, currentFrontmatter = null) {
  const { changes } = payload;
  requireControlledValues(changes.categories, vocabularies.categories, 'categories');
  const legacyEvents = payload.kind === 'edit-mod' && Array.isArray(currentFrontmatter?.events)
    ? currentFrontmatter.events.filter(value => typeof value === 'string')
    : [];
  requireControlledValues(changes.events, vocabularies.events, 'events', legacyEvents);
  const existingLocations = new Set(vocabularies.mapLocations.map(normalized));
  for (const location of changes.new_locations ?? []) {
    if (existingLocations.has(normalized(location.cell))) {
      throw new Error(`new_locations contains an existing wiki map location: ${location.cell}`);
    }
  }
  const allowedMapLocations = [
    ...vocabularies.mapLocations,
    ...(changes.new_locations ?? []).map(location => location.cell),
  ];
  requireControlledValues(changes.map_locations, allowedMapLocations, 'map_locations');
  const knownModSlugs = new Set([
    ...(vocabularies.modSlugs ?? []),
    ...(payload.kind === 'new-mod' ? [changes.slug] : []),
  ].map(normalized));
  const validateRelations = (relations, label) => {
    for (const [index, relation] of (relations ?? []).entries()) {
      if (!knownModSlugs.has(normalized(relation.target))) {
        throw new Error(`${label}[${index}] targets a nonexistent wiki mod: ${relation.target}`);
      }
    }
  };
  validateRelations(changes.relations, 'relations');
  for (const [index, component] of (changes.components ?? []).entries()) {
    requireControlledValues(
      component.map_locations,
      allowedMapLocations,
      `components[${index}].map_locations`,
    );
    validateRelations(component.relations, `components[${index}].relations`);
  }
  const hasComponentMapCoverage = (changes.components ?? []).some(component =>
    component.map_locations.length > 0 || component.map_exterior_edits.length > 0);
  if (changes.map_enabled
      && changes.map_locations.length === 0
      && changes.map_exterior_edits.length === 0
      && !hasComponentMapCoverage) {
    throw new Error('A map-enabled mod must contain at least one controlled map location or exterior cell.');
  }
}

function newModFrontmatter(changes) {
  const result = {
    title: changes.title,
    authors: changes.authors,
    url: changes.url,
    categories: changes.categories,
    map_enabled: changes.map_enabled,
    map_locations: changes.map_locations,
    map_exterior_edits: changes.map_exterior_edits,
    draft: false,
    events: changes.events,
  };
  if (changes.picture_url) result.picture_url = changes.picture_url;
  if (changes.showcase_url) result.showcase_url = changes.showcase_url;
  if (changes.relations?.length) result.relations = changes.relations;
  if (changes.components?.length) result.components = changes.components;
  return result;
}

function applyModChanges(current, changes) {
  const next = {
    ...current,
    title: changes.title,
    authors: changes.authors,
    categories: changes.categories,
    events: changes.events,
    map_enabled: changes.map_enabled,
    map_locations: changes.map_locations,
    map_exterior_edits: changes.map_exterior_edits,
  };
  delete next.map_exterior_cells;
  next.url = changes.url;
  delete next.description;
  deleteWhenBlank(next, 'picture_url', changes.picture_url);
  deleteWhenBlank(next, 'showcase_url', changes.showcase_url);
  if (Object.hasOwn(changes, 'relations')) {
    if (changes.relations.length > 0) next.relations = changes.relations;
    else delete next.relations;
  }
  if (Object.hasOwn(changes, 'components')) {
    if (changes.components.length > 0) next.components = changes.components;
    else delete next.components;
  }
  return next;
}

function applyLocationChanges(current, changes) {
  const originals = current.additional_entrances === undefined ? [] : current.additional_entrances;
  if (!Array.isArray(originals)) throw new Error('The current location has invalid additional_entrances metadata.');
  const additional_entrances = changes.additional_entrances.map(entrance => {
    const original = originals[entrance.sourceIndex];
    if (original === null || typeof original !== 'object' || Array.isArray(original)) {
      throw new Error(`Entrance source index ${entrance.sourceIndex} does not exist in the current file.`);
    }
    const next = { ...original, x: entrance.x, y: entrance.y };
    deleteWhenBlank(next, 'region', entrance.region);
    return next;
  });
  const next = {
    ...current,
    title: changes.cell,
    cell: changes.cell,
    x: changes.x,
    y: changes.y,
  };
  deleteWhenBlank(next, 'region', changes.region);
  deleteWhenBlank(next, 'uesp_wiki', changes.uesp_wiki);
  if (additional_entrances.length > 0) next.additional_entrances = additional_entrances;
  else delete next.additional_entrances;
  return next;
}

export function publicPullRequestMetadata(payload) {
  const title = payload.kind === 'new-mod'
    ? `Wiki: add ${payload.changes.title}`
    : `Wiki: update ${payload.changes.title ?? payload.changes.cell}`;
  return {
    title,
    body: 'Submitted through darkelfmodding.com. Review the wiki page and public contributor record diffs before merging.',
  };
}

async function nextSubmissionMapId(submissionId, index, usedIds) {
  const digest = await sha256Hex(`${submissionId}:map-location:${index}`);
  let candidate = 1_000_000_000 + (Number.parseInt(digest.slice(0, 8), 16) % 1_000_000_000);
  while (usedIds.has(candidate)) {
    candidate += 1;
    if (candidate >= 2_000_000_000) candidate = 1_000_000_000;
  }
  usedIds.add(candidate);
  return candidate;
}

async function planNewLocationFiles(payload, repoRoot) {
  if ((payload.changes.new_locations ?? []).length === 0) return [];
  const locationsDirectory = path.join(repoRoot, 'wiki', 'content', 'locations');
  const existingLocations = await loadWikiLocations(locationsDirectory);
  const usedIds = new Set();
  for (const location of existingLocations) {
    const frontmatter = location.frontmatter ?? {};
    if (Number.isInteger(frontmatter.map_id)) usedIds.add(frontmatter.map_id);
    for (const entrance of Array.isArray(frontmatter.additional_entrances)
      ? frontmatter.additional_entrances
      : []) {
      if (Number.isInteger(entrance?.map_id)) usedIds.add(entrance.map_id);
    }
  }
  const modSlug = payload.kind === 'new-mod'
    ? payload.changes.slug
    : path.posix.basename(payload.target.path, '.md');
  let mapIdIndex = 0;
  const plans = [];
  for (const location of payload.changes.new_locations ?? []) {
    const repositoryPath = `wiki/content/locations/${location.slug}.md`;
    const filePath = resolveRepositoryTarget(repoRoot, repositoryPath, 'edit-location');
    if (await exists(filePath)) {
      throw new Error(`A wiki location with the proposed filename already exists: ${location.slug}.md`);
    }
    const frontmatter = {
      title: location.cell,
      map_id: await nextSubmissionMapId(payload.submissionId, mapIdIndex++, usedIds),
      cell: location.cell,
      region: location.region,
      x: location.x,
      y: location.y,
      icon: 100,
      level: 16.5,
      mod_added: true,
      mod_added_by: modSlug,
      draft: false,
    };
    if (location.additional_entrances.length > 0) {
      frontmatter.additional_entrances = [];
      for (const entrance of location.additional_entrances) {
        const generated = {
          map_id: await nextSubmissionMapId(payload.submissionId, mapIdIndex++, usedIds),
          x: entrance.x,
          y: entrance.y,
          level: 16.5,
        };
        if (entrance.region) generated.region = entrance.region;
        frontmatter.additional_entrances.push(generated);
      }
    }
    plans.push({
      repositoryPath,
      filePath,
      source: serializeWikiMarkdown(frontmatter, `${location.description.trim()}\n`),
    });
  }
  return plans;
}

export async function applyWikiSubmission(input, {
  repoRoot = REPO_ROOT,
  vocabularies,
} = {}) {
  const payload = validateSubmissionPayload(input);
  const controlled = vocabularies ?? await loadSubmissionVocabularies();
  const body = articleBodyFromGeneratedMarkdown(payload.generatedMarkdown);
  const contributionPath = wikiContributionRepositoryPath(payload.submissionId);
  if (await exists(path.join(repoRoot, ...contributionPath.split('/')))) {
    throw new Error('A wiki contribution record with this submission identifier already exists.');
  }

  if (payload.kind === 'new-mod') {
    validateModVocabularies(payload, controlled);
    const repositoryPath = `wiki/content/mods/${payload.changes.slug}.md`;
    const filePath = resolveRepositoryTarget(repoRoot, repositoryPath, 'new-mod');
    if (await exists(filePath)) throw new Error('A wiki mod with the proposed filename already exists.');
    const locationPlans = await planNewLocationFiles(payload, repoRoot);
    const source = serializeWikiMarkdown(newModFrontmatter(payload.changes), body);
    await writeFile(filePath, source, 'utf8');
    for (const location of locationPlans) {
      await writeFile(location.filePath, location.source, 'utf8');
    }
    await writeWikiContributionRecord(
      contributionRecordForPayload(payload, repositoryPath),
      { repoRoot },
    );
    return {
      repositoryPath,
      contributionPath,
      repositoryPaths: [
        repositoryPath,
        ...locationPlans.map(location => location.repositoryPath),
        contributionPath,
      ],
      submissionId: payload.submissionId,
      ...publicPullRequestMetadata(payload),
    };
  }

  const filePath = resolveRepositoryTarget(repoRoot, payload.target.path, payload.kind);
  if (!await exists(filePath)) throw new Error('The target wiki article does not exist.');
  const currentBytes = await readFile(filePath);
  if (await sha256Hex(currentBytes) !== payload.target.baseSha256) {
    throw new Error('The target wiki article changed after this edit was started (stale SHA-256).');
  }
  const current = parseWikiSource(currentBytes.toString('utf8'), payload.target.path);
  const currentFrontmatter = current.data && typeof current.data === 'object' && !Array.isArray(current.data)
    ? current.data
    : {};
  let frontmatter;
  if (payload.kind === 'edit-mod') {
    validateModVocabularies(payload, controlled, currentFrontmatter);
    frontmatter = applyModChanges(currentFrontmatter, payload.changes);
  } else {
    frontmatter = applyLocationChanges(currentFrontmatter, payload.changes);
  }
  const locationPlans = payload.kind === 'edit-mod'
    ? await planNewLocationFiles(payload, repoRoot)
    : [];
  await writeFile(filePath, serializeWikiMarkdown(frontmatter, body), 'utf8');
  for (const location of locationPlans) {
    await writeFile(location.filePath, location.source, 'utf8');
  }
  await writeWikiContributionRecord(
    contributionRecordForPayload(payload, payload.target.path),
    { repoRoot },
  );
  return {
    repositoryPath: payload.target.path,
    contributionPath,
    repositoryPaths: [
      payload.target.path,
      ...locationPlans.map(location => location.repositoryPath),
      contributionPath,
    ],
    submissionId: payload.submissionId,
    ...publicPullRequestMetadata(payload),
  };
}
