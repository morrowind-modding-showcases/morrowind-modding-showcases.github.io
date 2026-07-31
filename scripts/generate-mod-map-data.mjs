import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  REPO_ROOT,
  formatValidationErrors,
  generateMapData,
  validateWikiProject,
} from './wiki-content-lib.mjs';

export async function buildModMapData(outputPath) {
  const result = await validateWikiProject();
  if (result.errors.length > 0) {
    throw new Error(`Wiki validation failed before map generation.\n\n${formatValidationErrors(result.errors)}`);
  }
  const data = generateMapData(result.mods);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return data;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputPath = path.resolve(REPO_ROOT, process.argv[2] || 'map/data/mods.json');
  try {
    const data = await buildModMapData(outputPath);
    console.log(`Generated ${data.mods.length} map records at ${path.relative(REPO_ROOT, outputPath)}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  }
}
