import { loadNewsFeed } from '../assets/js/patreon-news.js';

const container = document.querySelector('[data-news-feed]');

if (container) {
  loadNewsFeed({
    container,
    headingLevel: 3,
    emptyMessage: 'No news has been published yet.',
    errorMessage: 'News could not be loaded right now.',
  });
}
