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
});

test('ribbon rotations remain stable for the same modder history', () => {
  const first = certificate.layoutFor(entries(5), 'same-modder');
  const second = certificate.layoutFor(entries(5), 'same-modder');

  assert.deepEqual(
    first.ribbons.map(ribbon => [ribbon.centerX, ribbon.top, ribbon.angle]),
    second.ribbons.map(ribbon => [ribbon.centerX, ribbon.top, ribbon.angle]),
  );
});

test('season labels support the recorded Madness sequence', () => {
  assert.equal(certificate.roman(1), 'I');
  assert.equal(certificate.roman(9), 'IX');
  assert.equal(certificate.roman(10), 'X');
  assert.equal(certificate.ordinalSeason(1), 'First');
  assert.equal(certificate.ordinalSeason(8), 'Eighth');
  assert.equal(certificate.ordinalSeason(10), 'Tenth');
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
