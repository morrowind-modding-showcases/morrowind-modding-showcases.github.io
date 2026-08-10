const textEncoder = new TextEncoder();

export const WIKI_SUBMISSION_SCHEMA_VERSION = 1;
export const MAX_GENERATED_MARKDOWN_BYTES = 100 * 1024;
export const MAX_NOTES_LENGTH = 5_000;
export const MAX_TURNSTILE_TOKEN_LENGTH = 2_048;
export const SUBMISSION_KINDS = Object.freeze([
  'new-mod',
  'edit-mod',
  'edit-location',
  'new-location',
]);

export const MOD_TARGET_PATTERN = /^wiki\/content\/mods\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
export const LOCATION_TARGET_PATTERN = /^wiki\/content\/locations\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label} contains missing or unexpected fields.`);
  }
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

function validateModChanges(value, { creating }) {
  const keys = [
    'title', 'authors', 'url', 'picture_url', 'showcase_url',
    'categories', 'events', 'map_enabled', 'map_locations',
  ];
  const hasLegacyDescription = Object.hasOwn(value, 'description');
  if (hasLegacyDescription) keys.push('description');
  if (creating) keys.push('slug');
  expectExactKeys(value, keys, 'changes');
  // Keep already-queued version 1 submissions importable, but never carry their
  // former SEO override into the normalized changes or reconstructed frontmatter.
  if (hasLegacyDescription) {
    expectString(value.description, 'changes.description', { min: creating ? 1 : 0, max: 1_000 });
  }
  const changes = {
    title: expectString(value.title, 'changes.title', { min: 1, max: 200, singleLine: true }),
    authors: expectUniqueStringArray(value.authors, 'changes.authors', { min: creating ? 1 : 0, max: 50, itemMax: 200 }),
    url: expectString(value.url, 'changes.url', { min: creating ? 1 : 0, max: 2_000, singleLine: true }),
    picture_url: expectOptionalUrl(value.picture_url, 'changes.picture_url'),
    showcase_url: expectOptionalUrl(value.showcase_url, 'changes.showcase_url'),
    categories: expectUniqueStringArray(value.categories, 'changes.categories', { min: 1, max: 1, itemMax: 100 }),
    events: expectUniqueStringArray(value.events, 'changes.events', { max: 50, itemMax: 200 }),
    map_enabled: value.map_enabled,
    map_locations: expectUniqueStringArray(value.map_locations, 'changes.map_locations', { max: 200, itemMax: 300 }),
  };
  if (typeof changes.map_enabled !== 'boolean') fail('changes.map_enabled must be true or false.');
  if (changes.map_enabled && changes.map_locations.length === 0) {
    fail('Map-enabled mods require at least one controlled map location.');
  }
  if (!changes.map_enabled && changes.map_locations.length !== 0) {
    fail('Map-disabled mods must not include map locations.');
  }
  if (creating) {
    changes.slug = expectString(value.slug, 'changes.slug', { min: 1, max: 120, singleLine: true });
    if (!isValidWikiFilename(changes.slug)) fail('changes.slug is not a valid wiki filename.');
  }
  return changes;
}

function validateLocationChanges(value, { creating }) {
  expectExactKeys(value, ['cell', 'region', 'x', 'y', 'uesp_wiki', 'additional_entrances'], 'changes');
  if (!Array.isArray(value.additional_entrances) || value.additional_entrances.length > 100) {
    fail('changes.additional_entrances must be a bounded array.');
  }
  const additional_entrances = value.additional_entrances.map((entrance, index) => {
    expectExactKeys(
      entrance,
      creating ? ['x', 'y', 'region'] : ['sourceIndex', 'x', 'y', 'region'],
      `changes.additional_entrances[${index}]`,
    );
    const validated = {
      x: expectInteger(entrance.x, `changes.additional_entrances[${index}].x`),
      y: expectInteger(entrance.y, `changes.additional_entrances[${index}].y`),
      region: expectString(entrance.region, `changes.additional_entrances[${index}].region`, { max: 200, singleLine: true }),
    };
    if (!creating) {
      validated.sourceIndex = expectInteger(
        entrance.sourceIndex,
        `changes.additional_entrances[${index}].sourceIndex`,
      );
      if (validated.sourceIndex < 0) fail('Entrance source indexes must be non-negative.');
    }
    return validated;
  });
  if (!creating) {
    const indexes = additional_entrances.map(entrance => entrance.sourceIndex);
    if (new Set(indexes).size !== indexes.length) fail('Entrance source indexes must be unique.');
  }
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
  if (kind === 'new-location') keys.push('suggestedFilename');
  expectExactKeys(value, keys, 'payload');

  if (value.schemaVersion !== WIKI_SUBMISSION_SCHEMA_VERSION) fail('schemaVersion must be 1.');
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
    schemaVersion: 1,
    submissionId,
    kind,
    contributorName: validateContributorName(value.contributorName),
    notes: expectString(value.notes, 'notes', { max: MAX_NOTES_LENGTH }),
    createdAt,
    changes: kind === 'new-mod' || kind === 'edit-mod'
      ? validateModChanges(value.changes, { creating: kind === 'new-mod' })
      : validateLocationChanges(value.changes, { creating: kind === 'new-location' }),
    generatedMarkdown,
  };
  if (kind.startsWith('edit-')) result.target = validateTarget(value.target, kind);
  if (kind === 'new-location') {
    result.suggestedFilename = expectString(value.suggestedFilename, 'suggestedFilename', { min: 1, max: 120, singleLine: true });
    if (!isValidWikiFilename(result.suggestedFilename)) fail('suggestedFilename is not a valid wiki filename.');
  }
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
