import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildWikiContributionHistory,
  generateWikiContributionHistory,
  loadWikiContributionRecords,
  validateWikiContributionRecord,
  writeWikiContributionRecord,
} from './wiki-contribution-data.mjs';

const first = {
  schemaVersion: 1,
  submissionId: '123e4567-e89b-42d3-a456-426614174000',
  contributor: 'Example Editor',
  submittedAt: '2026-07-02T12:00:00.000Z',
  kind: 'new-mod',
  pagePath: 'wiki/content/mods/example-mod.md',
  pageTitle: 'Example Mod',
};

const second = {
  schemaVersion: 1,
  submissionId: '123e4567-e89b-42d3-a456-426614174001',
  contributor: 'example editor',
  submittedAt: '2026-08-02T12:00:00.000Z',
  kind: 'edit-location',
  pagePath: 'wiki/content/locations/balmora/example-cell.md',
  pageTitle: 'Example Cell',
};

test('contribution history keeps individual changes and deduplicates contributor names case-insensitively', () => {
  const history = buildWikiContributionHistory([first, second]);
  assert.deepEqual(history.contributors, ['Example Editor']);
  assert.deepEqual(
    history.contributions.map(record => record.submissionId),
    [second.submissionId, first.submissionId],
  );
});

test('contribution records round trip through their UUID-owned source files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wiki-contributions-'));
  try {
    const repositoryPath = await writeWikiContributionRecord(first, { repoRoot: root });
    assert.equal(repositoryPath, `content/wiki-contributions/${first.submissionId}.json`);
    const records = await loadWikiContributionRecords({
      directory: path.join(root, 'content', 'wiki-contributions'),
    });
    assert.deepEqual(records, [first]);
    await assert.rejects(
      writeWikiContributionRecord(first, { repoRoot: root }),
      error => error?.code === 'EEXIST',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('version-2 contribution records require explicit compatible contributor identity', () => {
  const external = validateWikiContributionRecord({
    ...first,
    schemaVersion: 2,
    contributorType: 'external',
    modderId: null,
  });
  assert.equal(external.contributorType, 'external');
  assert.equal(external.modderId, null);

  const linked = validateWikiContributionRecord({
    ...first,
    schemaVersion: 2,
    contributorType: 'modder',
    modderId: 'example-editor',
  });
  assert.equal(linked.modderId, 'example-editor');
  assert.throws(
    () => validateWikiContributionRecord({ ...linked, modderId: null }),
    /stable modderId/u,
  );
  assert.throws(
    () => validateWikiContributionRecord({ ...external, modderId: 'stale-id' }),
    /null modderId/u,
  );
});

test('history generation validates records and writes deterministic public JSON', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wiki-history-'));
  const outputPath = path.join(root, 'static', 'history.json');
  try {
    const history = await generateWikiContributionHistory({
      outputPath,
      loadRecords: async () => [first, second],
    });
    assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), history);
    assert.throws(
      () => validateWikiContributionRecord({ ...first, pagePath: '../escape.md' }),
      /pagePath/u,
    );
    assert.throws(
      () => validateWikiContributionRecord({ ...first, contributor: '<script>' }),
      /contributor/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('record loader rejects filenames that do not match their submission UUID', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'wiki-contribution-name-'));
  try {
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, 'wrong.json'), JSON.stringify(first));
    await assert.rejects(
      loadWikiContributionRecords({ directory: root }),
      /filename must match submissionId/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
