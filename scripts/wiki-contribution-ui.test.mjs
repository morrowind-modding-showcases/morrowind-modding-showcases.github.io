import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Quartz navigation, article actions, and Contribute page routing match the public scope', async () => {
  const [nav, action, layout, page, component, leaderboard, recentChanges] = await Promise.all([
    readFile('wiki/quartz/components/SiteNav.tsx', 'utf8'),
    readFile('wiki/quartz/components/ContributionAction.tsx', 'utf8'),
    readFile('wiki/quartz.layout.ts', 'utf8'),
    readFile('wiki/content/contribute.md', 'utf8'),
    readFile('wiki/quartz/components/ContributionForm.tsx', 'utf8'),
    readFile('wiki/content/contributors.md', 'utf8'),
    readFile('wiki/content/recent-changes.md', 'utf8'),
  ]);
  assert.match(nav, />\s*Mods\s*</u);
  assert.match(nav, />\s*Locations\s*</u);
  assert.match(nav, /resolveRelative\(fileData\.slug!, "contribute" as FullSlug\)/u);
  assert.match(nav, /href=\{contributeHref\}[\s\S]*?>\s*Contribute\s*</u);
  assert.match(nav, />\s*Leaderboard\s*</u);
  assert.match(nav, />\s*Recent changes\s*</u);
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
  assert.match(layout, /Component\.ContributionHistory\(\)/u);
  assert.match(page, /title: "Contribute"/u);
  assert.match(component, /fileData\.slug !== "contribute"/u);
  assert.match(leaderboard, /title: "Leaderboard"/u);
  assert.match(recentChanges, /title: "Recent Changes"/u);
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
  assert.doesNotMatch(source, /Add a new map location/u);
  assert.match(source, /"Download URL"/u);
  assert.match(source, /"Cell name"/u);
  assert.match(source, /"UESP URL \(optional\)"/u);
  assert.match(source, /"Include this mod on the TES3 Mod Map"/u);
  assert.match(source, /Does this download contain alternate versions, patches, translations, or optional plugins\?/u);
  assert.match(source, /function componentEditor/u);
  assert.match(source, /placeholder: "Search wiki mods"/u);
  assert.match(source, /create\("div", "contribution-reference-results"\)/u);
  assert.match(source, /"No wiki mods match that search\."/u);
  assert.match(
    source,
    /makeButton\(\s*mod\.title,[\s\S]*?\(\) => chooseMod\(mod\),[\s\S]*?"contribution-reference-option"/u,
  );
  assert.match(source, /"Add another component"/u);
  assert.match(source, /function automaticComponentId/u);
  assert.match(source, /id\.readOnly = component\.automaticId/u);
  assert.match(source, /Generated automatically from the component name/u);
  assert.match(source, /result = `\$\{base\}-\$\{suffix\}`/u);
  assert.match(source, /"Exterior edits \(optional\)"/u);
  assert.match(source, /"Upload component plugin"/u);
  assert.match(source, /component\.plugins = deduplicate/u);
  assert.match(source, /map_exterior_edits: component\.mapExteriorEdits\.map/u);
  assert.match(
    source,
    /state\.componentsTouched &&\s*\(state\.kind === "edit-mod" \|\| state\.componentsEnabled\)/u,
  );
  assert.match(source, /mapEnabled: kind === "new-mod"/u);
  assert.match(source, /"Add exterior cell"/u);
  assert.match(source, /"Download Markdown File"/u);
  assert.match(source, /"Submit for review"/u);
  assert.match(source, /GitHub pull request/u);
  assert.match(source, /"User name"/u);
  assert.match(source, /options\.contributors/u);
  assert.match(source, /document\.createElement\("datalist"\)/u);
  assert.match(source, /"Remember user name on this device"/u);
  assert.doesNotMatch(source, /Notes for maintainers|private moderation queue/u);
  assert.doesNotMatch(source, /state\.description|"Description \(optional\)"/u);
  assert.match(source, /delete frontmatter\.description/u);
  assert.doesNotMatch(pages, /label: Short description/u);
  assert.match(config, /Plugin\.Description\(\)/u);
  assert.doesNotMatch(source, /confirmation checkbox|Contact details|Discord|GitHub username|Nexus username/iu);
});

test('mod components follow map coverage and preserve individually collapsible named panels', async () => {
  const [source, styles, pages] = await Promise.all([
    readFile('wiki/quartz/components/scripts/contribution.inline.ts', 'utf8'),
    readFile('wiki/quartz/components/styles/contribution.scss', 'utf8'),
    readFile('.pages.yml', 'utf8'),
  ]);
  const modForm = source.slice(
    source.indexOf('const mapToggle = document.createElement("input")'),
    source.indexOf('form.append(details);', source.indexOf('const mapToggle = document.createElement("input")')),
  );
  assert.ok(modForm.indexOf('const mapToggle') < modForm.indexOf('const componentsToggle'));
  assert.match(source, /expanded: false,[\s\S]*?name: stringValue\(rawComponent\.name\)/u);
  assert.match(source, /function blankComponent[\s\S]*?expanded: true/u);
  assert.match(source, /function blankComponent[\s\S]*?type: "variant"/u);
  assert.match(source, /const hasComponentMapCoverage =[\s\S]*?component\.mapLocations\.length > 0[\s\S]*?component\.mapExteriorEdits\.length > 0/u);
  assert.doesNotMatch(pages, /values:\s*\r?\n\s*- main\s*\r?\n\s*- variant/u);
  assert.match(source, /create\(\s*"details",\s*"contribution-component"/u);
  assert.match(source, /component\.name\.trim\(\) \|\| `Component \$\{index \+ 1\}`/u);
  assert.match(source, /details\.addEventListener\("toggle", \(\) => \{\s*component\.expanded = details\.open;/u);
  assert.match(styles, /\.contribution-component-summary/u);
  assert.match(styles, /\.contribution-component\[open\]/u);
  assert.match(
    styles,
    /\.contribution-reference-results[\s\S]*?max-height: 18rem;[\s\S]*?overflow: auto;/u,
  );
});

test('the server-rendered and interactive contribution views share the same intro copy', async () => {
  const [component, source] = await Promise.all([
    readFile('wiki/quartz/components/ContributionForm.tsx', 'utf8'),
    readFile('wiki/quartz/components/scripts/contribution.inline.ts', 'utf8'),
  ]);
  assert.match(component, /Submissions will be\s+reviewed by a wiki maintainer prior to publication\./u);
  assert.match(component, />\s*how to contribute\s*</u);
  assert.match(
    source,
    /root\.querySelector<HTMLParagraphElement>\(\s*"\.wiki-contribution-intro",?\s*\)/u,
  );
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

test('plugin parsing stays local, keeps zero-reference cells selected, and supports bulk selection', async () => {
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
  assert.match(parser, /tag === "LAND"/u);
  assert.match(parser, /tag === "INTV"/u);
  assert.match(parser, /tag === "FRMR"/u);
  assert.match(parser, /selected: true/u);
  assert.doesNotMatch(parser, /selected: parsed\.modifiedReferences > 0/u);
  assert.match(source, /makeButton\("Select all"/u);
  assert.match(source, /allSelected \? "Deselect all" : "Select all"/u);
  assert.match(source, /cell\.selected = shouldSelect/u);
  assert.match(source, /syncToggleAll\(\)/u);
  assert.match(parser, /isOfficialTes3Cell/u);
  assert.doesNotMatch(parser, /OBJECT_FLAG_MODIFIED/u);
  assert.match(parser, /region \|\| "Wilderness"/u);
  assert.match(styles, /grid-template-columns: repeat\(2,/u);
  assert.match(styles, /\.contribution-cell-row/u);
  assert.match(source, /contribution-cell-row-unavailable/u);
  assert.match(
    source,
    /create\(\s*"span",\s*"contribution-cell-unavailable-mark",\s*"×",?\s*\)/u,
  );
  assert.match(source, /has no exterior doormarker/u);
  assert.match(
    styles,
    /\.contribution-cell-row-unavailable[\s\S]*?cursor: not-allowed;/u,
  );
  assert.match(
    styles,
    /\.contribution-cell-row-unavailable \.contribution-cell-content[\s\S]*?opacity: 0\.55;/u,
  );
  assert.match(source, /appendChildren\(row, indicator, content, controls\)/u);
  assert.match(styles, /\.contribution-cell-indicator[\s\S]*?flex: 0 0 1rem;/u);
  assert.match(styles, /\.contribution-cell-unavailable-mark/u);
  assert.match(parser, /tag === "DODT"/u);
  assert.match(parser, /tag === "DNAM"/u);
  assert.match(parser, /referencePosition/u);
  assert.match(parser, /doorMarkers/u);
  assert.match(source, /makeButton\(draft \? "Remove location" : "Add location"/u);
  assert.match(source, /makeButton\("Add all new locations"/u);
  assert.match(
    source,
    /newLocationCandidates\.map\(\(cell\) => newLocationDraftForCell\(cell\)\)/u,
  );
  assert.match(
    source,
    /for \(const cell of newLocationCandidates\) cell\.selected = true/u,
  );
  assert.match(
    source,
    /addAllNewLocations\.disabled = newLocationCandidates\.every/u,
  );
  assert.match(source, /All new locations added/u);
  assert.match(source, /create\("output", "contribution-static-value", value\)/u);
  assert.doesNotMatch(source, /Filled from the doormarker destination/u);
  assert.doesNotMatch(source, /Filled from the exterior CELL record/u);
  assert.match(styles, /\.contribution-static-value[\s\S]*?display: flex;[\s\S]*?align-items: center;/u);
  assert.match(styles, /\.contribution-new-location-metadata[\s\S]*?align-items: start;/u);
  assert.match(source, /This becomes the new location article text/u);
  assert.match(source, /new_locations:/u);
  assert.match(source, /function modAddedLocationDetail/u);
  assert.doesNotMatch(source, /Math\.hypot\(primary\.x - entrance\.x, primary\.y - entrance\.y\) >= 100/u);
  assert.match(source, /contribution-location-variant-choice/u);
  assert.match(source, /Use an install-specific location for \$\{state\.fileName\}/u);
  assert.match(source, /Make these coordinates the main location/u);
  assert.match(source, /Add these coordinates as new entrances/u);
  assert.match(source, /needs a variant, main-location, or entrance choice/u);
  assert.match(source, /location_variants:/u);
  assert.match(source, /map_location_changes:/u);
  assert.match(source, /retained\?\.mode \?\? "variant"/u);
});

test('the mod map exposes blue new-location styling and an independent visibility toggle', async () => {
  const [html, source, styles] = await Promise.all([
    readFile('map/index.html', 'utf8'),
    readFile('map/js/map.js', 'utf8'),
    readFile('map/css/map.css', 'utf8'),
  ]);
  assert.match(html, /id="new-location-filter-toggle"[^>]*> New locations/u);
  assert.doesNotMatch(html, /id="new-location-filter-toggle"[^>]*\schecked(?:\s|>)/u);
  assert.match(html, /dot-new-location[^<]*<\/span> New location/u);
  assert.match(styles, /--new-location: #4c9cff/u);
  assert.match(source, /loc\.mod_added === true/u);
  assert.match(source, /let newLocationsVisible = Boolean\(newLocationFilterToggle\?\.checked\)/u);
  assert.match(source, /entry\.newLocation && !newLocationsVisible/u);
  assert.match(source, /!newLocationsVisible && !activeMod/u);
  assert.match(source, /loc\.main_source/u);
  assert.match(source, /function locationSourceMatchesActiveFilter/u);
  assert.match(source, /function locationReplacementMatchesActiveFilter/u);
  assert.match(source, /markerRecord\.sourceMode === "entrance"/u);
  assert.match(source, /visibleEntryMarkerRecords/u);
  assert.match(source, /!entry\.newLocation && filterMode === "modded"/u);
  assert.match(source, /!entry\.newLocation && filterMode === "vanilla"/u);
  assert.doesNotMatch(source, /newLocationFilterEnabled && !displayedEntryIsNewLocation/u);
  assert.match(source, /displayedEntryIsNewLocation/u);
  assert.match(source, /STYLE\.newLocation/u);
  assert.match(source, /locationVariant/u);
  assert.match(source, /fillOpacity: 0\.5/u);
  assert.match(source, /return locationVariantMatchesActiveFilter\(markerRecord\)/u);
  assert.match(source, /entry\.newLocation \? "Added by" : "Modified by"/u);
  assert.match(styles, /popup-added-by h4[^}]*var\(--new-location\)/u);
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

test('browser preview, source loading, Turnstile, and remembered-name behavior fail closed', async () => {
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
  assert.doesNotMatch(source, /localStorage|sessionStorage/u);
  assert.match(source, /document\.cookie/u);
  assert.match(source, /SameSite=Lax; Secure/u);
  assert.match(source, /Max-Age=\$\{CONTRIBUTOR_COOKIE_MAX_AGE\}/u);
  assert.match(source, /article: kind === "new-mod" \? NEW_MOD_ARTICLE_TEMPLATE : ""/u);
  assert.doesNotMatch(source, /# Description|# Location/u);
});

test('article editing provides formatted editing, icon Markdown controls, and canonical wikilink autocomplete', async () => {
  const [source, styles, config] = await Promise.all([
    readFile('wiki/quartz/components/scripts/contribution.inline.ts', 'utf8'),
    readFile('wiki/quartz/components/styles/contribution.scss', 'utf8'),
    readFile('wiki/quartz.config.ts', 'utf8'),
  ]);

  assert.match(source, /formatted\.contentEditable = "true"/u);
  assert.match(source, /makeButton\("Formatted", \(\) => setMode\(false\)\)/u);
  assert.match(source, /makeButton\("Markdown", \(\) => setMode\(true\)\)/u);
  assert.match(source, /setMode\(false\);/u);
  assert.match(source, /serializeFormattedMarkdown/u);
  assert.match(source, /renderMarkdown\(state\.article, formatted, options\.wikiPages\)/u);
  assert.match(source, /button\.replaceChildren\(editorIcon\(icon\)\)/u);
  assert.match(source, /button\.setAttribute\("aria-label", label\)/u);
  for (const label of [
    'Bold (Ctrl+B)',
    'Italic (Ctrl+I)',
    'Strikethrough',
    'Heading',
    'Block quote',
    'Bulleted list',
    'Numbered list',
    'Inline code',
    'External link',
    'Internal wiki link',
  ])
    assert.ok(source.includes(`"${label}"`));
  assert.match(source, /lastIndexOf\("\[\["/u);
  assert.match(source, /options\.wikiPages/u);
  assert.match(source, /`\[\[\$\{page\.path\}\|\$\{page\.title\}\]\]`/u);
  assert.match(source, /event\.key === "ArrowDown" \|\| event\.key === "ArrowUp"/u);
  assert.match(source, /event\.key === "Enter" \|\| event\.key === "Tab"/u);
  assert.match(styles, /\.contribution-format-toolbar/u);
  assert.match(styles, /\.contribution-format-button svg/u);
  assert.match(styles, /\.contribution-formatted-editor/u);
  assert.match(styles, /\.contribution-link-suggestions/u);
  assert.match(source, /positionSuggestions\(active\)/u);
  assert.match(source, /active\.range\.getClientRects/u);
  assert.match(source, /externalLinkText\.setAttribute\("aria-label", "Link text"\)/u);
  assert.match(source, /externalLinkUrl\.setAttribute\("aria-label", "Link URL"\)/u);
  assert.match(source, /makeButton\(\s*"Insert link",/u);
  assert.match(source, /link\.className = "external"/u);
  assert.match(source, /element\.classList\.add\("external"\)/u);
  assert.match(source, /replace\(\/\\u00a0\/gu, " "\)/u);
  assert.match(styles, /\.contribution-markdown-field[^{]*\{[^}]*position: relative/su);
  assert.match(styles, /\.contribution-link-suggestions[^{]*\{[^}]*position: absolute/su);
  assert.match(styles, /\.contribution-formatted-editor a\.external/u);
  assert.match(styles, /\.contribution-external-link-panel/u);
  assert.match(config, /Plugin\.WikiLinkResolver\(\)[\s\S]*?Plugin\.CrawlLinks/u);
});

test('new mod pages start with the suggested article text in both contribution interfaces', async () => {
  const [source, pages] = await Promise.all([
    readFile('wiki/quartz/components/scripts/contribution.inline.ts', 'utf8'),
    readFile('.pages.yml', 'utf8'),
  ]);
  const suggestedArticle = [
    '> Extract from mod description',
    '## World Edits',
    'Description of world edits.',
    '## Other Notes',
    'Other notes about the mod.',
  ].join('\n');
  assert.ok(source.includes(`const NEW_MOD_ARTICLE_TEMPLATE = \`${suggestedArticle}\n\`;`));
  assert.match(source, /article: kind === "new-mod" \? NEW_MOD_ARTICLE_TEMPLATE : ""/u);
  assert.ok(pages.replace(/\r\n/gu, '\n').includes(`            default: |-\n${suggestedArticle
    .split('\n')
    .map(line => `              ${line}`)
    .join('\n')}`));
});

test('unsubmitted contribution edits require confirmation before page navigation', async () => {
  const [source, router] = await Promise.all([
    readFile('wiki/quartz/components/scripts/contribution.inline.ts', 'utf8'),
    readFile('wiki/quartz/components/scripts/spa.inline.ts', 'utf8'),
  ]);
  assert.match(
    source,
    /You have unsubmitted edits\. Are you sure you would like to leave the page\?/u,
  );
  assert.match(source, /function hasUnsubmittedEdits/u);
  assert.match(source, /window\.confirm\(UNSUBMITTED_EDITS_MESSAGE\)/u);
  assert.match(source, /document\.addEventListener\("prenav"/u);
  assert.match(source, /window\.addEventListener\("beforeunload"/u);
  assert.match(source, /clearTrackedContributionState\(\);[\s\S]*?Object\.assign\(state, blankState/u);
  assert.match(router, /cancelable: true/u);
  assert.match(router, /return !event\.defaultPrevented/u);
  assert.match(router, /history\.go\(restoreDelta\)/u);
});

test('leaderboard and recent changes use merged contribution history with all requested periods', async () => {
  const [component, source, styles] = await Promise.all([
    readFile('wiki/quartz/components/ContributionHistory.tsx', 'utf8'),
    readFile('wiki/quartz/components/scripts/contribution-history.inline.ts', 'utf8'),
    readFile('wiki/quartz/components/styles/contribution-history.scss', 'utf8'),
  ]);
  assert.match(component, /slug !== "contributors" && slug !== "recent-changes"/u);
  assert.match(source, /contribution-history\.json/u);
  assert.match(source, /\[1, 3, 7, 14, 30, 90\]/u);
  assert.match(source, /\["month", "Month"\]/u);
  assert.match(source, /\["year", "Year"\]/u);
  assert.match(source, /\["all", "All time"\]/u);
  assert.match(source, /mode === "month" \? 30 : mode === "year" \? 365 : null/u);
  assert.doesNotMatch(source, /monthSelect|yearSelect|periodKeys|monthLabel/u);
  assert.match(source, /right\.count - left\.count/u);
  assert.match(source, /Date\.now\(\) - selectedDays/u);
  assert.doesNotMatch(source, /innerHTML/u);
  assert.match(styles, /\.contribution-leaderboard/u);
  assert.match(styles, /\.contribution-change-list/u);
});

test('map-location search preserves selections and article previews render Obsidian links', async () => {
  const [source, styles] = await Promise.all([
    readFile('wiki/quartz/components/scripts/contribution.inline.ts', 'utf8'),
    readFile('wiki/quartz/components/styles/contribution.scss', 'utf8'),
  ]);
  assert.match(source, /const searchMatches = query/u);
  assert.match(
    source,
    /new Set\(\[\s*\.\.\.state\.mapLocations,\s*\.\.\.searchMatches,?\s*\]\)/u,
  );
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
  assert.match(
    source,
    /state\.mapLocations = deduplicate\(\[\s*\.\.\.state\.mapLocations,\s*\.\.\.transfer\.matched,?\s*\]\)/u,
  );
  assert.match(source, /transfer\.exteriorEdits/u);
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
