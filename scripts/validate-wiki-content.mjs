import { formatValidationErrors, validateWikiProject } from './wiki-content-lib.mjs';

try {
  const result = await validateWikiProject();
  if (result.errors.length > 0) {
    console.error(`Wiki validation failed with ${result.errors.length} error(s).\n\n${formatValidationErrors(result.errors)}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Wiki validation passed: ${result.mods.length} mod files, ` +
      `${result.locations.length} location files, ` +
      `${result.vocabularies.map_locations.length} location match keys, ` +
      `${result.vocabularies.properties.categories.length} categories.`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
