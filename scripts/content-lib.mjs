import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import MadnessScore from '../assets/madness-score.js';
import Order from '../assets/order-score.js';
import { loadWikiContributionRecords } from './wiki-contribution-data.mjs';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const CONTENT_ROOT = path.join(REPO_ROOT, 'content');
export const MODATHON_ACHIEVEMENTS_ROOT = path.join(CONTENT_ROOT, 'modathon', 'achievements');
export const MODATHON_EVENTS_ROOT = path.join(CONTENT_ROOT, 'modathon', 'events');
export const MODATHON_MODS_ROOT = path.join(CONTENT_ROOT, 'modathon', 'mods');
export const MODATHON_METADATA_PATH = path.join(CONTENT_ROOT, 'modathon', 'mods-metadata.json');
export const MODJAM_EVENTS_ROOT = path.join(CONTENT_ROOT, 'modjam', 'events');
export const MODJAM_MODS_ROOT = path.join(CONTENT_ROOT, 'modjam', 'mods');
export const MODJAM_METADATA_PATH = path.join(CONTENT_ROOT, 'modjam', 'mods-metadata.json');
export const MODJAM_POSTCARDS_ROOT = path.join(CONTENT_ROOT, 'modjam', 'postcards');
export const MODJAM_POSTCARD_THUMBNAILS_ROOT = path.join(REPO_ROOT, 'modjam', 'assets', 'postcards', 'thumbnail');
export const MODJAM_POSTCARD_FULL_ROOT = path.join(REPO_ROOT, 'modjam', 'assets', 'postcards', 'full');
export const MADNESS_EVENTS_ROOT = path.join(CONTENT_ROOT, 'madness', 'events');
export const MADNESS_MODS_ROOT = path.join(CONTENT_ROOT, 'madness', 'mods');
export const MADNESS_TEAMS_ROOT = path.join(CONTENT_ROOT, 'madness', 'teams');
export const MADNESS_SCORE_RULES_PATH = path.join(CONTENT_ROOT, 'madness-score-rules.json');
export const ORDER_RULES_PATH = path.join(CONTENT_ROOT, 'order-rules.json');
export const MODDERS_ROOT = path.join(CONTENT_ROOT, 'modders');

// Backward-compatible aliases used by the Nexus updater and older helper scripts.
export const MODS_ROOT = MODATHON_MODS_ROOT;
export const MODS_METADATA_PATH = MODATHON_METADATA_PATH;

export const GENERATED_MODS_PATH = path.join(
  REPO_ROOT,
  'modathon',
  'assets',
  'data',
  'modathon-mods.json',
);
export const GENERATED_MODATHON_DATA_ROOT = path.join(REPO_ROOT, 'modathon', 'assets', 'data');
export const MODATHON_EVENTS_PATH = path.join(
  GENERATED_MODATHON_DATA_ROOT,
  'modathon-event.json',
);
export const GENERATED_MODDERS_PATH = path.join(REPO_ROOT, 'assets', 'data', 'modders.json');
export const GENERATED_MADNESS_SCORES_PATH = path.join(
  REPO_ROOT,
  'assets',
  'data',
  'madness-scores.json',
);
export const GENERATED_ORDER_SCORES_PATH = path.join(
  REPO_ROOT,
  'assets',
  'data',
  'order-scores.json',
);
export const GENERATED_MODJAM_MODS_PATH = path.join(REPO_ROOT, 'modjam', 'data', 'modjam-mods.json');
export const GENERATED_MODJAM_POSTCARDS_PATH = path.join(REPO_ROOT, 'modjam', 'data', 'postcards.json');
export const GENERATED_MADNESS_MODS_PATH = path.join(REPO_ROOT, 'madness', 'data', 'madness-mods.json');
export const GENERATED_MADNESS_TEAMS_PATH = path.join(REPO_ROOT, 'madness', 'data', 'madness-teams.json');
export const MODJAM_EVENTS_PATH = path.join(REPO_ROOT, 'modjam', 'data', 'modjam-event.json');
export const MADNESS_EVENTS_PATH = path.join(REPO_ROOT, 'madness', 'data', 'madness-event.json');

const MODATHON_MOD_FIELDS = new Set([
  'name',
  'authors',
  'category',
  'url',
  'downloads',
  'uniqueDownloads',
  'endorsements',
  'available',
  'nexusCategory',
  'pictureUrl',
  'showcaseUrl',
  'status',
  'error',
]);
const ACHIEVEMENT_FIELDS = new Set([
  'id',
  'name',
  'requirement',
  'masteryName',
  'rarity',
  'rarityKey',
  'group',
  'imageUrl',
  'unlockedBy',
  'unlockedCount',
]);
const ACHIEVEMENT_RARITIES = new Set([
  null,
  'Bronze',
  'Challenge',
  'Challenge/Super',
  'Category',
  'Copper',
  'Gold',
  'Hidden',
  'Hidden / Gold',
  'Hidden / Silver',
  'Hidden/Copper',
  'Hidden/Silver',
  'Hidden/Super',
  'Metrics',
  'Ruby',
  'Silver',
  'Updated Mod Badge',
]);
const ACHIEVEMENT_RARITY_KEYS = new Set([
  'bronze',
  'challenge',
  'challenge-super',
  'category',
  'copper',
  'gold',
  'hidden',
  'hidden-copper',
  'hidden-gold',
  'hidden-silver',
  'hidden-super',
  'metrics',
  'ruby',
  'silver',
  'unspecified',
  'updated-mod-badge',
]);
const ACHIEVEMENT_GROUPS = new Set([
  'badge',
  'category',
  'challenge',
  'challenge-super',
  'hidden',
  'hidden-metal',
  'hidden-super',
  'metal',
  'metric',
  'standard',
]);
const MODDER_FIELDS = new Set(['id', 'name', 'nexusProfileUrl', 'avatarUrl', 'aliases', 'wiki']);
const MODJAM_MOD_FIELDS = new Set([
  'id',
  'title',
  'url',
  'authors',
  'category',
  'placement',
  'placementLabel',
  'awards',
  'awardPlacardUrl',
  'pictureUrl',
  'showcaseUrl',
]);
const MADNESS_MOD_FIELDS = new Set([
  'name',
  'url',
  'team',
  'category',
  'themeId',
  'place',
  'notes',
  'pictureUrl',
  'showcaseUrl',
]);
const MADNESS_TEAM_FIELDS = new Set(['name', 'place', 'mods', 'members']);
const POSTCARD_FIELDS = new Set(['file', 'entryId', 'caption', 'captionPosition']);
const MADNESS_EVENT_FIELDS = new Set([
  'name',
  'year',
  'season',
  'themes',
  'timezoneLabel',
  'countdown',
  'registrationFormId',
]);
const MODATHON_EVENT_FIELDS = new Set([
  'name',
  'year',
  'timezoneLabel',
  'countdown',
  'note',
  'individualModCards',
  'awards',
]);
const MODJAM_EVENT_FIELDS = new Set([
  'id',
  'label',
  'name',
  'season',
  'year',
  'themes',
  'timezoneLabel',
  'countdown',
  'participationBannerUrl',
  'banner',
  'headers',
  'resultsStreamUrl',
  'competitionType',
  'competitionLabel',
  'competitionNote',
  'hasJudgeAwards',
]);
const REQUIRED_MODATHON_MOD_FIELDS = ['name', 'authors', 'category', 'url'];
const REQUIRED_MODDER_FIELDS = ['id', 'name'];
const INTEGER_MOD_FIELDS = ['downloads', 'uniqueDownloads', 'endorsements', 'status'];
const STRING_MOD_FIELDS = ['nexusCategory', 'pictureUrl', 'showcaseUrl', 'error'];
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const eventIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const yearPattern = /^\d{4}$/;
const utcTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const postcardCaptionPositions = new Set(['upper-left', 'lower-right']);
const competitionCopy = {
  'just-for-fun': {
    label: 'Just for fun',
    note: 'No ranked winner; prizes were awarded by random drawing.',
  },
  'popular-choice': {
    label: 'Popular Choice',
    note: 'The community selected a Popular Choice winner.',
  },
  judged: {
    label: 'Judged competition',
    note: 'A judging panel selected the placed entries.',
  },
};
export const STANDARD_MOD_CATEGORIES = new Set([
  'Character Customization',
  'Dungeon',
  'Gameplay, Patch, or UI',
  'Graphics, Animations, or Audio',
  'Immersion',
  'Items',
  'Landscape or Landmass',
  'NPCs and Creatures',
  'Player Home',
  'Quests',
  'Resource or Utility',
  'Towns and Cities',
  'Unknown',
]);
const modderCollator = new Intl.Collator('en-US', {
  sensitivity: 'variant',
  numeric: true,
});

export function relativePath(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join('/');
}

export function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function readJson(filePath) {
  let source;
  try {
    source = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Could not read ${relativePath(filePath)}: ${error.message}`);
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`Invalid JSON in ${relativePath(filePath)}: ${error.message}`);
  }
}

function fail(context, message) {
  throw new Error(`${context}: ${message}`);
}

function assertPlainObject(value, context) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(context, 'must be a JSON object');
  }
}

function assertExactFields(value, allowedFields, context) {
  const unexpected = Object.keys(value).filter(key => !allowedFields.has(key));
  if (unexpected.length) {
    fail(context, `has unsupported field${unexpected.length === 1 ? '' : 's'}: ${unexpected.join(', ')}`);
  }
}

function assertNonEmptyString(value, context) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(context, 'must be a non-empty string');
  }
}

function assertScoreFactor(value, context) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail(context, 'must be a non-negative finite number');
  }
}

export function validateMadnessScoreRules(
  rules,
  context = relativePath(MADNESS_SCORE_RULES_PATH),
) {
  assertPlainObject(rules, context);
  const fields = new Set(['entry', 'placement', 'modderthlon', 'achievement']);
  assertExactFields(rules, fields, context);
  fields.forEach((field) => {
    if (!Object.hasOwn(rules, field)) fail(context, `is missing required field "${field}"`);
  });

  for (const [groupName, factorNames] of [
    ['entry', ['modathon', 'modjam', 'madness']],
    ['achievement', [
      'gold',
      'silver',
      'bronze',
      'hidden',
      'challenge',
      'category',
      'metrics',
      'other',
    ]],
  ]) {
    const groupContext = `${context}.${groupName}`;
    assertPlainObject(rules[groupName], groupContext);
    const groupFields = new Set(factorNames);
    assertExactFields(rules[groupName], groupFields, groupContext);
    factorNames.forEach((factorName) => {
      if (!Object.hasOwn(rules[groupName], factorName)) {
        fail(groupContext, `is missing required field "${factorName}"`);
      }
      assertScoreFactor(rules[groupName][factorName], `${groupContext}.${factorName}`);
    });
  }

  const eventTypes = ['modathon', 'modjam', 'madness'];
  const ranks = ['first', 'second', 'third'];
  assertPlainObject(rules.placement, `${context}.placement`);
  assertExactFields(rules.placement, new Set(eventTypes), `${context}.placement`);
  eventTypes.forEach((eventType) => {
    const eventContext = `${context}.placement.${eventType}`;
    if (!Object.hasOwn(rules.placement, eventType)) {
      fail(`${context}.placement`, `is missing required field "${eventType}"`);
    }
    assertPlainObject(rules.placement[eventType], eventContext);
    assertExactFields(rules.placement[eventType], new Set(ranks), eventContext);
    ranks.forEach((rank) => {
      if (!Object.hasOwn(rules.placement[eventType], rank)) {
        fail(eventContext, `is missing required field "${rank}"`);
      }
      assertScoreFactor(rules.placement[eventType][rank], `${eventContext}.${rank}`);
    });
  });

  assertScoreFactor(rules.modderthlon, `${context}.modderthlon`);
}

export function validateOrderRules(rules, context = relativePath(ORDER_RULES_PATH)) {
  assertPlainObject(rules, context);
  assertExactFields(rules, new Set(['orderScorePerContribution', 'orderliness']), context);
  for (const field of ['orderScorePerContribution', 'orderliness']) {
    if (!Object.hasOwn(rules, field)) fail(context, `is missing required field "${field}"`);
  }
  if (!Number.isSafeInteger(rules.orderScorePerContribution)
      || rules.orderScorePerContribution < 0) {
    fail(`${context}.orderScorePerContribution`, 'must be a non-negative whole number');
  }

  const orderliness = rules.orderliness;
  const orderlinessContext = `${context}.orderliness`;
  assertPlainObject(orderliness, orderlinessContext);
  const fields = new Set(['gainPerActiveDay', 'floor', 'decayLambda', 'states']);
  assertExactFields(orderliness, fields, orderlinessContext);
  fields.forEach((field) => {
    if (!Object.hasOwn(orderliness, field)) {
      fail(orderlinessContext, `is missing required field "${field}"`);
    }
  });
  for (const field of ['gainPerActiveDay', 'floor', 'decayLambda']) {
    if (typeof orderliness[field] !== 'number'
        || !Number.isFinite(orderliness[field])
        || orderliness[field] <= 0) {
      fail(`${orderlinessContext}.${field}`, 'must be a positive finite number');
    }
  }
  if (orderliness.gainPerActiveDay > 100) {
    fail(`${orderlinessContext}.gainPerActiveDay`, 'must not exceed 100');
  }
  if (orderliness.floor !== 1) fail(`${orderlinessContext}.floor`, 'must equal 1');

  const expectedStates = [
    [0, 20, 'Initiate of Order'],
    [20, 40, 'Acolyte of Order'],
    [40, 60, 'Oblate of Order'],
    [60, 80, 'High Oblate of Order'],
    [80, 100, 'Champion of Order'],
  ];
  if (!Array.isArray(orderliness.states)
      || orderliness.states.length !== expectedStates.length) {
    fail(`${orderlinessContext}.states`, 'must define the five canonical Order states');
  }
  orderliness.states.forEach((state, index) => {
    const stateContext = `${orderlinessContext}.states[${index}]`;
    assertPlainObject(state, stateContext);
    assertExactFields(state, new Set(['minExclusive', 'maxInclusive', 'title']), stateContext);
    const [minExclusive, maxInclusive, title] = expectedStates[index];
    if (state.minExclusive !== minExclusive
        || state.maxInclusive !== maxInclusive
        || state.title !== title) {
      fail(stateContext, `must equal ${minExclusive}–${maxInclusive} ${JSON.stringify(title)}`);
    }
  });
}

function assertOptionalString(value, key, context, { allowNull = false } = {}) {
  if (!Object.hasOwn(value, key)) return;
  if (allowNull && value[key] === null) return;
  if (typeof value[key] !== 'string') fail(`${context}.${key}`, 'must be a string');
}

function assertUtcTimestamp(value, context) {
  if (typeof value !== 'string' || !utcTimestampPattern.test(value)) {
    fail(context, 'must use yyyy-MM-ddTHH:mm:ss.SSSZ in UTC');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    fail(context, 'must be a real UTC timestamp');
  }
}

function validateTimestampObject(value, context, fields, { required = false, order = [] } = {}) {
  if (value === undefined || value === null) {
    if (required) fail(context, 'is required');
    return;
  }
  assertPlainObject(value, context);
  assertExactFields(value, new Set(fields), context);
  for (const field of fields) {
    if (required && !Object.hasOwn(value, field)) fail(context, `is missing required field "${field}"`);
    if (Object.hasOwn(value, field)) assertUtcTimestamp(value[field], `${context}.${field}`);
  }
  const present = order.filter(field => Object.hasOwn(value, field));
  for (let index = 1; index < present.length; index += 1) {
    const previous = new Date(value[present[index - 1]]).getTime();
    const current = new Date(value[present[index]]).getTime();
    if (current < previous) {
      fail(`${context}.${present[index]}`, `must not be earlier than ${present[index - 1]}`);
    }
  }
}

function isAssetPath(value) {
  return typeof value === 'string'
    && /^(?:\/?assets\/|\/?modathon\/|\/?modjam\/|\/?madness\/)[^\r\n]+$/.test(value);
}

function assertAssetOrHttpUrl(value, context, { allowNull = false } = {}) {
  if (allowNull && (value === null || value === '')) return;
  assertNonEmptyString(value, context);
  if (isAssetPath(value)) return;
  assertHttpUrl(value, context);
}

function assertHttpUrl(value, context, { allowSitePath = false } = {}) {
  if (allowSitePath && isAssetPath(value)) return;
  assertNonEmptyString(value, context);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(context, 'must be a valid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    fail(context, 'must use http:// or https://');
  }
}

export function assertYouTubeShowcaseUrl(value, context) {
  assertHttpUrl(value, context);
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') fail(context, 'must use HTTPS');

  const isWatchUrl = ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(parsed.hostname)
    && parsed.pathname === '/watch';
  const shortUrlMatch = parsed.hostname === 'youtu.be'
    ? parsed.pathname.match(/^\/([A-Za-z0-9_-]{11})(?:&[^/]*)?$/)
    : null;
  const isShortUrl = Boolean(shortUrlMatch);
  if (!isWatchUrl && !isShortUrl) {
    fail(context, 'must be a YouTube watch or youtu.be URL');
  }

  const videoId = isShortUrl ? shortUrlMatch[1] : parsed.searchParams.get('v') || '';
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    fail(context, 'must contain an 11-character YouTube video ID');
  }
}

function assertOptionalYouTubeShowcaseUrl(value, key, context) {
  if (!Object.hasOwn(value, key) || value[key] === null || value[key] === '') return;
  assertYouTubeShowcaseUrl(value[key], `${context}.${key}`);
}

function assertOptionalNullableUrl(value, key, context, options) {
  if (!Object.hasOwn(value, key) || value[key] === null || value[key] === '') return;
  assertHttpUrl(value[key], `${context}.${key}`, options);
}

function assertStringArray(value, context, { required = false } = {}) {
  if (!Array.isArray(value)) fail(context, 'must be an array');
  if (required && value.length === 0) fail(context, 'must not be empty');
  value.forEach((item, index) => assertNonEmptyString(item, `${context}[${index}]`));
}

function assertYear(value, context) {
  if (!Number.isInteger(value) || value < 2015 || value > 2100) {
    fail(context, 'must be an integer from 2015 through 2100');
  }
}

export function identityKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '');
}

export function validateMod(mod, context) {
  assertPlainObject(mod, context);
  assertExactFields(mod, MODATHON_MOD_FIELDS, context);

  for (const field of REQUIRED_MODATHON_MOD_FIELDS) {
    if (!Object.hasOwn(mod, field)) fail(context, `is missing required field "${field}"`);
  }

  assertNonEmptyString(mod.name, `${context}.name`);
  if (!Array.isArray(mod.authors) || mod.authors.length === 0) {
    fail(`${context}.authors`, 'must be a non-empty array');
  }
  mod.authors.forEach((author, index) => {
    const authorContext = `${context}.authors[${index}]`;
    assertPlainObject(author, authorContext);
    assertExactFields(author, new Set(['name', 'contributed']), authorContext);
    for (const field of ['name', 'contributed']) {
      if (!Object.hasOwn(author, field)) fail(authorContext, `is missing required field "${field}"`);
    }
    assertNonEmptyString(author.name, `${authorContext}.name`);
    if (typeof author.contributed !== 'boolean') {
      fail(`${authorContext}.contributed`, 'must be a boolean');
    }
  });
  assertNonEmptyString(mod.category, `${context}.category`);
  if (!STANDARD_MOD_CATEGORIES.has(mod.category)) {
    fail(
      `${context}.category`,
      `must be one of the standard mod categories: ${[...STANDARD_MOD_CATEGORIES].join(', ')}`,
    );
  }
  assertHttpUrl(mod.url, `${context}.url`);

  for (const field of INTEGER_MOD_FIELDS) {
    if (!Object.hasOwn(mod, field)) continue;
    if (!Number.isInteger(mod[field]) || mod[field] < 0) {
      fail(`${context}.${field}`, 'must be a non-negative integer');
    }
  }

  if (Object.hasOwn(mod, 'available') && typeof mod.available !== 'boolean') {
    fail(`${context}.available`, 'must be a boolean');
  }

  for (const field of STRING_MOD_FIELDS) assertOptionalString(mod, field, context);
  if (Object.hasOwn(mod, 'pictureUrl')) {
    assertHttpUrl(mod.pictureUrl, `${context}.pictureUrl`, { allowSitePath: true });
  }
  assertOptionalYouTubeShowcaseUrl(mod, 'showcaseUrl', context);
}

function validateAchievement(achievement, context, { source = false } = {}) {
  assertPlainObject(achievement, context);
  assertExactFields(achievement, ACHIEVEMENT_FIELDS, context);
  for (const field of ['id', 'name', 'requirement', 'rarityKey', 'group']) {
    if (!Object.hasOwn(achievement, field)) fail(context, `is missing required field "${field}"`);
  }
  assertNonEmptyString(achievement.id, `${context}.id`);
  if (!idPattern.test(achievement.id)) {
    fail(`${context}.id`, 'must contain lowercase letters, numbers, and single hyphens only');
  }
  assertNonEmptyString(achievement.name, `${context}.name`);
  assertNonEmptyString(achievement.requirement, `${context}.requirement`);
  assertOptionalString(achievement, 'masteryName', context);
  if (Object.hasOwn(achievement, 'rarity') && !ACHIEVEMENT_RARITIES.has(achievement.rarity)) {
    fail(`${context}.rarity`, 'is not a supported rarity label');
  }
  if (!ACHIEVEMENT_RARITY_KEYS.has(achievement.rarityKey)) {
    fail(`${context}.rarityKey`, 'is not a supported rarity key');
  }
  if (!ACHIEVEMENT_GROUPS.has(achievement.group)) {
    fail(`${context}.group`, 'is not a supported display group');
  }
  assertOptionalString(achievement, 'imageUrl', context);
  if (source && !Object.hasOwn(achievement, 'unlockedBy')) achievement.unlockedBy = [];
  if (!Object.hasOwn(achievement, 'unlockedBy')) fail(context, 'is missing required field "unlockedBy"');
  assertStringArray(achievement.unlockedBy, `${context}.unlockedBy`);
  if (Object.hasOwn(achievement, 'unlockedCount')) {
    if (!Number.isInteger(achievement.unlockedCount) || achievement.unlockedCount < 0) {
      fail(`${context}.unlockedCount`, 'must be a non-negative integer');
    }
    if (!source && achievement.unlockedCount !== achievement.unlockedBy.length) {
      fail(`${context}.unlockedCount`, 'must equal the number of names in unlockedBy');
    }
  }
}

function validateAchievementList(achievements, context) {
  if (!Array.isArray(achievements)) fail(context, 'must be an array');
  const ids = new Set();
  achievements.forEach((achievement, index) => {
    validateAchievement(achievement, `${context}[${index}]`);
    if (ids.has(achievement.id)) fail(context, `duplicates achievement ID "${achievement.id}"`);
    ids.add(achievement.id);
  });
}

export function validateAchievementSource(document, context) {
  assertPlainObject(document, context);
  assertExactFields(
    document,
    new Set(['schemaVersion', 'year', ...ACHIEVEMENT_FIELDS]),
    context,
  );
  for (const field of ['schemaVersion', 'year']) {
    if (!Object.hasOwn(document, field)) fail(context, `is missing required field "${field}"`);
  }
  if (document.schemaVersion !== 1) fail(`${context}.schemaVersion`, 'must equal 1');
  assertYear(document.year, `${context}.year`);
  const { schemaVersion: _schemaVersion, year: _year, ...achievement } = document;
  validateAchievement(achievement, context, { source: true });
}

export function validateGeneratedAchievementDocument(document, context) {
  assertPlainObject(document, context);
  if (!isDeepStrictEqual(Object.keys(document), ['schemaVersion', 'event', 'achievements'])) {
    fail(context, 'must contain exactly "schemaVersion", "event", and "achievements"');
  }
  if (document.schemaVersion !== 1) fail(`${context}.schemaVersion`, 'must equal 1');
  assertPlainObject(document.event, `${context}.event`);
  if (!isDeepStrictEqual(document.event, {
    name: 'Morrowind Modathon',
    year: document.event.year,
  })) {
    fail(`${context}.event`, 'must contain only the canonical Modathon name and year');
  }
  assertYear(document.event.year, `${context}.event.year`);
  validateAchievementList(document.achievements, `${context}.achievements`);
}

export function validateModder(modder, context) {
  assertPlainObject(modder, context);
  assertExactFields(modder, MODDER_FIELDS, context);

  for (const field of REQUIRED_MODDER_FIELDS) {
    if (!Object.hasOwn(modder, field)) fail(context, `is missing required field "${field}"`);
  }

  assertNonEmptyString(modder.id, `${context}.id`);
  if (!idPattern.test(modder.id)) {
    fail(`${context}.id`, 'must contain lowercase letters, numbers, and single hyphens only');
  }
  assertNonEmptyString(modder.name, `${context}.name`);
  assertOptionalNullableUrl(modder, 'nexusProfileUrl', context);
  assertOptionalNullableUrl(modder, 'avatarUrl', context, { allowSitePath: true });
  if (Object.hasOwn(modder, 'aliases')) assertStringArray(modder.aliases, `${context}.aliases`);
  if (Object.hasOwn(modder, 'wiki')) {
    assertPlainObject(modder.wiki, `${context}.wiki`);
    assertExactFields(modder.wiki, new Set(['contributorNames']), `${context}.wiki`);
    if (!Object.hasOwn(modder.wiki, 'contributorNames')) {
      fail(`${context}.wiki`, 'is missing required field "contributorNames"');
    }
    assertStringArray(modder.wiki.contributorNames, `${context}.wiki.contributorNames`, {
      required: true,
    });
    const seen = new Set();
    modder.wiki.contributorNames.forEach((name, index) => {
      const key = Order.normalizedContributorName(name);
      if (!key) fail(`${context}.wiki.contributorNames[${index}]`, 'must be a usable name');
      if (seen.has(key)) {
        fail(`${context}.wiki.contributorNames`, `duplicates normalized contributor name ${JSON.stringify(name)}`);
      }
      seen.add(key);
    });
  }
}

export function validateModjamMod(mod, context) {
  assertPlainObject(mod, context);
  assertExactFields(mod, MODJAM_MOD_FIELDS, context);
  for (const field of ['id', 'title', 'authors', 'category']) {
    if (!Object.hasOwn(mod, field)) fail(context, `is missing required field "${field}"`);
  }
  assertNonEmptyString(mod.id, `${context}.id`);
  if (!idPattern.test(mod.id)) fail(`${context}.id`, 'must use lowercase letters, numbers, and hyphens');
  assertNonEmptyString(mod.title, `${context}.title`);
  assertOptionalNullableUrl(mod, 'url', context);
  if (!Array.isArray(mod.authors) || !mod.authors.length) fail(`${context}.authors`, 'must be a non-empty array');
  mod.authors.forEach((author, index) => {
    assertPlainObject(author, `${context}.authors[${index}]`);
    assertExactFields(author, new Set(['id']), `${context}.authors[${index}]`);
    assertNonEmptyString(author.id, `${context}.authors[${index}].id`);
  });
  assertNonEmptyString(mod.category, `${context}.category`);
  if (!STANDARD_MOD_CATEGORIES.has(mod.category)) {
    fail(
      `${context}.category`,
      `must be one of the standard mod categories: ${[...STANDARD_MOD_CATEGORIES].join(', ')}`,
    );
  }
  for (const field of ['placement', 'placementLabel']) {
    assertOptionalString(mod, field, context, { allowNull: true });
  }
  if (Object.hasOwn(mod, 'awards')) assertStringArray(mod.awards, `${context}.awards`);
  assertOptionalNullableUrl(mod, 'awardPlacardUrl', context, { allowSitePath: true });
  assertOptionalNullableUrl(mod, 'pictureUrl', context, { allowSitePath: true });
  assertOptionalYouTubeShowcaseUrl(mod, 'showcaseUrl', context);
}

export function validateMadnessMod(mod, context) {
  assertPlainObject(mod, context);
  assertExactFields(mod, MADNESS_MOD_FIELDS, context);
  for (const field of ['name', 'category']) {
    if (!Object.hasOwn(mod, field)) fail(context, `is missing required field "${field}"`);
  }
  assertNonEmptyString(mod.name, `${context}.name`);
  assertNonEmptyString(mod.category, `${context}.category`);
  if (!STANDARD_MOD_CATEGORIES.has(mod.category)) {
    fail(
      `${context}.category`,
      `must be one of the standard mod categories: ${[...STANDARD_MOD_CATEGORIES].join(', ')}`,
    );
  }
  for (const field of ['team', 'themeId', 'place', 'notes']) {
    assertOptionalString(mod, field, context, { allowNull: true });
  }
  assertOptionalNullableUrl(mod, 'url', context);
  assertOptionalNullableUrl(mod, 'pictureUrl', context, { allowSitePath: true });
  assertOptionalYouTubeShowcaseUrl(mod, 'showcaseUrl', context);
}

function validateMadnessEvent(event, context) {
  assertPlainObject(event, context);
  assertExactFields(event, MADNESS_EVENT_FIELDS, context);
  for (const field of ['name', 'year', 'season', 'themes']) {
    if (!Object.hasOwn(event, field)) fail(context, `is missing required field "${field}"`);
  }
  assertNonEmptyString(event.name, `${context}.name`);
  assertYear(event.year, `${context}.year`);
  if (event.name !== `Morrowind Modding Madness ${event.year}`) {
    fail(`${context}.name`, `must equal "Morrowind Modding Madness ${event.year}"`);
  }
  if (!Number.isInteger(event.season) || event.season < 1) {
    fail(`${context}.season`, 'must be a positive integer');
  }
  assertOptionalString(event, 'timezoneLabel', context, { allowNull: true });
  assertOptionalString(event, 'registrationFormId', context, { allowNull: true });
  validateTimestampObject(
    event.countdown,
    `${context}.countdown`,
    ['registrationOpen', 'competitionStart', 'submissionsClose', 'bugFixEnd'],
    { order: ['registrationOpen', 'competitionStart', 'submissionsClose', 'bugFixEnd'] },
  );
  if (!Array.isArray(event.themes)) fail(`${context}.themes`, 'must be an array');

  const themeIds = new Set();
  event.themes.forEach((theme, themeIndex) => {
    const themeContext = `${context}.themes[${themeIndex}]`;
    assertPlainObject(theme, themeContext);
    assertExactFields(
      theme,
      new Set(['id', 'name', 'weekStart', 'weekEnd']),
      themeContext,
    );
    for (const field of ['id', 'name', 'weekStart', 'weekEnd']) {
      if (!Object.hasOwn(theme, field)) {
        fail(themeContext, `is missing required field "${field}"`);
      }
    }
    assertNonEmptyString(theme.id, `${themeContext}.id`);
    if (!idPattern.test(theme.id)) {
      fail(`${themeContext}.id`, 'must use lowercase letters, numbers, and hyphens');
    }
    if (themeIds.has(theme.id)) {
      fail(`${context}.themes`, `duplicates theme ID "${theme.id}"`);
    }
    themeIds.add(theme.id);
    assertNonEmptyString(theme.name, `${themeContext}.name`);
    for (const field of ['weekStart', 'weekEnd']) {
      if (!Number.isInteger(theme[field]) || theme[field] < 1) {
        fail(`${themeContext}.${field}`, 'must be a positive integer');
      }
    }
    if (theme.weekEnd < theme.weekStart) {
      fail(`${themeContext}.weekEnd`, 'cannot be less than weekStart');
    }
  });
}

export function validateMadnessEventSource(document, context) {
  assertPlainObject(document, context);
  assertExactFields(
    document,
    new Set(['schemaVersion', 'eventType', ...MADNESS_EVENT_FIELDS]),
    context,
  );
  if (document.schemaVersion !== 1) fail(`${context}.schemaVersion`, 'must equal 1');
  if (document.eventType !== 'madness') fail(`${context}.eventType`, 'must equal "madness"');
  const {
    schemaVersion: _schemaVersion,
    eventType: _eventType,
    name: sourceName,
    ...sourceEvent
  } = document;
  const event = {
    name: `Morrowind Modding Madness ${sourceEvent.year}`,
    ...sourceEvent,
    themes: sourceEvent.themes ?? [],
  };
  if (sourceName !== undefined && sourceName !== event.name) {
    fail(`${context}.name`, `must equal the generated value "${event.name}"`);
  }
  validateMadnessEvent(event, context);
}

function validateModathonEvent(event, context) {
  assertPlainObject(event, context);
  assertExactFields(event, MODATHON_EVENT_FIELDS, context);
  for (const field of ['name', 'year']) {
    if (!Object.hasOwn(event, field)) fail(context, `is missing required field "${field}"`);
  }
  assertNonEmptyString(event.name, `${context}.name`);
  assertYear(event.year, `${context}.year`);
  if (event.name !== `Morrowind Modathon ${event.year}`) {
    fail(`${context}.name`, `must equal "Morrowind Modathon ${event.year}"`);
  }
  assertOptionalString(event, 'timezoneLabel', context, { allowNull: true });
  assertOptionalString(event, 'note', context, { allowNull: true });
  validateTimestampObject(
    event.countdown,
    `${context}.countdown`,
    ['start', 'end', 'graceEnd', 'reset'],
    { required: true, order: ['start', 'end', 'graceEnd', 'reset'] },
  );
  if (Object.hasOwn(event, 'individualModCards')
    && typeof event.individualModCards !== 'boolean') {
    fail(`${context}.individualModCards`, 'must be a boolean');
  }
  if (Object.hasOwn(event, 'awards') && !Array.isArray(event.awards)) {
    fail(`${context}.awards`, 'must be an array');
  }
  (event.awards || []).forEach((award, awardIndex) => {
    const awardContext = `${context}.awards[${awardIndex}]`;
    assertPlainObject(award, awardContext);
    assertExactFields(award, new Set(['award', 'mods']), awardContext);
    if (!Object.hasOwn(award, 'award')) fail(awardContext, 'is missing required field "award"');
    assertNonEmptyString(award.award, `${awardContext}.award`);
    if (award.mods === undefined || award.mods === null) return;
    if (!Array.isArray(award.mods)) fail(`${awardContext}.mods`, 'must be an array');
    award.mods.forEach((mod, modIndex) => {
      const modContext = `${awardContext}.mods[${modIndex}]`;
      assertPlainObject(mod, modContext);
      assertExactFields(mod, new Set(['name', 'attribution', 'archiveName']), modContext);
      if (!Object.hasOwn(mod, 'name')) fail(modContext, 'is missing required field "name"');
      if (!Object.hasOwn(mod, 'attribution')) fail(modContext, 'is missing required field "attribution"');
      assertNonEmptyString(mod.name, `${modContext}.name`);
      assertStringArray(mod.attribution, `${modContext}.attribution`, { required: true });
      assertOptionalString(mod, 'archiveName', modContext, { allowNull: true });
    });
  });
}

export function validateModathonEventSource(document, context) {
  assertPlainObject(document, context);
  assertExactFields(
    document,
    new Set(['schemaVersion', 'eventType', ...MODATHON_EVENT_FIELDS]),
    context,
  );
  if (document.schemaVersion !== 1) fail(`${context}.schemaVersion`, 'must equal 1');
  if (document.eventType !== 'modathon') {
    fail(`${context}.eventType`, 'must equal "modathon"');
  }
  const {
    schemaVersion: _schemaVersion,
    eventType: _eventType,
    name: sourceName,
    ...sourceEvent
  } = document;
  const event = {
    name: `Morrowind Modathon ${sourceEvent.year}`,
    ...sourceEvent,
  };
  if (sourceName !== undefined && sourceName !== event.name) {
    fail(`${context}.name`, `must equal the generated value "${event.name}"`);
  }
  validateModathonEvent(event, context);
}

export function validateModathonEvents(document, context = relativePath(MODATHON_EVENTS_PATH)) {
  assertPlainObject(document, context);
  if (!isDeepStrictEqual(Object.keys(document), ['schemaVersion', 'eventType', 'events'])) {
    fail(context, 'must contain exactly "schemaVersion", "eventType", and "events"');
  }
  if (document.schemaVersion !== 1) fail(`${context}.schemaVersion`, 'must equal 1');
  if (document.eventType !== 'modathon') {
    fail(`${context}.eventType`, 'must equal "modathon"');
  }
  if (!Array.isArray(document.events)) fail(`${context}.events`, 'must be an array');
  const years = new Set();
  document.events.forEach((event, index) => {
    validateModathonEvent(event, `${context}.events[${index}]`);
    if (years.has(event.year)) fail(context, `duplicates Modathon event year ${event.year}`);
    years.add(event.year);
  });
}

export function validateMadnessEvents(
  document,
  context = relativePath(MADNESS_EVENTS_PATH),
) {
  assertPlainObject(document, context);
  if (!isDeepStrictEqual(Object.keys(document), ['schemaVersion', 'eventType', 'events'])) {
    fail(context, 'must contain exactly "schemaVersion", "eventType", and "events"');
  }
  if (document.schemaVersion !== 1) fail(`${context}.schemaVersion`, 'must equal 1');
  if (document.eventType !== 'madness') fail(`${context}.eventType`, 'must equal "madness"');
  if (!Array.isArray(document.events)) fail(`${context}.events`, 'must be an array');

  const years = new Set();
  document.events.forEach((event, eventIndex) => {
    validateMadnessEvent(event, `${context}.events[${eventIndex}]`);
    if (years.has(event.year)) fail(context, `duplicates Madness event year ${event.year}`);
    years.add(event.year);
  });
}

export function validateModjamEvents(
  document,
  context = relativePath(MODJAM_EVENTS_PATH),
) {
  assertPlainObject(document, context);
  if (!isDeepStrictEqual(Object.keys(document), ['schemaVersion', 'eventType', 'events'])) {
    fail(context, 'must contain exactly "schemaVersion", "eventType", and "events"');
  }
  if (document.schemaVersion !== 1) fail(`${context}.schemaVersion`, 'must equal 1');
  if (document.eventType !== 'modjam') fail(`${context}.eventType`, 'must equal "modjam"');
  if (!Array.isArray(document.events)) fail(`${context}.events`, 'must be an array');

  const ids = new Set();
  document.events.forEach((event, index) => {
    const eventContext = `${context}.events[${index}]`;
    validateModjamEvent(event, eventContext);
    if (ids.has(event.id)) fail(context, `duplicates Modjam event ID "${event.id}"`);
    ids.add(event.id);
  });
}

export function canonicalModjamEvent(source) {
  const season = String(source.season || '').trim();
  const year = Number(source.year);
  const competition = competitionCopy[source.competitionType] || competitionCopy.judged;
  return {
    ...source,
    themes: (source.themes ?? []).map(theme => (
      typeof theme === 'string' ? theme.trim() : theme
    )),
    id: `${season.toLocaleLowerCase('en-US')}-${year}`,
    label: `${season} ${year}`,
    name: `${season} Modjam ${year}`,
    competitionLabel: competition.label,
    competitionNote: competition.note,
  };
}

function validateModjamEvent(event, context) {
  assertPlainObject(event, context);
  assertExactFields(event, MODJAM_EVENT_FIELDS, context);
  for (const field of ['id', 'label', 'season', 'year', 'themes']) {
    if (!Object.hasOwn(event, field)) fail(context, `is missing required field "${field}"`);
  }
  assertNonEmptyString(event.season, `${context}.season`);
  if (!['Winter', 'Spring', 'Summer', 'Autumn'].includes(event.season)) {
    fail(`${context}.season`, 'must be Winter, Spring, Summer, or Autumn');
  }
  assertYear(event.year, `${context}.year`);
  const canonical = canonicalModjamEvent(event);
  for (const field of ['id', 'label', 'name', 'competitionLabel', 'competitionNote']) {
    if (event[field] !== canonical[field]) {
      fail(`${context}.${field}`, `must equal the generated value "${canonical[field]}"`);
    }
  }
  if (!eventIdPattern.test(event.id)) {
    fail(`${context}.id`, 'must use lowercase letters, numbers, and hyphens');
  }
  assertStringArray(event.themes, `${context}.themes`);
  assertStringArray(event.headers, `${context}.headers`, { required: true });
  assertOptionalString(event, 'timezoneLabel', context, { allowNull: true });
  if (Object.hasOwn(event, 'banner')) {
    assertAssetOrHttpUrl(event.banner, `${context}.banner`, { allowNull: true });
  }
  if (Object.hasOwn(event, 'participationBannerUrl')) {
    assertAssetOrHttpUrl(event.participationBannerUrl, `${context}.participationBannerUrl`, { allowNull: true });
  }
  if (Object.hasOwn(event, 'resultsStreamUrl') && event.resultsStreamUrl !== null && event.resultsStreamUrl !== '') {
    assertHttpUrl(event.resultsStreamUrl, `${context}.resultsStreamUrl`);
  }
  event.headers.forEach((header, headerIndex) => {
    assertAssetOrHttpUrl(header, `${context}.headers[${headerIndex}]`);
  });
  validateTimestampObject(
    event.countdown,
    `${context}.countdown`,
    ['kickoffStart', 'start', 'end'],
    { order: ['kickoffStart', 'start', 'end'] },
  );
  const themeKeys = new Set();
  event.themes.forEach((theme, themeIndex) => {
    const key = theme.trim().toLocaleLowerCase('en-US');
    if (themeKeys.has(key) && key !== '[redacted]') {
      fail(`${context}.themes`, `duplicates theme "${theme}"`);
    }
    themeKeys.add(key);
  });
}

export function validateModjamEventSource(document, context) {
  assertPlainObject(document, context);
  assertExactFields(
    document,
    new Set(['schemaVersion', 'eventType', ...MODJAM_EVENT_FIELDS]),
    context,
  );
  if (document.schemaVersion !== 1) fail(`${context}.schemaVersion`, 'must equal 1');
  if (document.eventType !== 'modjam') {
    fail(`${context}.eventType`, 'must equal "modjam"');
  }
  const {
    schemaVersion: _schemaVersion,
    eventType: _eventType,
    id: sourceId,
    label: sourceLabel,
    name: sourceName,
    competitionLabel: sourceCompetitionLabel,
    competitionNote: sourceCompetitionNote,
    ...sourceEvent
  } = document;
  const event = canonicalModjamEvent({
    ...sourceEvent,
    themes: sourceEvent.themes ?? [],
  });
  for (const [field, value] of [
    ['id', sourceId],
    ['label', sourceLabel],
    ['name', sourceName],
    ['competitionLabel', sourceCompetitionLabel],
    ['competitionNote', sourceCompetitionNote],
  ]) {
    if (value !== undefined && value !== event[field]) {
      fail(`${context}.${field}`, `must equal the generated value "${event[field]}"`);
    }
  }
  validateModjamEvent(event, context);
}

export function modjamEntryId(eventId, url) {
  const nexusId = String(url || '')
    .match(/nexusmods\.com\/morrowind\/mods\/(\d+)(?:\D|$)/i)?.[1];
  if (!nexusId) return '';
  return `${eventId}-${nexusId.slice(-5).padStart(5, '0')}`;
}

export function normalizeModjamMod(record, sourcePath = '') {
  const fallbackId = sourcePath
    ? path.basename(sourcePath, '.json')
    : '';
  return {
    ...record,
    id: modjamEntryId(record.eventId, record.url) || record.id || fallbackId,
    placement: record.placement ?? null,
    placementLabel: record.placementLabel ?? null,
    awards: Array.isArray(record.awards) ? record.awards : [],
    awardPlacardUrl: record.awardPlacardUrl ?? null,
  };
}

export function validateMadnessThemeReferences(
  records,
  events,
  contexts = [],
) {
  const themesByYear = new Map((events?.events || []).map(event => [
    Number(event.year),
    new Set((event.themes || []).map(theme => theme.id)),
  ]));
  records.forEach((record, index) => {
    if (!Object.hasOwn(record, 'themeId') || record.themeId === null || record.themeId === '') return;
    const context = contexts[index] || `Madness mod record ${index + 1}`;
    const themes = themesByYear.get(Number(record.year));
    if (!themes?.has(record.themeId)) {
      fail(
        `${context}.themeId`,
        `references unknown Madness ${record.year} theme "${record.themeId}"`,
      );
    }
  });
}

function validateMadnessTeam(team, context, { generated = false } = {}) {
  assertPlainObject(team, context);
  assertExactFields(team, MADNESS_TEAM_FIELDS, context);
  for (const field of ['name', 'mods', 'members']) {
    if (!Object.hasOwn(team, field)) fail(context, `is missing required field "${field}"`);
  }
  assertNonEmptyString(team.name, `${context}.name`);
  if (!generated && /^team\s+/i.test(team.name)) {
    fail(`${context}.name`, 'must not include the generated "Team" prefix');
  }
  assertOptionalString(team, 'place', context);
  if (!Array.isArray(team.mods)) fail(`${context}.mods`, 'must be an array');
  team.mods.forEach((mod, index) => {
    const modContext = `${context}.mods[${index}]`;
    assertPlainObject(mod, modContext);
    assertExactFields(mod, new Set(generated ? ['name', 'url', 'showcaseUrl'] : ['name']), modContext);
    assertNonEmptyString(mod.name, `${modContext}.name`);
    if (generated) {
      assertOptionalNullableUrl(mod, 'url', modContext);
      assertOptionalYouTubeShowcaseUrl(mod, 'showcaseUrl', modContext);
    }
  });
  if (!Array.isArray(team.members) || !team.members.length) fail(`${context}.members`, 'must be a non-empty array');
  team.members.forEach((member, index) => {
    const memberContext = `${context}.members[${index}]`;
    assertPlainObject(member, memberContext);
    assertExactFields(member, new Set(['id']), memberContext);
    assertNonEmptyString(member.id, `${memberContext}.id`);
  });
}

export function validateMadnessTeamReferences(mods, teams, contexts = []) {
  const teamsByYear = new Map();
  const modsByYear = new Map();
  for (const team of teams) {
    const key = String(team.year);
    const byName = teamsByYear.get(key) || new Map();
    const normalizedName = team.name.trim().toLocaleLowerCase('en-US');
    if (byName.has(normalizedName)) {
      fail(`Madness teams ${key}`, `duplicates team name "${team.name}"`);
    }
    byName.set(normalizedName, team);
    teamsByYear.set(key, byName);
  }
  for (const mod of mods) {
    const key = String(mod.year);
    const byName = modsByYear.get(key) || new Set();
    if (byName.has(mod.name)) fail(`Madness mods ${key}`, `duplicates mod name "${mod.name}"`);
    byName.add(mod.name);
    modsByYear.set(key, byName);
  }

  for (const [index, team] of teams.entries()) {
    const teamContext = contexts[index] || `Madness team ${team.year} ${team.name}`;
    const knownMods = modsByYear.get(String(team.year)) || new Set();
    const seen = new Set();
    for (const [modIndex, mod] of team.mods.entries()) {
      if (seen.has(mod.name)) fail(`${teamContext}.mods[${modIndex}]`, `duplicates mod "${mod.name}"`);
      seen.add(mod.name);
      if (!knownMods.has(mod.name)) {
        fail(`${teamContext}.mods[${modIndex}].name`, `does not match a Madness ${team.year} mod`);
      }
    }
  }

  for (const [index, mod] of mods.entries()) {
    if (!mod.team) continue;
    const teamName = String(mod.team).replace(/^team\s+/i, '').trim().toLocaleLowerCase('en-US');
    const team = teamsByYear.get(String(mod.year))?.get(teamName);
    const context = contexts[index] || `Madness mod ${mod.year} ${mod.name}`;
    if (!team) fail(`${context}.team`, `references unknown Madness ${mod.year} team "${mod.team}"`);
    if (!team.mods.some(teamMod => teamMod.name === mod.name)) {
      fail(`${context}.team`, `team "${mod.team}" does not list this mod`);
    }
  }
}

function validatePostcard(postcard, context) {
  assertPlainObject(postcard, context);
  assertExactFields(postcard, POSTCARD_FIELDS, context);
  assertNonEmptyString(postcard.file, `${context}.file`);
  if (postcard.file !== path.basename(postcard.file)) {
    fail(`${context}.file`, 'must be a single image filename');
  }
  assertNonEmptyString(postcard.entryId, `${context}.entryId`);
  assertOptionalString(postcard, 'caption', context, { allowNull: true });
  assertOptionalString(postcard, 'captionPosition', context, { allowNull: true });
  if (Object.hasOwn(postcard, 'captionPosition')
    && postcard.captionPosition !== null
    && postcard.captionPosition !== ''
    && !postcardCaptionPositions.has(postcard.captionPosition)) {
    fail(`${context}.captionPosition`, 'must be upper-left or lower-right');
  }
}

async function validatePostcardAssets(records, files) {
  await Promise.all(records.map(async (postcard, index) => {
    for (const directory of [MODJAM_POSTCARD_THUMBNAILS_ROOT, MODJAM_POSTCARD_FULL_ROOT]) {
      try {
        await access(path.join(directory, postcard.file));
      } catch {
        fail(
          relativePath(files[index]),
          `references missing postcard asset "${path.relative(directory, path.join(directory, postcard.file))}"`,
        );
      }
    }
  }));
}

export function validateModsMetadata(metadata, context = relativePath(MODATHON_METADATA_PATH)) {
  assertPlainObject(metadata, context);
  const keys = Object.keys(metadata);
  if (!isDeepStrictEqual(keys, ['generated', 'game'])) {
    fail(context, 'must contain exactly "generated" and "game", in that order');
  }
  assertNonEmptyString(metadata.generated, `${context}.generated`);
  if (Number.isNaN(Date.parse(metadata.generated))) fail(`${context}.generated`, 'must be an ISO-compatible timestamp');
  if (metadata.game !== 'morrowind') fail(`${context}.game`, 'must equal "morrowind"');
}

function validateModjamMetadata(metadata, context = relativePath(MODJAM_METADATA_PATH)) {
  assertPlainObject(metadata, context);
  if (!isDeepStrictEqual(Object.keys(metadata), ['generatedAt', 'listedModderCount'])) {
    fail(context, 'must contain exactly "generatedAt" and "listedModderCount", in that order');
  }
  assertNonEmptyString(metadata.generatedAt, `${context}.generatedAt`);
  if (Number.isNaN(Date.parse(metadata.generatedAt))) {
    fail(`${context}.generatedAt`, 'must be an ISO-compatible timestamp');
  }
  if (!Number.isInteger(metadata.listedModderCount) || metadata.listedModderCount < 0) {
    fail(`${context}.listedModderCount`, 'must be a non-negative integer');
  }
}

function compareFileNames(left, right) {
  const a = left.toLocaleLowerCase('en-US');
  const b = right.toLocaleLowerCase('en-US');
  return a < b ? -1 : a > b ? 1 : left < right ? -1 : left > right ? 1 : 0;
}

async function listJsonFiles(directory, context) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Could not read ${relativePath(directory)}: ${error.message}`);
  }

  const unexpected = entries.filter(entry => !entry.isFile() || path.extname(entry.name) !== '.json');
  if (unexpected.length) {
    fail(context, `contains unsupported entries: ${unexpected.map(entry => entry.name).join(', ')}`);
  }

  const collisions = new Map();
  for (const entry of entries) {
    const key = entry.name.toLocaleLowerCase('en-US');
    const names = collisions.get(key) || [];
    names.push(entry.name);
    collisions.set(key, names);
  }
  const duplicateNames = [...collisions.values()].filter(names => names.length > 1);
  if (duplicateNames.length) {
    fail(context, `has case-insensitive filename collisions: ${duplicateNames.flat().join(', ')}`);
  }

  return entries.map(entry => entry.name).sort(compareFileNames);
}

async function listYearJsonFiles(directory, context) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Could not read ${relativePath(directory)}: ${error.message}`);
  }

  const unexpected = entries.filter(
    entry => !entry.isDirectory() || !/^\d{4}$/.test(entry.name),
  );
  if (unexpected.length) {
    fail(
      context,
      `contains unsupported entries: ${unexpected.map(entry => entry.name).join(', ')}`,
    );
  }

  const fileNames = [];
  for (const entry of entries.sort((left, right) => compareFileNames(left.name, right.name))) {
    const yearDirectory = path.join(directory, entry.name);
    const yearFiles = await listJsonFiles(
      yearDirectory,
      `${context}/${entry.name}`,
    );
    fileNames.push(...yearFiles.map(fileName => path.join(entry.name, fileName)));
  }
  return fileNames;
}

async function listEventJsonFiles(directory, context) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Could not read ${relativePath(directory)}: ${error.message}`);
  }

  const unexpected = entries.filter(
    entry => !entry.isDirectory() || !eventIdPattern.test(entry.name),
  );
  if (unexpected.length) {
    fail(
      context,
      `contains unsupported entries: ${unexpected.map(entry => entry.name).join(', ')}`,
    );
  }

  const fileNames = [];
  for (const entry of entries.sort((left, right) => compareFileNames(left.name, right.name))) {
    const eventDirectory = path.join(directory, entry.name);
    const eventFiles = await listJsonFiles(
      eventDirectory,
      `${context}/${entry.name}`,
    );
    fileNames.push(...eventFiles.map(fileName => path.join(entry.name, fileName)));
  }
  return fileNames;
}

async function loadRecordFiles(
  directory,
  validate,
  transform = value => value,
  listFiles = listJsonFiles,
) {
  const fileNames = await listFiles(directory, relativePath(directory));
  const records = [];
  const files = [];
  for (const fileName of fileNames) {
    const filePath = path.join(directory, fileName);
    const value = await readJson(filePath);
    validate(value, relativePath(filePath));
    records.push(transform(value, relativePath(filePath)));
    files.push(filePath);
  }
  return { records, files };
}

async function loadModderRecordFiles(directory = MODDERS_ROOT) {
  const fileNames = await listJsonFiles(directory, relativePath(directory));
  const records = [];
  const files = [];
  for (const fileName of fileNames) {
    const filePath = path.join(directory, fileName);
    const value = await readJson(filePath);
    const fileId = path.basename(filePath, '.json');
    const record = value
      && typeof value === 'object'
      && !Array.isArray(value)
      && (!Object.hasOwn(value, 'id') || value.id === '' || value.id === null)
      ? { ...value, id: fileId }
      : value;
    validateModder(record, relativePath(filePath));
    records.push(record);
    files.push(filePath);
  }
  return { records, files };
}

export async function loadModderRecords({ directory = MODDERS_ROOT } = {}) {
  const source = await loadModderRecordFiles(directory);
  const ids = new Map();
  source.records.forEach((modder, index) => {
    const fileId = path.basename(source.files[index], '.json');
    if (fileId !== modder.id) {
      fail(relativePath(source.files[index]), `filename must match stable modder ID "${modder.id}.json"`);
    }
    if (ids.has(modder.id)) {
      fail(relativePath(source.files[index]), `duplicates stable modder ID also used by ${ids.get(modder.id)}`);
    }
    ids.set(modder.id, relativePath(source.files[index]));
  });
  Order.buildIdentityIndex(source.records);
  return source.records;
}

async function loadYearRecordFiles(directory, validate, transform = value => value) {
  return loadRecordFiles(directory, validate, transform, listYearJsonFiles);
}

async function loadAchievementRecordFiles() {
  const fileNames = await listYearJsonFiles(
    MODATHON_ACHIEVEMENTS_ROOT,
    relativePath(MODATHON_ACHIEVEMENTS_ROOT),
  );
  const records = [];
  const files = [];
  const years = new Set();
  const recordKeys = new Set();
  for (const fileName of fileNames) {
    const filePath = path.join(MODATHON_ACHIEVEMENTS_ROOT, fileName);
    const record = await readJson(filePath);
    validateAchievementSource(record, relativePath(filePath));
    const normalizedRecord = {
      ...record,
      unlockedBy: Array.isArray(record.unlockedBy) ? record.unlockedBy : [],
      unlockedCount: Array.isArray(record.unlockedBy) ? record.unlockedBy.length : 0,
    };
    const parentYear = path.basename(path.dirname(fileName));
    if (Number(parentYear) !== normalizedRecord.year) {
      fail(
        relativePath(filePath),
        `year must match parent directory "${parentYear}"`,
      );
    }
    if (path.basename(fileName) !== `${normalizedRecord.year}-${normalizedRecord.id}.json`) {
      fail(
        relativePath(filePath),
        `filename must match year and achievement ID "${record.year}-${record.id}.json"`,
      );
    }
    const recordKey = `${normalizedRecord.year}|${normalizedRecord.id}`;
    if (recordKeys.has(recordKey)) {
      fail(relativePath(filePath), `duplicates achievement ID "${record.id}" for ${record.year}`);
    }
    years.add(normalizedRecord.year);
    recordKeys.add(recordKey);
    records.push(normalizedRecord);
    files.push(filePath);
  }
  return {
    records,
    files,
    years: [...years].sort((left, right) => left - right),
  };
}

export function generatedAchievementPath(year) {
  return path.join(GENERATED_MODATHON_DATA_ROOT, `${year}-achievements.json`);
}

export async function loadGeneratedAchievementDocuments() {
  let entries;
  try {
    entries = await readdir(GENERATED_MODATHON_DATA_ROOT, { withFileTypes: true });
  } catch (error) {
    throw new Error(
      `Could not read ${relativePath(GENERATED_MODATHON_DATA_ROOT)}: ${error.message}`,
    );
  }

  const fileNames = entries
    .filter(entry => entry.isFile() && /^\d{4}-achievements\.json$/.test(entry.name))
    .map(entry => entry.name)
    .sort(compareFileNames);
  const records = [];
  const files = [];
  const years = new Set();
  for (const fileName of fileNames) {
    const filePath = path.join(GENERATED_MODATHON_DATA_ROOT, fileName);
    const document = await readJson(filePath);
    validateGeneratedAchievementDocument(document, relativePath(filePath));
    const filenameYear = Number(fileName.slice(0, 4));
    if (document.event.year !== filenameYear) {
      fail(
        relativePath(filePath),
        `filename must match event year "${document.event.year}-achievements.json"`,
      );
    }
    if (years.has(document.event.year)) {
      fail(relativePath(filePath), `duplicates achievement year ${document.event.year}`);
    }
    years.add(document.event.year);
    records.push(document);
    files.push(filePath);
  }
  return { records, files };
}

function groupedRecords(records, keyFor, valueFor) {
  const groups = new Map();
  records.forEach((record) => {
    const key = String(keyFor(record));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(valueFor(record));
  });
  return groups;
}

export async function loadContentSources() {
  const [metadata, modjamMetadata, madnessScoreRules, orderRules] = await Promise.all([
    readJson(MODATHON_METADATA_PATH),
    readJson(MODJAM_METADATA_PATH),
    readJson(MADNESS_SCORE_RULES_PATH),
    readJson(ORDER_RULES_PATH),
  ]);
  validateModsMetadata(metadata);
  validateModjamMetadata(modjamMetadata);
  validateMadnessScoreRules(madnessScoreRules);
  validateOrderRules(orderRules);

  const [
    achievementSource,
    modathonEventSource,
    modjamEventSource,
    madnessEventSource,
    modathonSource,
    modderSource,
    modjamSource,
    madnessModSource,
    madnessTeamSource,
    postcardSource,
    wikiContributions,
  ] = await Promise.all([
    loadAchievementRecordFiles(),
    loadRecordFiles(MODATHON_EVENTS_ROOT, validateModathonEventSource, (record) => {
      const {
        schemaVersion: _schemaVersion,
        eventType: _eventType,
        name: _name,
        ...event
      } = record;
      return {
        name: `Morrowind Modathon ${event.year}`,
        ...event,
      };
    }),
    loadRecordFiles(MODJAM_EVENTS_ROOT, validateModjamEventSource, (record) => {
      const {
        schemaVersion: _schemaVersion,
        eventType: _eventType,
        id: _id,
        label: _label,
        name: _name,
        competitionLabel: _competitionLabel,
        competitionNote: _competitionNote,
        ...event
      } = record;
      return canonicalModjamEvent(event);
    }),
    loadRecordFiles(MADNESS_EVENTS_ROOT, validateMadnessEventSource, (record) => {
      const {
        schemaVersion: _schemaVersion,
        eventType: _eventType,
        name: _name,
        ...event
      } = record;
      return {
        name: `Morrowind Modding Madness ${event.year}`,
        ...event,
        themes: event.themes ?? [],
      };
    }),
    loadYearRecordFiles(MODATHON_MODS_ROOT, (record, context) => {
      assertPlainObject(record, context);
      assertYear(record.year, `${context}.year`);
      const directoryYearName = path.basename(path.dirname(context));
      const directoryYear = Number(directoryYearName);
      if (record.year !== directoryYear) {
        fail(
          `${context}.year`,
          `must match parent directory "${directoryYearName}"`,
        );
      }
      const { year: _year, ...mod } = record;
      validateMod(mod, context);
    }),
    loadModderRecordFiles(),
    loadRecordFiles(MODJAM_MODS_ROOT, (record, context) => {
      assertPlainObject(record, context);
      assertNonEmptyString(record.eventId, `${context}.eventId`);
      if (!eventIdPattern.test(record.eventId)) fail(`${context}.eventId`, 'must use lowercase letters, numbers, and hyphens');
      const parentEventId = path.basename(path.dirname(context));
      if (record.eventId !== parentEventId) {
        fail(
          `${context}.eventId`,
          `must match parent directory "${parentEventId}"`,
        );
      }
      const derivedId = modjamEntryId(record.eventId, record.url);
      if (derivedId && record.id && record.id !== derivedId) {
        fail(`${context}.id`, `must equal the generated Nexus entry ID "${derivedId}"`);
      }
      const { eventId: _eventId, ...mod } = normalizeModjamMod(record, context);
      validateModjamMod(mod, context);
    }, normalizeModjamMod, listEventJsonFiles),
    loadYearRecordFiles(MADNESS_MODS_ROOT, (record, context) => {
      assertPlainObject(record, context);
      assertYear(record.year, `${context}.year`);
      const parentYear = Number(path.basename(path.dirname(context)));
      if (record.year !== parentYear) {
        fail(`${context}.year`, `must match parent directory "${parentYear}"`);
      }
      const { year: _year, ...mod } = record;
      validateMadnessMod(mod, context);
    }),
    loadRecordFiles(MADNESS_TEAMS_ROOT, (record, context) => {
      assertPlainObject(record, context);
      assertYear(record.year, `${context}.year`);
      const { year: _year, ...team } = record;
      validateMadnessTeam(team, context);
    }),
    loadRecordFiles(MODJAM_POSTCARDS_ROOT, validatePostcard),
    loadWikiContributionRecords(),
  ]);

  const modathonEvents = {
    schemaVersion: 1,
    eventType: 'modathon',
    events: modathonEventSource.records,
  };
  validateModathonEvents(modathonEvents);
  modathonEventSource.records.forEach((event, index) => {
    const filePath = modathonEventSource.files[index];
    if (path.basename(filePath) !== `${event.year}.json`) {
      fail(relativePath(filePath), `filename must match year "${event.year}.json"`);
    }
  });

  const modjamEvents = {
    schemaVersion: 1,
    eventType: 'modjam',
    events: modjamEventSource.records.slice().sort((left, right) => (
      left.year - right.year
      || ['Winter', 'Spring', 'Summer', 'Autumn'].indexOf(left.season)
        - ['Winter', 'Spring', 'Summer', 'Autumn'].indexOf(right.season)
      || left.id.localeCompare(right.id)
    )),
  };
  validateModjamEvents(modjamEvents);
  modjamEventSource.records.forEach((event, index) => {
    const filePath = modjamEventSource.files[index];
    if (path.basename(filePath) !== `${event.id}.json`) {
      fail(relativePath(filePath), `filename must match generated event ID "${event.id}.json"`);
    }
  });

  const madnessEvents = {
    schemaVersion: 1,
    eventType: 'madness',
    events: madnessEventSource.records,
  };
  validateMadnessEvents(madnessEvents);
  madnessEventSource.records.forEach((event, index) => {
    const filePath = madnessEventSource.files[index];
    if (path.basename(filePath) !== `${event.year}.json`) {
      fail(relativePath(filePath), `filename must match year "${event.year}.json"`);
    }
  });

  const modderIds = new Map();
  modderSource.records.forEach((modder, index) => {
    const filePath = modderSource.files[index];
    const fileId = path.basename(filePath, '.json');
    if (fileId !== modder.id) {
      fail(
        relativePath(filePath),
        `stable ID cannot be changed from "${fileId}"; restore id to "${fileId}" and update name/aliases instead`,
      );
    }
    if (modderIds.has(modder.id)) {
      fail(relativePath(filePath), `duplicates stable modder ID also used by ${modderIds.get(modder.id)}`);
    }
    modderIds.set(modder.id, relativePath(filePath));
  });
  Order.buildIdentityIndex(modderSource.records);

  const modsByYear = groupedRecords(
    modathonSource.records,
    record => record.year,
    record => {
      const { year: _year, ...mod } = record;
      return mod;
    },
  );
  const achievementsByYear = groupedRecords(
    achievementSource.records,
    record => record.year,
    record => {
      const { schemaVersion: _schemaVersion, year: _year, ...achievement } = record;
      return achievement;
    },
  );
  const achievementYears = new Set(achievementSource.years);
  for (const [index, event] of modathonEvents.events.entries()) {
    assertYear(event?.year, `${relativePath(MODATHON_EVENTS_PATH)}.events[${index}].year`);
    achievementYears.add(event.year);
  }
  const modjamModsByEvent = groupedRecords(
    modjamSource.records,
    record => record.eventId,
    record => {
      const { eventId: _eventId, ...mod } = record;
      return mod;
    },
  );
  const madnessModsByYear = groupedRecords(
    madnessModSource.records,
    record => record.year,
    record => {
      const { year: _year, ...mod } = record;
      return mod;
    },
  );
  const madnessTeamsByYear = groupedRecords(
    madnessTeamSource.records,
    record => record.year,
    record => {
      const { year: _year, ...team } = record;
      return team;
    },
  );

  validateAuthorReferences(modsByYear, modderSource.records);
  validateIdReferences(
    modjamSource.records.flatMap(record => record.authors.map(author => author.id)),
    modderIds,
    'Modjam authors',
  );
  validateIdReferences(
    madnessTeamSource.records.flatMap(record => record.members.map(member => member.id)),
    modderIds,
    'Madness team members',
  );
  validateMadnessThemeReferences(
    madnessModSource.records,
    madnessEvents,
    madnessModSource.files.map(relativePath),
  );

  const eventIds = new Set((modjamEvents.events || []).map(event => event.id));
  for (const eventId of modjamModsByEvent.keys()) {
    if (!eventIds.has(eventId)) fail(relativePath(MODJAM_MODS_ROOT), `references unknown Modjam event "${eventId}"`);
  }
  const entryIds = new Set(modjamSource.records.map(record => record.id));
  postcardSource.records.forEach((postcard, index) => {
    if (!entryIds.has(postcard.entryId)) {
      fail(relativePath(postcardSource.files[index]), `references unknown Modjam entry "${postcard.entryId}"`);
    }
  });
  await validatePostcardAssets(postcardSource.records, postcardSource.files);
  validateMadnessTeamReferences(
    madnessModSource.records,
    madnessTeamSource.records,
  );

  return {
    metadata,
    modjamMetadata,
    madnessScoreRules,
    orderRules,
    modjamEvents,
    modathonEvents,
    madnessEvents,
    achievementYears: [...achievementYears].sort((left, right) => left - right),
    achievementsByYear,
    achievementRecords: achievementSource.records,
    achievementFiles: achievementSource.files,
    modathonEventRecords: modathonEventSource.records,
    modathonEventFiles: modathonEventSource.files,
    modjamEventRecords: modjamEventSource.records,
    modjamEventFiles: modjamEventSource.files,
    madnessEventRecords: madnessEventSource.records,
    madnessEventFiles: madnessEventSource.files,
    modsByYear,
    modders: modderSource.records,
    modRecords: modathonSource.records,
    modFiles: modathonSource.files,
    modderFiles: modderSource.files,
    wikiContributions,
    modjamModsByEvent,
    modjamModRecords: modjamSource.records,
    modjamModFiles: modjamSource.files,
    madnessModsByYear,
    madnessModRecords: madnessModSource.records,
    madnessModFiles: madnessModSource.files,
    madnessTeamsByYear,
    madnessTeamRecords: madnessTeamSource.records,
    madnessTeamFiles: madnessTeamSource.files,
    postcards: postcardSource.records,
    postcardFiles: postcardSource.files,
  };
}

function validateIdReferences(ids, knownIds, context) {
  ids.forEach((id, index) => {
    if (!knownIds.has(id)) fail(`${context}[${index}]`, `references unknown central modder ID "${id}"`);
  });
}

export function validateAuthorReferences(modsByYear, modders) {
  const references = new Map();
  for (const modder of modders) {
    for (const name of [modder.name, ...(modder.aliases || [])]) {
      const key = identityKey(name);
      if (!key) fail(`modder ${modder.id}`, `has an unusable name or alias: ${JSON.stringify(name)}`);
      const ids = references.get(key) || new Set();
      ids.add(modder.id);
      references.set(key, ids);
    }
  }

  for (const [name, ids] of references) {
    if (ids.size > 1) {
      fail('central modder registry', `name/alias key "${name}" is ambiguous across IDs: ${[...ids].join(', ')}`);
    }
  }

  for (const [year, mods] of modsByYear) {
    mods.forEach((mod, modIndex) => {
      mod.authors.forEach((author, authorIndex) => {
        if (!references.has(identityKey(author.name))) {
          fail(
            `content/modathon/mods record ${modIndex + 1} (${year}).authors[${authorIndex}]`,
            `does not resolve to a central modder name or alias: ${JSON.stringify(author.name)}`,
          );
        }
      });
    });
  }
}

function buildModjamSummary(events, listedModderCount) {
  const entries = events.flatMap(event => event.mods || []);
  const modderCount = new Set(
    entries.flatMap(entry => (entry.authors || []).map(author => author.id || author)),
  ).size;
  return {
    eventCount: events.length,
    entryCount: entries.length,
    modderCount,
    listedModderCount: Math.min(listedModderCount, modderCount),
    placementCount: entries.filter(entry => entry.placement).length,
    judgeAwardCount: entries.reduce(
      (count, entry) => count + (Array.isArray(entry.awards) ? entry.awards.length : 0),
      0,
    ),
    placardCount: entries.filter(entry => entry.awardPlacardUrl).length,
    categories: [...new Set(entries.map(entry => entry.category).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right)),
  };
}

export function buildContentDocuments(sources) {
  const mods = {};
  for (const [year, records] of [...sources.modsByYear].sort(([a], [b]) => Number(a) - Number(b))) {
    mods[year] = records;
  }

  const sortedModders = sources.modders.slice().sort((left, right) => (
    modderCollator.compare(left.name, right.name)
    || compareFileNames(left.id, right.id)
  ));

  const modjamEventOrder = (sources.modjamEvents.events || []).map(event => event.id);
  const modjamEvents = modjamEventOrder.map(id => ({
    id,
    mods: sources.modjamModsByEvent.get(id) || [],
  }));

  const madnessYears = [...new Set([
    ...(sources.madnessEvents.events || []).map(event => String(event.year)),
    ...sources.madnessModsByYear.keys(),
    ...sources.madnessTeamsByYear.keys(),
  ])].sort((left, right) => Number(left) - Number(right));
  const madnessModsDocument = {
    years: madnessYears.map(year => ({
      year: Number(year),
      mods: sources.madnessModsByYear.get(String(year)) || [],
    })),
  };
  const modsByYearAndName = new Map(madnessModsDocument.years.map(group => [
    group.year,
    new Map(group.mods.map(mod => [mod.name, mod])),
  ]));
  const madnessTeamsDocument = {
    years: madnessYears.map(year => ({
      year: Number(year),
      teams: (sources.madnessTeamsByYear.get(String(year)) || []).map(team => ({
        ...team,
        mods: team.mods.map((mod) => {
          const detail = modsByYearAndName.get(Number(year))?.get(mod.name);
          return {
            name: mod.name,
            url: detail?.url ?? null,
            ...(detail?.showcaseUrl ? { showcaseUrl: detail.showcaseUrl } : {}),
          };
        }),
      })),
    })),
  };

  const achievementDocuments = sources.achievementYears.map(year => ({
    schemaVersion: 1,
    event: {
      name: 'Morrowind Modathon',
      year,
    },
    achievements: sources.achievementsByYear.get(String(year)) || [],
  }));
  const modsDocument = {
    generated: sources.metadata.generated,
    game: sources.metadata.game,
    mods,
  };
  const moddersDocument = { modders: sortedModders };
  const modjamModsDocument = {
    generatedAt: sources.modjamMetadata.generatedAt,
    summary: buildModjamSummary(modjamEvents, sources.modjamMetadata.listedModderCount),
    events: modjamEvents,
  };
  const madnessScoresDocument = MadnessScore.buildScoreDocument({
    rules: sources.madnessScoreRules,
    registry: moddersDocument,
    modathonMods: modsDocument,
    modathonEvents: sources.modathonEvents,
    modjamMods: modjamModsDocument,
    modjamEvents: sources.modjamEvents,
    madnessTeams: madnessTeamsDocument,
    achievementDocuments,
  });
  const orderScoresDocument = Order.buildOrderDocument({
    rules: sources.orderRules,
    modders: sortedModders,
    contributions: sources.wikiContributions,
  });

  return {
    modsDocument,
    moddersDocument,
    madnessScoresDocument,
    orderScoresDocument,
    modjamModsDocument,
    modathonEventsDocument: sources.modathonEvents,
    modjamEventsDocument: sources.modjamEvents,
    madnessModsDocument,
    madnessTeamsDocument,
    madnessEventsDocument: sources.madnessEvents,
    postcardsDocument: { postcards: sources.postcards },
    achievementDocuments,
  };
}

export function validateGeneratedDocuments(modsDocument, moddersDocument, context = 'generated content') {
  assertPlainObject(modsDocument, `${context} Modathon document`);
  if (!isDeepStrictEqual(Object.keys(modsDocument), ['generated', 'game', 'mods'])) {
    fail(`${context} Modathon document`, 'must contain exactly "generated", "game", and "mods"');
  }
  validateModsMetadata(
    { generated: modsDocument.generated, game: modsDocument.game },
    `${context} Modathon metadata`,
  );
  assertPlainObject(modsDocument.mods, `${context} Modathon document.mods`);

  const modsByYear = new Map();
  for (const [year, mods] of Object.entries(modsDocument.mods)) {
    if (!yearPattern.test(year)) fail(`${context} Modathon document.mods`, `has invalid year "${year}"`);
    if (!Array.isArray(mods)) fail(`${context} Modathon document.mods.${year}`, 'must be an array');
    mods.forEach((mod, index) => validateMod(mod, `${context} Modathon ${year} record ${index + 1}`));
    modsByYear.set(year, mods);
  }

  assertPlainObject(moddersDocument, `${context} modder document`);
  if (!isDeepStrictEqual(Object.keys(moddersDocument), ['modders'])) {
    fail(`${context} modder document`, 'must contain exactly "modders"');
  }
  if (!Array.isArray(moddersDocument.modders)) fail(`${context} modder document.modders`, 'must be an array');
  const ids = new Set();
  moddersDocument.modders.forEach((modder, index) => {
    validateModder(modder, `${context} modder record ${index + 1}`);
    if (ids.has(modder.id)) fail(`${context} modder document`, `duplicates stable ID "${modder.id}"`);
    ids.add(modder.id);
  });
  validateAuthorReferences(modsByYear, moddersDocument.modders);
}

export function validateGeneratedSiteDocuments(documents, context = 'generated content') {
  validateGeneratedDocuments(documents.modsDocument, documents.moddersDocument, context);

  const {
    madnessScoresDocument,
    orderScoresDocument,
    modathonEventsDocument,
    modjamEventsDocument,
    modjamModsDocument,
    madnessModsDocument,
    madnessTeamsDocument,
    madnessEventsDocument,
    postcardsDocument,
    achievementDocuments,
  } = documents;
  if (orderScoresDocument !== undefined) {
    assertPlainObject(orderScoresDocument, `${context} Order Scores`);
    assertExactFields(
      orderScoresDocument,
      new Set(['schemaVersion', 'rules', 'modders', 'unlinkedContributors']),
      `${context} Order Scores`,
    );
    if (orderScoresDocument.schemaVersion !== 1) {
      fail(`${context} Order Scores`, 'must use schemaVersion 1');
    }
    validateOrderRules(orderScoresDocument.rules, `${context} Order Scores rules`);
    assertPlainObject(orderScoresDocument.modders, `${context} Order Scores modders`);
    const registryById = new Map(
      documents.moddersDocument.modders.map(modder => [modder.id, modder]),
    );
    if (Object.keys(orderScoresDocument.modders).length !== registryById.size) {
      fail(`${context} Order Scores modders`, 'must contain every central modder profile exactly once');
    }
    for (const [id, profile] of Object.entries(orderScoresDocument.modders)) {
      const profileContext = `${context} Order Scores profile ${id}`;
      assertPlainObject(profile, profileContext);
      assertExactFields(profile, new Set([
        'modderId', 'name', 'orderScore', 'hasMarkOfOrder',
        'orderlinessAtLastActivity', 'lastOrderActivityAt', 'orderActivityDays',
      ]), profileContext);
      const modder = registryById.get(id);
      if (!modder) fail(profileContext, 'references an unknown modder');
      if (profile.modderId !== id || profile.name !== modder.name) {
        fail(profileContext, 'must repeat the canonical stable ID and name');
      }
      if (!Number.isSafeInteger(profile.orderScore) || profile.orderScore < 0) {
        fail(`${profileContext}.orderScore`, 'must be a non-negative whole number');
      }
      if (profile.hasMarkOfOrder !== (profile.orderScore > 0)) {
        fail(`${profileContext}.hasMarkOfOrder`, 'must equal whether Order Score is positive');
      }
      if (!Number.isSafeInteger(profile.orderActivityDays) || profile.orderActivityDays < 0) {
        fail(`${profileContext}.orderActivityDays`, 'must be a non-negative whole number');
      }
      if (profile.orderScore === 0) {
        if (profile.orderlinessAtLastActivity !== 0
            || profile.lastOrderActivityAt !== null
            || profile.orderActivityDays !== 0) {
          fail(profileContext, 'a never-contributor must have zero Orderliness state');
        }
      } else {
        if (!(profile.orderlinessAtLastActivity >= orderScoresDocument.rules.orderliness.floor)
            || profile.orderlinessAtLastActivity > 100
            || !Number.isFinite(Date.parse(profile.lastOrderActivityAt))
            || profile.orderActivityDays < 1) {
          fail(profileContext, 'has invalid contributed Orderliness state');
        }
      }
    }
    if (!Array.isArray(orderScoresDocument.unlinkedContributors)) {
      fail(`${context} Order Scores unlinkedContributors`, 'must be an array');
    }
    orderScoresDocument.unlinkedContributors.forEach((entry, index) => {
      const entryContext = `${context} Order Scores unlinkedContributors[${index}]`;
      assertPlainObject(entry, entryContext);
      assertExactFields(entry, new Set(['contributor', 'contributions']), entryContext);
      assertNonEmptyString(entry.contributor, `${entryContext}.contributor`);
      if (!Number.isSafeInteger(entry.contributions) || entry.contributions < 1) {
        fail(`${entryContext}.contributions`, 'must be a positive whole number');
      }
    });
  }
  if (madnessScoresDocument !== undefined) {
    assertPlainObject(madnessScoresDocument, `${context} Madness Scores`);
    if (madnessScoresDocument.schemaVersion !== 1) {
      fail(`${context} Madness Scores`, 'must use schemaVersion 1');
    }
    validateMadnessScoreRules(
      madnessScoresDocument.rules,
      `${context} Madness Scores rules`,
    );
    assertPlainObject(madnessScoresDocument.modders, `${context} Madness Scores modders`);
    const knownIds = new Set(documents.moddersDocument.modders.map(modder => modder.id));
    for (const [id, profile] of Object.entries(madnessScoresDocument.modders)) {
      if (!knownIds.has(id)) fail(`${context} Madness Scores`, `references unknown modder "${id}"`);
      assertPlainObject(profile, `${context} Madness Scores profile ${id}`);
      if (profile.id !== id) fail(`${context} Madness Scores profile ${id}`, 'must repeat its stable ID');
      if (!Number.isFinite(profile.total) || profile.total <= 0) {
        fail(`${context} Madness Scores profile ${id}`, 'must have a positive finite total');
      }
      const componentTotal = Object.values(profile.entries || {}).reduce(
        (sum, entry) => sum + Number(entry.points || 0),
        0,
      ) + Number(profile.achievements?.points || 0)
        + Number(profile.placements?.points || 0)
        + Number(profile.modderthlons?.points || 0);
      if (componentTotal !== profile.total) {
        fail(`${context} Madness Scores profile ${id}`, 'component points must equal total');
      }
    }
  }
  if (modathonEventsDocument !== undefined) {
    validateModathonEvents(modathonEventsDocument, `${context} Modathon events`);
  }
  if (modjamEventsDocument !== undefined) {
    validateModjamEvents(modjamEventsDocument, `${context} Modjam events`);
  }
  if (madnessEventsDocument !== undefined) {
    validateMadnessEvents(madnessEventsDocument, `${context} Madness events`);
  }
  if (achievementDocuments !== undefined) {
    if (!Array.isArray(achievementDocuments)) {
      fail(`${context} Modathon achievements`, 'must be an array');
    }
    const years = new Set();
    achievementDocuments.forEach((document, index) => {
      validateGeneratedAchievementDocument(
        document,
        `${context} Modathon achievement document ${index + 1}`,
      );
      if (years.has(document.event.year)) {
        fail(`${context} Modathon achievements`, `duplicates year ${document.event.year}`);
      }
      years.add(document.event.year);
    });
  }
  assertPlainObject(modjamModsDocument, `${context} Modjam mods`);
  if (!isDeepStrictEqual(Object.keys(modjamModsDocument), ['generatedAt', 'summary', 'events'])) {
    fail(`${context} Modjam mods`, 'must contain exactly "generatedAt", "summary", and "events"');
  }
  if (!Array.isArray(modjamModsDocument.events)) fail(`${context} Modjam mods.events`, 'must be an array');
  const modjamIds = new Set();
  modjamModsDocument.events.forEach((group, groupIndex) => {
    assertPlainObject(group, `${context} Modjam event group ${groupIndex + 1}`);
    if (!isDeepStrictEqual(Object.keys(group), ['id', 'mods'])) {
      fail(`${context} Modjam event group ${groupIndex + 1}`, 'must contain exactly "id" and "mods"');
    }
    assertNonEmptyString(group.id, `${context} Modjam event group ${groupIndex + 1}.id`);
    if (!Array.isArray(group.mods)) fail(`${context} Modjam ${group.id}.mods`, 'must be an array');
    group.mods.forEach((mod, index) => {
      validateModjamMod(mod, `${context} Modjam ${group.id} record ${index + 1}`);
      if (modjamIds.has(mod.id)) fail(`${context} Modjam mods`, `duplicates entry ID "${mod.id}"`);
      modjamIds.add(mod.id);
    });
  });

  for (const [label, document, listName, validate] of [
    ['Madness mods', madnessModsDocument, 'mods', validateMadnessMod],
    ['Madness teams', madnessTeamsDocument, 'teams', (team, itemContext) => (
      validateMadnessTeam(team, itemContext, { generated: true })
    )],
  ]) {
    assertPlainObject(document, `${context} ${label}`);
    if (!isDeepStrictEqual(Object.keys(document), ['years'])) {
      fail(`${context} ${label}`, 'must contain exactly "years"');
    }
    if (!Array.isArray(document.years)) fail(`${context} ${label}.years`, 'must be an array');
    document.years.forEach((group, groupIndex) => {
      assertPlainObject(group, `${context} ${label} year ${groupIndex + 1}`);
      if (!isDeepStrictEqual(Object.keys(group), ['year', listName])) {
        fail(`${context} ${label} year ${groupIndex + 1}`, `must contain exactly "year" and "${listName}"`);
      }
      assertYear(group.year, `${context} ${label} year ${groupIndex + 1}.year`);
      if (!Array.isArray(group[listName])) fail(`${context} ${label} ${group.year}.${listName}`, 'must be an array');
      group[listName].forEach((record, index) => validate(
        record,
        `${context} ${label} ${group.year} record ${index + 1}`,
      ));
    });
  }

  assertPlainObject(postcardsDocument, `${context} postcards`);
  if (!isDeepStrictEqual(Object.keys(postcardsDocument), ['postcards'])) {
    fail(`${context} postcards`, 'must contain exactly "postcards"');
  }
  if (!Array.isArray(postcardsDocument.postcards)) fail(`${context} postcards.postcards`, 'must be an array');
  postcardsDocument.postcards.forEach((postcard, index) => (
    validatePostcard(postcard, `${context} postcard ${index + 1}`)
  ));
}

export function assertLosslessBuild(sources, documents) {
  const expectedAchievements = sources.achievementYears.map(year => ({
    schemaVersion: 1,
    event: {
      name: 'Morrowind Modathon',
      year,
    },
    achievements: sources.achievementsByYear.get(String(year)) || [],
  }));
  if (!isDeepStrictEqual(documents.achievementDocuments, expectedAchievements)) {
    fail('content build', 'changed Modathon achievement records while generating public documents');
  }
  const expectedMods = Object.fromEntries(sources.modsByYear);
  if (!isDeepStrictEqual(documents.modsDocument.mods, expectedMods)) {
    fail('content build', 'changed Modathon records while grouping them by year');
  }
  const expectedModders = sources.modders.slice().sort((left, right) => (
    modderCollator.compare(left.name, right.name)
    || compareFileNames(left.id, right.id)
  ));
  if (!isDeepStrictEqual(documents.moddersDocument.modders, expectedModders)) {
    fail('content build', 'changed modder records while assembling the registry');
  }
  if (!isDeepStrictEqual(documents.madnessEventsDocument, sources.madnessEvents)) {
    fail('content build', 'changed Madness event records while assembling the event archive');
  }
  if (!isDeepStrictEqual(documents.madnessScoresDocument.rules, sources.madnessScoreRules)) {
    fail('content build', 'changed Madness Score rules while generating score totals');
  }
  if (!isDeepStrictEqual(documents.orderScoresDocument.rules, sources.orderRules)) {
    fail('content build', 'changed Order rules while generating score totals');
  }
  const expectedOrderScores = Order.buildOrderDocument({
    rules: sources.orderRules,
    modders: expectedModders,
    contributions: sources.wikiContributions,
  });
  if (!isDeepStrictEqual(documents.orderScoresDocument, expectedOrderScores)) {
    fail('content build', 'changed Order data while generating score totals');
  }
  if (!isDeepStrictEqual(documents.modathonEventsDocument, sources.modathonEvents)) {
    fail('content build', 'changed Modathon event records while assembling the event archive');
  }
  if (!isDeepStrictEqual(documents.modjamEventsDocument, sources.modjamEvents)) {
    fail('content build', 'changed Modjam event records while assembling the event archive');
  }
  for (const group of documents.modjamModsDocument.events) {
    if (!isDeepStrictEqual(group.mods, sources.modjamModsByEvent.get(group.id) || [])) {
      fail('content build', `changed Modjam records while grouping event ${group.id}`);
    }
  }
  for (const group of documents.madnessModsDocument.years) {
    if (!isDeepStrictEqual(group.mods, sources.madnessModsByYear.get(String(group.year)) || [])) {
      fail('content build', `changed Madness mod records while grouping year ${group.year}`);
    }
  }
  const expectedPostcards = sources.postcards;
  if (!isDeepStrictEqual(documents.postcardsDocument.postcards, expectedPostcards)) {
    fail('content build', 'changed postcard records while assembling the manifest');
  }

  for (const [label, value] of [
    ['Modathon', documents.modsDocument],
    ['modder', documents.moddersDocument],
    ['Modjam', documents.modjamModsDocument],
    ['Modathon events', documents.modathonEventsDocument],
    ['Modjam events', documents.modjamEventsDocument],
    ['Madness events', documents.madnessEventsDocument],
    ['Madness mods', documents.madnessModsDocument],
    ['Madness teams', documents.madnessTeamsDocument],
    ['Madness Scores', documents.madnessScoresDocument],
    ['Order Scores', documents.orderScoresDocument],
    ['postcard', documents.postcardsDocument],
    ...documents.achievementDocuments.map(document => [
      `Modathon ${document.event.year} achievements`,
      document,
    ]),
  ]) {
    const reparsed = JSON.parse(canonicalJson(value));
    if (!isDeepStrictEqual(reparsed, value)) {
      fail('content build', `${label} data changed during its JSON round trip`);
    }
  }
}
