const textEncoder = new TextEncoder();

export const WIKI_SUBMISSION_SCHEMA_VERSION = 4;
export const MAX_GENERATED_MARKDOWN_BYTES = 100 * 1024;
export const MAX_NOTES_LENGTH = 5_000;
export const MAX_TURNSTILE_TOKEN_LENGTH = 2_048;
export const SUBMISSION_KINDS = Object.freeze([
  'new-mod',
  'edit-mod',
  'edit-location',
]);

export const MOD_TARGET_PATTERN = /^wiki\/content\/mods\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
export const LOCATION_TARGET_PATTERN = /^wiki\/content\/locations\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const COMPONENT_TYPES = Object.freeze(['variant', 'patch', 'translation', 'optional']);
export const RELATIONSHIP_TYPES = Object.freeze([
  'requires',
  'patch_for',
  'variant_of',
  'translation_of',
  'compatible_with',
  'incompatible_with',
]);

export class SubmissionValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SubmissionValidationError';
  }
}

const fail = message => {
  throw new SubmissionValidationError(message);
};
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const normalized = value => String(value).trim().toLocaleLowerCase('en-US');

function expectRecord(value, label) {
  if (!isRecord(value)) fail(`${label} must be an object.`);
  return value;
}

function expectExactKeys(value, keys, label) {
  const actual = Object.keys(expectRecord(value, label)).sort();
  const expected = [...keys].sort();
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter(key => !actualSet.has(key));
  const unexpected = actual.filter(key => !expectedSet.has(key));
  if (missing.length === 0 && unexpected.length === 0) return;

  const parts = [];
  if (missing.length > 0) {
    parts.push(`missing field${missing.length === 1 ? '' : 's'}: ${missing.map(JSON.stringify).join(', ')}`);
  }
  if (unexpected.length > 0) {
    parts.push(`unexpected field${unexpected.length === 1 ? '' : 's'}: ${unexpected.map(JSON.stringify).join(', ')}`);
  }
  fail(`${label} has ${parts.join('; ')}.`);
}

function expectString(value, label, { min = 0, max, singleLine = false } = {}) {
  if (typeof value !== 'string') fail(`${label} must be a string.`);
  const trimmed = value.trim();
  if (trimmed.length < min) fail(`${label} is too short.`);
  if (max !== undefined && trimmed.length > max) fail(`${label} is too long.`);
  if (singleLine && /[\r\n\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value)) {
    fail(`${label} must be a single line without control characters.`);
  }
  return trimmed;
}

function expectOptionalUrl(value, label) {
  const result = expectString(value, label, { max: 2_000, singleLine: true });
  if (result && !/^https?:\/\/[^\s]+$/iu.test(result)) fail(`${label} must be a complete HTTP(S) URL.`);
  return result;
}

function expectInteger(value, label) {
  if (!Number.isInteger(value)) fail(`${label} must be a signed whole number.`);
  return value;
}

function expectUniqueStringArray(value, label, { min = 0, max = 100, itemMax = 300 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail(`${label} must contain between ${min} and ${max} values.`);
  }
  const seen = new Set();
  return value.map((item, index) => {
    const result = expectString(item, `${label}[${index}]`, { min: 1, max: itemMax, singleLine: true });
    const key = normalized(result);
    if (seen.has(key)) fail(`${label} contains duplicate values.`);
    seen.add(key);
    return result;
  });
}

function expectExteriorCellArray(value, label) {
  const cells = expectUniqueStringArray(value, label, { max: 4_096, itemMax: 40 });
  for (const [index, cell] of cells.entries()) {
    const match = cell.match(/^(-?\d+), (-?\d+)$/u);
    if (!match) fail(`${label}[${index}] must use canonical signed X, Y coordinates.`);
    const x = Number(match[1]);
    const y = Number(match[2]);
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
      fail(`${label}[${index}] must use safe whole-number coordinates.`);
    }
    if (x < -34 || x > 29 || y < -27 || y > 36) {
      fail(`${label}[${index}] is outside the TES3 Mod Map.`);
    }
  }
  return cells;
}

function expectExteriorEditArray(value, label) {
  if (!Array.isArray(value) || value.length > 4_096) {
    fail(`${label} must contain at most 4096 exterior edits.`);
  }
  const seen = new Set();
  return value.map((rawEdit, index) => {
    const editLabel = `${label}[${index}]`;
    expectExactKeys(rawEdit, ['cell', 'landscape', 'references'], editLabel);
    const cell = expectExteriorCellArray([rawEdit.cell], `${editLabel}.cell`)[0];
    if (typeof rawEdit.landscape !== 'boolean') fail(`${editLabel}.landscape must be true or false.`);
    if (!Number.isSafeInteger(rawEdit.references) || rawEdit.references < 0) {
      fail(`${editLabel}.references must be a non-negative whole number.`);
    }
    const key = normalized(cell);
    if (seen.has(key)) fail(`${label} contains duplicate exterior cells.`);
    seen.add(key);
    return {
      cell,
      landscape: rawEdit.landscape,
      references: rawEdit.references,
    };
  });
}

const legacyExteriorEdits = cells => cells.map(cell => ({
  cell,
  landscape: true,
  references: 0,
}));

function expectNewLocationArray(value, label) {
  if (!Array.isArray(value) || value.length > 100) {
    fail(`${label} must contain at most 100 locations.`);
  }
  const cells = new Set();
  const slugs = new Set();
  return value.map((rawLocation, index) => {
    const locationLabel = `${label}[${index}]`;
    expectExactKeys(
      rawLocation,
      ['slug', 'cell', 'region', 'x', 'y', 'additional_entrances', 'description'],
      locationLabel,
    );
    const cell = expectString(rawLocation.cell, `${locationLabel}.cell`, {
      min: 1,
      max: 300,
      singleLine: true,
    });
    const slug = expectString(rawLocation.slug, `${locationLabel}.slug`, {
      min: 1,
      max: 120,
      singleLine: true,
    });
    if (!isValidWikiFilename(slug)) fail(`${locationLabel}.slug is malformed.`);
    if (slug !== slugifyWikiFilename(cell)) {
      fail(`${locationLabel}.slug must match the filename generated from its cell name.`);
    }
    const cellKey = normalized(cell);
    const slugKey = normalized(slug);
    if (cells.has(cellKey)) fail(`${label} contains duplicate cell names.`);
    if (slugs.has(slugKey)) fail(`${label} contains duplicate filenames.`);
    cells.add(cellKey);
    slugs.add(slugKey);
    const x = expectInteger(rawLocation.x, `${locationLabel}.x`);
    const y = expectInteger(rawLocation.y, `${locationLabel}.y`);
    if (x < -278_528 || x > 245_760 || y < -221_184 || y > 303_104) {
      fail(`${locationLabel} coordinates are outside the TES3 Mod Map.`);
    }
    if (!Array.isArray(rawLocation.additional_entrances)
        || rawLocation.additional_entrances.length > 100) {
      fail(`${locationLabel}.additional_entrances must contain at most 100 entrances.`);
    }
    const coordinates = new Set([`${x},${y}`]);
    const additional_entrances = rawLocation.additional_entrances.map((rawEntrance, entranceIndex) => {
      const entranceLabel = `${locationLabel}.additional_entrances[${entranceIndex}]`;
      expectExactKeys(rawEntrance, ['x', 'y', 'region'], entranceLabel);
      const entrance = {
        x: expectInteger(rawEntrance.x, `${entranceLabel}.x`),
        y: expectInteger(rawEntrance.y, `${entranceLabel}.y`),
        region: expectString(rawEntrance.region, `${entranceLabel}.region`, {
          max: 200,
          singleLine: true,
        }),
      };
      if (entrance.x < -278_528 || entrance.x > 245_760
          || entrance.y < -221_184 || entrance.y > 303_104) {
        fail(`${entranceLabel} coordinates are outside the TES3 Mod Map.`);
      }
      const coordinateKey = `${entrance.x},${entrance.y}`;
      if (coordinates.has(coordinateKey)) fail(`${locationLabel} contains duplicate entrance coordinates.`);
      coordinates.add(coordinateKey);
      return entrance;
    });
    return {
      slug,
      cell,
      region: expectString(rawLocation.region, `${locationLabel}.region`, {
        min: 1,
        max: 200,
        singleLine: true,
      }),
      x,
      y,
      additional_entrances,
      description: expectString(rawLocation.description, `${locationLabel}.description`, {
        min: 1,
        max: 20_000,
      }),
    };
  });
}

function expectLocationVariantArray(value, label) {
  if (!Array.isArray(value) || value.length > 100) {
    fail(`${label} must contain at most 100 location choices.`);
  }
  const sources = new Set();
  const mainCells = new Set();
  return value.map((rawVariant, index) => {
    const variantLabel = `${label}[${index}]`;
    expectExactKeys(
      rawVariant,
      ['cell', 'mode', 'plugin', 'component_id', 'x', 'y', 'region', 'additional_entrances'],
      variantLabel,
    );
    const cell = expectString(rawVariant.cell, `${variantLabel}.cell`, {
      min: 1,
      max: 300,
      singleLine: true,
    });
    const cellKey = normalized(cell);
    const mode = expectString(rawVariant.mode, `${variantLabel}.mode`, {
      min: 1,
      max: 20,
      singleLine: true,
    });
    if (!['variant', 'main'].includes(mode)) {
      fail(`${variantLabel}.mode must be variant or main.`);
    }
    const component_id = expectString(rawVariant.component_id, `${variantLabel}.component_id`, {
      max: 120,
      singleLine: true,
    });
    if (component_id && !SLUG_PATTERN.test(component_id)) {
      fail(`${variantLabel}.component_id is malformed.`);
    }
    const plugin = expectString(rawVariant.plugin, `${variantLabel}.plugin`, {
      min: 1,
      max: 300,
      singleLine: true,
    });
    const sourceKey = [cell, component_id, plugin].map(normalized).join(':');
    if (sources.has(sourceKey)) fail(`${label} contains duplicate plugin sources.`);
    sources.add(sourceKey);
    if (mode === 'main') {
      if (mainCells.has(cellKey)) fail(`${label} selects more than one main location for ${cell}.`);
      mainCells.add(cellKey);
    }
    const x = expectInteger(rawVariant.x, `${variantLabel}.x`);
    const y = expectInteger(rawVariant.y, `${variantLabel}.y`);
    if (x < -278_528 || x > 245_760 || y < -221_184 || y > 303_104) {
      fail(`${variantLabel} coordinates are outside the TES3 Mod Map.`);
    }
    if (!Array.isArray(rawVariant.additional_entrances) || rawVariant.additional_entrances.length > 100) {
      fail(`${variantLabel}.additional_entrances must contain at most 100 entrances.`);
    }
    const coordinates = new Set([`${x},${y}`]);
    const additional_entrances = rawVariant.additional_entrances.map((rawEntrance, entranceIndex) => {
      const entranceLabel = `${variantLabel}.additional_entrances[${entranceIndex}]`;
      expectExactKeys(rawEntrance, ['x', 'y', 'region'], entranceLabel);
      const entrance = {
        x: expectInteger(rawEntrance.x, `${entranceLabel}.x`),
        y: expectInteger(rawEntrance.y, `${entranceLabel}.y`),
        region: expectString(rawEntrance.region, `${entranceLabel}.region`, {
          max: 200,
          singleLine: true,
        }),
      };
      if (entrance.x < -278_528 || entrance.x > 245_760 || entrance.y < -221_184 || entrance.y > 303_104) {
        fail(`${entranceLabel} coordinates are outside the TES3 Mod Map.`);
      }
      const coordinateKey = `${entrance.x},${entrance.y}`;
      if (coordinates.has(coordinateKey)) fail(`${variantLabel} contains duplicate entrance coordinates.`);
      coordinates.add(coordinateKey);
      return entrance;
    });
    return {
      cell,
      mode,
      plugin,
      component_id,
      x,
      y,
      region: expectString(rawVariant.region, `${variantLabel}.region`, {
        max: 200,
        singleLine: true,
      }),
      additional_entrances,
    };
  });
}

function expectRelationships(value, label) {
  if (!Array.isArray(value) || value.length > 100) {
    fail(`${label} must contain at most 100 relationships.`);
  }
  const seen = new Set();
  return value.map((rawRelation, index) => {
    const relationLabel = `${label}[${index}]`;
    expectExactKeys(rawRelation, ['type', 'target'], relationLabel);
    const type = expectString(rawRelation.type, `${relationLabel}.type`, { min: 1, max: 50, singleLine: true });
    const target = expectString(rawRelation.target, `${relationLabel}.target`, { min: 1, max: 120, singleLine: true });
    if (!RELATIONSHIP_TYPES.includes(type)) fail(`${relationLabel}.type is unsupported.`);
    if (!SLUG_PATTERN.test(target)) fail(`${relationLabel}.target must be a wiki mod filename slug.`);
    const identifier = `${normalized(type)}:${normalized(target)}`;
    if (seen.has(identifier)) fail(`${label} contains duplicate normalized relationships.`);
    seen.add(identifier);
    return { type, target };
  });
}

function expectComponents(value, label, schemaVersion) {
  if (!Array.isArray(value) || value.length > 100) {
    fail(`${label} must contain at most 100 components.`);
  }
  const ids = new Set();
  return value.map((rawComponent, index) => {
    const componentLabel = `${label}[${index}]`;
    const component = expectRecord(rawComponent, componentLabel);
    const exteriorKey = schemaVersion === 1 ? 'map_exterior_cells' : 'map_exterior_edits';
    const hasExteriorCoverage = Object.hasOwn(component, exteriorKey);
    const keys = ['id', 'name', 'type', 'plugins', 'relations', 'map_locations', 'notes'];
    if (hasExteriorCoverage) keys.push(exteriorKey);
    expectExactKeys(
      component,
      keys,
      componentLabel,
    );
    const id = expectString(component.id, `${componentLabel}.id`, { min: 1, max: 120, singleLine: true });
    if (!SLUG_PATTERN.test(id)) fail(`${componentLabel}.id is malformed.`);
    const normalizedId = normalized(id);
    if (ids.has(normalizedId)) fail(`${label} contains a duplicate component ID.`);
    ids.add(normalizedId);
    const type = expectString(component.type, `${componentLabel}.type`, { min: 1, max: 50, singleLine: true });
    if (!COMPONENT_TYPES.includes(type)) fail(`${componentLabel}.type is unsupported.`);
    return {
      id,
      name: expectString(component.name, `${componentLabel}.name`, { min: 1, max: 200, singleLine: true }),
      type,
      plugins: expectUniqueStringArray(component.plugins, `${componentLabel}.plugins`, { max: 100, itemMax: 300 }),
      relations: expectRelationships(component.relations, `${componentLabel}.relations`),
      map_locations: expectUniqueStringArray(component.map_locations, `${componentLabel}.map_locations`, { max: 200, itemMax: 300 }),
      map_exterior_edits: hasExteriorCoverage
        ? schemaVersion === 1
          ? legacyExteriorEdits(expectExteriorCellArray(component.map_exterior_cells, `${componentLabel}.map_exterior_cells`))
          : expectExteriorEditArray(component.map_exterior_edits, `${componentLabel}.map_exterior_edits`)
        : [],
      notes: expectString(component.notes, `${componentLabel}.notes`, { max: 5_000 }),
    };
  });
}

export function slugifyWikiFilename(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .toLocaleLowerCase('en-US')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

export function isValidWikiFilename(value) {
  return typeof value === 'string' && SLUG_PATTERN.test(value);
}

export function isSafeModTargetPath(value) {
  return typeof value === 'string'
    && !value.endsWith('/index.md')
    && !value.includes('..')
    && !value.includes('\\')
    && !value.includes('\0')
    && MOD_TARGET_PATTERN.test(value);
}

export function isSafeLocationTargetPath(value) {
  return typeof value === 'string'
    && !value.endsWith('/index.md')
    && !value.includes('..')
    && !value.includes('\\')
    && !value.includes('\0')
    && LOCATION_TARGET_PATTERN.test(value);
}

export function isSafeEditTargetPath(value) {
  return isSafeModTargetPath(value) || isSafeLocationTargetPath(value);
}

export function articleBodyFromGeneratedMarkdown(source) {
  if (typeof source !== 'string') fail('generatedMarkdown must be a string.');
  const match = source.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)([\s\S]*)$/u);
  if (!match) fail('generatedMarkdown must contain valid YAML frontmatter delimiters.');
  if (!match[1].trim()) fail('The article text must not be blank.');
  return match[1];
}

function validateContributorName(value) {
  const name = expectString(value, 'contributorName', { min: 2, max: 100, singleLine: true });
  if (/[<>]/u.test(name)) fail('contributorName must not contain HTML markup.');
  return name;
}

function validateTarget(value, kind) {
  expectExactKeys(value, ['path', 'baseSha256'], 'target');
  const target = {
    path: expectString(value.path, 'target.path', { min: 1, max: 300, singleLine: true }),
    baseSha256: expectString(value.baseSha256, 'target.baseSha256', { min: 64, max: 64, singleLine: true }),
  };
  const pathIsValid = kind === 'edit-mod'
    ? isSafeModTargetPath(target.path)
    : isSafeLocationTargetPath(target.path);
  if (!pathIsValid) fail('target.path is not a permitted wiki article path.');
  if (!/^[a-f0-9]{64}$/u.test(target.baseSha256)) fail('target.baseSha256 must be lowercase hexadecimal SHA-256.');
  return target;
}

function validateModChanges(value, { creating, schemaVersion }) {
  const exteriorKey = schemaVersion === 1 ? 'map_exterior_cells' : 'map_exterior_edits';
  const keys = [
    'title', 'authors', 'url', 'picture_url', 'showcase_url',
    'categories', 'events', 'map_enabled', 'map_locations', exteriorKey,
  ];
  if (schemaVersion >= 3) keys.push('new_locations');
  if (schemaVersion >= 4) keys.push('location_variants');
  const hasLegacyDescription = Object.hasOwn(value, 'description');
  const hasRelations = Object.hasOwn(value, 'relations');
  const hasComponents = Object.hasOwn(value, 'components');
  if (hasLegacyDescription) keys.push('description');
  if (hasRelations) keys.push('relations');
  if (hasComponents) keys.push('components');
  if (creating) keys.push('slug');
  expectExactKeys(value, keys, 'changes');
  // Already-queued version 1 payloads may contain the former SEO override.
  // Validate that legacy value, but omit it from normalized changes.
  if (hasLegacyDescription) {
    expectString(value.description, 'changes.description', { max: 1_000 });
  }
  const changes = {
    title: expectString(value.title, 'changes.title', { min: 1, max: 200, singleLine: true }),
    authors: expectUniqueStringArray(value.authors, 'changes.authors', { min: creating ? 1 : 0, max: 50, itemMax: 200 }),
    url: expectOptionalUrl(value.url, 'changes.url'),
    picture_url: expectOptionalUrl(value.picture_url, 'changes.picture_url'),
    showcase_url: expectOptionalUrl(value.showcase_url, 'changes.showcase_url'),
    categories: expectUniqueStringArray(value.categories, 'changes.categories', { min: 1, max: 1, itemMax: 100 }),
    events: expectUniqueStringArray(value.events, 'changes.events', { max: 50, itemMax: 200 }),
    map_enabled: value.map_enabled,
    map_locations: expectUniqueStringArray(value.map_locations, 'changes.map_locations', { max: 200, itemMax: 300 }),
    map_exterior_edits: schemaVersion === 1
      ? legacyExteriorEdits(expectExteriorCellArray(value.map_exterior_cells, 'changes.map_exterior_cells'))
      : expectExteriorEditArray(value.map_exterior_edits, 'changes.map_exterior_edits'),
  };
  if (schemaVersion >= 3) {
    changes.new_locations = expectNewLocationArray(value.new_locations, 'changes.new_locations');
  }
  if (schemaVersion >= 4) {
    changes.location_variants = expectLocationVariantArray(value.location_variants, 'changes.location_variants');
  }
  if (hasRelations) changes.relations = expectRelationships(value.relations, 'changes.relations');
  if (hasComponents) changes.components = expectComponents(value.components, 'changes.components', schemaVersion);
  if (!changes.url) fail('changes.url is required.');
  if (typeof changes.map_enabled !== 'boolean') fail('changes.map_enabled must be true or false.');
  const hasComponentMapCoverage = (changes.components ?? []).some(component =>
    component.map_locations.length > 0 || component.map_exterior_edits.length > 0);
  if (changes.map_enabled
      && changes.map_locations.length === 0
      && changes.map_exterior_edits.length === 0
      && !hasComponentMapCoverage) {
    fail('Map-enabled mods require at least one controlled map location or exterior cell.');
  }
  if (!changes.map_enabled
      && (changes.map_locations.length !== 0
        || changes.map_exterior_edits.length !== 0
        || hasComponentMapCoverage
        || (changes.new_locations ?? []).length !== 0
        || (changes.location_variants ?? []).length !== 0)) {
    fail('Map-disabled mods must not include map locations or exterior cells, including component coverage.');
  }
  const coveredLocations = new Set([
    ...changes.map_locations,
    ...(changes.components ?? []).flatMap(component => component.map_locations),
  ].map(normalized));
  for (const location of changes.new_locations ?? []) {
    if (!coveredLocations.has(normalized(location.cell))) {
      fail(`New location ${location.cell} must be included in the main or component map coverage.`);
    }
  }
  const componentsById = new Map((changes.components ?? []).map(component => [normalized(component.id), component]));
  for (const variant of changes.location_variants ?? []) {
    if (!coveredLocations.has(normalized(variant.cell))) {
      fail(`Location choice ${variant.cell} must be included in the main or component map coverage.`);
    }
    if (!variant.component_id) {
      if (!changes.map_locations.some(location => normalized(location) === normalized(variant.cell))) {
        fail(`Main-plugin location choice ${variant.cell} must be included in the main map coverage.`);
      }
      continue;
    }
    const component = componentsById.get(normalized(variant.component_id));
    if (!component) {
      fail(`Location choice ${variant.cell} references a nonexistent component.`);
    }
    if (!component.map_locations.some(location => normalized(location) === normalized(variant.cell))) {
      fail(`Location choice ${variant.cell} must be covered by its component.`);
    }
    if (!component.plugins.some(plugin => normalized(plugin) === normalized(variant.plugin))) {
      fail(`Location choice ${variant.cell} must reference a plugin listed on its component.`);
    }
  }
  if (creating) {
    changes.slug = expectString(value.slug, 'changes.slug', { min: 1, max: 120, singleLine: true });
    if (!isValidWikiFilename(changes.slug)) fail('changes.slug is not a valid wiki filename.');
    if (changes.slug !== slugifyWikiFilename(changes.title)) {
      fail('changes.slug must match the filename generated automatically from changes.title.');
    }
  }
  return changes;
}

function validateLocationChanges(value) {
  expectExactKeys(value, ['cell', 'region', 'x', 'y', 'uesp_wiki', 'additional_entrances'], 'changes');
  if (!Array.isArray(value.additional_entrances) || value.additional_entrances.length > 100) {
    fail('changes.additional_entrances must be a bounded array.');
  }
  const additional_entrances = value.additional_entrances.map((entrance, index) => {
    expectExactKeys(
      entrance,
      ['sourceIndex', 'x', 'y', 'region'],
      `changes.additional_entrances[${index}]`,
    );
    const validated = {
      sourceIndex: expectInteger(
        entrance.sourceIndex,
        `changes.additional_entrances[${index}].sourceIndex`,
      ),
      x: expectInteger(entrance.x, `changes.additional_entrances[${index}].x`),
      y: expectInteger(entrance.y, `changes.additional_entrances[${index}].y`),
      region: expectString(entrance.region, `changes.additional_entrances[${index}].region`, { max: 200, singleLine: true }),
    };
    if (validated.sourceIndex < 0) fail('Entrance source indexes must be non-negative.');
    return validated;
  });
  const indexes = additional_entrances.map(entrance => entrance.sourceIndex);
  if (new Set(indexes).size !== indexes.length) fail('Entrance source indexes must be unique.');
  return {
    cell: expectString(value.cell, 'changes.cell', { min: 1, max: 300, singleLine: true }),
    region: expectString(value.region, 'changes.region', { max: 200, singleLine: true }),
    x: expectInteger(value.x, 'changes.x'),
    y: expectInteger(value.y, 'changes.y'),
    uesp_wiki: expectOptionalUrl(value.uesp_wiki, 'changes.uesp_wiki'),
    additional_entrances,
  };
}

export function validateSubmissionPayload(input) {
  const value = expectRecord(input, 'payload');
  const kind = value.kind;
  if (!SUBMISSION_KINDS.includes(kind)) fail('kind is unsupported.');
  const keys = [
    'schemaVersion', 'submissionId', 'kind', 'contributorName', 'notes',
    'createdAt', 'changes', 'generatedMarkdown',
  ];
  if (kind.startsWith('edit-')) keys.push('target');
  expectExactKeys(value, keys, 'payload');

  if (![1, 2, 3, WIKI_SUBMISSION_SCHEMA_VERSION].includes(value.schemaVersion)) {
    fail(`schemaVersion must be 1, 2, 3, or ${WIKI_SUBMISSION_SCHEMA_VERSION}.`);
  }
  const submissionId = expectString(value.submissionId, 'submissionId', { min: 36, max: 36, singleLine: true });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(submissionId)) {
    fail('submissionId must be a UUID.');
  }
  const createdAt = expectString(value.createdAt, 'createdAt', { min: 20, max: 40, singleLine: true });
  if (!Number.isFinite(Date.parse(createdAt))) fail('createdAt must be an ISO timestamp.');
  if (typeof value.generatedMarkdown !== 'string') fail('generatedMarkdown must be a string.');
  const generatedMarkdown = value.generatedMarkdown;
  if (textEncoder.encode(generatedMarkdown).byteLength > MAX_GENERATED_MARKDOWN_BYTES) {
    fail('generatedMarkdown exceeds 100 KiB.');
  }
  articleBodyFromGeneratedMarkdown(generatedMarkdown);

  const result = {
    schemaVersion: value.schemaVersion,
    submissionId,
    kind,
    contributorName: validateContributorName(value.contributorName),
    notes: expectString(value.notes, 'notes', { max: MAX_NOTES_LENGTH }),
    createdAt,
    changes: kind === 'new-mod' || kind === 'edit-mod'
      ? validateModChanges(value.changes, {
        creating: kind === 'new-mod',
        schemaVersion: value.schemaVersion,
      })
      : validateLocationChanges(value.changes),
    generatedMarkdown,
  };
  if (kind.startsWith('edit-')) result.target = validateTarget(value.target, kind);
  return result;
}

export function validateSubmissionEnvelope(input) {
  expectExactKeys(input, ['turnstileToken', 'startedAt', 'website', 'payload'], 'request');
  return {
    turnstileToken: expectString(input.turnstileToken, 'turnstileToken', {
      min: 1,
      max: MAX_TURNSTILE_TOKEN_LENGTH,
      singleLine: true,
    }),
    startedAt: expectString(input.startedAt, 'startedAt', { min: 20, max: 40, singleLine: true }),
    website: expectString(input.website, 'website', { max: 0 }),
    payload: validateSubmissionPayload(input.payload),
  };
}
