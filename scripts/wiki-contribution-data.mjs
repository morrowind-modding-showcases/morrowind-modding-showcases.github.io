import { mkdir, opendir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Order from '../assets/order-score.js';

import {
  LOCATION_TARGET_PATTERN,
  MOD_TARGET_PATTERN,
  SUBMISSION_KINDS,
} from './wiki-submission-schema.mjs';
import { REPO_ROOT } from './wiki-content-lib.mjs';

export const WIKI_CONTRIBUTION_DIRECTORY = path.join(
  REPO_ROOT,
  'content',
  'wiki-contributions',
);

export const WIKI_CONTRIBUTION_HISTORY_PATH = path.join(
  REPO_ROOT,
  'wiki',
  'quartz',
  'static',
  'contribution-history.json',
);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const VERSION_1_RECORD_KEYS = Object.freeze([
  'schemaVersion',
  'submissionId',
  'contributor',
  'submittedAt',
  'kind',
  'pagePath',
  'pageTitle',
]);
const VERSION_2_RECORD_KEYS = Object.freeze([
  ...VERSION_1_RECORD_KEYS,
  'contributorType',
  'modderId',
]);

function recordError(source, message) {
  throw new Error(`Invalid wiki contribution record ${source}: ${message}`);
}

export function validateWikiContributionRecord(input, source = '<memory>') {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    recordError(source, 'the record must be an object.');
  }
  const actualKeys = Object.keys(input).sort();
  const recordKeys = input.schemaVersion === 1
    ? VERSION_1_RECORD_KEYS
    : input.schemaVersion === 2
      ? VERSION_2_RECORD_KEYS
      : null;
  if (!recordKeys) recordError(source, 'schemaVersion must be 1 or 2.');
  const expectedKeys = [...recordKeys].sort();
  if (actualKeys.length !== expectedKeys.length
      || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    recordError(source, `the record fields do not match the version-${input.schemaVersion} schema.`);
  }
  if (typeof input.submissionId !== 'string' || !UUID_PATTERN.test(input.submissionId)) {
    recordError(source, 'submissionId must be a UUID.');
  }
  if (typeof input.contributor !== 'string') recordError(source, 'contributor must be text.');
  const contributor = input.contributor.trim();
  if (contributor.length < 2 || contributor.length > 100
      || /[<>\r\n\u0000-\u001f\u007f-\u009f]/u.test(contributor)) {
    recordError(source, 'contributor must be a safe public name between 2 and 100 characters.');
  }
  if (typeof input.submittedAt !== 'string' || !Number.isFinite(Date.parse(input.submittedAt))) {
    recordError(source, 'submittedAt must be an ISO timestamp.');
  }
  if (!SUBMISSION_KINDS.includes(input.kind)) recordError(source, 'kind is unsupported.');
  if (typeof input.pagePath !== 'string'
      || (!MOD_TARGET_PATTERN.test(input.pagePath) && !LOCATION_TARGET_PATTERN.test(input.pagePath))) {
    recordError(source, 'pagePath is not a permitted wiki article path.');
  }
  if (input.kind === 'edit-location' && !LOCATION_TARGET_PATTERN.test(input.pagePath)) {
    recordError(source, 'edit-location records must target a location article.');
  }
  if (input.kind !== 'edit-location' && !MOD_TARGET_PATTERN.test(input.pagePath)) {
    recordError(source, 'mod records must target a mod article.');
  }
  if (typeof input.pageTitle !== 'string') recordError(source, 'pageTitle must be text.');
  const pageTitle = input.pageTitle.trim();
  if (!pageTitle || pageTitle.length > 300
      || /[\r\n\u0000-\u001f\u007f-\u009f]/u.test(pageTitle)) {
    recordError(source, 'pageTitle must be one non-empty line of at most 300 characters.');
  }
  const result = {
    schemaVersion: input.schemaVersion,
    submissionId: input.submissionId.toLocaleLowerCase('en-US'),
    contributor,
    submittedAt: new Date(input.submittedAt).toISOString(),
    kind: input.kind,
    pagePath: input.pagePath,
    pageTitle,
  };
  if (input.schemaVersion === 2) {
    if (!['external', 'modder'].includes(input.contributorType)) {
      recordError(source, 'contributorType must be "external" or "modder".');
    }
    if (input.contributorType === 'external' && input.modderId !== null) {
      recordError(source, 'external contributions must use a null modderId.');
    }
    if (input.contributorType === 'modder'
        && (typeof input.modderId !== 'string'
          || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(input.modderId))) {
      recordError(source, 'modder contributions must use a stable modderId.');
    }
    result.contributorType = input.contributorType;
    result.modderId = input.modderId;
  }
  return result;
}

export function contributionRecordForPayload(payload, pagePath) {
  return validateWikiContributionRecord({
    schemaVersion: 2,
    submissionId: payload.submissionId,
    contributor: payload.contributorName,
    contributorType: payload.contributorType ?? 'external',
    modderId: payload.modderId ?? null,
    submittedAt: payload.createdAt,
    kind: payload.kind,
    pagePath,
    pageTitle: payload.changes.title ?? payload.changes.cell,
  });
}

export function wikiContributionRepositoryPath(submissionId) {
  if (typeof submissionId !== 'string' || !UUID_PATTERN.test(submissionId)) {
    throw new Error('Wiki contribution record path requires a valid submission UUID.');
  }
  return `content/wiki-contributions/${submissionId.toLocaleLowerCase('en-US')}.json`;
}

export async function writeWikiContributionRecord(record, {
  repoRoot = REPO_ROOT,
} = {}) {
  const validated = validateWikiContributionRecord(record);
  const repositoryPath = wikiContributionRepositoryPath(validated.submissionId);
  const filePath = path.join(repoRoot, ...repositoryPath.split('/'));
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(validated, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  return repositoryPath;
}

export async function loadWikiContributionRecords({
  directory = WIKI_CONTRIBUTION_DIRECTORY,
} = {}) {
  let entries;
  try {
    entries = await opendir(directory);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const records = [];
  for await (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLocaleLowerCase('en-US') !== '.json') {
      continue;
    }
    const filePath = path.join(directory, entry.name);
    let input;
    try {
      input = JSON.parse(await readFile(filePath, 'utf8'));
    } catch (error) {
      throw new Error(`Invalid wiki contribution record ${filePath}: ${error.message}`);
    }
    const record = validateWikiContributionRecord(input, filePath);
    if (entry.name.toLocaleLowerCase('en-US') !== `${record.submissionId}.json`) {
      recordError(filePath, 'the filename must match submissionId.');
    }
    records.push(record);
  }
  records.sort((left, right) =>
    left.submittedAt.localeCompare(right.submittedAt)
    || left.submissionId.localeCompare(right.submissionId));
  const ids = new Set();
  for (const record of records) {
    if (ids.has(record.submissionId)) {
      recordError(record.submissionId, 'submissionId is duplicated.');
    }
    ids.add(record.submissionId);
  }
  return records;
}

export function contributorNamesFromRecords(records) {
  const names = new Map();
  for (const record of records) {
    const name = String(record.contributor).trim();
    const key = Order.normalizedContributorName(name);
    if (!names.has(key)) names.set(key, name);
  }
  return [...names.values()].sort((left, right) =>
    left.localeCompare(right, 'en', { sensitivity: 'base', numeric: true }));
}

export function externalContributorNamesFromRecords(records, modders) {
  return Order.externalContributors(records, modders);
}

export function buildWikiContributionHistory(records) {
  const validated = records.map((record, index) =>
    validateWikiContributionRecord(record, `record ${index + 1}`));
  return {
    schemaVersion: 1,
    contributors: contributorNamesFromRecords(validated),
    contributions: [...validated].sort((left, right) =>
      right.submittedAt.localeCompare(left.submittedAt)
      || right.submissionId.localeCompare(left.submissionId)),
  };
}

export async function generateWikiContributionHistory({
  outputPath = WIKI_CONTRIBUTION_HISTORY_PATH,
  loadRecords = loadWikiContributionRecords,
} = {}) {
  const history = buildWikiContributionHistory(await loadRecords());
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
  return history;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputPath = process.argv[2]
    ? path.resolve(REPO_ROOT, process.argv[2])
    : WIKI_CONTRIBUTION_HISTORY_PATH;
  const history = await generateWikiContributionHistory({ outputPath });
  console.log(
    `Generated wiki contribution history: ${history.contributions.length} contributions from `
    + `${history.contributors.length} contributors at ${path.relative(REPO_ROOT, outputPath)}.`,
  );
}
