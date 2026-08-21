import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  contentHash,
  hashedAvatarFileName,
  nexusAvatarFor,
  refreshAvatarCache,
} from './cache-modder-avatars.mjs';

const quietLogger = { log() {}, error() {} };
const beforeSha = 'a'.repeat(40);
const afterSha = 'b'.repeat(40);

function webpBytes(label) {
  return Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([0, 0, 0, 0]),
    Buffer.from('WEBP'),
    Buffer.from(label),
  ]);
}

function imageResponse(bytes, status = 200) {
  return new Response(bytes, {
    status,
    headers: { 'content-type': 'image/webp' },
  });
}

async function createFixture(t, { profiles, cached }) {
  const repoRoot = await mkdtemp(path.join(tmpdir(), 'modder-avatar-cache-'));
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  const profilesDirectory = path.join(repoRoot, 'content', 'modders');
  const avatarsDirectory = path.join(repoRoot, 'assets', 'images', 'modder-avatars');
  const dataDirectory = path.join(repoRoot, 'assets', 'data');
  await Promise.all([
    mkdir(profilesDirectory, { recursive: true }),
    mkdir(avatarsDirectory, { recursive: true }),
    mkdir(dataDirectory, { recursive: true }),
  ]);

  for (const [fileName, profile] of Object.entries(profiles)) {
    await writeFile(
      path.join(profilesDirectory, fileName),
      `${JSON.stringify(profile, null, 2)}\n`,
      'utf8',
    );
  }

  const manifest = {};
  for (const [userId, entry] of Object.entries(cached)) {
    const fileName = entry.fileName || hashedAvatarFileName(userId, entry.bytes);
    await writeFile(path.join(avatarsDirectory, fileName), entry.bytes);
    manifest[userId] = `/assets/images/modder-avatars/${fileName}`;
    for (const obsolete of entry.obsolete || []) {
      await writeFile(path.join(avatarsDirectory, obsolete.fileName), obsolete.bytes);
    }
  }
  const manifestPath = path.join(dataDirectory, 'modder-avatars.json');
  await writeFile(manifestPath, `${JSON.stringify({ avatars: manifest }, null, 2)}\n`, 'utf8');

  return { repoRoot, avatarsDirectory, manifestPath, profilesDirectory };
}

function changedGit({ relativePath, previousProfile, status = 'M' }) {
  return async args => {
    if (args[0] === 'diff') return `${status}\0${relativePath}\0`;
    if (args[0] === 'show') return `${JSON.stringify(previousProfile)}\n`;
    assert.fail(`unexpected Git invocation: ${args.join(' ')}`);
  };
}

test('avatar hashes are deterministic and only Nexus avatar URLs are accepted', () => {
  const bytes = webpBytes('same avatar');
  const fileName = hashedAvatarFileName('12345', bytes);

  assert.equal(contentHash(bytes), contentHash(Buffer.from(bytes)));
  assert.equal(fileName, hashedAvatarFileName('12345', Buffer.from(bytes)));
  assert.match(fileName, /^12345-[0-9a-f]{12}\.webp$/);
  assert.deepEqual(nexusAvatarFor('https://avatars.nexusmods.com/12345/100?updated=1'), {
    userId: '12345',
    url: 'https://avatars.nexusmods.com/12345/100?updated=1',
  });
  assert.equal(nexusAvatarFor('https://example.com/12345/100'), null);
  assert.equal(nexusAvatarFor('http://avatars.nexusmods.com/12345/100'), null);
});

test('identical downloaded bytes do not rewrite the avatar or manifest', async t => {
  const bytes = webpBytes('unchanged');
  const fixture = await createFixture(t, {
    profiles: {
      'same.json': { avatarUrl: 'https://avatars.nexusmods.com/123/100' },
    },
    cached: { 123: { bytes } },
  });
  const fileName = hashedAvatarFileName('123', bytes);
  const avatarPath = path.join(fixture.avatarsDirectory, fileName);
  const beforeManifest = await readFile(fixture.manifestPath, 'utf8');
  const beforeTimes = {
    avatar: (await stat(avatarPath)).mtimeMs,
    manifest: (await stat(fixture.manifestPath)).mtimeMs,
  };

  const result = await refreshAvatarCache({
    repoRoot: fixture.repoRoot,
    mode: 'all',
    fetchImpl: async () => imageResponse(bytes),
    logger: quietLogger,
  });

  assert.deepEqual(result, {
    selected: 1,
    updated: 0,
    unchanged: 1,
    removed: 0,
    written: 0,
    failures: 0,
  });
  assert.equal(await readFile(fixture.manifestPath, 'utf8'), beforeManifest);
  assert.equal((await stat(avatarPath)).mtimeMs, beforeTimes.avatar);
  assert.equal((await stat(fixture.manifestPath)).mtimeMs, beforeTimes.manifest);
});

test('changed bytes create a new path, update the string manifest, and remove old versions', async t => {
  const oldBytes = webpBytes('old');
  const newBytes = webpBytes('new');
  const oldFileName = hashedAvatarFileName('123', oldBytes);
  const fixture = await createFixture(t, {
    profiles: {
      'changed.json': { avatarUrl: 'https://avatars.nexusmods.com/123/100' },
    },
    cached: {
      123: {
        bytes: oldBytes,
        obsolete: [{ fileName: '123-aaaaaaaa.webp', bytes: webpBytes('older') }],
      },
    },
  });

  const result = await refreshAvatarCache({
    repoRoot: fixture.repoRoot,
    mode: 'all',
    fetchImpl: async () => imageResponse(newBytes),
    logger: quietLogger,
  });
  const newFileName = hashedAvatarFileName('123', newBytes);
  const manifest = JSON.parse(await readFile(fixture.manifestPath, 'utf8')).avatars;

  assert.equal(result.updated, 1);
  assert.equal(result.written, 1);
  assert.equal(manifest['123'], `/assets/images/modder-avatars/${newFileName}`);
  assert.equal(typeof manifest['123'], 'string');
  assert.deepEqual(await readdir(fixture.avatarsDirectory), [newFileName]);
  await assert.rejects(readFile(path.join(fixture.avatarsDirectory, oldFileName)), /ENOENT/);
});

test('failed downloads preserve the last-known-good file and manifest', async t => {
  const bytes = webpBytes('last known good');
  const fixture = await createFixture(t, {
    profiles: {
      'failure.json': { avatarUrl: 'https://avatars.nexusmods.com/123/100' },
    },
    cached: { 123: { bytes } },
  });
  const beforeManifest = await readFile(fixture.manifestPath, 'utf8');
  const beforeFiles = await readdir(fixture.avatarsDirectory);

  const result = await refreshAvatarCache({
    repoRoot: fixture.repoRoot,
    mode: 'all',
    fetchImpl: async () => imageResponse(Buffer.from('unavailable'), 503),
    logger: quietLogger,
  });

  assert.equal(result.failures, 1);
  assert.equal(await readFile(fixture.manifestPath, 'utf8'), beforeManifest);
  assert.deepEqual(await readdir(fixture.avatarsDirectory), beforeFiles);
  assert.deepEqual(await readFile(path.join(fixture.avatarsDirectory, beforeFiles[0])), bytes);
});

test('--changed refreshes only profiles in the supplied commit range', async t => {
  const firstOld = webpBytes('first old');
  const firstNew = webpBytes('first new');
  const second = webpBytes('second unchanged');
  const fixture = await createFixture(t, {
    profiles: {
      'first.json': {
        name: 'First',
        avatarUrl: 'https://avatars.nexusmods.com/111/100',
      },
      'second.json': {
        name: 'Second',
        avatarUrl: 'https://avatars.nexusmods.com/222/100',
      },
    },
    cached: {
      111: { bytes: firstOld },
      222: { bytes: second },
    },
  });
  await writeFile(
    path.join(fixture.profilesDirectory, 'first.json'),
    `${JSON.stringify({
      name: 'First renamed',
      avatarUrl: 'https://avatars.nexusmods.com/111/100',
    }, null, 2)}\n`,
    'utf8',
  );
  const requested = [];

  await refreshAvatarCache({
    repoRoot: fixture.repoRoot,
    mode: 'changed',
    before: beforeSha,
    after: afterSha,
    runGit: changedGit({
      relativePath: 'content/modders/first.json',
      previousProfile: {
        name: 'First',
        avatarUrl: 'https://avatars.nexusmods.com/111/100',
      },
    }),
    fetchImpl: async url => {
      requested.push(url);
      return imageResponse(firstNew);
    },
    logger: quietLogger,
  });

  assert.deepEqual(requested, ['https://avatars.nexusmods.com/111/100']);
  const manifest = JSON.parse(await readFile(fixture.manifestPath, 'utf8')).avatars;
  assert.equal(manifest['111'], `/assets/images/modder-avatars/${hashedAvatarFileName('111', firstNew)}`);
  assert.equal(manifest['222'], `/assets/images/modder-avatars/${hashedAvatarFileName('222', second)}`);
  assert.deepEqual(
    await readFile(path.join(fixture.avatarsDirectory, hashedAvatarFileName('222', second))),
    second,
  );
});

test('--changed removes a retired Nexus avatar without touching unrelated users', async t => {
  const retired = webpBytes('retired');
  const unrelated = webpBytes('unrelated');
  const fixture = await createFixture(t, {
    profiles: {
      'retired.json': { avatarUrl: 'https://avatars.nexusmods.com/111/100' },
      'unrelated.json': { avatarUrl: 'https://avatars.nexusmods.com/222/100' },
    },
    cached: {
      111: { bytes: retired },
      222: { bytes: unrelated },
    },
  });
  await writeFile(
    path.join(fixture.profilesDirectory, 'retired.json'),
    `${JSON.stringify({ avatarUrl: 'https://example.com/avatar.webp' }, null, 2)}\n`,
    'utf8',
  );

  await refreshAvatarCache({
    repoRoot: fixture.repoRoot,
    mode: 'changed',
    before: beforeSha,
    after: afterSha,
    runGit: changedGit({
      relativePath: 'content/modders/retired.json',
      previousProfile: { avatarUrl: 'https://avatars.nexusmods.com/111/100' },
    }),
    fetchImpl: async () => assert.fail('a non-Nexus avatar must not be downloaded'),
    logger: quietLogger,
  });

  const manifest = JSON.parse(await readFile(fixture.manifestPath, 'utf8')).avatars;
  assert.equal(Object.hasOwn(manifest, '111'), false);
  assert.equal(typeof manifest['222'], 'string');
  assert.deepEqual(await readdir(fixture.avatarsDirectory), [hashedAvatarFileName('222', unrelated)]);
});

test('--changed refreshes an added profile without trying to read it from the old commit', async t => {
  const added = webpBytes('new profile');
  const fixture = await createFixture(t, {
    profiles: {
      'added.json': { avatarUrl: 'https://avatars.nexusmods.com/333/100' },
    },
    cached: {},
  });

  const result = await refreshAvatarCache({
    repoRoot: fixture.repoRoot,
    mode: 'changed',
    before: beforeSha,
    after: afterSha,
    runGit: changedGit({
      relativePath: 'content/modders/added.json',
      status: 'A',
    }),
    fetchImpl: async () => imageResponse(added),
    logger: quietLogger,
  });
  const manifest = JSON.parse(await readFile(fixture.manifestPath, 'utf8')).avatars;

  assert.equal(result.updated, 1);
  assert.equal(manifest['333'], `/assets/images/modder-avatars/${hashedAvatarFileName('333', added)}`);
});

test('a failed replacement download does not delete the previous user cache', async t => {
  const previous = webpBytes('previous user');
  const fixture = await createFixture(t, {
    profiles: {
      'replacement.json': { avatarUrl: 'https://avatars.nexusmods.com/444/100' },
    },
    cached: { 333: { bytes: previous } },
  });
  const beforeManifest = await readFile(fixture.manifestPath, 'utf8');
  const beforeFiles = await readdir(fixture.avatarsDirectory);

  const result = await refreshAvatarCache({
    repoRoot: fixture.repoRoot,
    mode: 'changed',
    before: beforeSha,
    after: afterSha,
    runGit: changedGit({
      relativePath: 'content/modders/replacement.json',
      previousProfile: { avatarUrl: 'https://avatars.nexusmods.com/333/100' },
    }),
    fetchImpl: async () => imageResponse(Buffer.from('unavailable'), 503),
    logger: quietLogger,
  });

  assert.equal(result.failures, 1);
  assert.equal(await readFile(fixture.manifestPath, 'utf8'), beforeManifest);
  assert.deepEqual(await readdir(fixture.avatarsDirectory), beforeFiles);
});

test('the refresh workflow uses changed and full modes and Pages deploys after it', async () => {
  const [workflow, deployWorkflow] = await Promise.all([
    readFile(new URL('../.github/workflows/refresh-modder-avatars.yml', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/deploy-pages.yml', import.meta.url), 'utf8'),
  ]);

  assert.match(workflow, /^name: Refresh modder avatars/m);
  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /--changed[\s\S]*--before[\s\S]*github\.event\.before[\s\S]*--after[\s\S]*github\.sha/);
  assert.match(workflow, /node scripts\/cache-modder-avatars\.mjs --all/);
  assert.match(workflow, /cron:/);
  assert.match(workflow, /git add -- assets\/data\/modder-avatars\.json assets\/images\/modder-avatars/);
  assert.match(workflow, /git commit -m "chore: refresh modder avatars"/);
  assert.match(deployWorkflow, /workflow_run:[\s\S]*Refresh modder avatars/);
});
