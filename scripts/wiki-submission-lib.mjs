import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import matter from 'gray-matter';
import yaml from 'js-yaml';

import { buildCanonicalEventLabels } from './sync-wiki-event-metadata.mjs';
import { decodeMachinePayload, sha256Hex } from './wiki-submission-codec.mjs';
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

const QUEUE_OWNER = 'morrowind-modding-showcases';
const QUEUE_REPOSITORY = 'wiki-submissions';
const normalized = value => String(value ?? '').trim().toLocaleLowerCase('en-US');

export class NewLocationManualImportError extends Error {
  constructor() {
    super(
      'New map-location proposals require maintainer-assigned map_id, icon, level, and final folder/path; no files were changed.',
    );
    this.name = 'NewLocationManualImportError';
  }
}

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
  if (changes.description) result.description = changes.description;
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
  deleteWhenBlank(next, 'description', changes.description);
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

export function publicPullRequestMetadata(payload, issueNumber) {
  const title = payload.kind === 'new-mod'
    ? `Wiki: add ${payload.changes.title}`
    : `Wiki: update ${payload.changes.title ?? payload.changes.cell}`;
  return {
    title,
    body: `Imports reviewed wiki submission #${issueNumber} from the private moderation queue.`,
  };
}

export async function applyWikiSubmission(input, {
  repoRoot = REPO_ROOT,
  vocabularies,
  issueNumber = 0,
} = {}) {
  const payload = validateSubmissionPayload(input);
  if (payload.kind === 'new-location') throw new NewLocationManualImportError();
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
      ...publicPullRequestMetadata(payload, issueNumber),
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
    ...publicPullRequestMetadata(payload, issueNumber),
  };
}

function githubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'darkelfmodding-wiki-importer',
  };
}

async function githubJson(url, token, fetchImpl) {
  const response = await fetchImpl(url, { headers: githubHeaders(token) });
  if (!response.ok) throw new Error(`Private moderation queue request failed with HTTP ${response.status}.`);
  return response.json();
}

export async function retrieveApprovedSubmission(issueNumber, {
  token = process.env.WIKI_QUEUE_TOKEN,
  fetchImpl = fetch,
} = {}) {
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) throw new Error('issue_number must be a positive integer.');
  if (!token) throw new Error('WIKI_QUEUE_TOKEN is required.');
  const base = `https://api.github.com/repos/${QUEUE_OWNER}/${QUEUE_REPOSITORY}/issues/${issueNumber}`;
  const [issue, comments] = await Promise.all([
    githubJson(base, token, fetchImpl),
    githubJson(`${base}/comments?per_page=100`, token, fetchImpl),
  ]);
  const labels = new Set((issue.labels ?? []).map(label => normalized(label?.name ?? label)));
  for (const required of ['wiki-submission', 'pending', 'approved']) {
    if (!labels.has(required)) throw new Error(`The queue issue is missing the required ${required} label.`);
  }
  for (const refused of ['imported', 'rejected']) {
    if (labels.has(refused)) throw new Error(`The queue issue is already marked ${refused}.`);
  }
  const decoded = await decodeMachinePayload(issue.body, comments);
  return validateSubmissionPayload(decoded);
}

export async function importApprovedSubmission(issueNumber, options = {}) {
  const payload = await retrieveApprovedSubmission(issueNumber, options);
  return applyWikiSubmission(payload, { ...options, issueNumber });
}
