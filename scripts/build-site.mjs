import { cp, mkdir, opendir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildResourcesPage } from './build-resources-page.mjs';
import { main as buildContent } from './build-content.mjs';
import { buildModMapData } from './generate-mod-map-data.mjs';
import { buildLocationMapData } from './generate-location-map-data.mjs';
import { REPO_ROOT } from './wiki-content-lib.mjs';

const dist = path.join(REPO_ROOT, 'dist');
const publicFiles = ['.nojekyll', 'CNAME', '404.html', 'index.html', 'nav.js'];
export const publicDirectories = ['assets', 'map', 'madness', 'modathon', 'modjam', 'news', 'resources'];
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

export async function injectGoogleAnalytics(directory) {
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

export async function buildSite({
  outputDirectory = dist,
  prepareContent = true,
  filesToCopy = publicFiles,
  directoriesToCopy = publicDirectories,
  generateDerivedData = true,
} = {}) {
  if (prepareContent) {
    await buildContent();
    await buildResourcesPage();
  }

  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  await Promise.all([
    ...filesToCopy.map(file => cp(path.join(REPO_ROOT, file), path.join(outputDirectory, file))),
    ...directoriesToCopy.map(directory => cp(
      path.join(REPO_ROOT, directory),
      path.join(outputDirectory, directory),
      { recursive: true },
    )),
  ]);

  const injectedPageCount = await injectGoogleAnalytics(outputDirectory);
  console.log(`Added Google Analytics to ${injectedPageCount} static HTML pages.`);

  if (!generateDerivedData) return;

  const [mapData, locationData] = await Promise.all([
    buildModMapData(path.join(outputDirectory, 'map', 'data', 'mods.json')),
    buildLocationMapData(path.join(outputDirectory, 'map', 'data', 'locations.json')),
  ]);
  console.log(
    `Staged the existing site, ${mapData.mods.length} mods, and ` +
    `${locationData.locations.length} wiki-owned locations in dist/.`,
  );
}

const isEntrypoint = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntrypoint) {
  await buildSite();
}
