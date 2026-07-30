const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');

const certificate = require('../madness/certificate.js');
const repoRoot = path.resolve(__dirname, '..');

function entries(count) {
  return Array.from({ length: count }, (_, index) => ({
    year: 2016 + index,
    season: index + 1,
    name: `Team ${index + 1}`,
  }));
}

test('a first-time modder gets a scroll without ribbons', () => {
  const layout = certificate.layoutFor(entries(1), 'first-timer');

  assert.equal(layout.width, 3072);
  assert.equal(layout.height, 2048);
  assert.deepEqual(layout.ribbons, []);
});

test('seven Madness appearances fit six downward ribbons on the export', () => {
  const layout = certificate.layoutFor(entries(7), 'veteran');

  assert.equal(layout.width, 3072);
  assert.equal(layout.height, 2740);
  assert.equal(layout.ribbons.length, 6);
  assert.ok(layout.ribbons.every(ribbon => Math.abs(ribbon.angle) <= 3.5 * Math.PI / 180));
  assert.ok(layout.ribbons.every(ribbon => ribbon.centerX - ribbon.width / 2 > 0));
  assert.ok(layout.ribbons.every(ribbon => ribbon.centerX + ribbon.width / 2 < layout.width));
  assert.ok(layout.ribbons.every(ribbon => ribbon.top + ribbon.height < layout.height));
  assert.deepEqual(layout.ribbons.map(ribbon => ribbon.flipX), [false, true, false, true, false, true]);
  assert.ok(layout.ribbons[0].top < layout.ribbons[1].top);
  assert.ok(layout.ribbons[5].top < layout.ribbons[4].top);
  assert.ok(layout.ribbons[1].top < layout.ribbons[2].top);
  assert.ok(layout.ribbons[4].top < layout.ribbons[3].top);
});

test('ribbon rotations remain stable for the same modder history', () => {
  const first = certificate.layoutFor(entries(5), 'same-modder');
  const second = certificate.layoutFor(entries(5), 'same-modder');

  assert.deepEqual(
    first.ribbons.map(ribbon => [ribbon.centerX, ribbon.top, ribbon.angle]),
    second.ribbons.map(ribbon => [ribbon.centerX, ribbon.top, ribbon.angle]),
  );
});

test('a skipped year leaves an empty ribbon position when space is available', () => {
  const history = [
    { year: 2016, season: 1, name: 'First' },
    { year: 2017, season: 2, name: 'Second' },
    { year: 2018, season: 3, name: 'Third' },
    { year: 2019, season: 4, name: 'Fourth' },
    { year: 2022, season: 6, name: 'Sixth' },
    { year: 2023, season: 7, name: 'Seventh' },
  ];
  const layout = certificate.layoutFor(history, 'gap-year-modder');

  assert.deepEqual(
    layout.ribbons.map(ribbon => ribbon.centerX),
    [480, 900, 1320, 2160, 2580],
  );
});

test('season labels support the recorded Madness sequence', () => {
  assert.equal(certificate.roman(1), 'I');
  assert.equal(certificate.roman(9), 'IX');
  assert.equal(certificate.roman(10), 'X');
  assert.equal(certificate.roman(2016), 'MMXVI');
  assert.equal(certificate.ordinalSeason(1), 'First');
  assert.equal(certificate.ordinalSeason(8), 'Eighth');
  assert.equal(certificate.ordinalSeason(10), 'Tenth');
  assert.equal(certificate.ordinalNumber(2001), '2001st');
  assert.equal(certificate.ordinalNumber(2002), '2002nd');
  assert.equal(certificate.ordinalNumber(2003), '2003rd');
  assert.equal(certificate.ordinalNumber(2011), '2011th');
  assert.equal(certificate.ordinalNumber(2012), '2012th');
  assert.equal(certificate.ordinalNumber(2013), '2013th');
  assert.equal(certificate.ordinalNumber(2016), '2016th');
});

test('certificate artwork and layout masks are stored as WebP', () => {
  const assetDir = path.join(repoRoot, 'madness', 'assets', 'certificate');
  ['scroll.webp', 'ribbon.webp', 'scroll-mask.webp', 'ribbon-mask.webp'].forEach(file => {
    assert.equal(existsSync(path.join(assetDir, file)), true, `${file} should exist`);
  });

  const source = readFileSync(path.join(repoRoot, 'madness', 'certificate.js'), 'utf8');
  assert.match(source, /assets\/certificate\/scroll\.webp/);
  assert.match(source, /assets\/certificate\/ribbon\.webp/);
  assert.doesNotMatch(source, /assets\/certificate\/(?:scroll|ribbon)\.png/);
});
