import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import matter from 'gray-matter';
import yaml from 'js-yaml';
import categoryApi from '../modathon/nexus-categories.js';

export const SITE_MOD_CATEGORIES = categoryApi.CATEGORIES;

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

export function exteriorCellIsOnMap(cell, world = MAP_WORLD) {
  const minX = Math.floor(world.posLeft / world.cellSize);
  const maxX = Math.ceil(world.posRight / world.cellSize) - 1;
  const minY = Math.floor(world.posBottom / world.cellSize);
  const maxY = Math.ceil(world.posTop / world.cellSize) - 1;
  return cell.x >= minX && cell.x <= maxX && cell.y >= minY && cell.y <= maxY;
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
const normalized = value => String(value ?? '').trim().toLocaleLowerCase('en-US');
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
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
  compareVocabulary(
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
  const value = record[property];
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

export function validateWikiMods(mods, { categories = [], map_locations: mapLocations = [] } = {}) {
  const errors = [];
  const categoryByKey = new Map(categories.map(value => [normalized(value), value]));
  const locationByKey = new Map(mapLocations.map(value => [normalized(value), value]));
  const slugs = new Map();
  const mapIds = new Map();

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
    const exteriorCells = validateStringList(record, 'map_exterior_cells', file, errors);
    void authors;

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

    const seenExteriorCells = new Set();
    for (const value of exteriorCells) {
      const cell = parseExteriorCell(value);
      if (!cell) {
        errors.push({
          file,
          property: 'map_exterior_cells',
          message: 'Exterior cells must use signed X, Y grid coordinates',
          value,
        });
        continue;
      }
      const key = `${cell.x},${cell.y}`;
      if (seenExteriorCells.has(key)) {
        errors.push({
          file,
          property: 'map_exterior_cells',
          message: 'Duplicate exterior cell',
          value,
        });
      }
      seenExteriorCells.add(key);
      if (value !== formatExteriorCell(cell)) {
        errors.push({
          file,
          property: 'map_exterior_cells',
          message: 'Exterior cells must use the canonical X, Y format',
          value,
          expected: [formatExteriorCell(cell)],
        });
      }
      if (!exteriorCellIsOnMap(cell)) {
        errors.push({
          file,
          property: 'map_exterior_cells',
          message: 'Exterior cell is outside the TES3 Mod Map imagery',
          value,
        });
      }
    }

    if (record.map_enabled === true && record.draft === false
        && locations.length === 0 && exteriorCells.length === 0) {
      errors.push({
        file,
        property: 'map_enabled',
        message: 'Published map-enabled mods need at least one location or exterior cell',
        value: { map_locations: locations, map_exterior_cells: exteriorCells },
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
    const candidateFolder = locationFolderSlug(record);
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
    if (typeof record.draft !== 'boolean') {
      errors.push({ file, property: 'draft', message: 'Expected true or false', value: record.draft });
    }
  }
  return errors;
}

export function generateMapData(mods) {
  return {
    generated_from: 'wiki/content/mods',
    mods: mods
      .filter(mod => !mod.parseError && mod.frontmatter?.draft === false && mod.frontmatter?.map_enabled === true)
      .map(mod => {
        const record = mod.frontmatter;
        const generated = {
          id: typeof record.map_id === 'string' && record.map_id.trim() ? record.map_id.trim() : mod.slug,
          wiki_slug: mod.slug,
          name: record.title.trim(),
          title: record.title.trim(),
          authors: Array.isArray(record.authors) ? record.authors : [],
          locations: Array.isArray(record.map_locations) ? record.map_locations : [],
          exterior_cells: (Array.isArray(record.map_exterior_cells)
            ? record.map_exterior_cells
            : [])
            .map(parseExteriorCell)
            .filter(Boolean)
            .map(cell => [cell.x, cell.y]),
          categories: Array.isArray(record.categories) ? record.categories : [],
          tags: Array.isArray(record.tags) ? record.tags : [],
          events: Array.isArray(record.events) ? record.events : [],
          wiki_url: `/wiki/mods/${mod.slug}`,
          map_url: `/map/?mod=${encodeURIComponent(mod.slug)}`,
        };
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
            return generatedEntrance;
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
