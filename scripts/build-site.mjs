import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { buildResourcesPage } from './build-resources-page.mjs';
import { buildModMapData } from './generate-mod-map-data.mjs';
import { buildLocationMapData } from './generate-location-map-data.mjs';
import { REPO_ROOT } from './wiki-content-lib.mjs';

const dist = path.join(REPO_ROOT, 'dist');
const publicFiles = ['.nojekyll', 'CNAME', '404.html', 'index.html', 'nav.js'];
const publicDirectories = ['assets', 'map', 'madness', 'modathon', 'modjam', 'resources'];

await buildResourcesPage();
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

const [mapData, locationData] = await Promise.all([
  buildModMapData(path.join(dist, 'map', 'data', 'mods.json')),
  buildLocationMapData(path.join(dist, 'map', 'data', 'locations.json')),
]);
console.log(
  `Staged the existing site, ${mapData.mods.length} mods, and ` +
  `${locationData.locations.length} wiki-owned locations in dist/.`,
);
