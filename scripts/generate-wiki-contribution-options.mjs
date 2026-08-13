import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCanonicalEventLabels } from './sync-wiki-event-metadata.mjs';
import {
  COMPONENT_TYPES,
  RELATIONSHIP_TYPES,
  REPO_ROOT,
  loadControlledVocabularies,
  loadWikiMods,
  stableUniqueStrings,
} from './wiki-content-lib.mjs';

export const CONTRIBUTION_OPTIONS_PATH = path.join(
  REPO_ROOT,
  'wiki',
  'quartz',
  'static',
  'contribution-options.json',
);

export async function generateWikiContributionOptions({
  outputPath = CONTRIBUTION_OPTIONS_PATH,
  loadVocabularies = loadControlledVocabularies,
  loadMods = loadWikiMods,
  loadEvents = buildCanonicalEventLabels,
} = {}) {
  const [vocabularies, mods, events] = await Promise.all([
    loadVocabularies(),
    loadMods(),
    loadEvents(),
  ]);
  const options = {
    schemaVersion: 1,
    categories: [...vocabularies.site.categories],
    events: stableUniqueStrings(events),
    mapLocations: stableUniqueStrings(vocabularies.map_locations),
    modSlugs: stableUniqueStrings(mods.map(mod => mod.slug)),
    mods: mods
      .filter(mod => !mod.parseError)
      .map(mod => ({
        slug: mod.slug,
        title: typeof mod.frontmatter?.title === 'string' ? mod.frontmatter.title.trim() : mod.slug,
      }))
      .sort((left, right) => left.title.localeCompare(right.title, 'en', { sensitivity: 'base', numeric: true })),
    componentTypes: [...COMPONENT_TYPES],
    relationshipTypes: [...RELATIONSHIP_TYPES],
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(options, null, 2)}\n`, 'utf8');
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputPath = process.argv[2]
    ? path.resolve(REPO_ROOT, process.argv[2])
    : CONTRIBUTION_OPTIONS_PATH;
  const options = await generateWikiContributionOptions({ outputPath });
  console.log(
    `Generated contribution options: ${options.categories.length} categories, `
    + `${options.events.length} events, ${options.mapLocations.length} locations, `
    + `${options.modSlugs.length} mod slugs at ${path.relative(REPO_ROOT, outputPath)}.`,
  );
}
