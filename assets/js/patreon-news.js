export const PATREON_NEWS_ENDPOINT =
  'https://patreon-webhook-test.melchior-dahrk.workers.dev/posts';

const BLOCK_TAGS =
  /<\s*\/?\s*(?:address|article|aside|blockquote|br|div|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi;
const DISCARDED_ELEMENTS = /<\s*(script|style|noscript|template)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;

function collapseWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function decodeBasicEntities(value) {
  const namedEntities = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };

  return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi, (entity, code) => {
    if (code[0] !== '#') return namedEntities[code.toLowerCase()] ?? entity;

    const radix = code[1].toLowerCase() === 'x' ? 16 : 10;
    const number = Number.parseInt(code.slice(radix === 16 ? 2 : 1), radix);
    if (!Number.isFinite(number) || number < 0 || number > 0x10ffff) return entity;

    try {
      return String.fromCodePoint(number);
    } catch {
      return entity;
    }
  });
}

export function htmlToPlainText(contentHtml, { DOMParserImpl = globalThis.DOMParser } = {}) {
  const source = String(contentHtml ?? '')
    .replace(DISCARDED_ELEMENTS, ' ')
    .replace(BLOCK_TAGS, ' ');
  const markupFreeText = source.replace(/<[^>]*>/g, ' ');

  if (typeof DOMParserImpl === 'function') {
    // Strip tags before parsing so the inert document is only used to decode
    // character references and cannot request embedded external resources.
    const parsed = new DOMParserImpl().parseFromString(markupFreeText, 'text/html');
    return collapseWhitespace(parsed.body?.textContent ?? '');
  }

  return collapseWhitespace(decodeBasicEntities(markupFreeText));
}

export function makeExcerpt(value, maxLength = 260) {
  const text = collapseWhitespace(value);
  const safeMaxLength = Number.isFinite(maxLength) ? Math.max(40, Math.floor(maxLength)) : 260;
  if (text.length <= safeMaxLength) return text;

  const candidate = text.slice(0, safeMaxLength + 1);
  const wordBoundary = candidate.lastIndexOf(' ');
  const cutoff = wordBoundary >= Math.floor(safeMaxLength * 0.65)
    ? wordBoundary
    : safeMaxLength;

  return `${candidate.slice(0, cutoff).trimEnd()}…`;
}

export function formatNewsDate(value, locale = 'en-US') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
}

function safePatreonUrl(value) {
  try {
    const url = new URL(String(value));
    const hostname = url.hostname.toLowerCase();
    const isPatreonHost = hostname === 'patreon.com' || hostname.endsWith('.patreon.com');
    return url.protocol === 'https:' && isPatreonHost ? url.href : '';
  } catch {
    return '';
  }
}

function normalizePost(post) {
  if (!post || typeof post !== 'object') return null;

  const title = collapseWhitespace(post.title);
  const publishedDate = new Date(post.publishedAt);
  const url = safePatreonUrl(post.url);
  if (!title || Number.isNaN(publishedDate.getTime()) || !url) return null;

  return {
    id: typeof post.id === 'string' ? post.id : '',
    title,
    contentHtml: typeof post.contentHtml === 'string' ? post.contentHtml : '',
    publishedAt: publishedDate.toISOString(),
    url,
  };
}

export function normalizeNewsPosts(posts) {
  if (!Array.isArray(posts)) return [];

  return posts
    .map(normalizePost)
    .filter(Boolean)
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
}

export async function fetchNews({
  endpoint = PATREON_NEWS_ENDPOINT,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');

  const response = await fetchImpl(endpoint, {
    headers: { Accept: 'application/json' },
  });

  if (!response?.ok) {
    throw new Error(`News request failed with status ${response?.status ?? 'unknown'}.`);
  }

  const payload = await response.json();
  if (!payload || !Array.isArray(payload.posts)) {
    throw new TypeError('News response did not contain a posts array.');
  }

  return normalizeNewsPosts(payload.posts);
}

function setFeedState(container, state) {
  container.dataset.state = state;
  container.setAttribute('aria-busy', 'false');
}

function renderStatus(container, message, state) {
  const documentRef = container.ownerDocument;
  const status = documentRef.createElement('p');
  status.className = 'news-feed__status';
  status.textContent = message;
  container.replaceChildren(status);
  setFeedState(container, state);
}

function createNewsArticle(post, { documentRef, headingLevel, excerptLength, locale }) {
  const article = documentRef.createElement('article');
  article.className = 'news-card';

  const heading = documentRef.createElement(`h${headingLevel}`);
  heading.className = 'news-card__title';
  heading.textContent = post.title;

  const time = documentRef.createElement('time');
  time.className = 'news-card__date';
  time.dateTime = post.publishedAt;
  time.textContent = formatNewsDate(post.publishedAt, locale);

  const excerpt = documentRef.createElement('p');
  excerpt.className = 'news-card__excerpt';
  excerpt.textContent = makeExcerpt(htmlToPlainText(post.contentHtml), excerptLength)
    || 'Visit Patreon to read the full update.';

  const link = documentRef.createElement('a');
  link.className = 'news-card__link';
  link.href = post.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Read on Patreon →';

  article.append(heading, time, excerpt, link);
  return article;
}

export function renderNewsPosts(container, posts, {
  limit = Number.POSITIVE_INFINITY,
  headingLevel = 2,
  excerptLength = 260,
  locale = 'en-US',
} = {}) {
  if (!container?.ownerDocument) throw new TypeError('A news feed container is required.');

  const normalizedPosts = normalizeNewsPosts(posts);
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : normalizedPosts.length;
  const displayedPosts = normalizedPosts.slice(0, safeLimit);
  const safeHeadingLevel = Number.isInteger(headingLevel) && headingLevel >= 2 && headingLevel <= 6
    ? headingLevel
    : 2;
  const documentRef = container.ownerDocument;
  const fragment = documentRef.createDocumentFragment();

  for (const post of displayedPosts) {
    fragment.append(createNewsArticle(post, {
      documentRef,
      headingLevel: safeHeadingLevel,
      excerptLength,
      locale,
    }));
  }

  container.replaceChildren(fragment);
  setFeedState(container, 'ready');
  return displayedPosts;
}

export async function loadNewsFeed({
  container,
  endpoint = PATREON_NEWS_ENDPOINT,
  fetchImpl = globalThis.fetch,
  limit = Number.POSITIVE_INFINITY,
  headingLevel = 2,
  excerptLength = 260,
  locale = 'en-US',
  emptyMessage = 'No news has been published yet.',
  errorMessage = 'News could not be loaded right now.',
  onEmpty,
  onError,
} = {}) {
  if (!container?.ownerDocument) throw new TypeError('A news feed container is required.');

  try {
    const posts = await fetchNews({ endpoint, fetchImpl });
    if (posts.length === 0) {
      if (typeof onEmpty === 'function') {
        container.replaceChildren();
        setFeedState(container, 'empty');
        onEmpty();
      } else {
        renderStatus(container, emptyMessage, 'empty');
      }
      return { status: 'empty', posts: [] };
    }

    const displayedPosts = renderNewsPosts(container, posts, {
      limit,
      headingLevel,
      excerptLength,
      locale,
    });
    return { status: 'ready', posts: displayedPosts };
  } catch (error) {
    if (typeof onError === 'function') {
      container.replaceChildren();
      setFeedState(container, 'error');
      onError(error);
    } else {
      renderStatus(container, errorMessage, 'error');
    }
    return { status: 'error', posts: [], error };
  }
}
