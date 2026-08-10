import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import matter from 'gray-matter';
import yaml from 'js-yaml';

import { buildCanonicalEventLabels } from './sync-wiki-event-metadata.mjs';
import { sha256Hex } from './wiki-submission-codec.mjs';
import {
  REPO_ROOT,
  loadControlledVocabularies,
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
  const [controlled, events] = await Promise.all([
    loadControlledVocabularies(),
    buildCanonicalEventLabels(),
  ]);
  return {
    categories: controlled.properties.categories,
    events,
    mapLocations: controlled.map_locations,
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
  requireControlledValues(changes.map_locations, vocabularies.mapLocations, 'map_locations');
  if (changes.map_enabled
      && changes.map_locations.length === 0
      && changes.map_exterior_cells.length === 0) {
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
    map_exterior_cells: changes.map_exterior_cells,
    draft: false,
    events: changes.events,
  };
  if (changes.picture_url) result.picture_url = changes.picture_url;
  if (changes.showcase_url) result.showcase_url = changes.showcase_url;
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
    map_exterior_cells: changes.map_exterior_cells,
  };
  next.url = changes.url;
  delete next.description;
  deleteWhenBlank(next, 'picture_url', changes.picture_url);
  deleteWhenBlank(next, 'showcase_url', changes.showcase_url);
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
    body: 'Created from an anonymous wiki contribution submitted through darkelfmodding.com. Review the generated file diff before merging.',
  };
}

export async function applyWikiSubmission(input, {
  repoRoot = REPO_ROOT,
  vocabularies,
} = {}) {
  const payload = validateSubmissionPayload(input);
  const controlled = vocabularies ?? await loadSubmissionVocabularies();
  const body = articleBodyFromGeneratedMarkdown(payload.generatedMarkdown);

  if (payload.kind === 'new-mod') {
    validateModVocabularies(payload, controlled);
    const repositoryPath = `wiki/content/mods/${payload.changes.slug}.md`;
    const filePath = resolveRepositoryTarget(repoRoot, repositoryPath, 'new-mod');
    if (await exists(filePath)) throw new Error('A wiki mod with the proposed filename already exists.');
    const source = serializeWikiMarkdown(newModFrontmatter(payload.changes), body);
    await writeFile(filePath, source, 'utf8');
    return {
      repositoryPath,
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
  await writeFile(filePath, serializeWikiMarkdown(frontmatter, body), 'utf8');
  return {
    repositoryPath: payload.target.path,
    submissionId: payload.submissionId,
    ...publicPullRequestMetadata(payload),
  };
}
