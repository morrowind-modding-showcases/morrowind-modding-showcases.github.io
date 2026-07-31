import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { buildModMapData } from './generate-mod-map-data.mjs';
import { REPO_ROOT } from './wiki-content-lib.mjs';

const dist = path.join(REPO_ROOT, 'dist');
const publicFiles = ['.nojekyll', 'CNAME', '404.html', 'index.html', 'nav.js'];
const publicDirectories = ['assets', 'map', 'madness', 'modathon', 'modjam'];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await Promise.all([
  ...publicFiles.map(file => cp(path.join(REPO_ROOT, file), path.join(dist, file))),
  ...publicDirectories.map(directory => cp(
    path.join(REPO_ROOT, directory),
    path.join(dist, directory),
    { recursive: true },
  )),
]);

const mapData = await buildModMapData(path.join(dist, 'map', 'data', 'mods.json'));
console.log(`Staged the existing site and ${mapData.mods.length} generated TES3 Mod Map records in dist/.`);
