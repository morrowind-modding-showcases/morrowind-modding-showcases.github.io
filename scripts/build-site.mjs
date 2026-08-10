import { cp, mkdir, opendir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildResourcesPage } from './build-resources-page.mjs';
import { main as buildContent } from './build-content.mjs';
import { buildModMapData } from './generate-mod-map-data.mjs';
import { buildLocationMapData } from './generate-location-map-data.mjs';
import { REPO_ROOT } from './wiki-content-lib.mjs';

const dist = path.join(REPO_ROOT, 'dist');
const publicFiles = ['.nojekyll', 'CNAME', '404.html', 'index.html', 'nav.js'];
const publicDirectories = ['assets', 'map', 'madness', 'modathon', 'modjam', 'resources'];
const googleAnalyticsId = 'G-ZXQRFGBRVH';
const googleAnalyticsTag = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', '${googleAnalyticsId}');
</script>
`;

async function injectGoogleAnalytics(directory) {
  let injectedPageCount = 0;
  const entries = await opendir(directory);

  for await (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      injectedPageCount += await injectGoogleAnalytics(entryPath);
      continue;
    }

    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.html') {
      continue;
    }

    const html = await readFile(entryPath, 'utf8');
    if (html.includes(googleAnalyticsId) || !/<\/head\s*>/i.test(html)) {
      continue;
    }

    await writeFile(entryPath, html.replace(/<\/head\s*>/i, `${googleAnalyticsTag}$&`));
    injectedPageCount += 1;
  }

  return injectedPageCount;
}

await buildContent();
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

const injectedPageCount = await injectGoogleAnalytics(dist);
console.log(`Added Google Analytics to ${injectedPageCount} static HTML pages.`);

const [mapData, locationData] = await Promise.all([
  buildModMapData(path.join(dist, 'map', 'data', 'mods.json')),
  buildLocationMapData(path.join(dist, 'map', 'data', 'locations.json')),
]);
console.log(
  `Staged the existing site, ${mapData.mods.length} mods, and ` +
  `${locationData.locations.length} wiki-owned locations in dist/.`,
);
