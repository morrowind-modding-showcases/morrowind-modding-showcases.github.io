const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const config = require('../assets/event-config.js');
const madnessSchedule = require('../madness/madness-schedule.js');
const modathonSchedule = require('../modathon/modathon-schedule.js');
const modjamSchedule = require('../modjam/modjam-schedule.js');

function source(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('the shared event manifest contains valid schedules for every event', () => {
  assert.equal(config.schemaVersion, 1);

  const modathonDates = Object.values(modathonSchedule.datesFor(2026));
  const modjamDates = [
    config.modjam.kickoffStart,
    config.modjam.start,
    config.modjam.end,
  ].map(Date.parse);
  assert.ok(modjamDates.every(Number.isFinite));
  assert.ok(modjamDates[0] < modjamDates[1]);
  assert.ok(modjamDates[1] < modjamDates[2]);

  const madnessDates = [
    config.madness.registration,
    config.madness.competition,
    config.madness.submissions,
    config.madness.bugFixEnd,
  ].map(Date.parse);

  for (const [name, dates] of [
    ['Modathon', modathonDates],
    ['Modjam', modjamDates],
    ['Madness', madnessDates],
  ]) {
    assert.ok(dates.every(Number.isFinite), `${name} contains an invalid date`);
    assert.ok(
      dates.every((value, index) => index === 0 || dates[index - 1] < value),
      `${name} dates are out of order`,
    );
  }

  assert.equal(new Date(config.madness.registration).getUTCFullYear(), config.madness.year);
  assert.match(config.madness.registrationFormId, /^[a-z0-9]+$/i);
});

test('event pages load the shared manifest before their schedule modules', () => {
  [
    ['modathon/index.html', '../assets/event-config.js', './modathon-schedule.js'],
    ['modjam/index.html', '../assets/event-config.js', './modjam-schedule.js'],
    ['madness/index.html', '../assets/event-config.js', './madness-schedule.js'],
    ['madness/register.html', '../assets/event-config.js', './madness-schedule.js'],
  ].forEach(([file, manifestPath, schedulePath]) => {
    const html = source(file);
    const manifestIndex = html.indexOf(`<script src="${manifestPath}"></script>`);
    const scheduleIndex = html.indexOf(`<script src="${schedulePath}"></script>`);
    assert.ok(manifestIndex >= 0, `${file} loads the event manifest`);
    assert.ok(scheduleIndex > manifestIndex, `${file} loads its schedule after the event manifest`);
  });
});

test('current event values no longer live in schedule or page source files', () => {
  assert.doesNotMatch(source('modjam/modjam-schedule.js'), /Summer Modjam 2026|2026-08-/);
  assert.doesNotMatch(source('modjam/app.js'), /datetime="2026-08-|https:\/\/i\.imgur\.com\/7nytO4q\.png/);
  assert.doesNotMatch(source('madness/madness-schedule.js'), /year:\s*2026|seasonNumber:\s*10/);
  assert.match(
    source('madness/register.html'),
    /const FORMSPREE_FORM_ID = MadnessSchedule\.EVENT\.registrationFormId;/,
  );
});

test('Modathon moves through its annual schedule states', () => {
  const year = 2026;
  const dates = modathonSchedule.datesFor(year);
  const nextDates = modathonSchedule.datesFor(year + 1);
  const transitions = [
    [dates.start - 60 * 60 * 1000, {
      mode: 'upcoming',
      year,
      durationMs: 60 * 60 * 1000,
      targetMs: dates.start,
    }],
    [dates.start, {
      mode: 'live',
      year,
      durationMs: dates.end - dates.start,
      targetMs: dates.end,
    }],
    [dates.end + 1000, {
      mode: 'grace',
      year,
      durationMs: 1000,
      targetMs: dates.graceEnd,
    }],
    [dates.reset - 1, {
      mode: 'over',
      year,
      durationMs: 0,
      targetMs: dates.reset,
    }],
    [dates.reset, {
      mode: 'upcoming',
      year: year + 1,
      durationMs: nextDates.start - dates.reset,
      targetMs: nextDates.start,
    }],
  ];

  for (const [timestamp, expected] of transitions) {
    assert.deepEqual(
      modathonSchedule.getState(timestamp),
      expected,
      `unexpected Modathon state at ${new Date(timestamp).toISOString()}`,
    );
  }
});

test('Madness moves through its configured schedule states', () => {
  const eventYear = madnessSchedule.EVENT_YEAR;
  const dates = madnessSchedule.datesFor(eventYear);
  const transitions = [
    [dates.registration - 60 * 60 * 1000, {
      mode: 'registration',
      year: eventYear,
      durationMs: 60 * 60 * 1000,
      targetMs: dates.registration,
      activeIndex: 0,
    }],
    [dates.registration, {
      mode: 'competition',
      year: eventYear,
      durationMs: dates.competition - dates.registration,
      targetMs: dates.competition,
      activeIndex: 1,
    }],
    [dates.competition, {
      mode: 'submissions',
      year: eventYear,
      durationMs: dates.submissions - dates.competition,
      targetMs: dates.submissions,
      activeIndex: 2,
    }],
    [dates.submissions, {
      mode: 'bugfix',
      year: eventYear,
      durationMs: dates.bugFixEnd - dates.submissions,
      targetMs: dates.bugFixEnd,
      activeIndex: 3,
    }],
    [dates.bugFixEnd, {
      mode: 'over',
      year: eventYear,
      durationMs: 0,
      targetMs: dates.bugFixEnd,
      activeIndex: 4,
    }],
  ];

  for (const [timestamp, expected] of transitions) {
    assert.deepEqual(
      madnessSchedule.getState(timestamp),
      expected,
      `unexpected Madness state at ${new Date(timestamp).toISOString()}`,
    );
  }
});

test('Madness registration follows its live window and explicit preview flag', () => {
  const dates = madnessSchedule.datesFor(madnessSchedule.EVENT_YEAR);
  const cases = [
    [dates.registration - 1, '', { isOpen: false, isTestMode: false, isFormAvailable: false }],
    [dates.registration, '', { isOpen: true, isTestMode: false, isFormAvailable: true }],
    [dates.competition - 1, '', { isOpen: true, isTestMode: false, isFormAvailable: true }],
    [dates.competition, '', { isOpen: false, isTestMode: false, isFormAvailable: false }],
    [dates.registration - 30 * 86400 * 1000, '?registration-test=1', {
      isOpen: false,
      isTestMode: true,
      isFormAvailable: true,
    }],
    [dates.registration - 30 * 86400 * 1000, '?registration-test=true', {
      isOpen: false,
      isTestMode: false,
      isFormAvailable: false,
    }],
  ];

  for (const [timestamp, search, expected] of cases) {
    assert.deepEqual(madnessSchedule.getRegistrationAvailability(timestamp, search), expected);
  }
});

test('Madness derives current-season labels and milestones from shared config', () => {
  const eventYear = madnessSchedule.EVENT_YEAR;
  const dates = madnessSchedule.datesFor(eventYear);
  const details = madnessSchedule.getEventDetails();
  const countdown = madnessSchedule.getCountdownView(dates.registration - 1000);

  assert.equal(details.eventYear, madnessSchedule.EVENT.year);
  assert.equal(details.seasonNumber, madnessSchedule.EVENT.seasonNumber);
  assert.equal(details.seasonRoman, madnessSchedule.toRoman(madnessSchedule.EVENT.seasonNumber));
  assert.match(details.seasonReturnLabel, new RegExp(String(eventYear)));
  assert.match(details.seasonReturnLabel, new RegExp(details.seasonRoman));
  assert.equal(countdown.eventScheduleAriaLabel, `Madness ${eventYear} schedule`);
  assert.deepEqual(
    countdown.countdownMilestones.map(milestone => milestone.datetime),
    [dates.registration, dates.competition, dates.submissions, dates.bugFixEnd]
      .map(timestamp => new Date(timestamp).toISOString()),
  );
});

test('Modjam countdown and published schedule change at the configured boundaries', () => {
  const kickoffAt = Date.parse(modjamSchedule.EVENT.kickoffStart);
  const startsAt = Date.parse(modjamSchedule.EVENT.start);
  const endsAt = Date.parse(modjamSchedule.EVENT.end);
  const before = modjamSchedule.getCountdownView(kickoffAt - 1);
  const kickoff = modjamSchedule.getCountdownView(kickoffAt);
  const live = modjamSchedule.getCountdownView(startsAt);
  const complete = modjamSchedule.getCountdownView(endsAt);

  assert.equal(before.mode, 'upcoming');
  assert.equal(before.title, 'Livestream begins in');
  assert.equal(before.eyebrow, '');
  assert.equal(kickoff.mode, 'upcoming');
  assert.equal(kickoff.title, 'The Modjam begins in');
  assert.equal(
    Number(kickoff.segments[0].value) * 24 + Number(kickoff.segments[1].value),
    Math.floor((startsAt - kickoffAt) / (60 * 60 * 1000)),
  );
  assert.equal(live.mode, 'live');
  assert.equal(live.title, 'The Modjam ends in');
  assert.equal(
    Number(live.segments[0].value) * 24 + Number(live.segments[1].value),
    Math.floor((endsAt - startsAt) / (60 * 60 * 1000)),
  );
  assert.equal(complete.mode, 'complete');
  assert.ok(kickoffAt < startsAt);
  assert.ok(startsAt < endsAt);
  assert.match(modjamSchedule.EVENT.participationBannerUrl, /^https?:\/\//);

  const eventSchedule = modjamSchedule.getEventSchedule();
  assert.equal(eventSchedule.ariaLabel, `${modjamSchedule.EVENT.name} schedule`);
  assert.equal(eventSchedule.kickoff.datetime, modjamSchedule.EVENT.kickoffStart);
  assert.equal(eventSchedule.event.startDatetime, modjamSchedule.EVENT.start);
  assert.equal(eventSchedule.event.endDatetime, modjamSchedule.EVENT.end);

  const appSource = source('modjam/app.js');
  const styleSource = source('modjam/style.css');
  assert.match(appSource, /function eventScheduleMarkup\(\)/);
  assert.match(appSource, /ModjamSchedule\.getEventSchedule\(\)/);
  assert.match(appSource, /container\.innerHTML\s*=\s*[^;]*\+ clock \+ detail;/);
  assert.match(appSource, /class="countdown-detail"/);
  assert.match(styleSource, /\.countdown-card\s*\{[^}]*repeating-linear-gradient/);
  assert.doesNotMatch(styleSource, /\.countdown-card\s*\{[^}]*url\(/);
  assert.match(styleSource, /\.countdown-card::before, \.countdown-card::after\s*\{[^}]*width:\s*44px[^}]*height:\s*14px/);
  assert.doesNotMatch(styleSource, /\.countdown-card::after\s*\{[^}]*border-radius:\s*50%/);
  assert.match(styleSource, /\.countdown-clock div\s*\{[^}]*rgba\(91,\s*57,\s*29,\s*\.09\)/);
});
