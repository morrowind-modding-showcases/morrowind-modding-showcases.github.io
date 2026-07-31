import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  REPO_ROOT,
  formatValidationErrors,
  generateLocationMapData,
  validateWikiProject,
} from './wiki-content-lib.mjs';

export async function buildLocationMapData(outputPath) {
  const result = await validateWikiProject();
  if (result.errors.length > 0) {
    throw new Error(`Wiki validation failed before location generation.\n\n${formatValidationErrors(result.errors)}`);
  }
  const data = generateLocationMapData(result.locations);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return data;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputPath = path.resolve(REPO_ROOT, process.argv[2] || 'map/data/locations.json');
  try {
    const data = await buildLocationMapData(outputPath);
    console.log(`Generated ${data.locations.length} map locations at ${path.relative(REPO_ROOT, outputPath)}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  }
}
