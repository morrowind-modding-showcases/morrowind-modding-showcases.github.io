const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const config = require('../assets/event-config.js');

function source(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('the shared event manifest contains valid current schedules', () => {
  assert.equal(config.schemaVersion, 1);

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
  assert.ok(madnessDates.every(Number.isFinite));
  assert.ok(madnessDates.every((value, index) => index === 0 || madnessDates[index - 1] < value));
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
