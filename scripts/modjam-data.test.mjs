import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const archive = JSON.parse(await readFile(new URL('../modjam/data/modjams.json', import.meta.url), 'utf8'));
const profiles = JSON.parse(await readFile(new URL('../modjam/data/modders.json', import.meta.url), 'utf8'));
const avatarManifest = JSON.parse(await readFile(new URL('../assets/data/modder-avatars.json', import.meta.url), 'utf8')).avatars;
const appSource = await readFile(new URL('../modjam/app.js', import.meta.url), 'utf8');
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

  for (const eventId of ['summer-2021', 'summer-2023', 'winter-2025']) {
    assert.equal(
      archive.events.find((event) => event.id === eventId)?.banner,
      `assets/banners/${eventId.replace('-', ' ')}.webp`
    );
  }

  await access(new URL('../modjam/assets/images/modjam-open-graph.webp', import.meta.url));
  await assert.rejects(access(new URL('../modjam/artwork/modjam-open-graph.png', import.meta.url)));
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
  await access(new URL('../modjam/assets/images/modjam_passport_mask.png', import.meta.url));
  await assert.rejects(access(new URL('../modjam/assets/images/modjam_passport.png', import.meta.url)));
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
  const before = schedule.getCountdownView(new Date('2026-08-20T23:59:59Z'));
  const live = schedule.getCountdownView(new Date('2026-08-21T00:00:00Z'));
  const kickoff = schedule.getCountdownView(new Date('2026-08-21T23:00:00Z'));
  const complete = schedule.getCountdownView(new Date('2026-08-23T00:00:00Z'));
  assert.equal(before.mode, 'upcoming');
  assert.equal(before.title, 'The Modjam');
  assert.equal(before.eyebrow, '');
  assert.equal(live.mode, 'live');
  assert.equal(kickoff.mode, 'live');
  assert.equal(complete.mode, 'complete');
  assert.equal(schedule.EVENT.kickoffStart, '2026-08-21T23:00:00Z');
  assert.equal(schedule.EVENT.start, '2026-08-21T00:00:00Z');
  assert.equal(schedule.EVENT.end, '2026-08-23T00:00:00Z');
  assert.match(styleSource, /\.countdown-card\s*\{[^}]*repeating-linear-gradient/);
  assert.doesNotMatch(styleSource, /\.countdown-card\s*\{[^}]*url\(/);
  assert.match(styleSource, /\.countdown-clock div\s*\{[^}]*rgba\(91,\s*57,\s*29,\s*\.09\)/);
});

test('the Modjam site gives the 2026 FAQ its own route and homepage link', async () => {
  const html = await readFile(new URL('../modjam/index.html', import.meta.url), 'utf8');
  assert.match(appSource, /Morrowind<br><em>ModJam<\/em>/);
  assert.match(appSource, /You will have 48 hours to make and release a mod/);
  assert.match(appSource, /class="hero-actions"[\s\S]*?href="\/modjam\/faq"/);
  assert.match(appSource, /function renderFaq\(\)/);
  assert.match(appSource, /path === '\/modjam\/faq'[\s\S]*?setActiveNav\('faq'\); renderFaq\(\)/);
  assert.match(html, /href="\/modjam\/faq" data-route data-nav="faq">FAQ<\/a>/);
  assert.match(appSource, /class="clear-filters-icon"/);
  assert.match(appSource, /https:\/\/www\.nexusmods\.com\/profile\/Danae123/);
  assert.match(appSource, /https:\/\/i\.imgur\.com\/7nytO4q\.png/);
  assert.doesNotMatch(appSource.match(/function renderHome\(\)[\s\S]*?\n  function renderFaq\(\)/)[0], /class="faq-section"/);
  assert.doesNotMatch(appSource, /Serious craft\.|Endless possibilities|Search every released mod|Browse every ModJam creator|A record of the honors created by Modjam judges/);
  assert.match(html, /href="\/modathon\/">Modathon<\/a>/);
  assert.match(html, /href="\/madness\/">Modding Madness<\/a>/);
  assert.doesNotMatch(html, /<footer[\s\S]*?(?:YouTube|Patreon|Nexus Mods)[\s\S]*?<\/footer>/);
});

test('the Modjam passport uses concise download copy and no helper paragraph', () => {
  assert.match(appSource, /Download passport <span aria-hidden="true">⤓<\/span>/);
  assert.doesNotMatch(appSource, /Download passport PNG/);
  assert.doesNotMatch(appSource, /Every stamp marks a weekend this modder joined the jam/);
});
