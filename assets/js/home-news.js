import { loadNewsFeed } from './patreon-news.js';

const section = document.querySelector('[data-home-news]');
const container = section?.querySelector('[data-news-feed]');

if (section && container) {
  const collapseSection = () => {
    section.hidden = true;
  };

  loadNewsFeed({
    container,
    limit: 3,
    headingLevel: 3,
    onEmpty: collapseSection,
    onError: collapseSection,
  });
}
