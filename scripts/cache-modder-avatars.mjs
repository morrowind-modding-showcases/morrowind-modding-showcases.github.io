import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEXUS_AVATAR_PATTERN = /^https:\/\/avatars\.nexusmods\.com\/(\d+)\/100(?:[/?#].*)?$/i;
const HASH_LENGTH = 12;
const DEFAULT_CONCURRENCY = 12;
const DEFAULT_TIMEOUT_MS = 20_000;
const PUBLIC_AVATAR_DIRECTORY = '/assets/images/modder-avatars';

function bytesBuffer(bytes) {
  return Buffer.isBuffer(bytes)
    ? bytes
    : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function nexusAvatarFor(value) {
  const url = typeof value === 'string' ? value : '';
  const match = url.match(NEXUS_AVATAR_PATTERN);
  return match ? { userId: match[1], url } : null;
}

export function extensionFor(bytes) {
  const buffer = bytesBuffer(bytes);
  const ascii = (start, end) => buffer.subarray(start, end).toString('ascii');
  if (buffer.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (buffer.length >= 8 && buffer[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return 'gif';
  return null;
}

export function contentHash(bytes) {
  return createHash('sha256').update(bytesBuffer(bytes)).digest('hex');
}

export function hashedAvatarFileName(userId, bytes, extension = extensionFor(bytes)) {
  if (!extension) throw new Error('avatar bytes are not a supported image');
  return `${userId}-${contentHash(bytes).slice(0, HASH_LENGTH)}.${extension}`;
}

function isMissing(error) {
  return error?.code === 'ENOENT';
}

async function readOptional(filePath) {
  try {
    return await readFile(filePath);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

function parseProfile(contents, label) {
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(`Could not parse ${label}: ${error.message}`);
  }
}

async function loadCurrentProfiles(repoRoot) {
  const directory = path.join(repoRoot, 'content', 'modders');
  const fileNames = (await readdir(directory))
    .filter(fileName => fileName.endsWith('.json'))
    .sort();
  const profiles = new Map();

  await Promise.all(fileNames.map(async fileName => {
    const relativePath = `content/modders/${fileName}`;
    const contents = await readFile(path.join(directory, fileName), 'utf8');
    profiles.set(relativePath, parseProfile(contents, relativePath));
  }));
  return profiles;
}

function indexNexusAvatars(profiles) {
  const avatars = new Map();
  for (const profile of profiles.values()) {
    const source = nexusAvatarFor(profile.avatarUrl);
    if (source && !avatars.has(source.userId)) avatars.set(source.userId, source.url);
  }
  return avatars;
}

async function defaultRunGit(args, cwd) {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

function assertCommit(value, flag) {
  if (!/^[0-9a-f]{7,64}$/i.test(value || '')) {
    throw new Error(`${flag} must be a Git commit SHA`);
  }
}

export async function changedModderFiles({ repoRoot, before, after, runGit = defaultRunGit }) {
  assertCommit(before, '--before');
  assertCommit(after, '--after');
  const output = await runGit([
    'diff',
    '--name-status',
    '-z',
    '--no-renames',
    '--diff-filter=ADM',
    before,
    after,
    '--',
    'content/modders',
  ], repoRoot);
  const fields = output.split('\0').filter(Boolean);
  const changes = [];

  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index];
    const relativePath = fields[index + 1]?.replaceAll('\\', '/');
    if (!relativePath || !/^[^/]+$/.test(path.posix.relative('content/modders', relativePath))) continue;
    if (!relativePath.endsWith('.json')) continue;
    changes.push({ status, relativePath });
  }
  return changes;
}

async function profileAtCommit({ repoRoot, commit, relativePath, runGit }) {
  const contents = await runGit(['show', `${commit}:${relativePath}`], repoRoot);
  return parseProfile(contents, `${relativePath} at ${commit}`);
}

function ownedAvatarPattern(userId) {
  return new RegExp(`^${userId}(?:-[0-9a-f]{8,64})?\\.(?:webp|png|jpg|gif)$`, 'i');
}

function manifestFileName(userId, value) {
  if (typeof value !== 'string') return null;
  const prefix = `${PUBLIC_AVATAR_DIRECTORY}/`;
  if (!value.startsWith(prefix)) return null;
  const fileName = value.slice(prefix.length);
  return ownedAvatarPattern(userId).test(fileName) ? fileName : null;
}

function sortedManifest(avatars) {
  return Object.fromEntries(Object.entries(avatars).sort(([left], [right]) => {
    const leftId = BigInt(left);
    const rightId = BigInt(right);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  }));
}

async function downloadAvatar({ userId, url, fetchImpl, timeoutMs }) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'image/webp',
      'User-Agent': 'Dark-Elf-Modding-Avatar-Cache/3.0',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response || response.ok !== true) {
    throw new Error(`HTTP ${response?.status ?? 'invalid response'}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const extension = extensionFor(bytes);
  if (!extension) {
    throw new Error(
      `response was not a recognized image (${response.headers?.get?.('content-type') || 'no content type'})`,
    );
  }
  return {
    userId,
    bytes,
    extension,
    hash: contentHash(bytes),
  };
}

async function mapWithConcurrency(entries, concurrency, worker) {
  const results = new Array(entries.length);
  let nextIndex = 0;

  async function work() {
    while (nextIndex < entries.length) {
      const index = nextIndex++;
      results[index] = await worker(entries[index]);
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(concurrency, entries.length) },
    () => work(),
  ));
  return results;
}

function parseManifest(contents, manifestPath) {
  let document;
  try {
    document = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Could not parse ${manifestPath}: ${error.message}`);
  }
  if (!document || typeof document.avatars !== 'object' || Array.isArray(document.avatars)) {
    throw new Error(`${manifestPath} must contain an avatars object`);
  }
  for (const [userId, value] of Object.entries(document.avatars)) {
    if (!/^\d+$/.test(userId) || typeof value !== 'string') {
      throw new Error(`${manifestPath} avatar entries must map Nexus user IDs to string paths`);
    }
  }
  return { ...document.avatars };
}

export async function refreshAvatarCache({
  repoRoot = defaultRepoRoot,
  mode,
  before,
  after,
  fetchImpl = globalThis.fetch,
  runGit = defaultRunGit,
  logger = console,
  concurrency = DEFAULT_CONCURRENCY,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (mode !== 'all' && mode !== 'changed') {
    throw new Error('mode must be "all" or "changed"');
  }

  const modderProfiles = await loadCurrentProfiles(repoRoot);
  const allCurrentAvatars = indexNexusAvatars(modderProfiles);
  const outputDirectory = path.join(repoRoot, 'assets', 'images', 'modder-avatars');
  const manifestPath = path.join(repoRoot, 'assets', 'data', 'modder-avatars.json');
  await mkdir(outputDirectory, { recursive: true });

  const manifestContents = await readFile(manifestPath, 'utf8');
  const manifest = parseManifest(manifestContents, manifestPath);
  const avatarsToRefresh = new Map();
  const usersToRemove = new Set();
  const removalsAfterRefresh = new Map();

  if (mode === 'all') {
    for (const [userId, url] of allCurrentAvatars) avatarsToRefresh.set(userId, url);
    for (const userId of Object.keys(manifest)) {
      if (!allCurrentAvatars.has(userId)) usersToRemove.add(userId);
    }
  } else {
    const changes = await changedModderFiles({ repoRoot, before, after, runGit });
    for (const { status, relativePath } of changes) {
      let currentSource = null;
      if (status !== 'D') {
        currentSource = nexusAvatarFor(modderProfiles.get(relativePath)?.avatarUrl);
        if (currentSource) avatarsToRefresh.set(currentSource.userId, currentSource.url);
      }
      if (status !== 'A') {
        const previousProfile = await profileAtCommit({
          repoRoot,
          commit: before,
          relativePath,
          runGit,
        });
        const previousSource = nexusAvatarFor(previousProfile.avatarUrl);
        if (previousSource && !allCurrentAvatars.has(previousSource.userId)) {
          if (currentSource) {
            const deferred = removalsAfterRefresh.get(currentSource.userId) || new Set();
            deferred.add(previousSource.userId);
            removalsAfterRefresh.set(currentSource.userId, deferred);
          } else {
            usersToRemove.add(previousSource.userId);
          }
        }
      }
    }
  }

  const failures = [];
  const downloads = await mapWithConcurrency(
    [...avatarsToRefresh].map(([userId, url]) => ({ userId, url })),
    concurrency,
    async source => {
      try {
        return await downloadAvatar({ ...source, fetchImpl, timeoutMs });
      } catch (error) {
        const message = `${source.userId}: ${error.message || error}`;
        failures.push(message);
        logger.error(`Avatar refresh failed for Nexus user ${message}; preserving the last-known-good cache.`);
        return null;
      }
    },
  );

  let manifestChanged = false;
  let written = 0;
  let updated = 0;
  let unchanged = 0;
  const cleanupUsers = new Set();

  for (const download of downloads) {
    if (!download) continue;
    const { userId, bytes, extension, hash } = download;
    const fileName = `${userId}-${hash.slice(0, HASH_LENGTH)}.${extension}`;
    const publicPath = `${PUBLIC_AVATAR_DIRECTORY}/${fileName}`;
    const outputPath = path.join(outputDirectory, fileName);

    try {
      const existingDesiredBytes = await readOptional(outputPath);
      if (!existingDesiredBytes || !existingDesiredBytes.equals(bytes)) {
        await writeFile(outputPath, bytes);
        written++;
      }

      if (manifest[userId] !== publicPath) {
        manifest[userId] = publicPath;
        manifestChanged = true;
        cleanupUsers.add(userId);
        updated++;
      } else if (!existingDesiredBytes || !existingDesiredBytes.equals(bytes)) {
        updated++;
      } else {
        unchanged++;
      }
      for (const obsoleteUserId of removalsAfterRefresh.get(userId) || []) {
        usersToRemove.add(obsoleteUserId);
      }
    } catch (error) {
      const message = `${userId}: could not update the local cache: ${error.message || error}`;
      failures.push(message);
      logger.error(`${message}; preserving the existing manifest entry and cached avatar.`);
    }
  }

  for (const userId of usersToRemove) {
    if (Object.hasOwn(manifest, userId)) {
      delete manifest[userId];
      manifestChanged = true;
    }
    cleanupUsers.add(userId);
  }

  if (manifestChanged) {
    const serialized = `${JSON.stringify({ avatars: sortedManifest(manifest) }, null, 2)}\n`;
    await writeFile(manifestPath, serialized, 'utf8');
  }

  let removed = 0;
  if (cleanupUsers.size) {
    const cachedFiles = await readdir(outputDirectory);
    for (const userId of cleanupUsers) {
      const retainedFile = manifestFileName(userId, manifest[userId]);
      for (const fileName of cachedFiles) {
        if (fileName !== retainedFile && ownedAvatarPattern(userId).test(fileName)) {
          await unlink(path.join(outputDirectory, fileName));
          removed++;
        }
      }
    }
  }

  const summary = {
    selected: avatarsToRefresh.size,
    updated,
    unchanged,
    removed,
    written,
    failures: failures.length,
  };
  logger.log(
    `Avatar cache: ${summary.selected} selected, ${updated} updated, ${unchanged} unchanged, `
      + `${removed} obsolete files removed, ${failures.length} failed.`,
  );
  return summary;
}

export function parseArguments(args) {
  const mode = args.includes('--all') ? 'all' : args.includes('--changed') ? 'changed' : null;
  if (!mode || (args.includes('--all') && args.includes('--changed'))) {
    throw new Error('Usage: node scripts/cache-modder-avatars.mjs --all | --changed --before <sha> --after <sha>');
  }

  const valueFor = flag => {
    const index = args.indexOf(flag);
    return index === -1 ? undefined : args[index + 1];
  };
  const known = new Set(['--all', '--changed', '--before', '--after']);
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (!known.has(argument)) throw new Error(`Unknown argument: ${argument}`);
    if (argument === '--before' || argument === '--after') index++;
  }

  const options = { mode };
  if (mode === 'changed') {
    options.before = valueFor('--before');
    options.after = valueFor('--after');
    assertCommit(options.before, '--before');
    assertCommit(options.after, '--after');
  } else if (args.includes('--before') || args.includes('--after')) {
    throw new Error('--before and --after can only be used with --changed');
  }
  return options;
}

export async function main(args = process.argv.slice(2)) {
  await refreshAvatarCache(parseArguments(args));
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch(error => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
