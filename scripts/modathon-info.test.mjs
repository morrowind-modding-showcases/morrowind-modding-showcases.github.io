import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const infoHtml = await readFile(new URL('modathon/info/index.html', root), 'utf8');
const infoCss = await readFile(new URL('modathon/info/info.css', root), 'utf8');
const historyHtml = await readFile(new URL('modathon/history/index.html', root), 'utf8');
const modathonHtml = await readFile(new URL('modathon/index.html', root), 'utf8');

test('the Modathon navigation publishes the Info tab on every Modathon surface', () => {
  assert.match(modathonHtml, /href="info\/">INFO<\/a>/);
  assert.match(historyHtml, /href="info\/">INFO<\/a>/);
  assert.match(infoHtml, /href="info\/" aria-current="page">INFO<\/a>/);
  assert.match(infoHtml, /href="history\/">HISTORY<\/a>/);
  assert.match(infoHtml, /<mms-site-switcher current="modathon"><\/mms-site-switcher>/);
});

test('the supplied rules and FAQ are represented completely', () => {
  assert.equal((infoHtml.match(/<li>\s*<div class="info-rule-copy">/g) || []).length, 5);
  assert.equal((infoHtml.match(/<article class="info-faq-card(?: info-faq-card--featured)?">/g) || []).length, 8);

  const requiredDetails = [
    'May 1st at 12am UTC',
    'June 2nd at 12pm UTC',
    'up to 5 entries per day',
    'Part of the May Modathon Month',
    'usually between July 3rd–7th',
    'at least a 10% win rate',
    'your shiny new achievement badges',
  ];

  for (const detail of requiredDetails) {
    assert.ok(infoHtml.includes(detail), `missing supplied detail: ${detail}`);
  }
});

test('the Info page reuses the History presentation without copied document formatting', () => {
  assert.match(infoHtml, /href="history\/history\.css"/);
  assert.match(infoHtml, /src="history\/history\.js" defer/);
  assert.equal((infoHtml.match(/data-history-section/g) || []).length, 6);
  assert.doesNotMatch(infoHtml, /class="c\d|font-family:"Arial"|docs\.google\.com/);
  assert.match(infoCss, /@media \(max-width: 680px\)/);
  assert.match(infoCss, /@media print/);
});
