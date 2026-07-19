import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [modjamApp, modjamStyles, madnessPage, madnessStyles] = await Promise.all([
  readFile(new URL('../modjam/app.js', import.meta.url), 'utf8'),
  readFile(new URL('../modjam/style.css', import.meta.url), 'utf8'),
  readFile(new URL('../madness/mods.html', import.meta.url), 'utf8'),
  readFile(new URL('../madness/style.css', import.meta.url), 'utf8'),
]);

test('ModJam entry cards render lazy Nexus pictures with a resilient fallback', () => {
  assert.match(modjamApp, /entryPicture\(entry\)/);
  assert.match(modjamApp, /safeUrl\(entry\.pictureUrl\)/);
  assert.match(modjamApp, /class="entry-card-picture/);
  assert.match(modjamApp, /loading="lazy" decoding="async"/);
  assert.match(modjamApp, /\.entry-card-picture img/);
  assert.match(modjamStyles, /\.entry-card-picture\s*\{/);
  assert.match(modjamStyles, /object-fit:\s*cover/);
});

test('Madness mod rows render responsive Nexus thumbnails with a fallback', () => {
  assert.match(madnessPage, /value="\{\{ m\.pictureUrl \}\}"/);
  assert.match(madnessPage, /class="mm-mod-picture"/);
  assert.match(madnessPage, /onError="\{\{ m\.imageError \}\}"/);
  assert.match(madnessPage, /noPicture:\s*!pictureUrl/);
  assert.match(madnessStyles, /\.mm-mod-row\s*\{/);
  assert.match(madnessStyles, /\.mm-mod-picture img\s*\{/);
  assert.match(madnessStyles, /@media \(max-width:\s*600px\)/);
});
