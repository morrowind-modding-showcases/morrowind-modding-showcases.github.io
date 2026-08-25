import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import matter from 'gray-matter';
import yaml from 'js-yaml';

import { loadModderRecords } from './content-lib.mjs';

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
  const locationChanges = modLocationChanges(changes);
  if (locationChanges.length > 0) result.map_location_changes = locationChanges;
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
  if (Object.hasOwn(changes, 'map_location_changes')) {
    if (changes.map_location_changes.length > 0) {
      next.map_location_changes = modLocationChanges(changes);
    } else {
      delete next.map_location_changes;
    }
  } else if ((changes.location_variants ?? []).length > 0) {
    const merged = mergeModLocationChanges(
      Array.isArray(current.map_location_changes) ? current.map_location_changes : [],
      modLocationChanges(changes),
    );
    if (merged.length > 0) next.map_location_changes = merged;
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

async function nextSubmissionMapId(submissionId, namespace, index, usedIds) {
  const digest = await sha256Hex(`${submissionId}:${namespace}:${index}`);
  let candidate = 1_000_000_000 + (Number.parseInt(digest.slice(0, 8), 16) % 1_000_000_000);
  while (usedIds.has(candidate)) {
    candidate += 1;
    if (candidate >= 2_000_000_000) candidate = 1_000_000_000;
  }
  usedIds.add(candidate);
  return candidate;
}

async function planNewLocationFiles(payload, repoRoot, usedIds) {
  if ((payload.changes.new_locations ?? []).length === 0) return [];
  const modSlug = payload.kind === 'new-mod' ? payload.changes.slug : path.posix.basename(payload.target.path, '.md');
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
      map_id: await nextSubmissionMapId(payload.submissionId, 'map-location', mapIdIndex++, usedIds),
      cell: location.cell,
      x: location.x,
      y: location.y,
      icon: 100,
      level: 16.5,
      mod_added: true,
      mod_added_by: modSlug,
      draft: false,
    };
    deleteWhenBlank(frontmatter, 'region', location.region);
    if (location.additional_entrances.length > 0) {
      frontmatter.additional_entrances = [];
      for (const entrance of location.additional_entrances) {
        const generated = {
          map_id: await nextSubmissionMapId(payload.submissionId, 'map-location', mapIdIndex++, usedIds),
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

function locationSourceKey(source) {
  return [source.mod, source.component ?? '', source.plugin ?? ''].map(normalized).join(':');
}

function modLocationChangeKey(change) {
  return [change.cell, change.component ?? '', change.plugin ?? ''].map(normalized).join(':');
}

function mergeModLocationChanges(...groups) {
  const bySource = new Map();
  for (const change of groups.flat()) {
    if (!change || typeof change.cell !== 'string' || typeof change.plugin !== 'string') continue;
    bySource.set(modLocationChangeKey(change), { ...change });
  }
  return [...bySource.values()];
}

function modLocationChanges(changes) {
  if (Array.isArray(changes.map_location_changes)) {
    return changes.map_location_changes.map(change => {
      const generated = {
        cell: change.cell,
        mode: change.mode,
        plugin: change.plugin,
      };
      if (change.component) generated.component = change.component;
      return generated;
    });
  }
  return (changes.location_variants ?? []).map(change => {
    const generated = {
      cell: change.cell,
      mode: change.mode,
      plugin: change.plugin,
    };
    if (change.component_id) generated.component = change.component_id;
    return generated;
  });
}

function sourceForLocationChange(change, modSlug) {
  const source = { mod: modSlug };
  if (change.component_id) source.component = change.component_id;
  if (change.plugin) source.plugin = change.plugin;
  return source;
}

function variantGeometry(source, geometry) {
  const variant = {
    ...source,
    x: geometry.x,
    y: geometry.y,
  };
  if (typeof geometry.region === 'string' && geometry.region.trim()) {
    variant.region = geometry.region.trim();
  }
  const entrances = (Array.isArray(geometry.additional_entrances) ? geometry.additional_entrances : [])
    .filter(entrance => entrance && Number.isFinite(entrance.x) && Number.isFinite(entrance.y))
    .map(entrance => {
      const generated = { x: entrance.x, y: entrance.y };
      if (typeof entrance.region === 'string' && entrance.region.trim()) {
        generated.region = entrance.region.trim();
      }
      return generated;
    });
  if (entrances.length > 0) variant.entrances = entrances;
  return variant;
}

function upsertLocationVariant(variants, variant) {
  const key = locationSourceKey(variant);
  const index = variants.findIndex(candidate => locationSourceKey(candidate) === key);
  if (index >= 0) variants[index] = variant;
  else variants.push(variant);
}

async function planLocationVariantFiles(payload, repoRoot, existingLocations, usedIds) {
  const changes = payload.changes.location_variants ?? [];
  if (changes.length === 0) return [];
  const modSlug = payload.kind === 'new-mod' ? payload.changes.slug : path.posix.basename(payload.target.path, '.md');
  const locationsByCell = new Map();
  for (const location of existingLocations) {
    const record = location.frontmatter ?? {};
    for (const candidate of [record.cell, record.title]) {
      if (typeof candidate === 'string' && candidate.trim()) {
        locationsByCell.set(normalized(candidate), location);
      }
    }
  }
  const plans = [];
  let mapIdIndex = 0;
  const changesByLocation = new Map();
  for (const change of changes) {
    const location = locationsByCell.get(normalized(change.cell));
    if (!location) throw new Error(`Location choice references a missing wiki location: ${change.cell}`);
    const key = normalized(location.relativePath);
    if (!changesByLocation.has(key)) changesByLocation.set(key, { location, changes: [] });
    changesByLocation.get(key).changes.push(change);
  }
  for (const { location, changes: locationChanges } of changesByLocation.values()) {
    const current = location.frontmatter ?? {};
    if (current.mod_added !== true) {
      throw new Error(`Location choices are only valid for mod-added locations: ${current.cell ?? current.title}`);
    }
    if (current.location_variants !== undefined && !Array.isArray(current.location_variants)) {
      throw new Error(`The current location has invalid location_variants metadata: ${current.cell ?? current.title}`);
    }
    const variants = (Array.isArray(current.location_variants) ? current.location_variants : []).map(variant => ({
      ...variant,
    }));
    const next = { ...current };
    const orderedChanges = [...locationChanges].sort((left, right) =>
      Number(right.mode === 'main') - Number(left.mode === 'main'));
    for (const change of orderedChanges) {
      const source = sourceForLocationChange(change, modSlug);
      const sourceKey = locationSourceKey(source);
      const incomingGeometry = {
        x: change.x,
        y: change.y,
        region: change.region,
        additional_entrances: change.additional_entrances,
      };
      if (change.mode === 'variant') {
        if (Array.isArray(next.additional_entrances)) {
          next.additional_entrances = next.additional_entrances.filter(entrance =>
            !entrance?.source || locationSourceKey(entrance.source) !== sourceKey);
          if (next.additional_entrances.length === 0) delete next.additional_entrances;
        }
        upsertLocationVariant(variants, variantGeometry(source, incomingGeometry));
      } else if (change.mode === 'entrance') {
        const priorVariantIndex = variants.findIndex(variant => locationSourceKey(variant) === sourceKey);
        if (priorVariantIndex >= 0) variants.splice(priorVariantIndex, 1);
        if (Array.isArray(next.additional_entrances)) {
          next.additional_entrances = next.additional_entrances.filter(entrance =>
            !entrance?.source || locationSourceKey(entrance.source) !== sourceKey);
          if (next.additional_entrances.length === 0) delete next.additional_entrances;
        }
        const coordinates = new Set([
          Number.isFinite(next.x) && Number.isFinite(next.y) ? `${next.x},${next.y}` : '',
          ...(Array.isArray(next.additional_entrances) ? next.additional_entrances : [])
            .filter(entrance => Number.isFinite(entrance?.x) && Number.isFinite(entrance?.y))
            .map(entrance => `${entrance.x},${entrance.y}`),
        ]);
        const incomingEntrances = [
          { x: change.x, y: change.y, region: change.region },
          ...change.additional_entrances,
        ];
        for (const entrance of incomingEntrances) {
          const coordinateKey = `${entrance.x},${entrance.y}`;
          if (coordinates.has(coordinateKey)) continue;
          coordinates.add(coordinateKey);
          const generated = {
            map_id: await nextSubmissionMapId(
              payload.submissionId,
              'location-entrance',
              mapIdIndex++,
              usedIds,
            ),
            x: entrance.x,
            y: entrance.y,
            level: Number.isFinite(current.level) ? current.level : 16.5,
            source,
          };
          if (entrance.region) generated.region = entrance.region;
          if (!Array.isArray(next.additional_entrances)) next.additional_entrances = [];
          next.additional_entrances.push(generated);
        }
      } else {
        const priorSource =
          next.main_location_source &&
          typeof next.main_location_source === 'object' &&
          !Array.isArray(next.main_location_source)
            ? { ...next.main_location_source }
            : { mod: next.mod_added_by };
        const priorMainEntrances = (Array.isArray(next.additional_entrances)
          ? next.additional_entrances
          : []).filter(entrance => !entrance?.source);
        const retainedSourcedEntrances = (Array.isArray(next.additional_entrances)
          ? next.additional_entrances
          : []).filter(entrance =>
          entrance?.source && locationSourceKey(entrance.source) !== sourceKey);
        upsertLocationVariant(variants, variantGeometry(priorSource, {
          ...next,
          additional_entrances: priorMainEntrances,
        }));
        const promotedIndex = variants.findIndex(variant => locationSourceKey(variant) === sourceKey);
        if (promotedIndex >= 0) variants.splice(promotedIndex, 1);
        next.x = change.x;
        next.y = change.y;
        deleteWhenBlank(next, 'region', change.region);
        next.main_location_source = source;
        const promotedEntrances = [];
        for (const entrance of change.additional_entrances) {
          const generated = {
            map_id: await nextSubmissionMapId(
              payload.submissionId,
              'promoted-location',
              mapIdIndex++,
              usedIds,
            ),
            x: entrance.x,
            y: entrance.y,
            level: Number.isFinite(current.level) ? current.level : 16.5,
          };
          if (entrance.region) generated.region = entrance.region;
          promotedEntrances.push(generated);
        }
        const nextEntrances = [...promotedEntrances, ...retainedSourcedEntrances];
        if (nextEntrances.length > 0) {
          next.additional_entrances = nextEntrances;
        } else {
          delete next.additional_entrances;
        }
      }
    }
    if (variants.length > 0) next.location_variants = variants;
    else delete next.location_variants;
    plans.push({
      repositoryPath: `wiki/content/locations/${location.relativePath}`,
      filePath: location.filePath,
      source: serializeWikiMarkdown(next, location.body),
    });
  }
  return plans;
}

async function planModLocationFiles(payload, repoRoot) {
  const locationsDirectory = path.join(repoRoot, 'wiki', 'content', 'locations');
  const existingLocations = await loadWikiLocations(locationsDirectory);
  const usedIds = new Set();
  for (const location of existingLocations) {
    const frontmatter = location.frontmatter ?? {};
    if (Number.isInteger(frontmatter.map_id)) usedIds.add(frontmatter.map_id);
    for (const entrance of Array.isArray(frontmatter.additional_entrances) ? frontmatter.additional_entrances : []) {
      if (Number.isInteger(entrance?.map_id)) usedIds.add(entrance.map_id);
    }
  }
  return [
    ...(await planNewLocationFiles(payload, repoRoot, usedIds)),
    ...(await planLocationVariantFiles(payload, repoRoot, existingLocations, usedIds)),
  ];
}

export async function applyWikiSubmission(input, {
  repoRoot = REPO_ROOT,
  vocabularies,
} = {}) {
  const payload = validateSubmissionPayload(input);
  if (payload.contributorType === 'modder') {
    const modders = await loadModderRecords({
      directory: path.join(repoRoot, 'content', 'modders'),
    });
    const selected = modders.find(modder => modder.id === payload.modderId);
    if (!selected) {
      throw new Error(`Select an existing modder profile; unknown modderId "${payload.modderId}".`);
    }
    if (payload.contributorName !== selected.name) {
      throw new Error(
        `Selected modderId "${payload.modderId}" must use canonical contributor name "${selected.name}".`,
      );
    }
  }
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
    const locationPlans = await planModLocationFiles(payload, repoRoot);
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
    ? await planModLocationFiles(payload, repoRoot)
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
