import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';

const archive = JSON.parse(await readFile(new URL('../modjam/data/modjams.json', import.meta.url), 'utf8'));
const profiles = JSON.parse(await readFile(new URL('../modjam/data/modders.json', import.meta.url), 'utf8'));
const appSource = await readFile(new URL('../modjam/app.js', import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const schedule = require('../modjam/modjam-schedule.js');

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

test('modder profiles use the optimized illustrated passport', async () => {
  const passportPath = new URL('../modjam/assets/images/modjam_passport.webp', import.meta.url);
  const passport = await stat(passportPath);
  assert.ok(passport.size < 500_000, `passport asset is ${passport.size} bytes`);
  assert.match(appSource, /modjam_passport\.webp/);
  assert.match(appSource, /passport-stamp--/);
  assert.match(appSource, /Every stamp marks a weekend/);
  await assert.rejects(access(new URL('../modjam/assets/images/modjam_passport.png', import.meta.url)));
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
  const before = schedule.getCountdownView(new Date('2026-08-21T23:59:59-04:00'));
  const live = schedule.getCountdownView(new Date('2026-08-22T00:00:00-04:00'));
  const complete = schedule.getCountdownView(new Date('2026-08-24T00:00:00-04:00'));
  assert.equal(before.mode, 'upcoming');
  assert.equal(live.mode, 'live');
  assert.equal(complete.mode, 'complete');
  assert.equal(schedule.EVENT.dateLabel, 'August 22–23, 2026');
});
