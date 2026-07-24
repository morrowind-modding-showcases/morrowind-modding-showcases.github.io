import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../modathon/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../modathon/style.css', import.meta.url), 'utf8');

test('Modathon publishes the Info tab and route', () => {
  assert.match(html, /onClick="\{\{ goInfo \}\}">INFO<\/div>/);
  assert.match(html, /path === 'info'\) nextView = 'info'/);
  assert.match(html, /view === 'info'\) path = view/);
  assert.match(html, /isInfo: !loading && view === 'info'/);
});

test('the Info tab includes the supplied rules and FAQ content', () => {
  const info = html.match(/<!-- ============ INFO ============ -->([\s\S]*?)<!-- ============ MODDER PAGE ============ -->/)?.[1] || '';
  assert.equal((info.match(/class="info-rule-list"/g) || []).length, 1);
  assert.equal((info.match(/<details>/g) || []).length, 7);
  assert.match(info, /Limit submissions to five per day/);
  assert.match(info, /Part of the May Modathon Month/);
  assert.match(info, /When does my Modathon Legacy profile update\?/);
});

test('the Info tab supports responsive layouts and native disclosure controls', () => {
  assert.match(css, /\.info-layout\s*\{[\s\S]*?grid-template-columns:/);
  assert.match(css, /@media \(max-width: 760px\) \{[\s\S]*?\.info-layout\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.info-faq details\[open\] summary::after/);
});
