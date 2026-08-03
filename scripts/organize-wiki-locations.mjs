import { access, mkdir, rename, rmdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  WIKI_LOCATIONS_DIR,
  canonicalLocationName,
  groupedLocationFolderSlugs,
  loadWikiLocations,
  locationFolderName,
  locationFolderSlug,
  organizedLocationExplorerTitle,
  organizedLocationTitle,
  serializeWikiMarkdown,
} from './wiki-content-lib.mjs';

const checkOnly = process.argv.includes('--check');
const normalized = value => String(value ?? '').trim().toLocaleLowerCase('en-US');

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sourceWithOrganizedTitle(location, isGrouped) {
  const currentTitle = typeof location.frontmatter?.title === 'string'
    ? location.frontmatter.title
    : '';
  const desiredTitle = organizedLocationTitle(location.frontmatter, isGrouped);
  const currentExplorerTitle = typeof location.frontmatter?.explorer_title === 'string'
    ? location.frontmatter.explorer_title.trim()
    : '';
  const desiredExplorerTitle = organizedLocationExplorerTitle(location.frontmatter, isGrouped);
  const titleIsCurrent = !desiredTitle || desiredTitle === currentTitle;
  const explorerTitleIsCurrent = (desiredExplorerTitle ?? '') === currentExplorerTitle;
  if (titleIsCurrent && explorerTitleIsCurrent) return location.source;

  const newline = location.source.includes('\r\n') ? '\r\n' : '\n';
  let source = desiredTitle
    ? location.source.replace(/^title:[^\r\n]*$/m, `title: ${JSON.stringify(desiredTitle)}`)
    : location.source;
  if (desiredExplorerTitle) {
    if (/^explorer_title:[^\r\n]*$/m.test(source)) {
      source = source.replace(
        /^explorer_title:[^\r\n]*$/m,
        `explorer_title: ${JSON.stringify(desiredExplorerTitle)}`,
      );
    } else {
      source = source.replace(
        /^title:[^\r\n]*$/m,
        match => `${match}${newline}explorer_title: ${JSON.stringify(desiredExplorerTitle)}`,
      );
    }
  } else {
    source = source.replace(/^explorer_title:[^\r\n]*\r?\n/m, '');
  }
  const hasCell = typeof location.frontmatter?.cell === 'string' && location.frontmatter.cell.trim();
  if (isGrouped && !hasCell) {
    const fullName = canonicalLocationName(location.frontmatter);
    source = source.replace(
      /^map_id:[^\r\n]*\r?\n/m,
      match => `${match}cell: ${JSON.stringify(fullName)}${newline}`,
    );
  }
  return source;
}

const locations = await loadWikiLocations();
const candidateGroups = new Map();
for (const location of locations) {
  const slug = locationFolderSlug(location.frontmatter);
  const name = locationFolderName(location.frontmatter);
  if (slug && name && !candidateGroups.has(slug)) candidateGroups.set(slug, name);
}
const groupedFolders = groupedLocationFolderSlugs(locations);
const groups = new Map([...candidateGroups].filter(([folder]) => groupedFolders.has(folder)));

const titleUpdates = locations
  .map(location => ({
    location,
    source: sourceWithOrganizedTitle(
      location,
      groupedFolders.has(locationFolderSlug(location.frontmatter)),
    ),
  }))
  .filter(update => update.source !== update.location.source);

const moves = locations
  .map(location => {
    const candidateFolder = locationFolderSlug(location.frontmatter);
    const folder = candidateFolder && groupedFolders.has(candidateFolder) ? candidateFolder : null;
    const targetRelativePath = folder
      ? path.posix.join(folder, path.posix.basename(location.relativePath))
      : path.posix.basename(location.relativePath);
    return {
      location,
      targetRelativePath,
      targetPath: path.join(WIKI_LOCATIONS_DIR, ...targetRelativePath.split('/')),
    };
  })
  .filter(move => move.location.relativePath !== move.targetRelativePath);

const targetSources = new Map();
for (const move of moves) {
  const key = normalized(move.targetRelativePath);
  if (targetSources.has(key)) {
    throw new Error(`${move.targetRelativePath} would receive more than one location article.`);
  }
  targetSources.set(key, move.location.filePath);
  if (await exists(move.targetPath)) {
    throw new Error(`${move.targetRelativePath} already exists.`);
  }
}

const groupIndexes = [];
for (const [folder, title] of groups) {
  const hasParentArticle = locations.some(location =>
    locationFolderSlug(location.frontmatter) === null
    && normalized(canonicalLocationName(location.frontmatter)) === normalized(title));
  if (hasParentArticle) continue;

  const relativePath = path.posix.join(folder, 'index.md');
  const filePath = path.join(WIKI_LOCATIONS_DIR, folder, 'index.md');
  if (!(await exists(filePath))) groupIndexes.push({ title, relativePath, filePath });
}

const staleIndexes = [];
const staleFolders = [];
const knownFolders = new Set([
  ...candidateGroups.keys(),
  ...locations
    .map(location => path.posix.dirname(location.relativePath))
    .filter(folder => folder !== '.'),
]);
for (const folder of knownFolders) {
  if (groupedFolders.has(folder)) continue;
  const filePath = path.join(WIKI_LOCATIONS_DIR, folder, 'index.md');
  if (await exists(filePath)) staleIndexes.push({ folder, filePath });
  const folderPath = path.join(WIKI_LOCATIONS_DIR, folder);
  if (await exists(folderPath)) staleFolders.push(folderPath);
}

if (checkOnly) {
  if (moves.length > 0 || titleUpdates.length > 0 || groupIndexes.length > 0
      || staleIndexes.length > 0 || staleFolders.length > 0) {
    console.error(
      `Location organization is stale: ${moves.length} article move(s), ${titleUpdates.length} title update(s), `
      + `${groupIndexes.length} folder index creation(s), ${staleIndexes.length} folder index removal(s), `
      + `and ${staleFolders.length} empty folder removal(s) are needed.`,
    );
    process.exitCode = 1;
  } else {
    console.log('Location articles are organized into name-based folders.');
  }
} else {
  for (const update of titleUpdates) {
    await writeFile(update.location.filePath, update.source, 'utf8');
  }

  for (const move of moves) {
    await mkdir(path.dirname(move.targetPath), { recursive: true });
    await rename(move.location.filePath, move.targetPath);
  }

  for (const index of staleIndexes) await unlink(index.filePath);
  for (const folderPath of staleFolders) {
    try {
      await rmdir(folderPath);
    } catch (error) {
      if (error?.code !== 'ENOTEMPTY' && error?.code !== 'ENOENT') throw error;
    }
  }

  for (const index of groupIndexes) {
    await mkdir(path.dirname(index.filePath), { recursive: true });
    await writeFile(index.filePath, serializeWikiMarkdown({
      title: index.title,
      description: `Morrowind locations grouped by name under ${index.title}.`,
    }), 'utf8');
  }

  console.log(
    `Organized ${moves.length} location article move(s) and ${titleUpdates.length} title update(s) into `
    + `${groups.size} multi-entry folder(s); created ${groupIndexes.length} and removed ${staleIndexes.length} folder index(es), `
    + `then removed ${staleFolders.length} empty folder(s).`,
  );
}
