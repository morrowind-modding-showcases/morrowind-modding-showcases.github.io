import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  WIKI_LOCATIONS_DIR,
  loadWikiLocations,
  locationFolderName,
  locationFolderSlug,
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

function canonicalLocationName(record) {
  if (typeof record?.cell === 'string' && record.cell.trim()) return record.cell.trim();
  if (typeof record?.title === 'string') return record.title.trim();
  return '';
}

const locations = await loadWikiLocations();
const groups = new Map();
for (const location of locations) {
  const slug = locationFolderSlug(location.frontmatter);
  const name = locationFolderName(location.frontmatter);
  if (slug && name && !groups.has(slug)) groups.set(slug, name);
}

const moves = locations
  .filter(location => locationFolderSlug(location.frontmatter))
  .map(location => {
    const folder = locationFolderSlug(location.frontmatter);
    const targetRelativePath = path.posix.join(folder, path.posix.basename(location.relativePath));
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

if (checkOnly) {
  if (moves.length > 0 || groupIndexes.length > 0) {
    console.error(
      `Location organization is stale: ${moves.length} article move(s) and ${groupIndexes.length} folder index(es) are needed.`,
    );
    process.exitCode = 1;
  } else {
    console.log('Location articles are organized into name-based folders.');
  }
} else {
  for (const move of moves) {
    await mkdir(path.dirname(move.targetPath), { recursive: true });
    await rename(move.location.filePath, move.targetPath);
  }

  for (const index of groupIndexes) {
    await mkdir(path.dirname(index.filePath), { recursive: true });
    await writeFile(index.filePath, serializeWikiMarkdown({
      title: index.title,
      description: `Morrowind locations grouped by name under ${index.title}.`,
    }), 'utf8');
  }

  console.log(
    `Organized ${moves.length} location article(s) into ${groups.size} name-based folder(s); created ${groupIndexes.length} folder index(es).`,
  );
}
