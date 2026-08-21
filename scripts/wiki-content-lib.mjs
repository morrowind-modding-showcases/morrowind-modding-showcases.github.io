import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import matter from 'gray-matter';
import yaml from 'js-yaml';
import categoryApi from '../modathon/nexus-categories.js';

export const SITE_MOD_CATEGORIES = categoryApi.CATEGORIES;

export const COMPONENT_TYPES = Object.freeze([
  'variant',
  'patch',
  'translation',
  'optional',
]);
export const RELATIONSHIP_TYPES = Object.freeze([
  'requires',
  'patch_for',
  'variant_of',
  'translation_of',
  'compatible_with',
  'incompatible_with',
]);

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WIKI_MODS_DIR = path.join(REPO_ROOT, 'wiki', 'content', 'mods');
export const WIKI_LOCATIONS_DIR = path.join(REPO_ROOT, 'wiki', 'content', 'locations');
export const WIKI_PROPERTIES_PATH = path.join(
  REPO_ROOT,
  'wiki',
  'content',
  '_meta',
  'ModWiki_properties.md',
);
export const PAGES_CONFIG_PATH = path.join(REPO_ROOT, '.pages.yml');
export const MAP_WORLD = Object.freeze({
  name: 'morrowind',
  cellSize: 8192,
  posLeft: -278528,
  posTop: 303104,
  posRight: 245760,
  posBottom: -221184,
});

export function parseExteriorCell(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/);
  if (!match) return null;
  const x = Number(match[1]);
  const y = Number(match[2]);
  return Number.isSafeInteger(x) && Number.isSafeInteger(y) ? { x, y } : null;
}

export function formatExteriorCell(cell) {
  return `${cell.x}, ${cell.y}`;
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
const normalized = value => String(value ?? '').trim().toLocaleLowerCase('en-US');
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const stableIdentifierPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const cityTransportPrefixes = new Set(['boat transport', 'silt strider']);

export function canonicalLocationName(record) {
  return typeof record?.cell === 'string' && record.cell.trim()
    ? record.cell.trim()
    : typeof record?.title === 'string'
      ? record.title.trim()
      : '';
}

export function locationFolderName(record) {
  const locationName = canonicalLocationName(record);
  const comma = locationName.indexOf(',');
  if (comma < 0) return null;
  const prefix = locationName.slice(0, comma).trim();
  const suffix = locationName.slice(comma + 1).trim();
  const folderName = cityTransportPrefixes.has(normalized(prefix)) ? suffix : prefix;
  return folderName || null;
}

export function locationFolderSlug(record) {
  const folderName = locationFolderName(record);
  if (!folderName) return null;
  const slug = folderName
    .normalize('NFKD')
    .toLocaleLowerCase('en-US')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || null;
}

export function groupedLocationFolderSlugs(locations) {
  const counts = new Map();
  const forcedFolders = new Set();
  for (const location of locations ?? []) {
    const record = location?.frontmatter ?? location;
    if (record?.mod_added === true) continue;
    const folder = locationFolderSlug(record);
    if (folder) counts.set(folder, (counts.get(folder) ?? 0) + 1);
    const locationName = canonicalLocationName(record);
    const comma = locationName.indexOf(',');
    if (folder && comma >= 0 && cityTransportPrefixes.has(normalized(locationName.slice(0, comma)))) {
      forcedFolders.add(folder);
    }
  }
  return new Set([
    ...forcedFolders,
    ...[...counts].filter(([, count]) => count > 1).map(([folder]) => folder),
  ]);
}

export function organizedLocationTitle(record, _isGrouped) {
  const title = typeof record?.title === 'string' ? record.title.trim() : '';
  const locationName = canonicalLocationName(record);
  return locationName || title;
}

export function organizedLocationExplorerTitle(record, isGrouped) {
  if (!isGrouped) return null;
  const locationName = canonicalLocationName(record);
  const comma = locationName.indexOf(',');
  if (comma < 0) return null;

  const prefix = locationName.slice(0, comma).trim();
  if (cityTransportPrefixes.has(normalized(prefix))) return prefix || null;

  const explicitTitle = typeof record?.explorer_title === 'string'
    ? record.explorer_title.trim()
    : '';
  if (explicitTitle) return explicitTitle;

  const title = typeof record?.title === 'string' ? record.title.trim() : '';
  if (title && normalized(title) !== normalized(locationName)) return title;
  return locationName.slice(comma + 1).trim() || null;
}

export function stableUniqueStrings(values) {
  const byKey = new Map();
  for (const rawValue of values) {
    if (typeof rawValue !== 'string') continue;
    const value = rawValue.trim();
    const key = normalized(value);
    if (value && !byKey.has(key)) byKey.set(key, value);
  }
  return [...byKey.values()].sort(collator.compare);
}

export function serializeWikiMarkdown(frontmatter, body = '') {
  const content = String(body).replace(/^(?:\r\n|\n)/, '');
  return `---\n${yaml.dump(frontmatter, {
    lineWidth: -1,
    noRefs: true,
    forceQuotes: true,
    quotingType: '"',
  })}---\n${content}`;
}

export function canonicalMapLocations(locations) {
  const values = [];
  for (const location of locations ?? []) {
    const record = location?.frontmatter ?? location;
    if (record?.draft === true) continue;
    if (typeof record?.cell === 'string') values.push(record.cell);
    if (typeof record?.title === 'string') values.push(record.title);
    else if (typeof record?.name === 'string') values.push(record.name);

    const locationName = canonicalLocationName(record);
    const comma = locationName.indexOf(',');
    const prefix = comma >= 0 ? locationName.slice(0, comma).trim() : '';
    if (cityTransportPrefixes.has(normalized(prefix))) {
      values.push(locationName.slice(comma + 1));
    } else if (typeof record?.explorer_title === 'string') {
      values.push(record.explorer_title);
    }
  }
  return stableUniqueStrings(values);
}

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(entryPath);
    if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.md') return [entryPath];
    return [];
  }));
  return nested.flat();
}

async function loadWikiRecords(directory) {
  const filePaths = (await markdownFiles(directory))
    .filter(filePath => path.basename(filePath).toLowerCase() !== 'index.md')
    .sort(collator.compare);

  return Promise.all(filePaths.map(async filePath => {
    const relativePath = path.relative(directory, filePath).split(path.sep).join('/');
    const slug = relativePath.replace(/\.md$/i, '');
    const source = await readFile(filePath, 'utf8');
    try {
      const parsed = matter(source, { engines: { yaml: value => yaml.load(value) } });
      return { filePath, relativePath, slug, source, frontmatter: parsed.data, body: parsed.content, parseError: null };
    } catch (error) {
      return {
        filePath,
        relativePath,
        slug,
        source,
        frontmatter: {},
        body: '',
        parseError: error instanceof Error ? error.message : String(error),
      };
    }
  }));
}

export async function loadWikiMods(modsDirectory = WIKI_MODS_DIR) {
  return loadWikiRecords(modsDirectory);
}

export async function loadWikiLocations(locationsDirectory = WIKI_LOCATIONS_DIR) {
  return loadWikiRecords(locationsDirectory);
}

function findContentEntry(entries, name) {
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (entry?.name === name) return entry;
    const nested = findContentEntry(entry?.items, name);
    if (nested) return nested;
  }
  return null;
}

function fieldOptions(collection, fieldName) {
  const field = collection?.fields?.find(candidate => candidate?.name === fieldName);
  const values = field?.options?.values;
  if (!Array.isArray(values)) return [];
  return values.map(value => typeof value === 'string' ? value : value?.name).filter(Boolean);
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    const key = normalized(value);
    if (seen.has(key)) duplicates.add(String(value));
    else seen.add(key);
  }
  return stableUniqueStrings(duplicates);
}

function compareVocabulary(leftName, leftValues, rightName, rightValues, property, errors) {
  const left = new Map(leftValues.map(value => [normalized(value), value]));
  const right = new Map(rightValues.map(value => [normalized(value), value]));
  const missingRight = [...left.entries()].filter(([key]) => !right.has(key)).map(([, value]) => value);
  const missingLeft = [...right.entries()].filter(([key]) => !left.has(key)).map(([, value]) => value);

  if (missingRight.length > 0) {
    errors.push({
      file: `${leftName} ↔ ${rightName}`,
      property,
      message: `${leftName} contains values missing from ${rightName}`,
      value: stableUniqueStrings(missingRight),
    });
  }
  if (missingLeft.length > 0) {
    errors.push({
      file: `${leftName} ↔ ${rightName}`,
      property,
      message: `${rightName} contains values missing from ${leftName}`,
      value: stableUniqueStrings(missingLeft),
    });
  }
}

function requireVocabularySubset(subsetName, subsetValues, completeName, completeValues, property, errors) {
  const complete = new Set(completeValues.map(normalized));
  const missing = subsetValues.filter(value => !complete.has(normalized(value)));
  if (missing.length > 0) {
    errors.push({
      file: `${subsetName} ↔ ${completeName}`,
      property,
      message: `${subsetName} contains values missing from ${completeName}`,
      value: stableUniqueStrings(missing),
    });
  }
}

export async function loadControlledVocabularies({
  propertiesPath = WIKI_PROPERTIES_PATH,
  pagesPath = PAGES_CONFIG_PATH,
  locationsDirectory = WIKI_LOCATIONS_DIR,
} = {}) {
  const [propertiesSource, pagesSource, locations] = await Promise.all([
    readFile(propertiesPath, 'utf8'),
    readFile(pagesPath, 'utf8'),
    loadWikiLocations(locationsDirectory),
  ]);
  const properties = matter(propertiesSource, { engines: { yaml: value => yaml.load(value) } }).data;
  const pages = yaml.load(pagesSource);
  const wikiMods = findContentEntry(pages?.content, 'wiki_mods');
  if (!wikiMods) throw new Error('Pages CMS collection "wiki_mods" was not found in .pages.yml.');

  return {
    site: {
      categories: [...SITE_MOD_CATEGORIES],
    },
    properties: {
      categories: Array.isArray(properties.categories) ? properties.categories : [],
      map_locations: Array.isArray(properties.map_locations) ? properties.map_locations : [],
      authors: Array.isArray(properties.authors) ? properties.authors : [],
    },
    pages: {
      categories: fieldOptions(wikiMods, 'categories'),
      map_locations: fieldOptions(wikiMods, 'map_locations'),
    },
    map_locations: canonicalMapLocations(locations),
  };
}

export function validateControlledVocabularies(vocabularies) {
  const errors = [];
  for (const source of ['properties', 'pages']) {
    for (const property of ['categories', 'map_locations']) {
      const duplicates = duplicateValues(vocabularies[source][property]);
      if (duplicates.length > 0) {
        errors.push({
          file: source === 'properties' ? 'wiki/content/_meta/ModWiki_properties.md' : '.pages.yml',
          property,
          message: 'Controlled vocabulary contains duplicate values',
          value: duplicates,
        });
      }
    }
  }

  compareVocabulary(
    'modathon/nexus-categories.js',
    vocabularies.site.categories,
    'ModWiki_properties.md',
    vocabularies.properties.categories,
    'categories',
    errors,
  );
  compareVocabulary(
    'ModWiki_properties.md',
    vocabularies.properties.categories,
    '.pages.yml',
    vocabularies.pages.categories,
    'categories',
    errors,
  );
  compareVocabulary(
    'ModWiki_properties.md',
    vocabularies.properties.map_locations,
    '.pages.yml',
    vocabularies.pages.map_locations,
    'map_locations',
    errors,
  );
  requireVocabularySubset(
    'ModWiki_properties.md',
    vocabularies.properties.map_locations,
    'wiki/content/locations',
    vocabularies.map_locations,
    'map_locations',
    errors,
  );
  return errors;
}

function validateStringList(record, property, file, errors) {
  return validateStringListValue(record[property], property, file, errors);
}

function validateStringListValue(value, property, file, errors) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    errors.push({ file, property, message: 'Expected a list of strings', value });
    return [];
  }
  for (const [index, item] of value.entries()) {
    if (typeof item !== 'string' || item.trim() === '') {
      errors.push({ file, property: `${property}[${index}]`, message: 'Expected a non-empty string', value: item });
    }
  }
  return value.filter(item => typeof item === 'string' && item.trim() !== '').map(item => item.trim());
}

function validateExteriorCellList(value, property, file, errors) {
  const exteriorCells = validateStringListValue(value, property, file, errors);
  const seen = new Set();
  for (const rawValue of exteriorCells) {
    const cell = parseExteriorCell(rawValue);
    if (!cell) {
      errors.push({
        file,
        property,
        message: 'Exterior cells must use signed X, Y grid coordinates',
        value: rawValue,
      });
      continue;
    }
    const key = `${cell.x},${cell.y}`;
    if (seen.has(key)) {
      errors.push({ file, property, message: 'Duplicate exterior cell', value: rawValue });
    }
    seen.add(key);
    if (rawValue !== formatExteriorCell(cell)) {
      errors.push({
        file,
        property,
        message: 'Exterior cells must use the canonical X, Y format',
        value: rawValue,
        expected: [formatExteriorCell(cell)],
      });
    }
  }
  return exteriorCells;
}

function legacyExteriorEdits(value) {
  return (Array.isArray(value) ? value : [])
    .filter(item => typeof item === 'string' && item.trim())
    .map(cell => ({ cell: cell.trim(), landscape: true, references: 0 }));
}

function exteriorEditValues(record) {
  if (Array.isArray(record?.map_exterior_edits)) return record.map_exterior_edits;
  return legacyExteriorEdits(record?.map_exterior_cells);
}

function validateExteriorEditList(value, property, file, errors) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    errors.push({ file, property, message: 'Expected a list of exterior edit objects', value });
    return [];
  }
  const edits = [];
  const seen = new Set();
  for (const [index, rawEdit] of value.entries()) {
    const editProperty = `${property}[${index}]`;
    if (!isObject(rawEdit)) {
      errors.push({ file, property: editProperty, message: 'Expected an exterior edit object', value: rawEdit });
      continue;
    }
    const cellValue = typeof rawEdit.cell === 'string' ? rawEdit.cell.trim() : '';
    const cell = parseExteriorCell(cellValue);
    const landscape = rawEdit.landscape;
    const references = rawEdit.references;
    if (!cell) {
      errors.push({
        file,
        property: `${editProperty}.cell`,
        message: 'Exterior edits must use signed X, Y grid coordinates',
        value: rawEdit.cell,
      });
    } else {
      const key = `${cell.x},${cell.y}`;
      if (seen.has(key)) {
        errors.push({ file, property, message: 'Duplicate exterior edit cell', value: cellValue });
      }
      seen.add(key);
      if (cellValue !== formatExteriorCell(cell)) {
        errors.push({
          file,
          property: `${editProperty}.cell`,
          message: 'Exterior edits must use the canonical X, Y format',
          value: cellValue,
          expected: [formatExteriorCell(cell)],
        });
      }
    }
    if (typeof landscape !== 'boolean') {
      errors.push({ file, property: `${editProperty}.landscape`, message: 'Expected true or false', value: landscape });
    }
    if (!Number.isSafeInteger(references) || references < 0) {
      errors.push({
        file,
        property: `${editProperty}.references`,
        message: 'Expected a non-negative whole-number reference count',
        value: references,
      });
    }
    if (cell && typeof landscape === 'boolean' && Number.isSafeInteger(references) && references >= 0) {
      edits.push({ cell: formatExteriorCell(cell), landscape, references });
    }
  }
  return edits;
}

function validateRelationList(value, property, file, knownSlugs, errors) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    errors.push({ file, property, message: 'Expected a list of relationships', value });
    return [];
  }

  const result = [];
  const identifiers = new Map();
  for (const [index, rawRelation] of value.entries()) {
    const relationProperty = `${property}[${index}]`;
    if (!isObject(rawRelation)) {
      errors.push({ file, property: relationProperty, message: 'Expected a relationship object', value: rawRelation });
      continue;
    }
    const type = typeof rawRelation.type === 'string' ? rawRelation.type.trim() : '';
    const target = typeof rawRelation.target === 'string' ? rawRelation.target.trim() : '';
    if (!RELATIONSHIP_TYPES.includes(type)) {
      errors.push({
        file,
        property: `${relationProperty}.type`,
        message: 'Unknown relationship type',
        value: rawRelation.type,
        expected: RELATIONSHIP_TYPES,
      });
    }
    if (!stableIdentifierPattern.test(target)) {
      errors.push({
        file,
        property: `${relationProperty}.target`,
        message: 'Relationship targets must use a wiki mod filename slug',
        value: rawRelation.target,
      });
    } else if (!knownSlugs.has(normalized(target))) {
      errors.push({
        file,
        property: `${relationProperty}.target`,
        message: 'Relationship targets a nonexistent wiki mod',
        value: target,
      });
    }

    if (type && target) {
      const identifier = `${normalized(type)}:${normalized(target)}`;
      if (identifiers.has(identifier)) {
        errors.push({
          file,
          property: relationProperty,
          message: `Duplicate normalized relationship identifier also used by ${identifiers.get(identifier)}`,
          value: { type, target },
        });
      } else {
        identifiers.set(identifier, relationProperty);
      }
    }
    if (RELATIONSHIP_TYPES.includes(type) && stableIdentifierPattern.test(target)) {
      result.push({ type, target });
    }
  }
  return result;
}

function normalizedComponent(component) {
  const result = {
    id: component.id.trim(),
    name: component.name.trim(),
    type: component.type.trim(),
    plugins: Array.isArray(component.plugins)
      ? component.plugins.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim())
      : [],
    map_locations: Array.isArray(component.map_locations)
      ? component.map_locations.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim())
      : [],
    map_exterior_edits: exteriorEditValues(component)
      .filter(isObject)
      .map(edit => ({
        cell: typeof edit.cell === 'string' ? edit.cell.trim() : '',
        landscape: edit.landscape === true,
        references: Number.isSafeInteger(edit.references) ? edit.references : 0,
      }))
      .filter(edit => edit.cell),
    relations: Array.isArray(component.relations)
      ? component.relations
        .filter(relation => isObject(relation) && typeof relation.type === 'string' && typeof relation.target === 'string')
        .map(relation => ({ type: relation.type.trim(), target: relation.target.trim() }))
      : [],
  };
  if (typeof component.notes === 'string' && component.notes.trim()) result.notes = component.notes.trim();
  return result;
}

function normalizedMapLocationChanges(value) {
  return (Array.isArray(value) ? value : [])
    .filter(change => isObject(change)
      && typeof change.cell === 'string'
      && typeof change.mode === 'string'
      && typeof change.plugin === 'string')
    .map(change => {
      const generated = {
        cell: change.cell.trim(),
        mode: change.mode.trim(),
        plugin: change.plugin.trim(),
      };
      if (typeof change.component === 'string' && change.component.trim()) {
        generated.component = change.component.trim();
      }
      return generated;
    })
    .filter(change => change.cell && change.plugin);
}

export function normalizeWikiMod(mod) {
  const record = isObject(mod.frontmatter) ? mod.frontmatter : {};
  const explicitComponents = Array.isArray(record.components)
    ? record.components.filter(isObject).map(normalizedComponent)
    : [];
  return {
    id: mod.slug,
    slug: mod.slug,
    title: typeof record.title === 'string' ? record.title.trim() : mod.slug,
    components: explicitComponents,
    explicit_components: explicitComponents,
    map_location_changes: normalizedMapLocationChanges(record.map_location_changes),
    relations: Array.isArray(record.relations)
      ? record.relations
        .filter(relation => isObject(relation) && typeof relation.type === 'string' && typeof relation.target === 'string')
        .map(relation => ({ type: relation.type.trim(), target: relation.target.trim() }))
      : [],
  };
}

export function generateWikiData(mods) {
  const published = mods
    .filter(mod => !mod.parseError && mod.frontmatter?.draft !== true)
    .map(normalizeWikiMod)
    .sort((left, right) => collator.compare(left.title, right.title));
  const publishedIds = new Set(published.map(mod => mod.id));
  const relations = [];
  for (const mod of published) {
    for (const relation of mod.relations) {
      if (publishedIds.has(relation.target)) {
        relations.push({
          type: relation.type,
          source_mod: mod.id,
          source_component: null,
          target_mod: relation.target,
        });
      }
    }
    for (const component of mod.explicit_components) {
      for (const relation of component.relations) {
        if (publishedIds.has(relation.target)) {
          relations.push({
            type: relation.type,
            source_mod: mod.id,
            source_component: component.id,
            target_mod: relation.target,
          });
        }
      }
    }
  }
  relations.sort((left, right) => collator.compare(
    `${left.source_mod}:${left.source_component ?? ''}:${left.type}:${left.target_mod}`,
    `${right.source_mod}:${right.source_component ?? ''}:${right.type}:${right.target_mod}`,
  ));

  return {
    schema_version: 1,
    generated_from: 'wiki/content/mods',
    mods: Object.fromEntries(published.map(mod => {
      const generated = {
        id: mod.id,
        slug: mod.slug,
        title: mod.title,
        components: mod.components,
        outgoing_relationships: relations.filter(relation => relation.source_mod === mod.id),
        incoming_relationships: relations.filter(relation => relation.target_mod === mod.id),
      };
      if (mod.map_location_changes.length > 0) {
        generated.map_location_changes = mod.map_location_changes;
      }
      return [mod.id, generated];
    })),
    relationships: relations,
  };
}

export function validateWikiMods(mods, { categories = [], map_locations: mapLocations = [] } = {}) {
  const errors = [];
  const categoryByKey = new Map(categories.map(value => [normalized(value), value]));
  const locationByKey = new Map(mapLocations.map(value => [normalized(value), value]));
  const slugs = new Map();
  const mapIds = new Map();
  const knownSlugs = new Set(mods.map(mod => normalized(mod.slug)));
  const normalizedComponentIdentifiers = new Map();

  for (const mod of mods) {
    const file = `wiki/content/mods/${mod.relativePath}`;
    const record = isObject(mod.frontmatter) ? mod.frontmatter : {};
    if (mod.parseError) {
      errors.push({ file, property: 'frontmatter', message: `Invalid YAML: ${mod.parseError}` });
      continue;
    }
    if (typeof mod.source === 'string' && /^---\S/m.test(mod.source)) {
      errors.push({
        file,
        property: 'frontmatter',
        message: 'The closing frontmatter delimiter must be on its own line',
      });
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(mod.slug)) {
      errors.push({
        file,
        property: 'filename',
        message: 'Use lowercase letters, numbers, and single hyphens for stable URLs',
        value: mod.relativePath,
      });
    }
    const slugKey = normalized(mod.slug);
    if (slugs.has(slugKey)) {
      errors.push({ file, property: 'filename', message: `Duplicate mod slug also used by ${slugs.get(slugKey)}`, value: mod.slug });
    } else {
      slugs.set(slugKey, file);
    }

    if (typeof record.title !== 'string' || record.title.trim() === '') {
      errors.push({ file, property: 'title', message: 'A non-empty title is required', value: record.title });
    }
    for (const property of ['description', 'url', 'picture_url', 'showcase_url']) {
      const value = record[property];
      if (value !== undefined && value !== null && typeof value !== 'string') {
        errors.push({ file, property, message: 'Expected a string', value });
      }
    }
    for (const property of ['map_enabled', 'draft']) {
      if (typeof record[property] !== 'boolean') {
        errors.push({ file, property, message: 'Expected true or false', value: record[property] });
      }
    }

    const authors = validateStringList(record, 'authors', file, errors);
    const modCategories = validateStringList(record, 'categories', file, errors);
    validateStringList(record, 'tags', file, errors);
    validateStringList(record, 'events', file, errors);
    const locations = validateStringList(record, 'map_locations', file, errors);
    const legacyExteriorCells = validateExteriorCellList(record.map_exterior_cells, 'map_exterior_cells', file, errors);
    const exteriorEdits = validateExteriorEditList(
      record.map_exterior_edits,
      'map_exterior_edits',
      file,
      errors,
    );
    if (record.map_exterior_cells !== undefined && record.map_exterior_edits !== undefined) {
      errors.push({
        file,
        property: 'map_exterior_edits',
        message: 'Use map_exterior_edits instead of defining both exterior metadata formats',
      });
    }
    const effectiveExteriorEdits = record.map_exterior_edits === undefined
      ? legacyExteriorEdits(legacyExteriorCells)
      : exteriorEdits;
    validateRelationList(record.relations, 'relations', file, knownSlugs, errors);
    void authors;

    const rawComponents = record.components;
    let componentLocations = [];
    let componentExteriorEdits = [];
    if (rawComponents !== undefined && rawComponents !== null && !Array.isArray(rawComponents)) {
      errors.push({ file, property: 'components', message: 'Expected a list of components', value: rawComponents });
    }
    const componentIds = new Map();
    const componentsById = new Map();
    for (const [index, component] of (Array.isArray(rawComponents) ? rawComponents : []).entries()) {
      const componentProperty = `components[${index}]`;
      if (!isObject(component)) {
        errors.push({ file, property: componentProperty, message: 'Expected a component object', value: component });
        continue;
      }
      const componentId = typeof component.id === 'string' ? component.id.trim() : '';
      if (!stableIdentifierPattern.test(componentId)) {
        errors.push({
          file,
          property: `${componentProperty}.id`,
          message: 'Malformed component ID; use lowercase letters, numbers, and single hyphens',
          value: component.id,
        });
      } else {
        const identifier = normalized(componentId);
        if (componentIds.has(identifier)) {
          errors.push({
            file,
            property: `${componentProperty}.id`,
            message: `Duplicate component ID also used by ${componentIds.get(identifier)}`,
            value: componentId,
          });
        } else {
          componentIds.set(identifier, `${componentProperty}.id`);
          componentsById.set(identifier, component);
        }
        const globalIdentifier = `${slugKey}#${identifier}`;
        if (normalizedComponentIdentifiers.has(globalIdentifier)) {
          errors.push({
            file,
            property: `${componentProperty}.id`,
            message: `Duplicate normalized identifier also used by ${normalizedComponentIdentifiers.get(globalIdentifier)}`,
            value: globalIdentifier,
          });
        } else {
          normalizedComponentIdentifiers.set(globalIdentifier, `${file} ${componentProperty}.id`);
        }
      }
      if (typeof component.name !== 'string' || component.name.trim() === '') {
        errors.push({ file, property: `${componentProperty}.name`, message: 'A non-empty component name is required', value: component.name });
      }
      if (typeof component.type !== 'string' || !COMPONENT_TYPES.includes(component.type.trim())) {
        errors.push({
          file,
          property: `${componentProperty}.type`,
          message: 'Unknown component type',
          value: component.type,
          expected: COMPONENT_TYPES,
        });
      }
      validateStringListValue(component.plugins, `${componentProperty}.plugins`, file, errors);
      const locationsForComponent = validateStringListValue(
        component.map_locations,
        `${componentProperty}.map_locations`,
        file,
        errors,
      );
      componentLocations = componentLocations.concat(locationsForComponent);
      const legacyComponentExteriorCells = validateExteriorCellList(
        component.map_exterior_cells,
        `${componentProperty}.map_exterior_cells`,
        file,
        errors,
      );
      const explicitComponentExteriorEdits = validateExteriorEditList(
        component.map_exterior_edits,
        `${componentProperty}.map_exterior_edits`,
        file,
        errors,
      );
      if (component.map_exterior_cells !== undefined && component.map_exterior_edits !== undefined) {
        errors.push({
          file,
          property: `${componentProperty}.map_exterior_edits`,
          message: 'Use map_exterior_edits instead of defining both exterior metadata formats',
        });
      }
      componentExteriorEdits = componentExteriorEdits.concat(
        component.map_exterior_edits === undefined
          ? legacyExteriorEdits(legacyComponentExteriorCells)
          : explicitComponentExteriorEdits,
      );
      const seenComponentLocations = new Set();
      for (const location of locationsForComponent) {
        const key = normalized(location);
        if (seenComponentLocations.has(key)) {
          errors.push({ file, property: `${componentProperty}.map_locations`, message: 'Duplicate component map location', value: location });
        }
        seenComponentLocations.add(key);
        if (!locationByKey.has(key)) {
          errors.push({
            file,
            property: `${componentProperty}.map_locations`,
            message: 'Invalid component map location',
            value: location,
            expected: mapLocations,
          });
        }
      }
      if (component.notes !== undefined && component.notes !== null && typeof component.notes !== 'string') {
        errors.push({ file, property: `${componentProperty}.notes`, message: 'Expected a string', value: component.notes });
      }
      validateRelationList(
        component.relations,
        `${componentProperty}.relations`,
        file,
        knownSlugs,
        errors,
      );
    }

    for (const category of modCategories) {
      if (!categoryByKey.has(normalized(category))) {
        errors.push({
          file,
          property: 'categories',
          message: 'Invalid category',
          value: category,
          expected: categories,
        });
      }
    }

    const seenLocations = new Set();
    for (const location of locations) {
      const key = normalized(location);
      if (seenLocations.has(key)) {
        errors.push({ file, property: 'map_locations', message: 'Duplicate map location', value: location });
      }
      seenLocations.add(key);
      if (!locationByKey.has(key)) {
        errors.push({
          file,
          property: 'map_locations',
          message: 'Invalid map location',
          value: location,
          expected: mapLocations,
        });
      }
    }

    const rawLocationChanges = record.map_location_changes;
    if (rawLocationChanges !== undefined && !Array.isArray(rawLocationChanges)) {
      errors.push({
        file,
        property: 'map_location_changes',
        message: 'Expected a list of plugin-specific location changes',
        value: rawLocationChanges,
      });
    }
    const locationChangeSources = new Set();
    const mainLocationChanges = new Set();
    for (const [index, change] of (Array.isArray(rawLocationChanges) ? rawLocationChanges : []).entries()) {
      const property = `map_location_changes[${index}]`;
      if (!isObject(change)) {
        errors.push({ file, property, message: 'Expected a location change object', value: change });
        continue;
      }
      const cell = typeof change.cell === 'string' ? change.cell.trim() : '';
      const mode = typeof change.mode === 'string' ? change.mode.trim() : '';
      const plugin = typeof change.plugin === 'string' ? change.plugin.trim() : '';
      const component = typeof change.component === 'string' ? change.component.trim() : '';
      if (!cell) {
        errors.push({ file, property: `${property}.cell`, message: 'A map location is required', value: change.cell });
      } else if (!locationByKey.has(normalized(cell))) {
        errors.push({
          file,
          property: `${property}.cell`,
          message: 'Invalid map location',
          value: cell,
          expected: mapLocations,
        });
      }
      if (!['main', 'variant', 'entrance'].includes(mode)) {
        errors.push({
          file,
          property: `${property}.mode`,
          message: 'Expected main, variant, or entrance',
          value: change.mode,
        });
      }
      if (!plugin) {
        errors.push({ file, property: `${property}.plugin`, message: 'A plugin filename is required', value: change.plugin });
      }
      if (change.component !== undefined && !stableIdentifierPattern.test(component)) {
        errors.push({
          file,
          property: `${property}.component`,
          message: 'Expected a component ID slug',
          value: change.component,
        });
      }
      const cellKey = normalized(cell);
      if (component) {
        const sourceComponent = componentsById.get(normalized(component));
        if (!sourceComponent) {
          errors.push({
            file,
            property: `${property}.component`,
            message: 'Location change references a nonexistent component',
            value: component,
          });
        } else {
          const sourceLocations = Array.isArray(sourceComponent.map_locations)
            ? sourceComponent.map_locations.map(normalized)
            : [];
          const sourcePlugins = Array.isArray(sourceComponent.plugins)
            ? sourceComponent.plugins.map(normalized)
            : [];
          if (cell && !sourceLocations.includes(cellKey)) {
            errors.push({
              file,
              property: `${property}.cell`,
              message: 'Location change must be covered by its component',
              value: cell,
            });
          }
          if (plugin && !sourcePlugins.includes(normalized(plugin))) {
            errors.push({
              file,
              property: `${property}.plugin`,
              message: 'Location change plugin must be listed on its component',
              value: plugin,
            });
          }
        }
      } else if (cell && !seenLocations.has(cellKey)) {
        errors.push({
          file,
          property: `${property}.cell`,
          message: 'Main-plugin location change must be covered by map_locations',
          value: cell,
        });
      }
      const sourceKey = [cell, component, plugin].map(normalized).join(':');
      if (locationChangeSources.has(sourceKey)) {
        errors.push({ file, property, message: 'Duplicate plugin-specific location change', value: sourceKey });
      }
      locationChangeSources.add(sourceKey);
      if (mode === 'main') {
        if (mainLocationChanges.has(cellKey)) {
          errors.push({ file, property, message: 'Only one main placement is allowed per location', value: cell });
        }
        mainLocationChanges.add(cellKey);
      }
    }

    if (record.map_enabled === true && record.draft === false
        && locations.length === 0 && effectiveExteriorEdits.length === 0
        && componentLocations.length === 0 && componentExteriorEdits.length === 0) {
      errors.push({
        file,
        property: 'map_enabled',
        message: 'Published map-enabled mods need at least one location or exterior cell',
        value: { map_locations: locations, map_exterior_edits: effectiveExteriorEdits },
      });
    }
    if (record.map_enabled === false && Array.isArray(rawLocationChanges) && rawLocationChanges.length > 0) {
      errors.push({
        file,
        property: 'map_location_changes',
        message: 'Map-disabled mods must not retain location changes',
        value: rawLocationChanges,
      });
    }

    if (record.map_id !== undefined && record.map_id !== null) {
      if (typeof record.map_id !== 'string' || record.map_id.trim() === '') {
        errors.push({ file, property: 'map_id', message: 'Expected a non-empty string', value: record.map_id });
      } else {
        const key = normalized(record.map_id);
        if (mapIds.has(key)) {
          errors.push({ file, property: 'map_id', message: `Duplicate map ID also used by ${mapIds.get(key)}`, value: record.map_id });
        } else {
          mapIds.set(key, file);
        }
      }
    }
  }
  return errors;
}

export function validateWikiLocations(locations) {
  const errors = [];
  const slugs = new Map();
  const mapIds = new Map();
  const cellNames = new Map();
  const groupedFolders = groupedLocationFolderSlugs(locations);

  for (const location of locations) {
    const file = `wiki/content/locations/${location.relativePath}`;
    const record = isObject(location.frontmatter) ? location.frontmatter : {};
    if (location.parseError) {
      errors.push({ file, property: 'frontmatter', message: `Invalid YAML: ${location.parseError}` });
      continue;
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(location.slug)) {
      errors.push({ file, property: 'filename', message: 'Use lowercase letters, numbers, and single hyphens for stable URLs', value: location.relativePath });
    }
    const candidateFolder = record.mod_added === true
      ? null
      : locationFolderSlug(record);
    const expectedFolder = candidateFolder && groupedFolders.has(candidateFolder)
      ? candidateFolder
      : null;
    const actualFolder = path.posix.dirname(location.relativePath);
    if (expectedFolder && actualFolder !== expectedFolder) {
      errors.push({
        file,
        property: 'filename',
        message: `This location belongs under ${locationFolderName(record)} in the ${expectedFolder}/ folder`,
        value: location.relativePath,
      });
    } else if (!expectedFolder && actualFolder !== '.') {
      errors.push({
        file,
        property: 'filename',
        message: 'Locations without a shared comma-qualified parent belong directly in wiki/content/locations',
        value: location.relativePath,
      });
    }
    const slugKey = normalized(location.slug);
    if (slugs.has(slugKey)) {
      errors.push({ file, property: 'filename', message: `Duplicate location slug also used by ${slugs.get(slugKey)}`, value: location.slug });
    } else {
      slugs.set(slugKey, file);
    }

    const cellName = typeof record.cell === 'string' ? record.cell.trim() : '';
    const cellKey = normalized(cellName);
    if (cellKey && cellNames.has(cellKey)) {
      errors.push({
        file,
        property: 'cell',
        message: `Duplicate cell entry also used by ${cellNames.get(cellKey)}; add its geometry to additional_entrances instead`,
        value: cellName,
      });
    } else if (cellKey) {
      cellNames.set(cellKey, file);
    }

    if (typeof record.title !== 'string' || record.title.trim() === '') {
      errors.push({ file, property: 'title', message: 'A non-empty title is required', value: record.title });
    } else {
      const expectedTitle = organizedLocationTitle(record, Boolean(expectedFolder));
      if (record.title.trim() !== expectedTitle) {
        errors.push({
          file,
          property: 'title',
          message: 'Location titles should use the complete cell name',
          value: record.title,
          expected: [expectedTitle],
        });
      }
    }
    const expectedExplorerTitle = organizedLocationExplorerTitle(record, Boolean(expectedFolder));
    const actualExplorerTitle = typeof record.explorer_title === 'string'
      ? record.explorer_title.trim()
      : '';
    if (expectedExplorerTitle && !actualExplorerTitle) {
      errors.push({
        file,
        property: 'explorer_title',
        message: 'Nested locations need a shortened Explorer title',
        value: record.explorer_title,
        expected: [expectedExplorerTitle],
      });
    } else if (!expectedExplorerTitle && record.explorer_title !== undefined) {
      errors.push({
        file,
        property: 'explorer_title',
        message: 'Top-level locations should not override their Explorer title',
        value: record.explorer_title,
      });
    }
    if (!Number.isInteger(record.map_id) || record.map_id <= 0) {
      errors.push({ file, property: 'map_id', message: 'Expected a positive integer', value: record.map_id });
    } else if (mapIds.has(record.map_id)) {
      errors.push({ file, property: 'map_id', message: `Duplicate map ID also used by ${mapIds.get(record.map_id)}`, value: record.map_id });
    } else {
      mapIds.set(record.map_id, file);
    }
    for (const property of ['cell', 'region', 'uesp_wiki']) {
      const value = record[property];
      if (value !== undefined && value !== null && typeof value !== 'string') {
        errors.push({ file, property, message: 'Expected a string', value });
      }
    }
    if (record.mod_added !== undefined && typeof record.mod_added !== 'boolean') {
      errors.push({ file, property: 'mod_added', message: 'Expected true or false', value: record.mod_added });
    }
    if (record.mod_added === true) {
      if (typeof record.mod_added_by !== 'string'
          || !stableIdentifierPattern.test(record.mod_added_by.trim())) {
        errors.push({
          file,
          property: 'mod_added_by',
          message: 'Mod-added locations need a wiki mod filename slug',
          value: record.mod_added_by,
        });
      }
    } else if (record.mod_added_by !== undefined) {
      errors.push({
        file,
        property: 'mod_added_by',
        message: 'mod_added_by is only valid when mod_added is true',
        value: record.mod_added_by,
      });
    }
    if (record.mod_added !== true && record.main_location_source !== undefined) {
      errors.push({
        file,
        property: 'main_location_source',
        message: 'Main-location source metadata is only valid for mod-added locations',
        value: record.main_location_source,
      });
    }
    if (record.mod_added !== true && record.location_variants !== undefined) {
      errors.push({
        file,
        property: 'location_variants',
        message: 'Location variants are only valid for mod-added locations',
        value: record.location_variants,
      });
    }
    for (const property of ['x', 'y', 'icon', 'level']) {
      if (typeof record[property] !== 'number' || !Number.isFinite(record[property])) {
        errors.push({ file, property, message: 'Expected a finite number', value: record[property] });
      }
    }
    if (record.additional_entrances !== undefined && !Array.isArray(record.additional_entrances)) {
      errors.push({
        file,
        property: 'additional_entrances',
        message: 'Expected a list of entrance coordinate objects',
        value: record.additional_entrances,
      });
    }
    const entranceCoordinates = new Set();
    if (Number.isFinite(record.x) && Number.isFinite(record.y)) {
      entranceCoordinates.add(`${record.x},${record.y}`);
    }
    for (const [index, entrance] of (Array.isArray(record.additional_entrances)
      ? record.additional_entrances
      : []).entries()) {
      const property = `additional_entrances[${index}]`;
      if (!isObject(entrance)) {
        errors.push({ file, property, message: 'Expected an entrance coordinate object', value: entrance });
        continue;
      }
      if (!Number.isInteger(entrance.map_id) || entrance.map_id <= 0) {
        errors.push({ file, property: `${property}.map_id`, message: 'Expected a positive integer', value: entrance.map_id });
      } else if (mapIds.has(entrance.map_id)) {
        errors.push({
          file,
          property: `${property}.map_id`,
          message: `Duplicate map ID also used by ${mapIds.get(entrance.map_id)}`,
          value: entrance.map_id,
        });
      } else {
        mapIds.set(entrance.map_id, `${file} ${property}`);
      }
      for (const coordinate of ['x', 'y', 'level']) {
        if (typeof entrance[coordinate] !== 'number' || !Number.isFinite(entrance[coordinate])) {
          errors.push({
            file,
            property: `${property}.${coordinate}`,
            message: 'Expected a finite number',
            value: entrance[coordinate],
          });
        }
      }
      if (entrance.region !== undefined && entrance.region !== null
          && typeof entrance.region !== 'string') {
        errors.push({
          file,
          property: `${property}.region`,
          message: 'Expected a string',
          value: entrance.region,
        });
      }
      if (Number.isFinite(entrance.x) && Number.isFinite(entrance.y)) {
        const coordinateKey = `${entrance.x},${entrance.y}`;
        if (entranceCoordinates.has(coordinateKey)) {
          errors.push({
            file,
            property,
            message: 'Duplicate entrance coordinates',
            value: coordinateKey,
          });
        }
        entranceCoordinates.add(coordinateKey);
      }
    }
    const validateLocationSource = (source, property) => {
      if (!isObject(source)) {
        errors.push({
          file,
          property,
          message: 'Expected a location source object',
          value: source,
        });
        return null;
      }
      if (typeof source.mod !== 'string' || !stableIdentifierPattern.test(source.mod.trim())) {
        errors.push({
          file,
          property: `${property}.mod`,
          message: 'Expected a wiki mod filename slug',
          value: source.mod,
        });
      }
      if (
        source.component !== undefined &&
        (typeof source.component !== 'string' || !stableIdentifierPattern.test(source.component.trim()))
      ) {
        errors.push({
          file,
          property: `${property}.component`,
          message: 'Expected a component ID slug',
          value: source.component,
        });
      }
      if (source.plugin !== undefined && (typeof source.plugin !== 'string' || !source.plugin.trim())) {
        errors.push({
          file,
          property: `${property}.plugin`,
          message: 'Expected a non-empty plugin filename',
          value: source.plugin,
        });
      }
      return source;
    };
    for (const [index, entrance] of (Array.isArray(record.additional_entrances)
      ? record.additional_entrances
      : []).entries()) {
      if (!isObject(entrance) || entrance.source === undefined) continue;
      if (record.mod_added !== true) {
        errors.push({
          file,
          property: `additional_entrances[${index}].source`,
          message: 'Entrance source metadata is only valid for mod-added locations',
          value: entrance.source,
        });
        continue;
      }
      validateLocationSource(entrance.source, `additional_entrances[${index}].source`);
    }
    if (record.main_location_source !== undefined) {
      validateLocationSource(record.main_location_source, 'main_location_source');
    }
    if (record.location_variants !== undefined && !Array.isArray(record.location_variants)) {
      errors.push({
        file,
        property: 'location_variants',
        message: 'Expected a list of plugin-specific location variants',
        value: record.location_variants,
      });
    }
    const variantSources = new Set();
    for (const [index, variant] of (Array.isArray(record.location_variants)
      ? record.location_variants
      : []
    ).entries()) {
      const property = `location_variants[${index}]`;
      if (!validateLocationSource(variant, property)) continue;
      const sourceKey = [variant.mod, variant.component ?? '', variant.plugin ?? ''].map(normalized).join(':');
      if (variantSources.has(sourceKey)) {
        errors.push({
          file,
          property,
          message: 'Only one location variant is allowed per plugin source',
          value: sourceKey,
        });
      }
      variantSources.add(sourceKey);
      for (const coordinate of ['x', 'y']) {
        if (!Number.isFinite(variant[coordinate])) {
          errors.push({
            file,
            property: `${property}.${coordinate}`,
            message: 'Expected a finite number',
            value: variant[coordinate],
          });
        }
      }
      if (variant.region !== undefined && typeof variant.region !== 'string') {
        errors.push({
          file,
          property: `${property}.region`,
          message: 'Expected a string',
          value: variant.region,
        });
      }
      if (variant.entrances !== undefined && !Array.isArray(variant.entrances)) {
        errors.push({
          file,
          property: `${property}.entrances`,
          message: 'Expected a list of entrance coordinates',
          value: variant.entrances,
        });
      }
      const variantCoordinates = new Set(
        Number.isFinite(variant.x) && Number.isFinite(variant.y) ? [`${variant.x},${variant.y}`] : [],
      );
      for (const [entranceIndex, entrance] of (Array.isArray(variant.entrances) ? variant.entrances : []).entries()) {
        const entranceProperty = `${property}.entrances[${entranceIndex}]`;
        if (!isObject(entrance)) {
          errors.push({
            file,
            property: entranceProperty,
            message: 'Expected an entrance coordinate object',
            value: entrance,
          });
          continue;
        }
        for (const coordinate of ['x', 'y']) {
          if (!Number.isFinite(entrance[coordinate])) {
            errors.push({
              file,
              property: `${entranceProperty}.${coordinate}`,
              message: 'Expected a finite number',
              value: entrance[coordinate],
            });
          }
        }
        if (entrance.region !== undefined && typeof entrance.region !== 'string') {
          errors.push({
            file,
            property: `${entranceProperty}.region`,
            message: 'Expected a string',
            value: entrance.region,
          });
        }
        if (Number.isFinite(entrance.x) && Number.isFinite(entrance.y)) {
          const coordinateKey = `${entrance.x},${entrance.y}`;
          if (variantCoordinates.has(coordinateKey)) {
            errors.push({
              file,
              property: entranceProperty,
              message: 'Duplicate variant entrance coordinates',
              value: coordinateKey,
            });
          }
          variantCoordinates.add(coordinateKey);
        }
      }
    }
    if (typeof record.draft !== 'boolean') {
      errors.push({ file, property: 'draft', message: 'Expected true or false', value: record.draft });
    }
  }
  return errors;
}

const replacementCoverageTypes = new Set(['variant', 'translation']);

function uniqueLocationValues(values) {
  const byKey = new Map();
  for (const value of values) {
    if (typeof value !== 'string' || !value.trim()) continue;
    const key = normalized(value);
    if (!byKey.has(key)) byKey.set(key, value.trim());
  }
  return [...byKey.values()];
}

function numericExteriorEdits(values) {
  const byKey = new Map();
  for (const rawEdit of values) {
    if (!isObject(rawEdit)) continue;
    const cell = parseExteriorCell(rawEdit.cell);
    if (!cell || !Number.isSafeInteger(cell.x) || !Number.isSafeInteger(cell.y)) continue;
    const landscape = rawEdit.landscape === true;
    const references = Number.isSafeInteger(rawEdit.references) && rawEdit.references > 0
      ? rawEdit.references
      : 0;
    const key = `${cell.x},${cell.y}`;
    const existing = byKey.get(key) ?? { x: cell.x, y: cell.y, landscape: false, references: 0 };
    existing.landscape ||= landscape;
    existing.references += references;
    byKey.set(key, existing);
  }
  return [...byKey.values()];
}

function mergeExteriorEdits(...groups) {
  return numericExteriorEdits(groups.flat().map(edit => ({
    cell: `${edit.x}, ${edit.y}`,
    landscape: edit.landscape,
    references: edit.references,
  })));
}

export function generateMapData(mods) {
  return {
    generated_from: 'wiki/content/mods',
    mods: mods
      .filter(mod => {
        if (mod.parseError || mod.frontmatter?.draft !== false) return false;
        const hasComponentLocations = Array.isArray(mod.frontmatter?.components)
          && mod.frontmatter.components.some(component =>
            isObject(component)
            && ((Array.isArray(component.map_locations) && component.map_locations.length > 0)
              || exteriorEditValues(component).length > 0));
        return mod.frontmatter?.map_enabled === true || hasComponentLocations;
      })
      .map(mod => {
        const record = mod.frontmatter;
        const baseLocations = Array.isArray(record.map_locations) ? record.map_locations : [];
        const baseExteriorEdits = numericExteriorEdits(exteriorEditValues(record));
        const componentLocations = (Array.isArray(record.components) ? record.components : [])
          .filter(component => isObject(component)
            && typeof component.id === 'string'
            && typeof component.name === 'string'
            && typeof component.type === 'string')
          .map(component => {
            const type = component.type.trim();
            const coverageMode = replacementCoverageTypes.has(type) ? 'replace' : 'additive';
            const locations = uniqueLocationValues(
              Array.isArray(component.map_locations) ? component.map_locations : [],
            );
            const exterior_edits = numericExteriorEdits(exteriorEditValues(component));
            return {
              id: component.id.trim(),
              name: component.name.trim(),
              type,
              coverage_mode: coverageMode,
              locations,
              exterior_edits,
              effective_locations: coverageMode === 'replace'
                ? locations
                : uniqueLocationValues([...baseLocations, ...locations]),
              effective_exterior_edits: coverageMode === 'replace'
                ? exterior_edits
                : mergeExteriorEdits(baseExteriorEdits, exterior_edits),
            };
          })
          .filter(component => component.effective_locations.length > 0
            || component.effective_exterior_edits.length > 0);
        const generated = {
          id: typeof record.map_id === 'string' && record.map_id.trim() ? record.map_id.trim() : mod.slug,
          wiki_slug: mod.slug,
          name: record.title.trim(),
          title: record.title.trim(),
          authors: Array.isArray(record.authors) ? record.authors : [],
          locations: baseLocations,
          exterior_edits: baseExteriorEdits,
          categories: Array.isArray(record.categories) ? record.categories : [],
          tags: Array.isArray(record.tags) ? record.tags : [],
          events: Array.isArray(record.events) ? record.events : [],
          wiki_url: `/wiki/mods/${mod.slug}`,
          map_url: `/map/?mod=${encodeURIComponent(mod.slug)}`,
        };
        if (componentLocations.length > 0) generated.component_locations = componentLocations;
        const locationChanges = normalizedMapLocationChanges(record.map_location_changes);
        if (locationChanges.length > 0) generated.location_changes = locationChanges;
        if (typeof record.description === 'string' && record.description.trim()) {
          generated.description = record.description.trim();
        }
        if (typeof record.picture_url === 'string' && record.picture_url.trim()) {
          generated.picture_url = record.picture_url.trim();
        }
        if (typeof record.url === 'string' && record.url.trim()) generated.url = record.url.trim();
        return generated;
      })
      .sort((left, right) => collator.compare(left.name, right.name)),
  };
}

export function generateLocationMapData(locations) {
  const generatedSource = source => {
    if (!isObject(source) || typeof source.mod !== 'string' || !source.mod.trim()) return null;
    const generated = { mod: source.mod.trim() };
    if (typeof source.component === 'string' && source.component.trim()) {
      generated.component = source.component.trim();
    }
    if (typeof source.plugin === 'string' && source.plugin.trim()) {
      generated.plugin = source.plugin.trim();
    }
    return generated;
  };
  return {
    generated_from: 'wiki/content/locations',
    world: { ...MAP_WORLD },
    locations: locations
      .filter(location => !location.parseError && location.frontmatter?.draft === false)
      .map(location => {
        const record = location.frontmatter;
        const generated = {
          id: record.map_id,
          name: record.title.trim(),
          x: record.x,
          y: record.y,
          icon: record.icon,
          level: record.level,
          wiki_url: `/wiki/locations/${location.slug}`,
        };
        if (typeof record.cell === 'string' && record.cell.trim()) generated.cell = record.cell.trim();
        if (typeof record.region === 'string' && record.region.trim()) generated.region = record.region.trim();
        if (typeof record.uesp_wiki === 'string' && record.uesp_wiki.trim()) generated.wiki = record.uesp_wiki.trim();
        if (record.mod_added === true) {
          generated.mod_added = true;
          generated.mod_added_by = record.mod_added_by.trim();
          const mainSource = generatedSource(record.main_location_source);
          if (mainSource) generated.main_source = mainSource;
        }
        if (Array.isArray(record.additional_entrances) && record.additional_entrances.length > 0) {
          generated.entrances = record.additional_entrances.map(entrance => {
            const generatedEntrance = {
              id: entrance.map_id,
              x: entrance.x,
              y: entrance.y,
              level: entrance.level,
            };
            if (typeof entrance.region === 'string' && entrance.region.trim()) {
              generatedEntrance.region = entrance.region.trim();
            }
            const source = generatedSource(entrance.source);
            if (source) generatedEntrance.source = source;
            return generatedEntrance;
          });
        }
        if (Array.isArray(record.location_variants) && record.location_variants.length > 0) {
          generated.variants = record.location_variants.map((variant, variantIndex) => {
            const generatedVariant = {
              id: `${record.map_id}:variant:${variantIndex}`,
              mod: variant.mod.trim(),
              x: variant.x,
              y: variant.y,
            };
            if (typeof variant.component === 'string' && variant.component.trim()) {
              generatedVariant.component = variant.component.trim();
            }
            if (typeof variant.plugin === 'string' && variant.plugin.trim()) {
              generatedVariant.plugin = variant.plugin.trim();
            }
            if (typeof variant.region === 'string' && variant.region.trim()) {
              generatedVariant.region = variant.region.trim();
            }
            if (Array.isArray(variant.entrances) && variant.entrances.length > 0) {
              generatedVariant.entrances = variant.entrances.map((entrance, entranceIndex) => {
                const generatedEntrance = {
                  id: `${record.map_id}:variant:${variantIndex}:${entranceIndex}`,
                  x: entrance.x,
                  y: entrance.y,
                };
                if (typeof entrance.region === 'string' && entrance.region.trim()) {
                  generatedEntrance.region = entrance.region.trim();
                }
                return generatedEntrance;
              });
            }
            return generatedVariant;
          });
        }
        return generated;
      })
      .sort((left, right) => left.id - right.id),
  };
}

export function formatValidationErrors(errors) {
  return errors.map(error => {
    const lines = [error.file, '', `${error.message}:`, `  ${error.property}`];
    if ('value' in error) {
      const value = Array.isArray(error.value)
        ? error.value.map(item => `  - ${item}`).join('\n')
        : `  ${JSON.stringify(error.value)}`;
      lines.push('', 'Invalid value:', value);
    }
    if (Array.isArray(error.expected) && error.expected.length > 0) {
      const preview = error.expected.slice(0, 30).map(item => `  - ${item}`);
      if (error.expected.length > preview.length) preview.push(`  …and ${error.expected.length - preview.length} more`);
      lines.push('', 'Expected one of:', ...preview);
    }
    return lines.join('\n');
  }).join('\n\n---\n\n');
}

export async function validateWikiProject(options = {}) {
  const [mods, locations, vocabularies] = await Promise.all([
    loadWikiMods(options.modsDirectory),
    loadWikiLocations(options.locationsDirectory),
    loadControlledVocabularies(options),
  ]);
  const errors = [
    ...validateControlledVocabularies(vocabularies),
    ...validateWikiLocations(locations),
    ...validateWikiMods(mods, {
      categories: vocabularies.properties.categories,
      map_locations: vocabularies.map_locations,
    }),
  ];
  return { mods, locations, vocabularies, errors };
}
