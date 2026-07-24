import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const historyUrl = new URL('modathon/history/index.html', root);
const historyHtml = await readFile(historyUrl, 'utf8');
const historyCss = await readFile(new URL('modathon/history/history.css', root), 'utf8');
const historyJs = await readFile(new URL('modathon/history/history.js', root), 'utf8');
const modathonHtml = await readFile(new URL('modathon/index.html', root), 'utf8');
const modathonCss = await readFile(new URL('modathon/style.css', root), 'utf8');

test('the Modathon navigation publishes the History tab', () => {
  assert.match(modathonHtml, /<a class="nav-button \{\{ navHistoryClass \}\}" href="\?view=history"[^>]*onClick="\{\{ goHistory \}\}">HISTORY<\/a>/);
  assert.match(historyHtml, /<a class="nav-button nav-button--idle" href="info">INFO<\/a>/);
  assert.match(historyHtml, /href="history\/" aria-current="page">HISTORY<\/a>/);
  assert.match(historyHtml, /<mms-site-switcher current="modathon"><\/mms-site-switcher>/);
});

test('history participates in the Modathon client-side router', () => {
  assert.match(modathonHtml, /if \(!path && requestedView === 'history'\) nextView = 'history'/);
  assert.match(modathonHtml, /view === 'history' \? '\/modathon\/\?view=history'/);
  assert.match(modathonHtml, /event\?\.\preventDefault\(\);\s*this\.nav\('history'\)/);
  assert.match(modathonHtml, /fetch\('history\/'\)/);
  assert.match(historyCss, /\.history-shell \.site-header-row \{\s*max-width: 1080px;/);
});

test('the cleaned history article reuses every annual banner', () => {
  for (let year = 2015; year <= 2026; year += 1) {
    const banner = `assets/images/banners/Modathon_${year}.webp`;
    assert.equal(historyHtml.split(banner).length - 1, 1, `${year} banner should be referenced once`);
  }

  const article = historyHtml.match(/<article class="history-article">([\s\S]*?)<\/article>/)?.[1] || '';
  assert.doesNotMatch(article, /\.(?:png|jpe?g)"/i);
  assert.doesNotMatch(article, /ahistoryofmorrowindmodathons|images\/image\d+/i);
});

test('all unique article artwork is optimized and present', async () => {
  const sources = [...historyHtml.matchAll(/src="(history\/assets\/[^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(sources).size, 27);
  assert.ok(sources.every(source => source.endsWith('.webp')));
  await Promise.all(sources.map(source => access(new URL(`modathon/${source}`, root))));
});

test('each annual statistics block is an interactive bar chart', () => {
  const charts = [...historyHtml.matchAll(/<figure class="history-chart" data-history-chart>([\s\S]*?)<\/figure>/g)];
  const expectedTotals = [15, 29, 29, 89, 240, 227, 236, 269, 184, 173, 179, 229];

  assert.equal(charts.length, 12);
  charts.forEach(([, chart], index) => {
    const year = 2015 + index;
    const total = [...chart.matchAll(/data-value="(\d+)"/g)]
      .reduce((sum, match) => sum + Number(match[1]), 0);
    assert.match(chart, new RegExp(`${year} RELEASE MIX`));
    assert.match(chart, /data-history-chart-sort/);
    assert.equal(total, expectedTotals[index]);
  });

  assert.doesNotMatch(historyHtml, /Replace with bar graph|Modathon Stats:/);
  assert.match(historyJs, /RESTORE SOURCE ORDER/);
  assert.match(historyJs, /Number\(right\.dataset\.value\)/);
});

test('history interactions remain accessible and responsive', () => {
  assert.match(historyHtml, /<dialog class="history-lightbox"/);
  assert.equal((historyHtml.match(/data-history-lightbox/g) || []).length, 39);
  assert.equal((historyHtml.match(/data-history-section/g) || []).length, 10);
  assert.doesNotMatch(historyHtml, /https:\/\/www\.google\.com\/url\?/);
  assert.match(historyJs, /prefers-reduced-motion/);
  assert.match(historyJs, /IntersectionObserver/);
  assert.match(historyCss, /@media \(max-width: 680px\)/);
  assert.match(historyCss, /@media \(prefers-reduced-motion: reduce\)/);
});

test('Modathon publishes the Info tab and route', () => {
  assert.match(modathonHtml, /onClick="\{\{ goInfo \}\}">INFO<\/div>/);
  assert.match(modathonHtml, /path === 'info'\) nextView = 'info'/);
  assert.match(modathonHtml, /view === 'info'\) path = view/);
  assert.match(modathonHtml, /isInfo: !loading && view === 'info'/);
});

test('the Info tab includes the supplied rules and FAQ content', () => {
  const info = modathonHtml.match(/<!-- ============ INFO ============ -->([\s\S]*?)<!-- ============ MODDER PAGE ============ -->/)?.[1] || '';
  assert.equal((info.match(/class="info-rule-list"/g) || []).length, 1);
  assert.equal((info.match(/<li class="info-rule-item">/g) || []).length, 5);
  assert.equal((info.match(/<details>/g) || []).length, 7);
  assert.match(info, /All types of mods are perfectly acceptable \(with the exception of any content restrictions mentioned in rule 2\)\./);
  assert.match(info, /Individual mod authors can submit up to 5 entries per day, but no more than that\./);
  assert.match(info, /Part of the May Modathon Month/);
  assert.match(info, /Okay, but what about my Modathon Profile on Modathon Legacy\? When does that update\?/);
  assert.doesNotMatch(info, /The Modathon is meant to be a competition open to all|First,|Second,|Third,|Fourth,|Fifth,/);
  assert.doesNotMatch(info, /BEFORE YOU SUBMIT|ENTER THE COMPETITION|COMMON QUESTIONS|<span>0[123]<\/span>/);
});

test('the Info tab supports responsive layouts and native disclosure controls', () => {
  assert.match(modathonCss, /\.info-layout\s*\{[\s\S]*?grid-template-columns:/);
  assert.match(modathonCss, /\.info-layout\s*\{[\s\S]*?align-items: stretch/);
  assert.match(modathonCss, /\.info-rule-item::before\s*\{[\s\S]*?content: counter\(info-rule\) '\.'/);
  assert.doesNotMatch(modathonCss, /\.info-rule-item\s*\{[^}]*border-top:/);
  assert.match(modathonCss, /@media \(max-width: 760px\) \{[\s\S]*?\.info-layout\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(modathonCss, /\.info-faq details\[open\] summary::after/);
});
