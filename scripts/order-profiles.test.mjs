import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [modathon, modjamHtml, modjamApp, madness, generated] = await Promise.all([
  readFile('modathon/index.html', 'utf8'),
  readFile('modjam/index.html', 'utf8'),
  readFile('modjam/app.js', 'utf8'),
  readFile('madness/modder.html', 'utf8'),
  readFile('assets/data/order-scores.json', 'utf8').then(JSON.parse),
]);

test('all existing modder profile sites load and display independent Order data', () => {
  for (const source of [modathon, modjamHtml, madness]) {
    assert.match(source, /assets\/order-score\.js/u);
  }
  for (const source of [modathon, modjamApp, madness]) {
    assert.match(source, /assets\/data\/order-scores\.json/u);
    assert.match(source, /MARK OF ORDER|Mark of Order/u);
    assert.match(source, /Order Score/u);
    assert.match(source, /Orderliness/u);
    assert.match(source, /profileView\([^)]*[\s\S]*?Date\.now\(\)/u);
  }
  assert.match(modathon, /assets\/data\/madness-scores\.json/u);
  assert.match(modjamApp, /assets\/data\/madness-scores\.json/u);
  assert.match(madness, /assets\/data\/madness-scores\.json/u);
});

test('generated Order data stores decay state rather than a current percentage', () => {
  assert.equal(generated.schemaVersion, 1);
  assert.ok(Object.keys(generated.modders).length > 0);
  for (const profile of Object.values(generated.modders)) {
    assert.ok(Object.hasOwn(profile, 'orderlinessAtLastActivity'));
    assert.ok(Object.hasOwn(profile, 'lastOrderActivityAt'));
    assert.equal(Object.hasOwn(profile, 'orderliness'), false);
  }
  assert.ok(Array.isArray(generated.unlinkedContributors));
});
