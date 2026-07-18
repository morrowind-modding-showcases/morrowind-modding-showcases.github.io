const assert = require('node:assert/strict');
const test = require('node:test');
const schedule = require('../madness/madness-schedule.js');

const eventYear = schedule.EVENT_YEAR;
const dates = schedule.datesFor(eventYear);

test('counts down to team registration at September 1, 12am UTC', () => {
  const state = schedule.getState(dates.registration - 60 * 60 * 1000);
  assert.deepEqual(state, {
    mode: 'registration',
    year: eventYear,
    durationMs: 60 * 60 * 1000,
    targetMs: dates.registration,
    activeIndex: 0,
  });
});

test('moves to the competition countdown when registration opens', () => {
  const state = schedule.getState(dates.registration);
  assert.equal(state.mode, 'competition');
  assert.equal(state.targetMs, dates.competition);
  assert.equal(state.activeIndex, 1);
});

test('moves to the submission countdown when the competition starts', () => {
  const state = schedule.getState(dates.competition);
  assert.equal(state.mode, 'submissions');
  assert.equal(state.targetMs, dates.submissions);
  assert.equal(state.activeIndex, 2);
});

test('moves to the bug-fixing countdown at the submission deadline', () => {
  const state = schedule.getState(dates.submissions);
  assert.equal(state.mode, 'bugfix');
  assert.equal(state.targetMs, dates.bugFixEnd);
  assert.equal(state.activeIndex, 3);
});

test('shows the event as over when the bug-fixing period ends', () => {
  const state = schedule.getState(dates.bugFixEnd);
  assert.deepEqual(state, {
    mode: 'over',
    year: eventYear,
    durationMs: 0,
    targetMs: dates.bugFixEnd,
    activeIndex: 4,
  });
});

test('makes registration available only from September 1 through October 1', () => {
  assert.deepEqual(
    schedule.getRegistrationAvailability(dates.registration - 1, ''),
    { isOpen: false, isTestMode: false, isFormAvailable: false },
  );
  assert.deepEqual(
    schedule.getRegistrationAvailability(dates.registration, ''),
    { isOpen: true, isTestMode: false, isFormAvailable: true },
  );
  assert.deepEqual(
    schedule.getRegistrationAvailability(dates.competition - 1, ''),
    { isOpen: true, isTestMode: false, isFormAvailable: true },
  );
  assert.deepEqual(
    schedule.getRegistrationAvailability(dates.competition, ''),
    { isOpen: false, isTestMode: false, isFormAvailable: false },
  );
});

test('supports an explicit registration test preview outside the live window', () => {
  assert.deepEqual(
    schedule.getRegistrationAvailability(dates.registration - 30 * 86400 * 1000, '?registration-test=1'),
    { isOpen: false, isTestMode: true, isFormAvailable: true },
  );
  assert.equal(
    schedule.getRegistrationAvailability(dates.registration - 30 * 86400 * 1000, '?registration-test=true').isFormAvailable,
    false,
  );
});

test('derives current-season labels and countdown milestones from shared config', () => {
  const details = schedule.getEventDetails();
  const countdown = schedule.getCountdownView(dates.registration - 1000);

  assert.equal(details.eventYear, schedule.EVENT.year);
  assert.equal(details.seasonNumber, schedule.EVENT.seasonNumber);
  assert.equal(details.seasonRoman, schedule.toRoman(schedule.EVENT.seasonNumber));
  assert.match(details.seasonReturnLabel, new RegExp(String(eventYear)));
  assert.match(details.seasonReturnLabel, new RegExp(details.seasonRoman));
  assert.equal(countdown.eventScheduleAriaLabel, `Madness ${eventYear} schedule`);
  assert.deepEqual(
    countdown.countdownMilestones.map(milestone => milestone.datetime),
    [dates.registration, dates.competition, dates.submissions, dates.bugFixEnd]
      .map(timestamp => new Date(timestamp).toISOString()),
  );
});
