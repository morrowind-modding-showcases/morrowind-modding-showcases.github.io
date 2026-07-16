const assert = require('node:assert/strict');
const test = require('node:test');
const schedule = require('../modathon/modathon-schedule.js');

const at = value => Date.parse(value);

test('counts down to May 1 before Modathon', () => {
  const state = schedule.getState(at('2026-04-30T23:00:00Z'));
  assert.deepEqual(state, {
    mode: 'upcoming',
    year: 2026,
    durationMs: 60 * 60 * 1000,
    targetMs: at('2026-05-01T00:00:00Z'),
  });
});

test('counts down to June 2 while Modathon is live', () => {
  const state = schedule.getState(at('2026-05-01T00:00:00Z'));
  assert.equal(state.mode, 'live');
  assert.equal(state.year, 2026);
  assert.equal(state.targetMs, at('2026-06-02T00:00:00Z'));
});

test('counts up negatively during the twelve-hour grace period', () => {
  const state = schedule.getState(at('2026-06-02T06:30:00Z'));
  assert.equal(state.mode, 'grace');
  assert.equal(state.durationMs, (6 * 60 + 30) * 60 * 1000);
  assert.equal(state.targetMs, at('2026-06-02T12:00:00Z'));
});

test('shows the over state until July 1', () => {
  const state = schedule.getState(at('2026-06-30T23:59:59Z'));
  assert.equal(state.mode, 'over');
  assert.equal(state.year, 2026);
  assert.equal(state.targetMs, at('2026-07-01T00:00:00Z'));
});

test('resets to the following May after July 1', () => {
  const state = schedule.getState(at('2026-07-01T00:00:00Z'));
  assert.equal(state.mode, 'upcoming');
  assert.equal(state.year, 2027);
  assert.equal(state.targetMs, at('2027-05-01T00:00:00Z'));
});
