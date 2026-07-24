#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export class PublishingExportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PublishingExportError';
  }
}

export function columnName(columnNumber) {
  if (!Number.isInteger(columnNumber) || columnNumber < 1) {
    throw new PublishingExportError('Column numbers must be positive integers');
  }

  let value = columnNumber;
  let name = '';
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

export function publishingRange(sheetName, columnCount) {
  const escapedName = String(sheetName).replaceAll("'", "''");
  return `'${escapedName}'!A2:${columnName(columnCount)}`;
}

export function csvCell(value) {
  const text = String(value ?? '');
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function rowsToCsv(rows, width) {
  return `${rows
    .map(row => Array.from({ length: width }, (_, index) => csvCell(row[index])))
    .join('\n')}\n`;
}

function normalizeRows(values, width) {
  const rows = values.map(row => {
    if (row.length > width) {
      throw new PublishingExportError(
        `Google Sheets returned ${row.length} columns; expected at most ${width}`,
      );
    }
    return Array.from({ length: width }, (_, index) => String(row[index] ?? ''));
  });

  while (rows.length && rows.at(-1).every(value => value === '')) rows.pop();
  return rows;
}

export async function writePublishingExports({
  schema,
  valueRanges,
  outputDirectory,
}) {
  const sheetEntries = Object.entries(schema.sheets || {});
  if (valueRanges.length !== sheetEntries.length) {
    throw new PublishingExportError(
      `Google Sheets returned ${valueRanges.length} ranges; expected ${sheetEntries.length}`,
    );
  }

  await mkdir(outputDirectory, { recursive: true });
  const summary = [];

  for (let index = 0; index < sheetEntries.length; index += 1) {
    const [sheetName, sheetSchema] = sheetEntries[index];
    const expectedHeaders = sheetSchema.columns.map(column => column.name);
    const rows = normalizeRows(valueRanges[index].values || [], expectedHeaders.length);
    const headers = rows[0] || [];

    if (JSON.stringify(headers) !== JSON.stringify(expectedHeaders)) {
      throw new PublishingExportError(
        `${sheetName}: row 2 headers must be exactly ${expectedHeaders.join(', ')}`,
      );
    }

    const dataRows = rows.slice(1);
    await writeFile(
      path.join(outputDirectory, sheetSchema.fileName),
      rowsToCsv([expectedHeaders, ...dataRows], expectedHeaders.length),
    );
    summary.push({
      sheetName,
      fileName: sheetSchema.fileName,
      rowCount: dataRows.filter(row => row.some(Boolean)).length,
    });
  }

  return summary;
}

export async function fetchPublishingValues({
  spreadsheetId,
  accessToken,
  schema,
  fetchImpl = fetch,
}) {
  if (!/^[A-Za-z0-9_-]+$/.test(spreadsheetId)) {
    throw new PublishingExportError('Spreadsheet ID contains unexpected characters');
  }
  if (!accessToken) throw new PublishingExportError('GOOGLE_ACCESS_TOKEN is required');

  const parameters = new URLSearchParams({
    majorDimension: 'ROWS',
    valueRenderOption: 'FORMATTED_VALUE',
  });
  Object.entries(schema.sheets).forEach(([sheetName, sheetSchema]) => {
    parameters.append('ranges', publishingRange(sheetName, sheetSchema.columns.length));
  });

  const response = await fetchImpl(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${parameters}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      detail = body.error?.message || detail;
    } catch {
      // Keep the HTTP status text when Google did not return JSON.
    }
    throw new PublishingExportError(
      `Google Sheets API request failed (${response.status}): ${detail}`,
    );
  }

  const body = await response.json();
  return body.valueRanges || [];
}

function parseArguments(argv) {
  const options = {
    spreadsheetId: process.env.PUBLISHING_SPREADSHEET_ID || '',
    accessToken: process.env.GOOGLE_ACCESS_TOKEN || '',
    outputDirectory: '',
    schemaPath: path.resolve('publishing/schema-v1.json'),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--spreadsheet') {
      options.spreadsheetId = argv[++index] || '';
    } else if (argument === '--output') {
      options.outputDirectory = path.resolve(argv[++index] || '');
    } else if (argument === '--schema') {
      options.schemaPath = path.resolve(argv[++index] || '');
    } else {
      throw new PublishingExportError(`Unknown argument: ${argument}`);
    }
  }

  if (!options.spreadsheetId || !options.outputDirectory) {
    throw new PublishingExportError(
      'Usage: node scripts/export-google-publishing.mjs '
      + '--output <directory> [--spreadsheet <spreadsheet-id>] [--schema <schema-path>]',
    );
  }
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const schema = JSON.parse(await readFile(options.schemaPath, 'utf8'));
  const valueRanges = await fetchPublishingValues({
    spreadsheetId: options.spreadsheetId,
    accessToken: options.accessToken,
    schema,
  });
  const summary = await writePublishingExports({
    schema,
    valueRanges,
    outputDirectory: options.outputDirectory,
  });
  summary.forEach(item => console.log(`${item.sheetName}: ${item.rowCount} rows`));
  return summary;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch(error => {
    if (error instanceof PublishingExportError) {
      console.error(`Error: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  });
}
