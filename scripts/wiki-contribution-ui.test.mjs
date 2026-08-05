import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Quartz navigation, article actions, and Contribute page routing match the public scope', async () => {
  const [nav, action, layout, page, component] = await Promise.all([
    readFile('wiki/quartz/components/SiteNav.tsx', 'utf8'),
    readFile('wiki/quartz/components/ContributionAction.tsx', 'utf8'),
    readFile('wiki/quartz.layout.ts', 'utf8'),
    readFile('wiki/content/contribute.md', 'utf8'),
    readFile('wiki/quartz/components/ContributionForm.tsx', 'utf8'),
  ]);
  assert.match(nav, />\s*Mods\s*</u);
  assert.match(nav, />\s*Locations\s*</u);
  assert.match(nav, /href="\/wiki\/contribute\/"[\s\S]*?>\s*Contribute\s*</u);
  assert.match(action, /validModSlug/u);
  assert.match(action, /validLocationSlug/u);
  assert.match(action, /frontmatter\?\.map_id !== undefined/u);
  assert.match(action, /wiki\/content\/\$\{slug\}\.md/u);
  assert.match(layout, /Component\.ContributionAction\(\)/u);
  assert.match(layout, /Component\.ContributionForm\(\)/u);
  assert.match(page, /title: "Contribute to the Wiki"/u);
  assert.match(component, /fileData\.slug !== "contribute"/u);
});

test('the browser contribution UI exposes only two create choices and all four exact submission labels', async () => {
  const source = await readFile('wiki/quartz/components/scripts/contribution.inline.ts', 'utf8');
  assert.equal((source.match(/create\("button", "contribution-choice"\)/gu) ?? []).length, 2);
  for (const label of [
    'Edit an existing mod page',
    'Add a new mod page',
    'Edit an existing map location',
    'Add a new map location',
  ]) assert.match(source, new RegExp(label));
  assert.match(source, /"Cell name"/u);
  assert.match(source, /"UESP URL \(optional\)"/u);
  assert.match(source, /"Include this mod on the TES3 Mod Map"/u);
  assert.match(source, /"Submit for review"/u);
  assert.doesNotMatch(source, /confirmation checkbox|Contact details|Discord|GitHub username|Nexus username/iu);
});

test('browser preview, source loading, Turnstile, and privacy behavior fail closed', async () => {
  const source = await readFile('wiki/quartz/components/scripts/contribution.inline.ts', 'utf8');
  assert.match(source, /raw\.githubusercontent\.com/u);
  assert.match(source, /crypto\.subtle\.digest\("SHA-256", bytes\)/u);
  assert.match(source, /new TextDecoder\("utf-8", \{ fatal: true \}\)/u);
  assert.match(source, /contribution-options\.json/u);
  assert.match(source, /0x4AAAAAAEGiDP91lRPZHrbI/u);
  assert.match(source, /action: "wiki_contribution"/u);
  assert.match(source, /turnstile\.reset/u);
  assert.match(source, /Submission received\. Thank you!/u);
  assert.match(source, /type = "checkbox"/u);
  assert.doesNotMatch(source, /innerHTML/u);
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/u);
  assert.match(source, /article: ""/u);
  assert.doesNotMatch(source, /# Description|# Location/u);
});

test('LocationDetails accepts complete UESP URLs while preserving legacy page-title links', async () => {
  const [source, map] = await Promise.all([
    readFile('wiki/quartz/components/LocationDetails.tsx', 'utf8'),
    readFile('map/js/map.js', 'utf8'),
  ]);
  assert.match(source, /\^https\?:\\\/\\\//u);
  assert.match(source, /https:\/\/en\.uesp\.net\/wiki\/Morrowind:/u);
  assert.match(map, /if \(\/\^https\?:[\s\S]*?\.test\(page\)\) return page/u);
});
