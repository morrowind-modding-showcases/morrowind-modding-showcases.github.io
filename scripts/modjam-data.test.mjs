import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const archive = JSON.parse(await readFile(new URL('../modjam/data/modjams.json', import.meta.url), 'utf8'));
const profiles = JSON.parse(await readFile(new URL('../modjam/data/modders.json', import.meta.url), 'utf8'));
const judgeRegistry = JSON.parse(await readFile(new URL('../modjam/data/judges.json', import.meta.url), 'utf8'));
const avatarManifest = JSON.parse(await readFile(new URL('../assets/data/modder-avatars.json', import.meta.url), 'utf8')).avatars;
const postcardManifest = JSON.parse(await readFile(new URL('../modjam/data/postcards.json', import.meta.url), 'utf8'));
const appSource = await readFile(new URL('../modjam/app.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../modjam/index.html', import.meta.url), 'utf8');
const styleSource = await readFile(new URL('../modjam/style.css', import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const schedule = require('../modjam/modjam-schedule.js');

function loadPassportAwardNotes() {
  const testHook = '\n  globalThis.__passportAwardNotes = passportAwardNotes;\n})();';
  const instrumentedApp = appSource.replace(/\}\)\(\);\s*$/, testHook);
  assert.notEqual(instrumentedApp, appSource, 'could not install the passport award test hook');
  const sandbox = {
    console,
    document: {
      getElementById() { return {}; },
      addEventListener() {},
      querySelectorAll() { return []; }
    },
    window: { addEventListener() {} },
    fetch() { return new Promise(() => {}); }
  };
  vm.runInNewContext(instrumentedApp, sandbox);
  return sandbox.__passportAwardNotes;
}

function loadPostcardPicker() {
  const testHook = '\n  globalThis.__pickPostcards = pickPostcards;\n  globalThis.__setPostcardData = function (items) { postcardData = items; };\n})();';
  const instrumentedApp = appSource.replace(/\}\)\(\);\s*$/, testHook);
  assert.notEqual(instrumentedApp, appSource, 'could not install the postcard picker test hook');
  const sandbox = {
    console,
    document: {
      getElementById() { return {}; },
      addEventListener() {},
      querySelectorAll() { return []; }
    },
    window: { addEventListener() {} },
    fetch() { return new Promise(() => {}); }
  };
  vm.runInNewContext(instrumentedApp, sandbox);
  return sandbox;
}

const entries = archive.events.flatMap((event) => event.entries.map((entry) => ({ ...entry, event })));

test('the two spreadsheet exports are represented completely', () => {
  assert.equal(archive.summary.eventCount, 9);
  assert.equal(archive.summary.entryCount, 164);
  assert.equal(archive.summary.listedModderCount, 96);
  assert.equal(archive.summary.modderCount, 99);
  assert.equal(archive.summary.judgeAwardCount, 178);
  assert.equal(archive.summary.placardCount, 26);
});

test('local Modjam imagery uses the WebP asset folders', async () => {
  for (const event of archive.events.filter((candidate) => candidate.banner)) {
    assert.match(event.banner, /^assets\/banners\/.+\.webp$/);
    await access(new URL(`../modjam/${event.banner}`, import.meta.url));
  }

  const headerPaths = archive.events.flatMap((event) => event.headers || []);
  const uniqueHeaderPaths = [...new Set(headerPaths)].sort();
  assert.equal(headerPaths.length, archive.events.length);
  assert.deepEqual(uniqueHeaderPaths, [
    'assets/headers/header-spring.webp',
    'assets/headers/header-summer.webp',
    'assets/headers/header-winter.webp'
  ]);
  for (const header of headerPaths) {
    assert.match(header, /^assets\/headers\/header-(?:winter|spring|summer)\.webp$/);
    await access(new URL(`../modjam/${header}`, import.meta.url));
  }
  assert.ok(archive.events.every((event) => event.headers.length === 1));
  assert.deepEqual(
    archive.events.find((event) => event.id === 'summer-2021')?.headers,
    ['assets/headers/header-summer.webp']
  );
  assert.deepEqual(
    (await readdir(new URL('../modjam/assets/headers/', import.meta.url))).sort(),
    uniqueHeaderPaths.map((header) => header.replace('assets/headers/', '')).sort()
  );

  for (const eventId of ['summer-2021', 'summer-2023', 'winter-2025']) {
    assert.equal(
      archive.events.find((event) => event.id === eventId)?.banner,
      `assets/banners/${eventId.replace('-', ' ')}.webp`
    );
  }

  await access(new URL('../modjam/assets/images/modjam-open-graph.webp', import.meta.url));
  await access(new URL('../modjam/assets/images/trophy.webp', import.meta.url));
  await assert.rejects(access(new URL('../modjam/artwork/modjam-open-graph.png', import.meta.url)));
  await assert.rejects(access(new URL('../modjam/assets/images/trophy.png', import.meta.url)));
});

test('the entry archive groups filtered results beneath event headers', () => {
  assert.match(appSource, /function archiveEventGroup\(event, eventEntries\)/);
  assert.match(appSource, /archiveData\.events\.slice\(\)\.reverse\(\)\.map\(function \(event\)/);
  assert.match(appSource, /entryCard\(entry, \{ hideEvent: true \}\)/);
  assert.match(appSource, /class="archive-event-list" id="entry-results"/);
  assert.match(styleSource, /\.archive-event-header\s*\{/);
  assert.match(styleSource, /\.archive-event-header\s*\{[^}]*background:\s*transparent/);
  assert.doesNotMatch(styleSource.match(/\.archive-event-header\s*\{[^}]*\}/)?.[0] || '', /border:|box-shadow:/);
  assert.match(styleSource, /\.archive-event-art\s*\{[^}]*background:\s*transparent/);
  assert.match(styleSource, /\.archive-event-art\s*\{[^}]*aspect-ratio:\s*96\s*\/\s*23/);
  assert.match(styleSource, /\.archive-event-title\s*\{[^}]*var\(--postcard-script\)/);
  assert.match(styleSource, /\.archive-event-title\s*\{[^}]*font:\s*400 clamp\(40px,\s*6\.3vw,\s*96px\)/);
  assert.match(styleSource, /\.archive-event-title\s*\{[^}]*-webkit-text-stroke:\s*\.03em[^}]*paint-order:\s*stroke fill/);
  assert.match(styleSource, /\.archive-event-art--winter \.archive-event-title\s*\{[^}]*--event-title-fill:/);
  assert.match(styleSource, /\.archive-event-art--spring \.archive-event-title\s*\{[^}]*--event-title-fill:/);
});

test('the entry archive filters by year and season', () => {
  assert.match(appSource, /<span>Year<\/span><select id="year-filter"><option value="">All years<\/option>/);
  assert.match(appSource, /new Set\(archiveData\.events\.map\(function \(event\) \{ return event\.year; \}\)\)/);
  assert.match(appSource, /if \(year && String\(entry\.event\.year\) !== year\) return false;/);
  assert.match(appSource, /if \(season && entry\.event\.season !== season\) return false;/);
  assert.doesNotMatch(appSource, /id="event-filter"/);
});

test('postcards are assembled live from the complete WebP manifest on every Modjam page', async () => {
  const postcardFiles = (await readdir(new URL('../modjam/assets/postcards/thumbnail/', import.meta.url)))
    .filter((file) => file.endsWith('.webp'))
    .sort();
  const fullPostcardFiles = (await readdir(new URL('../modjam/assets/postcards/full/', import.meta.url)))
    .filter((file) => file.endsWith('.webp'))
    .sort();
  assert.deepEqual(postcardManifest.map((postcard) => postcard.file).sort(), postcardFiles);
  assert.deepEqual(fullPostcardFiles, postcardFiles);
  assert.ok(postcardFiles.every((file) => file === file.toLowerCase()));
  assert.ok(postcardManifest.filter((postcard) => postcard.caption).length >= 2);
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const profilesById = new Map(profiles.modders.map((modder) => [modder.id, modder]));
  for (const postcard of postcardManifest) {
    const entry = entriesById.get(postcard.entryId);
    assert.ok(entry, `${postcard.file} must reference an archive entry`);
    for (const author of entry.authors) {
      assert.ok(
        profilesById.get(author.id)?.entryIds.includes(entry.id),
        `${postcard.file} must connect ${entry.title} to ${author.name}'s profile`
      );
    }
  }
  assert.match(appSource, /function postcardBackdrop\(preferredEntryIds\)/);
  assert.match(appSource, /function renderPage\(html, preferredEntryIds\)\s*\{[\s\S]*?insertAdjacentHTML\('afterbegin', postcardBackdrop\(preferredEntryIds\)\)/);
  assert.match(appSource, /path === '\/modjam\/archive'\) return 4/);
  assert.match(appSource, /Math\.min\(viewportLimit, heightLimit\) \* postcardDensityMultiplier\(\)/);
  assert.match(appSource, /while \(postcards\.length < count\) postcards = postcards\.concat\(shuffledCopy\(postcardData\)\)/);
  for (const renderer of ['renderHome', 'renderFaq', 'renderArchive', 'renderModders', 'renderProfile']) {
    assert.match(appSource, new RegExp(`function ${renderer}\\([^)]*\\) \\{[\\s\\S]*?renderPage\\(`));
  }
  assert.match(appSource, /randomBetween\(-11, 11\)/);
  assert.match(appSource, /randomBetween\(0\.78, 1\.13\)/);
  assert.match(appSource, /var topStart = layoutHeight \* \(main\.classList\.contains\('is-home'\) \? 0\.28 : 0\.08\)/);
  assert.match(appSource, /Math\.min\(1\.28, 1 \+ \(sourceAspect - postcardAspect\) \* 0\.18\)/);
  assert.match(appSource, /src="assets\/postcards\/thumbnail\//);
  assert.match(appSource, /modjam_postcard_overlay\.webp/);
  assert.match(styleSource, /\.postcard-backdrop\s*\{[^}]*z-index:\s*1/);
  assert.match(styleSource, /main > :not\(\.postcard-backdrop\) > \*\s*\{[^}]*z-index:\s*2/);
  assert.match(styleSource, /main \.stat-ribbon\s*\{ z-index:\s*2/);
  assert.match(styleSource, /\.host-card\s*\{[^}]*background:\s*rgba\(20,\s*32,\s*45,\s*\.92\)/);
  assert.match(styleSource, /transform:\s*scale\(var\(--photo-zoom, 1\)\)/);
  assert.match(styleSource, /background-postcard--left \.background-postcard__message\s*\{[^}]*right:\s*8%/);
  assert.match(styleSource, /--postcard-script:\s*'Yellowtail'/);
  await access(new URL('../modjam/assets/images/modjam_postcard_overlay.webp', import.meta.url));
  await assert.rejects(access(new URL('../modjam/assets/images/modjam_postcard_overlay.png', import.meta.url)));
});

test('modder profiles put postcards from their credited mods first', () => {
  const sandbox = loadPostcardPicker();
  sandbox.__setPostcardData([
    { file: 'other.webp', entryId: 'other-entry' },
    { file: 'mine-one.webp', entryId: 'my-entry' },
    { file: 'mine-two.webp', entryId: 'my-entry' }
  ]);
  const selected = sandbox.__pickPostcards(3, ['my-entry']);
  assert.deepEqual(Array.from(selected.slice(0, 2), (postcard) => postcard.entryId), ['my-entry', 'my-entry']);
  assert.equal(selected[2].entryId, 'other-entry');
  assert.match(appSource, /renderPage\([^;]+, modder\.entryIds\);/);
});

test('visitors can build and download full-resolution Modjam postcards', async () => {
  const creatorSource = appSource.match(/function renderPostcardCreator\(\)[\s\S]*?\n  function renderArchive\(\)/)?.[0] || '';
  assert.match(indexSource, /href="\/modjam\/postcard" data-route data-nav="postcard">Postcard<\/a>/);
  assert.match(appSource, /path === '\/modjam\/postcard'[\s\S]*?setActiveNav\('postcard'\); renderPostcardCreator\(\)/);
  assert.match(creatorSource, /<canvas id="postcard-canvas" width="1920" height="1080"/);
  assert.match(creatorSource, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(creatorSource, /<input type="text" id="postcard-message-line-1" maxlength="72"/);
  assert.match(creatorSource, /<input type="text" id="postcard-message-line-2" maxlength="72"/);
  assert.match(creatorSource, /id="postcard-text-align"><option value="left">Left<\/option><option value="center">Center<\/option><option value="right">Right<\/option>/);
  assert.match(creatorSource, /id="postcard-text-size" min="44" max="200" value="86"/);
  assert.doesNotMatch(creatorSource, /postcard-text-rotation|textRotation/);
  assert.match(creatorSource, /context\.font = '400 ' \+ textSize \+ "px Yellowtail, 'Brush Script MT', cursive"/);
  assert.match(creatorSource, /\[messageLineOneInput, messageLineTwoInput\]\.forEach/);
  assert.match(creatorSource, /textAlignSelect\.addEventListener\('change'/);
  assert.match(creatorSource, /context\.textAlign = textAlign/);
  assert.match(creatorSource, /id="postcard-season"[^>]*aria-label="Season: Summer\. Switch to winter"/);
  assert.match(creatorSource, /seasonButton\.addEventListener\('click'/);
  assert.match(creatorSource, /setSeason\(activeSeason === 'summer' \? 'winter' : 'summer'\)/);
  assert.match(creatorSource, /context\.strokeStyle = '#C55222'/);
  assert.match(creatorSource, /context\.fillStyle = '#A1E4EB'/);
  assert.match(creatorSource, /return \[messageLineOneInput\.value\.trim\(\), messageLineTwoInput\.value\.trim\(\)\]/);
  assert.match(creatorSource, /textSizeInput\.addEventListener\('input'/);
  assert.match(creatorSource, /function postcardMessageHitTest\(x, y\)/);
  assert.match(creatorSource, /dragMode === 'text'/);
  assert.match(creatorSource, /data-postcard-text-nudge/);
  assert.match(creatorSource, /Math\.max\(canvas\.width \/ activeImage\.naturalWidth, canvas\.height \/ activeImage\.naturalHeight\)/);
  assert.match(creatorSource, /canvas\.addEventListener\('pointermove'/);
  assert.match(creatorSource, /canvas\.addEventListener\('wheel'/);
  assert.match(creatorSource, /canvas\.toBlob\([\s\S]*?'image\/png'\)/);
  assert.match(creatorSource, /context\.drawImage\(activeImage[\s\S]*?drawPostcardMessage\(\);\s+var overlayImage = overlayImages\[activeSeason\];\s+if \(overlayImage\.complete[^;]+context\.drawImage\(overlayImage[^;]+;\s+if \(stampInput\.checked/);
  assert.match(styleSource, /\.postcard-preview-wrap canvas\s*\{[^}]*touch-action:\s*none/);
  assert.doesNotMatch(creatorSource, /Greetings from Vvardenfell|Choose a view from the archive or bring your own screenshot/);
  assert.doesNotMatch(styleSource, /\.postcard-preview-wrap::(?:before|after)/);
  assert.match(styleSource, /\.postcard-page\s*\{[^}]*background:\s*transparent/);
  assert.ok(appSource.includes(String.raw`if (!/^[a-z0-9][a-z0-9 .()'_-]*\.webp$/i.test(file)) return '';`));
  const summerOverlay = await stat(new URL('../modjam/assets/postcards/modjam_postcard_overlay_full.webp', import.meta.url));
  const winterOverlay = await stat(new URL('../modjam/assets/postcards/modjam_postcard_winter_overlay_full.webp', import.meta.url));
  assert.ok(summerOverlay.size < 600_000, `summer postcard overlay is ${summerOverlay.size} bytes`);
  assert.ok(winterOverlay.size < 1_600_000, `winter postcard overlay is ${winterOverlay.size} bytes`);
  await access(new URL('../modjam/assets/postcards/modjam_postcard_overlay_full_stamp.webp', import.meta.url));
});

test('Modjam profiles use the shared Modathon avatar stash', async () => {
  for (const modder of profiles.modders.filter((candidate) => candidate.avatarUrl)) {
    const userId = modder.avatarUrl.match(/^https:\/\/avatars\.nexusmods\.com\/(\d+)\/100/i)?.[1];
    assert.ok(userId, `${modder.name} has an unsupported avatar URL`);
    assert.match(avatarManifest[userId] || '', /^\/assets\/images\/modder-avatars\/.+\.(?:webp|png|jpg|gif)$/);
    await access(new URL(`..${avatarManifest[userId]}`, import.meta.url));
  }
  assert.match(appSource, /modder-avatars\.json/);
});

test('modder profiles use the optimized illustrated passport', async () => {
  const passportPath = new URL('../modjam/assets/images/modjam_passport.webp', import.meta.url);
  const passport = await stat(passportPath);
  assert.ok(passport.size < 500_000, `passport asset is ${passport.size} bytes`);
  assert.match(appSource, /modjam_passport\.webp/);
  assert.match(appSource, /passport-stamp--/);
  assert.match(appSource, /passport-visas--left/);
  assert.match(appSource, /passportAwardNotes/);
  assert.match(appSource, /data-award-source/);
  assert.match(appSource, /PASSPORT_AWARD_MAX = 8/);
  assert.match(appSource, /candidates\.length < PASSPORT_AWARD_MAX/);
  assert.doesNotMatch(appSource, /Entry visas continued/i);
  assert.match(styleSource, /passport-visas--untitled/);
  assert.match(appSource, /noteHitsCircle/);
  assert.match(appSource, /renderPassportCanvas/);
  assert.match(appSource, /data-passport-download/);
  assert.match(appSource, /canvas\.toBlob\(resolve, 'image\/png'\)/);
  assert.match(appSource, /-modjam-passport\.png/);
  assert.match(styleSource, /"Courier New"/);
  assert.match(styleSource, /passport-award-note--wrapped/);
  assert.match(styleSource, /modjam_passport_mask\.png/);
  assert.match(appSource, /var upperLeftAwardGoal =/);
  assert.match(appSource, /var flatAwardLimit = Math\.max\(1, Math\.floor\(notes\.length \* \.25\)\)/);
  assert.match(appSource, /flatPlacedCount >= flatAwardLimit/);
  assert.match(appSource, /var rotationExcess = Math\.max\(0, Math\.abs\(angle\) - 18\) \/ 27/);
  assert.match(appSource, /var rotationPenalty = Math\.pow\(rotationExcess, 2\)/);
  assert.match(appSource, /\+ flatRotationPenalty \+ balancePenalty/);
  assert.match(appSource, /var verticalCrowdingPenalty =/);
  assert.match(appSource, /var horizontalCrowdingPenalty =/);
  assert.doesNotMatch(appSource, /var stampCrowdingPenalty =/);
  assert.match(appSource, /var horizontalEdgePenalty =/);
  assert.match(appSource, /var verticalEdgePenalty =/);
  assert.match(appSource, /var pageBalancePenalty =/);
  assert.doesNotMatch(appSource, /var gapDistance =/);
  assert.match(styleSource, /passport-visas--left \{ top: 44%/);
  assert.match(styleSource, /passport-visas-title::after/);
  assert.match(appSource, /var visaRuleY =/);
  assert.match(appSource, /wordmarkRect\.width \* \.25/);
  await access(new URL('../modjam/assets/images/modjam_passport_mask.png', import.meta.url));
  await assert.rejects(access(new URL('../modjam/assets/images/modjam_passport.png', import.meta.url)));
});

test('judge passports use a deduplicated roster and the WebP badge on page two', async () => {
  const judges = judgeRegistry.judges;
  const expectedListedNames = [
    'Narangren', 'mercurybard', 'Tizzo', 'Alandro Sul', 'Laken', 'Endify', 'Simpy', 'Voig',
    'Kleidium', 'Melchior Dahrk', 'johnnyhostile', 'Mort', 'Qualia', 'Tanzie', 'DimNussens',
    'Glittergear', 'Kildozeri', 'AxeMagister', 'Bluttier', 'Danae', 'Denina', 'Alice', 'HJ-12',
    'Merlord', 'OJ', 'ProfArmitage', 'RandomPal', 'Rubberman', 'Xero Foxx'
  ];
  assert.equal(judges.length, 29);
  assert.equal(new Set(judges.map((judge) => judge.modderId)).size, judges.length);
  assert.deepEqual(
    judges.map((judge) => judge.listedAs).sort((left, right) => left.localeCompare(right)),
    expectedListedNames.sort((left, right) => left.localeCompare(right))
  );

  const existingIds = new Set(profiles.modders.map((modder) => modder.id));
  assert.equal(judges.filter((judge) => !existingIds.has(judge.modderId)).length, 11);
  const judgesByListedName = new Map(judges.map((judge) => [judge.listedAs, judge]));
  assert.equal(judgesByListedName.get('Laken').modderId, 'hmcascade');
  assert.equal(judgesByListedName.get('Simpy').modderId, 'safebox');
  assert.equal(judgesByListedName.get('OJ').modderId, 'operatorjack');
  assert.equal(judgesByListedName.get('mercurybard').nexusProfileUrl, 'https://www.nexusmods.com/profile/mercurybard');
  assert.equal(judgesByListedName.get('mercurybard').avatarUrl, 'https://avatars.nexusmods.com/11622/100');
  for (const judge of judges.filter((candidate) => candidate.avatarUrl)) {
    const userId = judge.avatarUrl.match(/^https:\/\/avatars\.nexusmods\.com\/(\d+)\/100/i)?.[1];
    assert.ok(userId && avatarManifest[userId], `${judge.listedAs} judge avatar is not cached`);
  }

  const badge = await readFile(new URL('../modjam/assets/passport/judge_stamp.webp', import.meta.url));
  assert.equal(badge.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(badge.subarray(8, 12).toString('ascii'), 'WEBP');
  await assert.rejects(access(new URL('../modjam/assets/passport/judge_stamp.png', import.meta.url)));
  assert.match(appSource, /function hydrateJudgeProfiles\(registry\)/);
  assert.match(appSource, /fetch\('\.\/data\/judges\.json'\)/);
  assert.match(appSource, /passport-judge-badge[^\n]+judge_stamp\.webp/);
  assert.match(appSource, /book\.querySelector\('\.passport-judge-badge'\)/);
  assert.match(appSource, /context\.drawImage\(judgeBadge,/);
  const badgeRule = styleSource.match(/\.passport-judge-badge\s*\{[^}]+\}/)?.[0] || '';
  const badgeLeft = Number.parseFloat(badgeRule.match(/left:\s*([\d.]+)%/)?.[1]);
  const badgeWidth = Number.parseFloat(badgeRule.match(/width:\s*([\d.]+)%/)?.[1]);
  assert.match(badgeRule, /top:\s*15\.3%/);
  assert.match(badgeRule, /transform:\s*translateY\(-50%\)/);
  assert.ok(Math.abs(badgeWidth - 12.333 * .7) < 0.001, 'judge badge should be 70% of its previous size');
  assert.ok(badgeLeft + badgeWidth < 68, 'judge badge should clear the built-in Morrowind Modjam postmark');
});

test('passport awards fill every available slot after covering awarded entries', () => {
  const passportAwardNotes = loadPassportAwardNotes();
  const oneAwardHeavyMod = [{
    id: 'one-mod',
    title: 'One Mod',
    awards: ['First Award', 'Second Award', 'Third Award', 'Fourth Award', 'Fifth Award']
  }];
  const supplemented = passportAwardNotes({ id: 'one-modder' }, oneAwardHeavyMod);
  assert.equal((supplemented.match(/class="passport-award-note/g) || []).length, 5);
  assert.equal((supplemented.match(/data-award-source="one-mod"/g) || []).length, 5);

  const unevenWork = [
    {
      id: 'award-heavy-mod',
      title: 'Award-heavy Mod',
      awards: Array.from({ length: 8 }, (_, index) => `Heavy Award ${index}`)
    },
    { id: 'other-mod', title: 'Other Mod', awards: ['Other Mod Award'] }
  ];
  const balanced = passportAwardNotes({ id: 'two-modder' }, unevenWork);
  assert.equal((balanced.match(/class="passport-award-note/g) || []).length, 8);
  assert.equal((balanced.match(/data-award-source="other-mod"/g) || []).length, 1);

  for (const [modderName, expectedAwardCount] of [['Stripes', 3], ['Melchior Dahrk', 4]]) {
    const modder = profiles.modders.find((candidate) => candidate.name === modderName);
    const work = entries.filter((entry) => modder.entryIds.includes(entry.id));
    const passport = passportAwardNotes(modder, work);
    assert.equal(
      (passport.match(/class="passport-award-note/g) || []).length,
      expectedAwardCount,
      `${modderName} should receive all available award notes`
    );
  }

  const prolificWork = Array.from({ length: 10 }, (_, index) => ({
    id: `mod-${index}`,
    title: `Mod ${index}`,
    awards: [`Award ${index} Award`]
  }));
  const capped = passportAwardNotes({ id: 'prolific-modder' }, prolificWork);
  assert.equal((capped.match(/class="passport-award-note/g) || []).length, 8);
});

test('every credited author has a profile and every profile entry exists', () => {
  const profileIds = new Set(profiles.modders.map((modder) => modder.id));
  const entryIds = new Set(entries.map((entry) => entry.id));
  for (const entry of entries) {
    assert.ok(entry.authors.length > 0, `${entry.title} has no credited author`);
    for (const author of entry.authors) assert.ok(profileIds.has(author.id), `${author.name} has no profile`);
  }
  for (const modder of profiles.modders) {
    for (const entryId of modder.entryIds) assert.ok(entryIds.has(entryId), `${modder.name} references missing ${entryId}`);
  }
});

test('historical competition formats are kept distinct', () => {
  const winter2020 = archive.events.find((event) => event.id === 'winter-2020');
  const summer2020 = archive.events.find((event) => event.id === 'summer-2020');
  const spring2021 = archive.events.find((event) => event.id === 'spring-2021');
  const summer2021 = archive.events.find((event) => event.id === 'summer-2021');
  assert.equal(winter2020.competitionType, 'just-for-fun');
  assert.equal(summer2020.competitionType, 'just-for-fun');
  assert.equal(winter2020.entries.filter((entry) => entry.placement).length, 0);
  assert.equal(summer2020.entries.filter((entry) => entry.placement).length, 0);
  assert.equal(spring2021.competitionType, 'popular-choice');
  assert.equal(spring2021.entries.filter((entry) => entry.placement === 'popular-choice').length, 1);
  assert.equal(summer2021.competitionType, 'judged');
  assert.equal(summer2021.hasJudgeAwards, false);
  assert.equal(archive.events.find((event) => event.id === 'summer-2022').hasJudgeAwards, true);
});

test('homepage event cards link the available Modjam results streams', () => {
  const expectedStreams = {
    'spring-2021': 'https://www.youtube.com/watch?v=NWwshXaH_oA',
    'winter-2022': 'https://www.youtube.com/watch?v=VsUJgAfL0jU',
    'winter-2023': 'https://www.youtube.com/watch?v=Yenj8XSzY_c',
    'summer-2023': 'https://www.youtube.com/watch?v=WUQO6AGWEgc'
  };

  for (const event of archive.events) {
    assert.equal(event.resultsStreamUrl || null, expectedStreams[event.id] || null);
  }
  assert.match(appSource, /class="results-stream-link"/);
  assert.match(appSource, /<span>Results<\/span><span>Stream<\/span>/);
  assert.match(appSource, /target="_blank" rel="noopener" aria-label="Watch the/);
  assert.match(styleSource, /\.results-stream-link\s*\{[^}]*top:\s*12px[^}]*right:\s*9px/);
  assert.match(styleSource, /\.results-stream-link\s*\{[^}]*width:\s*72px[^}]*height:\s*50px/);
  assert.match(styleSource, /\.results-stream-link\s*\{[^}]*background:\s*#f03[^}]*color:\s*white/);
  assert.doesNotMatch(appSource, /results-stream-link[^\n]+(?:<svg|<img)/);
});

test('placards and delightfully specific awards remain attached to their entries', () => {
  const penguin = entries.find((entry) => entry.title === 'Penguin Island');
  const incense = entries.find((entry) => entry.title === 'The Pilgrimage of Incense');
  assert.ok(penguin.awards.some((award) => /Penguin/i.test(award)));
  assert.ok(penguin.awards.includes('"Mom, can I get a Penguin?" Award'));
  assert.match(penguin.awardPlacardUrl, /^https:\/\//);
  assert.ok(incense.awards.includes('Four Ancestors in a Trenchcoat Award'));
  assert.match(incense.awardPlacardUrl, /^https:\/\//);
});

test('the Summer 2026 countdown changes at the event boundaries', () => {
  const before = schedule.getCountdownView(new Date('2026-08-21T22:59:59Z'));
  const kickoff = schedule.getCountdownView(new Date('2026-08-21T23:00:00Z'));
  const live = schedule.getCountdownView(new Date('2026-08-22T00:00:00Z'));
  const complete = schedule.getCountdownView(new Date('2026-08-24T00:00:00Z'));
  assert.equal(before.mode, 'upcoming');
  assert.equal(before.title, 'Livestream begins in');
  assert.equal(before.eyebrow, '');
  assert.equal(kickoff.mode, 'upcoming');
  assert.equal(kickoff.title, 'The Modjam begins in');
  assert.deepEqual(kickoff.segments.slice(0, 2), [
    { value: '0', unit: 'days' },
    { value: '01', unit: 'hours' },
  ]);
  assert.equal(live.mode, 'live');
  assert.equal(live.title, 'The Modjam ends in');
  assert.deepEqual(live.segments.slice(0, 2), [
    { value: '2', unit: 'days' },
    { value: '00', unit: 'hours' },
  ]);
  assert.equal(complete.mode, 'complete');
  assert.equal(schedule.EVENT.kickoffStart, '2026-08-21T23:00:00Z');
  assert.equal(schedule.EVENT.start, '2026-08-22T00:00:00Z');
  assert.equal(schedule.EVENT.end, '2026-08-24T00:00:00Z');
  assert.match(appSource, /datetime="2026-08-21T23:00:00Z"/);
  assert.match(appSource, /datetime="2026-08-22T00:00:00Z"/);
  assert.match(appSource, /datetime="2026-08-24T00:00:00Z"/);
  assert.match(appSource, /container\.innerHTML\s*=\s*[^;]*\+ clock \+ detail;/);
  assert.match(appSource, /class="countdown-detail"/);
  assert.match(styleSource, /\.countdown-card\s*\{[^}]*repeating-linear-gradient/);
  assert.doesNotMatch(styleSource, /\.countdown-card\s*\{[^}]*url\(/);
  assert.match(styleSource, /\.countdown-card::before, \.countdown-card::after\s*\{[^}]*width:\s*44px[^}]*height:\s*14px/);
  assert.doesNotMatch(styleSource, /\.countdown-card::after\s*\{[^}]*border-radius:\s*50%/);
  assert.match(styleSource, /\.countdown-clock div\s*\{[^}]*rgba\(91,\s*57,\s*29,\s*\.09\)/);
});

test('the Modjam site gives the 2026 FAQ its own route and homepage link', async () => {
  const html = await readFile(new URL('../modjam/index.html', import.meta.url), 'utf8');
  assert.match(appSource, /Morrowind<br><img class="hero-title-image" src="assets\/images\/modjam_text\.png" alt="Modjam"/);
  assert.match(appSource, /You will have 48 hours to make and release a mod/);
  assert.match(appSource, /participants will have 48 hours to create and release a mod based on the selected themes/);
  assert.doesNotMatch(appSource, /release a Morrowind mod based on the selected themes/);
  assert.match(appSource, /class="hero-actions"[\s\S]*?href="\/modjam\/faq"/);
  assert.match(appSource, /function renderFaq\(\)/);
  assert.match(appSource, /path === '\/modjam\/faq'[\s\S]*?setActiveNav\('faq'\); renderFaq\(\)/);
  assert.match(html, /href="\/modjam\/faq" data-route data-nav="faq">FAQ<\/a>/);
  assert.match(appSource, /class="clear-filters-icon"/);
  assert.match(appSource, /https:\/\/www\.nexusmods\.com\/profile\/Danae123/);
  assert.match(appSource, /https:\/\/i\.imgur\.com\/7nytO4q\.png/);
  assert.doesNotMatch(appSource.match(/function renderHome\(\)[\s\S]*?\n  function renderFaq\(\)/)[0], /class="faq-section"/);
  assert.doesNotMatch(appSource, /Serious craft\.|Endless possibilities|Search every released mod|Browse every ModJam creator|A record of the honors created by Modjam judges/);
  assert.match(html, /<script src="\.\.\/nav\.js" defer><\/script>/);
  assert.match(html, /<mms-site-switcher current="modjam"><\/mms-site-switcher>/);
  assert.doesNotMatch(html, /aria-label="Elsewhere"/);
  assert.doesNotMatch(html, /<footer[\s\S]*?(?:YouTube|Patreon|Nexus Mods)[\s\S]*?<\/footer>/);
});

test('the Modjam passport uses concise download copy and no helper paragraph', () => {
  assert.match(appSource, /Download passport <svg class="lucide lucide-download" aria-hidden="true"/);
  assert.match(appSource, /<path d="M12 15V3"><\/path><path d="m17 10-5 5-5-5"><\/path>/);
  assert.doesNotMatch(appSource, /Download passport PNG/);
  assert.doesNotMatch(appSource, /Every stamp marks a weekend this modder joined the jam/);
});

test('profile section titles remain readable over postcards without redundant labels', () => {
  assert.match(appSource, /section-heading section-heading-panel passport-heading/);
  assert.match(appSource, /section-heading-panel"><h2>The trophy cabinet<\/h2>/);
  assert.match(appSource, /’s<br>Modjamography<\/h2>/);
  assert.doesNotMatch(appSource, /Official record/i);
  assert.doesNotMatch(appSource, /Placements &amp; judge awards/i);
  assert.doesNotMatch(appSource, /Complete Modjamography/i);
  assert.match(styleSource, /\.section-heading-panel\s*\{[^}]*background:\s*rgba\(22,\s*35,\s*49,\s*\.8\)/);
});

test('the trophy illustration appears in profile cabinets and the homepage Judge Awards block', () => {
  assert.match(appSource, /class="cabinet-trophy" src="assets\/images\/trophy\.webp"/);
  assert.match(appSource, /class="awards-trophy" src="assets\/images\/trophy\.webp"/);
  assert.match(appSource, /awards-showcase"><img class="awards-trophy"[\s\S]*?<div class="award-ribbons">/);
  assert.match(styleSource, /\.cabinet-card\s*\{[^}]*grid-template-columns:/);
  assert.match(styleSource, /\.awards-showcase\s*\{[^}]*grid-template-columns:\s*clamp\(110px,\s*12vw,\s*175px\)\s+minmax\(0,\s*1fr\)/);
});

test('judge awards use the entry archive instead of a redundant standalone page', () => {
  assert.doesNotMatch(indexSource, /href="\/modjam\/awards"/);
  assert.doesNotMatch(appSource, /function renderAwards\(/);
  assert.doesNotMatch(appSource, /path === '\/modjam\/awards'/);
  assert.match(appSource, /href="\/modjam\/archive\?result=awards" data-route>Browse award recipients/);
  assert.match(appSource, /var selectedResult = params\.get\('result'\) \|\| ''/);
  assert.match(appSource, /selectedResult === 'awards' \? ' selected' : ''/);
  assert.doesNotMatch(styleSource, /\.award-toolbar|\.award-entry(?:\W|$)/);
});

test('homepage copy uses translucent panels and equal-sized Modjammer cards', () => {
  assert.match(appSource, /section-heading-panel"><h2>The Modjam archive<\/h2>/);
  assert.match(appSource, /awards-marquee-copy section-heading-panel/);
  assert.match(appSource, /modder-callout-copy section-heading-panel/);
  assert.match(styleSource, /\.modder-callout\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)[^}]*align-items:\s*stretch/);
  assert.match(styleSource, /\.modder-callout > div\s*\{[^}]*width:\s*100%[^}]*max-width:\s*none/);
});
