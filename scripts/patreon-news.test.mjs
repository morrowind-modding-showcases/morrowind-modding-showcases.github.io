import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  formatNewsDate,
  htmlToPlainText,
  loadNewsFeed,
  makeExcerpt,
  renderNewsPosts,
} from '../assets/js/patreon-news.js';
import { buildSite, publicDirectories } from './build-site.mjs';

const sharedModuleSource = await readFile(new URL('../assets/js/patreon-news.js', import.meta.url), 'utf8');
const homePage = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const homeNewsSource = await readFile(new URL('../assets/js/home-news.js', import.meta.url), 'utf8');
const newsPage = await readFile(new URL('../news/index.html', import.meta.url), 'utf8');
const newsStyles = await readFile(new URL('../news/news.css', import.meta.url), 'utf8');
const resourcesPage = await readFile(new URL('../resources/index.html', import.meta.url), 'utf8');
const sharedNav = await readFile(new URL('../nav.js', import.meta.url), 'utf8');

class FakeNode {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.className = '';
    this._textContent = '';
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes) {
    this._textContent = '';
    this.children = [...nodes];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }

  get textContent() {
    return this._textContent + this.children.map(child => child.textContent).join('');
  }
}

class FakeDocument {
  createElement(tagName) {
    return new FakeNode(tagName.toLowerCase(), this);
  }

  createDocumentFragment() {
    return new FakeNode('#fragment', this);
  }
}

function createContainer() {
  const documentRef = new FakeDocument();
  return new FakeNode('div', documentRef);
}

function findElements(node, tagName) {
  return [
    ...(node.tagName === tagName ? [node] : []),
    ...node.children.flatMap(child => findElements(child, tagName)),
  ];
}

function post(index, overrides = {}) {
  return {
    id: String(index),
    title: `Update ${index}`,
    contentHtml: `<p>Details for update ${index} with enough useful context for readers.</p>`,
    publishedAt: `2026-01-${String(index).padStart(2, '0')}T12:00:00.000Z`,
    url: `https://www.patreon.com/posts/update-${index}`,
    ...overrides,
  };
}

function successfulFetch(posts) {
  return async () => ({
    ok: true,
    status: 200,
    async json() {
      return { posts };
    },
  });
}

test('the site build stages the News page and its shared client assets', async () => {
  assert.ok(publicDirectories.includes('news'));

  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), 'mms-news-build-'));
  try {
    await buildSite({
      outputDirectory,
      prepareContent: false,
      filesToCopy: [],
      directoriesToCopy: ['news', 'assets/js', 'assets/css'],
      generateDerivedData: false,
    });
    const [builtNewsPage, builtModule, builtStyles] = await Promise.all([
      readFile(path.join(outputDirectory, 'news', 'index.html'), 'utf8'),
      readFile(path.join(outputDirectory, 'assets', 'js', 'patreon-news.js'), 'utf8'),
      readFile(path.join(outputDirectory, 'assets', 'css', 'patreon-news.css'), 'utf8'),
    ]);

    assert.match(builtNewsPage, /<mms-site-switcher current="news"/);
    assert.match(builtModule, /export async function fetchNews/);
    assert.match(builtStyles, /\.news-card/);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test('the shared navigation and News page expose the new top-level section', () => {
  assert.match(sharedNav, /\{ id: 'news', href: '\/news\/', label: 'News' \}/);
  assert.match(sharedNav, /:host\(\[current="news"\]\)/);
  assert.match(newsPage, /<script src="\.\.\/nav\.js" defer><\/script>/);
  assert.match(newsPage, /<mms-site-switcher current="news" placement="overlay">/);
});

test('the News page follows the Resources page shell, hero, panel, and footer styling', () => {
  for (const className of ['hero', 'hero-art', 'hero-wash', 'hero-content', 'hero-logo', 'hero-subtitle', 'footer-inner']) {
    assert.match(resourcesPage, new RegExp(`class="${className}"`));
    assert.match(newsPage, new RegExp(`class="${className}"`));
  }

  assert.match(newsPage, /<img class="hero-logo" src="\.\.\/assets\/images\/logo\.webp" alt="Dark Elf Modding logo">/);
  assert.match(newsPage, /<img src="\.\.\/assets\/images\/deg\.webp" alt="darkelfguy portrait">/);
  assert.match(newsStyles, /\.site-shell \{[\s\S]*?radial-gradient\(circle at 50% 22%/);
  assert.match(newsStyles, /main \{[\s\S]*?max-width: 1240px;[\s\S]*?padding: 48px 24px 72px;/);
  assert.match(newsStyles, /\.news-panel \{[\s\S]*?background: var\(--panel\);[\s\S]*?border: 1px solid var\(--line\);/);
});

test('valid posts render newest-first with dates, excerpts, and safe Patreon links', () => {
  const container = createContainer();
  const rendered = renderNewsPosts(container, [post(1), post(3), post(2)]);
  const articles = findElements(container, 'article');

  assert.deepEqual(rendered.map(item => item.id), ['3', '2', '1']);
  assert.equal(articles.length, 3);
  assert.equal(findElements(articles[0], 'h2')[0].textContent, 'Update 3');
  assert.equal(findElements(articles[0], 'time')[0].textContent, 'January 3, 2026');
  assert.match(findElements(articles[0], 'p')[0].textContent, /Details for update 3/);

  const link = findElements(articles[0], 'a')[0];
  assert.equal(link.href, 'https://www.patreon.com/posts/update-3');
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener noreferrer');
  assert.equal(link.textContent, 'Read on Patreon →');
});

test('Patreon HTML becomes a word-safe plain-text excerpt and is never injected', () => {
  const html = '<p>Hello <strong>world</strong> &amp; friends.</p>'
    + '<script>window.evil = true</script><p>Second paragraph.</p>';
  const plainText = htmlToPlainText(html, { DOMParserImpl: undefined });
  const excerpt = makeExcerpt(`${plainText} ${'additional words '.repeat(30)}`, 90);
  const container = createContainer();

  renderNewsPosts(container, [
    post(1, {
      title: '<img src=x onerror=alert(1)>A safe title',
      contentHtml: html,
    }),
    post(2, { url: 'javascript:alert(1)' }),
  ]);

  assert.equal(plainText, 'Hello world & friends. Second paragraph.');
  assert.ok(excerpt.length <= 91);
  assert.match(excerpt, /…$/);
  assert.equal(findElements(container, 'img').length, 0);
  assert.equal(findElements(container, 'script').length, 0);
  assert.equal(findElements(container, 'article').length, 1);
  assert.match(findElements(container, 'h2')[0].textContent, /^<img src=x onerror=alert\(1\)>/);
  assert.doesNotMatch(sharedModuleSource, /\.innerHTML\b/);
  assert.match(sharedModuleSource, /\.textContent\s*=/);
});

test('the homepage feed uses the shared loader and limits output to three posts', async () => {
  const container = createContainer();
  const result = await loadNewsFeed({
    container,
    fetchImpl: successfulFetch([post(1), post(2), post(3), post(4), post(5)]),
    limit: 3,
    headingLevel: 3,
  });

  assert.equal(result.status, 'ready');
  assert.equal(findElements(container, 'article').length, 3);
  assert.deepEqual(findElements(container, 'h3').map(heading => heading.textContent), [
    'Update 5',
    'Update 4',
    'Update 3',
  ]);
  assert.match(homePage, /<h2[^>]*>Latest News<\/h2>/);
  assert.match(homePage, /href="\/news\/">View all news →<\/a>/);
  assert.match(homePage, /src="\.\/assets\/js\/home-news\.js"/);
  assert.match(homeNewsSource, /limit: 3/);
});

test('an empty feed renders a restrained empty state', async () => {
  const container = createContainer();
  const result = await loadNewsFeed({
    container,
    fetchImpl: successfulFetch([]),
  });

  assert.equal(result.status, 'empty');
  assert.equal(container.dataset.state, 'empty');
  assert.equal(container.textContent, 'No news has been published yet.');
  assert.equal(findElements(container, 'article').length, 0);
});

test('failed fetches render the archive message and can collapse the homepage section', async () => {
  const archiveContainer = createContainer();
  const archiveResult = await loadNewsFeed({
    container: archiveContainer,
    fetchImpl: async () => { throw new Error('offline'); },
  });

  let homepageCollapsed = false;
  const homeResult = await loadNewsFeed({
    container: createContainer(),
    fetchImpl: async () => ({ ok: false, status: 503 }),
    onError: () => { homepageCollapsed = true; },
  });

  assert.equal(archiveResult.status, 'error');
  assert.equal(archiveContainer.textContent, 'News could not be loaded right now.');
  assert.equal(homeResult.status, 'error');
  assert.equal(homepageCollapsed, true);
  assert.match(homeNewsSource, /section\.hidden = true/);
});

test('date formatting is stable for valid values and empty for invalid values', () => {
  assert.equal(formatNewsDate('2026-04-05T23:00:00Z'), 'April 5, 2026');
  assert.equal(formatNewsDate('not-a-date'), '');
});
