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
  assert.match(nav, /resolveRelative\(fileData\.slug!, "contribute" as FullSlug\)/u);
  assert.match(nav, /href=\{contributeHref\}[\s\S]*?>\s*Contribute\s*</u);
  assert.doesNotMatch(nav, /\/wiki\/contribute\//u);
  assert.match(action, /validModSlug/u);
  assert.match(action, /validLocationSlug/u);
  assert.match(action, /frontmatter\?\.map_id !== undefined/u);
  assert.match(action, /wiki\/content\/\$\{slug\}\.md/u);
  assert.match(action, /const contributeHref = "\/wiki\/contribute"/u);
  assert.doesNotMatch(action, /resolveRelative/u);
  assert.match(action, /href=\{`\$\{contributeHref\}\?edit=/u);
  assert.match(action, /data-router-ignore/u);
  assert.doesNotMatch(action, /\/wiki\/contribute\//u);
  assert.match(layout, /Component\.ContributionAction\(\)/u);
  assert.match(layout, /Component\.ContributionForm\(\)/u);
  assert.match(page, /title: "Contribute to the Wiki"/u);
  assert.match(component, /fileData\.slug !== "contribute"/u);
});

test('the browser contribution UI exposes one create choice and the three direct-PR submission labels', async () => {
  const [source, pages, config] = await Promise.all([
    readFile('wiki/quartz/components/scripts/contribution.inline.ts', 'utf8'),
    readFile('.pages.yml', 'utf8'),
    readFile('wiki/quartz.config.ts', 'utf8'),
  ]);
  const createChoices = source.slice(
    source.indexOf('function renderChoices'),
    source.indexOf('async function initializeContributionForm'),
  );
  assert.equal((createChoices.match(/create\("button", "contribution-choice"\)/gu) ?? []).length, 1);
  assert.doesNotMatch(createChoices, /Parse plugin file/u);
  for (const label of [
    'Edit an existing mod page',
    'Add a new mod page',
    'Edit an existing map location',
  ])
    assert.match(source, new RegExp(label));
  assert.doesNotMatch(source, /Add a new map location|new-location/u);
  assert.match(source, /"Download URL"/u);
  assert.match(source, /"Cell name"/u);
  assert.match(source, /"UESP URL \(optional\)"/u);
  assert.match(source, /"Include this mod on the TES3 Mod Map"/u);
  assert.match(source, /mapEnabled: kind === "new-mod"/u);
  assert.match(source, /"Add exterior cell"/u);
  assert.match(source, /"Download Markdown File"/u);
  assert.match(source, /"Submit for review"/u);
  assert.match(source, /GitHub pull request/u);
  assert.doesNotMatch(source, /Contributor name|Notes for maintainers|private moderation queue/u);
  assert.doesNotMatch(source, /state\.description|"Description \(optional\)"/u);
  assert.match(source, /delete frontmatter\.description/u);
  assert.doesNotMatch(pages, /label: Short description/u);
  assert.match(config, /Plugin\.Description\(\)/u);
  assert.doesNotMatch(source, /confirmation checkbox|Contact details|Discord|GitHub username|Nexus username/iu);
});

test('the server-rendered and interactive contribution views share the same intro copy', async () => {
  const [component, source] = await Promise.all([
    readFile('wiki/quartz/components/ContributionForm.tsx', 'utf8'),
    readFile('wiki/quartz/components/scripts/contribution.inline.ts', 'utf8'),
  ]);
  assert.match(component, /Submissions will be\s+reviewed by a wiki maintainer prior to publication\./u);
  assert.match(component, />\s*how to contribute\s*</u);
  assert.match(source, /root\.querySelector<HTMLParagraphElement>\("\.wiki-contribution-intro"\)/u);
  assert.match(source, /paragraph\.cloneNode\(true\)/u);
  assert.doesNotMatch(source, /Submissions open public pull requests for maintainer review\./u);
});

test('review downloads the generated Markdown with the repository filename in every contribution mode', async () => {
  const source = await readFile('wiki/quartz/components/scripts/contribution.inline.ts', 'utf8');
  assert.match(source, /state\.reviewPayload\?\.generatedMarkdown/u);
  assert.match(source, /state\.targetPath\.split\("\/"\)\.pop\(\)/u);
  assert.match(source, /`\$\{state\.slug\}\.md`/u);
  assert.match(source, /new Blob\(\[contents\], \{ type: "text\/markdown;charset=utf-8" \}\)/u);
  assert.match(source, /link\.download = filename/u);
  assert.match(source, /actions\.append\(back, download, submit\)/u);
});

test('plugin parsing stays local and defaults zero-reference cells off', async () => {
  const [source, parser, styles] = await Promise.all([
    readFile('wiki/quartz/components/scripts/contribution.inline.ts', 'utf8'),
    readFile('wiki/quartz/components/scripts/tes3-plugin-parser.ts', 'utf8'),
    readFile('wiki/quartz/components/styles/contribution.scss', 'utf8'),
  ]);
  assert.match(source, /file\.arrayBuffer\(\)/u);
  assert.match(source, /parseTes3Plugin/u);
  assert.match(source, /It is parsed locally and is never uploaded/u);
  assert.match(source, /cell\.selected = checkbox\.checked/u);
  assert.doesNotMatch(source, /state\.warning/u);
  assert.match(parser, /tag === "CELL"/u);
  assert.match(parser, /tag === "FRMR"/u);
  assert.match(parser, /selected: parsed\.modifiedReferences > 0/u);
  assert.match(parser, /isOfficialTes3Cell/u);
  assert.doesNotMatch(parser, /OBJECT_FLAG_MODIFIED/u);
  assert.match(parser, /region \|\| "Wilderness"/u);
  assert.match(styles, /grid-template-columns: repeat\(2,/u);
  assert.match(styles, /\.contribution-cell-row/u);
  assert.match(source, /contribution-cell-row-unavailable/u);
  assert.match(source, /contribution-cell-unavailable-mark", "×"/u);
  assert.match(source, /cannot be selected/u);
  assert.match(
    styles,
    /\.contribution-cell-row-unavailable[\s\S]*?cursor: not-allowed;/u,
  );
  assert.match(
    styles,
    /\.contribution-cell-row-unavailable \.contribution-cell-content[\s\S]*?opacity: 0\.55;/u,
  );
  assert.match(source, /appendChildren\(row, indicator, content\)/u);
  assert.match(styles, /\.contribution-cell-indicator[\s\S]*?flex: 0 0 1rem;/u);
  assert.match(styles, /\.contribution-cell-unavailable-mark/u);
});

test('contribution routing follows query changes and contribution headings use the wiki body font', async () => {
  const [source, styles] = await Promise.all([
    readFile('wiki/quartz/components/scripts/contribution.inline.ts', 'utf8'),
    readFile('wiki/quartz/components/styles/contribution.scss', 'utf8'),
  ]);
  assert.match(source, /root\.dataset\.initializedFor === routeKey/u);
  assert.doesNotMatch(source, /dataset\.initialized === "true"/u);
  assert.doesNotMatch(styles, /var\(--headerFont\)/u);
  assert.equal((styles.match(/font-family: var\(--bodyFont\)/gu) ?? []).length, 2);
  assert.equal((styles.match(/font-variant: normal/gu) ?? []).length, 2);
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
  assert.match(source, /Submission accepted\. Thank you!/u);
  assert.match(source, /type = "checkbox"/u);
  assert.doesNotMatch(source, /innerHTML/u);
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/u);
  assert.match(source, /article: ""/u);
  assert.doesNotMatch(source, /# Description|# Location/u);
});

test('map-location search preserves selections and article previews render Obsidian links', async () => {
  const [source, styles] = await Promise.all([
    readFile('wiki/quartz/components/scripts/contribution.inline.ts', 'utf8'),
    readFile('wiki/quartz/components/styles/contribution.scss', 'utf8'),
  ]);
  assert.match(source, /const searchMatches = query/u);
  assert.match(source, /new Set\(\[\.\.\.state\.mapLocations, \.\.\.searchMatches\]\)/u);
  assert.match(source, /choices\.hidden = displayedLocations\.size === 0 && !query/u);
  assert.doesNotMatch(source, /index < 100/u);
  assert.match(source, /function renderObsidianLinks/u);
  assert.match(source, /transformInternalLink\(target\)/u);
  assert.match(source, /link\.classList\.add\("internal"\)/u);
  assert.match(source, /https:\/\/obsidian\.md\/help\/syntax/u);
  assert.match(styles, /\.wiki-contribution input\[type="checkbox"\][\s\S]*?margin: 0;[\s\S]*?transform: none;/u);
});

test('event, filename, and plugin-upload controls use the compact form layout', async () => {
  const [source, styles] = await Promise.all([
    readFile('wiki/quartz/components/scripts/contribution.inline.ts', 'utf8'),
    readFile('wiki/quartz/components/styles/contribution.scss', 'utf8'),
  ]);
  assert.match(source, /select\.append\(new Option\("Choose an event", ""\)\)/u);
  assert.doesNotMatch(source, /select\.multiple = true|select\.size =/u);
  assert.match(source, /state\.events = select\.value \? \[select\.value\] : \[\]/u);
  assert.equal((source.match(/slugInput\.readOnly = true/gu) ?? []).length, 1);
  assert.match(source, /Generated automatically from the mod title/u);
  assert.match(source, /mapLocationSelect\(state, options, upload, file\)/u);
  assert.match(styles, /\.contribution-map-search[\s\S]*?display: flex;/u);
});

test('new and existing mod forms can prepopulate map locations from a local plugin', async () => {
  const source = await readFile('wiki/quartz/components/scripts/contribution.inline.ts', 'utf8');
  assert.match(
    source,
    /if \(state\.kind === "new-mod" \|\| state\.kind === "edit-mod"\)[\s\S]*?mapLocationEditor\(root, state, options, rerender\)/u,
  );
  assert.match(source, /makeButton\("Upload plugin"/u);
  assert.match(source, /file\.accept = "\.esp,\.esm"/u);
  assert.match(source, /"Use selected cells"/u);
  assert.match(source, /state\.mapLocations = deduplicate\(\[\.\.\.state\.mapLocations, \.\.\.transfer\.matched\]\)/u);
  assert.match(source, /\.\.\.transfer\.exteriorCells/u);
  assert.match(source, /The file is parsed locally and is never uploaded/u);
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
