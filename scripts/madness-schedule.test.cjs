const assert = require('node:assert/strict');
const test = require('node:test');
const schedule = require('../madness/madness-schedule.js');

const at = value => Date.parse(value);

test('counts down to team registration at September 1, 12am UTC', () => {
  const state = schedule.getState(at('2026-08-31T23:00:00Z'));
  assert.deepEqual(state, {
    mode: 'registration',
    year: 2026,
    durationMs: 60 * 60 * 1000,
    targetMs: at('2026-09-01T00:00:00Z'),
    activeIndex: 0,
  });
});

test('moves to the competition countdown when registration opens', () => {
  const state = schedule.getState(at('2026-09-01T00:00:00Z'));
  assert.equal(state.mode, 'competition');
  assert.equal(state.targetMs, at('2026-10-01T00:00:00Z'));
  assert.equal(state.activeIndex, 1);
});

test('moves to the submission countdown when the competition starts', () => {
  const state = schedule.getState(at('2026-10-01T00:00:00Z'));
  assert.equal(state.mode, 'submissions');
  assert.equal(state.targetMs, at('2026-11-07T00:00:00Z'));
  assert.equal(state.activeIndex, 2);
});

test('moves to the bug-fixing countdown at the submission deadline', () => {
  const state = schedule.getState(at('2026-11-07T00:00:00Z'));
  assert.equal(state.mode, 'bugfix');
  assert.equal(state.targetMs, at('2026-11-15T00:00:00Z'));
  assert.equal(state.activeIndex, 3);
});

test('shows the event as over when the bug-fixing period ends', () => {
  const state = schedule.getState(at('2026-11-15T00:00:00Z'));
  assert.deepEqual(state, {
    mode: 'over',
    year: 2026,
    durationMs: 0,
    targetMs: at('2026-11-15T00:00:00Z'),
    activeIndex: 4,
  });
});

test('makes registration available only from September 1 through October 1', () => {
  assert.deepEqual(
    schedule.getRegistrationAvailability(at('2026-08-31T23:59:59Z'), ''),
    { isOpen: false, isTestMode: false, isFormAvailable: false },
  );
  assert.deepEqual(
    schedule.getRegistrationAvailability(at('2026-09-01T00:00:00Z'), ''),
    { isOpen: true, isTestMode: false, isFormAvailable: true },
  );
  assert.deepEqual(
    schedule.getRegistrationAvailability(at('2026-09-30T23:59:59Z'), ''),
    { isOpen: true, isTestMode: false, isFormAvailable: true },
  );
  assert.deepEqual(
    schedule.getRegistrationAvailability(at('2026-10-01T00:00:00Z'), ''),
    { isOpen: false, isTestMode: false, isFormAvailable: false },
  );
});

test('supports an explicit registration test preview outside the live window', () => {
  assert.deepEqual(
    schedule.getRegistrationAvailability(at('2026-07-17T12:00:00Z'), '?registration-test=1'),
    { isOpen: false, isTestMode: true, isFormAvailable: true },
  );
  assert.equal(
    schedule.getRegistrationAvailability(at('2026-07-17T12:00:00Z'), '?registration-test=true').isFormAvailable,
    false,
  );
});
