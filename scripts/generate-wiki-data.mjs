import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  REPO_ROOT,
  formatValidationErrors,
  generateWikiData,
  validateWikiProject,
} from './wiki-content-lib.mjs';

export const WIKI_DATA_PATH = path.join(
  REPO_ROOT,
  'wiki',
  'quartz',
  'static',
  'wiki-data.json',
);

export async function buildWikiData(outputPath = WIKI_DATA_PATH) {
  const result = await validateWikiProject();
  if (result.errors.length > 0) {
    throw new Error(`Wiki validation failed before wiki data generation.\n\n${formatValidationErrors(result.errors)}`);
  }
  const data = generateWikiData(result.mods);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return data;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputPath = process.argv[2]
    ? path.resolve(REPO_ROOT, process.argv[2])
    : WIKI_DATA_PATH;
  try {
    const data = await buildWikiData(outputPath);
    console.log(
      `Generated ${Object.keys(data.mods).length} wiki mods and `
      + `${data.relationships.length} relationships at ${path.relative(REPO_ROOT, outputPath)}.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  }
}
