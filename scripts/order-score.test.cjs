const assert = require('node:assert/strict');
const test = require('node:test');

const Order = require('../assets/order-score.js');
const rules = require('../content/order-rules.json');

const DAY = 24 * 60 * 60 * 1000;
const modder = (overrides = {}) => ({
  id: 'greatness7',
  name: 'Greatness7',
  ...overrides,
});
const contribution = (overrides = {}) => ({
  schemaVersion: 1,
  submissionId: '123e4567-e89b-42d3-a456-426614174000',
  contributor: 'Greatness7',
  submittedAt: '2026-01-01T12:00:00.000Z',
  kind: 'edit-mod',
  pagePath: 'wiki/content/mods/example.md',
  pageTitle: 'Example',
  ...overrides,
});

test('Order contributor normalization preserves one matching identity', () => {
  assert.equal(Order.normalizedContributorName('Greatness7'), 'greatness7');
  assert.equal(Order.normalizedContributorName(' greatness7 '), 'greatness7');
  assert.equal(Order.normalizedContributorName('Greatness   7'), 'greatness 7');
  assert.equal(Order.normalizedContributorName('Ｇｒｅａｔｎｅｓｓ７'), 'greatness7');
});

test('historical contributor names resolve retroactively to a profile', () => {
  const document = Order.buildOrderDocument({
    rules,
    modders: [modder({ wiki: { contributorNames: ['Greatness7'] } })],
    contributions: [contribution()],
  });
  assert.equal(document.modders.greatness7.orderScore, 1);
  assert.equal(document.modders.greatness7.hasMarkOfOrder, true);
  assert.equal(document.modders.greatness7.orderlinessAtLastActivity, 20);
  assert.equal(document.modders.greatness7.orderActivityDays, 1);
  assert.deepEqual(document.unlinkedContributors, []);
});

test('a direct version-2 modderId is authoritative without a historical name mapping', () => {
  const document = Order.buildOrderDocument({
    rules,
    modders: [modder()],
    contributions: [contribution({
      schemaVersion: 2,
      contributor: 'Greatness7',
      contributorType: 'modder',
      modderId: 'greatness7',
    })],
  });
  assert.equal(document.modders.greatness7.orderScore, 1);
});

test('ambiguous normalized wiki contributor mappings identify both profiles', () => {
  assert.throws(
    () => Order.buildIdentityIndex([
      modder({ id: 'one', name: 'Modder One', wiki: { contributorNames: ['Example'] } }),
      modder({ id: 'two', name: 'Modder Two', wiki: { contributorNames: [' example '] } }),
    ]),
    /Modder One[\s\S]*Modder Two[\s\S]*example/u,
  );
});

test('unlinked contributors are generated, normalized, counted, and sorted', () => {
  const records = [
    contribution(),
    contribution({
      submissionId: '123e4567-e89b-42d3-a456-426614174001',
      contributor: ' greatness7 ',
    }),
    contribution({
      submissionId: '123e4567-e89b-42d3-a456-426614174002',
      contributor: 'Some Dunmer',
    }),
  ];
  const document = Order.buildOrderDocument({ rules, modders: [], contributions: records });
  assert.deepEqual(document.unlinkedContributors, [
    { contributor: 'Greatness7', contributions: 2 },
    { contributor: 'Some Dunmer', contributions: 1 },
  ]);
  assert.deepEqual(Order.externalContributors(records, []), ['Greatness7', 'Some Dunmer']);
});

test('a never-contributor has no score, Mark, Orderliness, or state', () => {
  const document = Order.buildOrderDocument({ rules, modders: [modder()], contributions: [] });
  const profile = document.modders.greatness7;
  const view = Order.profileView(profile, rules, Date.parse('2026-01-01T00:00:00Z'));
  assert.equal(view.orderScore, 0);
  assert.equal(view.hasMarkOfOrder, false);
  assert.equal(view.rawOrderliness, 0);
  assert.equal(view.displayOrderliness, 0);
  assert.equal(view.orderlinessState, '---');
});

test('multiple same-day edits all score but add only one Orderliness activity day', () => {
  const document = Order.buildOrderDocument({
    rules,
    modders: [modder({ wiki: { contributorNames: ['Greatness7'] } })],
    contributions: [
      contribution(),
      contribution({
        submissionId: '123e4567-e89b-42d3-a456-426614174001',
        submittedAt: '2026-01-01T18:00:00.000Z',
      }),
      contribution({
        submissionId: '123e4567-e89b-42d3-a456-426614174002',
        submittedAt: '2026-01-02T12:00:00.000Z',
      }),
    ],
  });
  const profile = document.modders.greatness7;
  assert.equal(profile.orderScore, 3);
  assert.equal(profile.orderActivityDays, 2);
  assert.equal(profile.hasMarkOfOrder, true);
  assert.ok(profile.orderlinessAtLastActivity > 39 && profile.orderlinessAtLastActivity < 40);
});

test('Orderliness state boundaries use raw values', () => {
  const cases = [
    [20, 'Initiate of Order'],
    [20.0001, 'Acolyte of Order'],
    [40, 'Acolyte of Order'],
    [40.0001, 'Oblate of Order'],
    [60, 'Oblate of Order'],
    [60.0001, 'High Oblate of Order'],
    [80, 'High Oblate of Order'],
    [80.0001, 'Champion of Order'],
    [100, 'Champion of Order'],
  ];
  for (const [raw, title] of cases) {
    assert.equal(Order.orderlinessState(raw, rules, true), title);
  }
});

test('Orderliness decay is deterministic and asymptotic toward one percent', () => {
  const from = '2026-01-01T00:00:00.000Z';
  const after = days => Date.parse(from) + days * DAY;
  assert.ok(Math.abs(Order.decayOrderliness(100, from, after(30), rules) - 65) < 0.15);
  assert.ok(Math.abs(Order.decayOrderliness(100, from, after(90), rules) - 27.7) < 0.15);
  const year = Order.decayOrderliness(100, from, after(365), rules);
  assert.ok(Math.abs(year - 1.49) < 0.02);
  assert.equal(Math.max(1, Math.round(year)), 1);
  const distant = Order.decayOrderliness(100, from, after(10_000), rules);
  assert.ok(distant > 1);
  assert.equal(Order.orderlinessState(distant, rules, true), 'Initiate of Order');
});

test('advancing the injected clock changes only current Orderliness', () => {
  const document = Order.buildOrderDocument({
    rules,
    modders: [modder({ wiki: { contributorNames: ['Greatness7'] } })],
    contributions: [contribution()],
  });
  const profile = document.modders.greatness7;
  const now = Date.parse(profile.lastOrderActivityAt);
  const current = Order.profileView(profile, rules, now);
  const later = Order.profileView(profile, rules, now + 365 * DAY);
  assert.ok(current.rawOrderliness > later.rawOrderliness);
  assert.equal(current.orderScore, later.orderScore);
  assert.equal(current.hasMarkOfOrder, later.hasMarkOfOrder);
});
