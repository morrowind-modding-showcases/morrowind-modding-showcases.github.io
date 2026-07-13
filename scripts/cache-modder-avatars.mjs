import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(repoRoot, 'modathon', 'assets', 'data', 'modders.json');
const manifestPath = path.join(repoRoot, 'modathon', 'assets', 'data', 'avatar-assets.json');
const outputDir = path.join(repoRoot, 'modathon', 'assets', 'images', 'avatars');
const force = process.argv.includes('--force');
const concurrency = 12;

const { modders = [] } = JSON.parse(await readFile(dataPath, 'utf8'));
const avatars = [...new Map(modders.flatMap(modder => {
  const match = String(modder.avatar || '').match(/^https:\/\/avatars\.nexusmods\.com\/(\d+)\/100(?:[/?#].*)?$/i);
  return match ? [[match[1], modder.avatar]] : [];
})).entries()].map(([userId, url]) => ({ userId, url }));

await mkdir(outputDir, { recursive: true });
const existingFiles = new Set(await readdir(outputDir));

let downloaded = 0;
let skipped = 0;
const failures = [];
const manifest = {};
let nextIndex = 0;

function extensionFor(bytes) {
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return 'gif';
  return null;
}

async function cacheNext() {
  while (nextIndex < avatars.length) {
    const { userId, url } = avatars[nextIndex++];
    const existingFile = [...existingFiles].find(file => file.startsWith(`${userId}.`));

    if (!force && existingFile) {
      manifest[userId] = `assets/images/avatars/${existingFile}`;
      skipped++;
      continue;
    }

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'image/webp',
          'User-Agent': 'Modathon-Legacy-Avatar-Cache/1.0',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const bytes = new Uint8Array(await response.arrayBuffer());
      const extension = extensionFor(bytes);
      if (!extension) throw new Error(`response was not a recognized image (${response.headers.get('content-type') || 'no content type'})`);

      const fileName = `${userId}.${extension}`;
      const outputPath = path.join(outputDir, fileName);
      await writeFile(outputPath, bytes);
      existingFiles.add(fileName);
      manifest[userId] = `assets/images/avatars/${fileName}`;
      downloaded++;
    } catch (error) {
      failures.push(`${userId}: ${error.message}`);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => cacheNext()));

const sortedManifest = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => Number(a) - Number(b)));
await writeFile(manifestPath, `${JSON.stringify({ avatars: sortedManifest }, null, 2)}\n`);

console.log(`Avatar cache: ${downloaded} downloaded, ${skipped} already present, ${failures.length} failed.`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}
