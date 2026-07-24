import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  PublishingExportError,
  columnName,
  csvCell,
  fetchPublishingValues,
  publishingRange,
  writePublishingExports,
} from './export-google-publishing.mjs';

test('spreadsheet ranges begin at the protected row 2 headers', () => {
  assert.equal(columnName(1), 'A');
  assert.equal(columnName(26), 'Z');
  assert.equal(columnName(27), 'AA');
  assert.equal(publishingRange("Modder's Notes", 3), "'Modder''s Notes'!A2:C");
});

test('CSV cells quote Google multi-select chips and embedded text safely', () => {
  assert.equal(csvCell('one, two'), '"one, two"');
  assert.equal(csvCell('A "quoted" value'), '"A ""quoted"" value"');
  assert.equal(csvCell('line one\nline two'), '"line one\nline two"');
});

test('the exporter requests every publishing tab in schema order', async () => {
  const schema = {
    sheets: {
      Events: {
        fileName: 'Events.csv',
        columns: [{ name: 'event_id' }, { name: 'name' }],
      },
      Modders: {
        fileName: 'Modders.csv',
        columns: [{ name: 'person_id' }],
      },
    },
  };
  let requestedUrl = '';
  const valueRanges = await fetchPublishingValues({
    spreadsheetId: 'safe_sheet-id',
    accessToken: 'test-token',
    schema,
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      assert.equal(options.headers.Authorization, 'Bearer test-token');
      return {
        ok: true,
        async json() {
          return { valueRanges: [{ values: [] }, { values: [] }] };
        },
      };
    },
  });

  const url = new URL(requestedUrl);
  assert.deepEqual(url.searchParams.getAll('ranges'), [
    "'Events'!A2:B",
    "'Modders'!A2:A",
  ]);
  assert.equal(valueRanges.length, 2);
});

test('the exporter retries transient Google Sheets network failures', async () => {
  let attempts = 0;
  const valueRanges = await fetchPublishingValues({
    spreadsheetId: 'safe_sheet-id',
    accessToken: 'test-token',
    schema: {
      sheets: {
        Events: {
          fileName: 'Events.csv',
          columns: [{ name: 'event_id' }],
        },
      },
    },
    fetchImpl: async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('read ECONNRESET');
      return {
        ok: true,
        async json() {
          return { valueRanges: [{ values: [] }] };
        },
      };
    },
    retryDelays: [0, 0],
    sleepImpl: async () => {},
  });

  assert.equal(attempts, 3);
  assert.equal(valueRanges.length, 1);
});

test('the exporter writes schema-named CSV files and preserves chip lists', async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'mms-publishing-'));
  const schema = {
    sheets: {
      Entries: {
        fileName: 'Entries.csv',
        columns: [
          { name: 'entry_id' },
          { name: 'author_ids' },
        ],
      },
    },
  };

  const summary = await writePublishingExports({
    schema,
    valueRanges: [{
      values: [
        ['entry_id', 'author_ids'],
        ['example-entry', 'first-modder, second-modder'],
      ],
    }],
    outputDirectory,
  });

  assert.deepEqual(summary, [{
    sheetName: 'Entries',
    fileName: 'Entries.csv',
    rowCount: 1,
  }]);
  assert.equal(
    await readFile(path.join(outputDirectory, 'Entries.csv'), 'utf8'),
    'entry_id,author_ids\nexample-entry,"first-modder, second-modder"\n',
  );
});

test('the exporter rejects changed workbook headers before importing data', async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'mms-publishing-'));
  await assert.rejects(
    writePublishingExports({
      schema: {
        sheets: {
          Events: {
            fileName: 'Events.csv',
            columns: [{ name: 'event_id' }],
          },
        },
      },
      valueRanges: [{ values: [['renamed_event_id']] }],
      outputDirectory,
    }),
    error => error instanceof PublishingExportError && /row 2 headers/.test(error.message),
  );
});

test('the workflow propagates validation failures through the import summary pipeline', async () => {
  const workflow = await readFile(
    new URL('../.github/workflows/update-event-data.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /Validate import[\s\S]*?set -o pipefail[\s\S]*?tee/);
});
