(() => {
  function asUrl(value) {
    return value instanceof URL ? new URL(value.href) : new URL(value, 'https://resources.invalid/');
  }

  function readResourceState(value, validTabs, validTags) {
    const url = asUrl(value);
    const hashId = url.hash.replace(/^#/, '');
    const hashTab = validTabs.find(tab => hashId === `resource-tab-${tab}` || hashId === `resource-panel-${tab}`);
    const requestedTab = url.searchParams.get('tab');
    const tab = validTabs.includes(requestedTab) ? requestedTab : (hashTab || validTabs[0]);
    const search = (url.searchParams.get('search') || '').trim();
    const requestedTags = new Set(url.searchParams.getAll('tag'));
    const tags = validTags.filter(tag => requestedTags.has(tag));

    return { tab, search, tags };
  }

  function createResourceUrl(value, state, validTags) {
    const url = asUrl(value);
    const normalizedSearch = state.search.trim();
    url.searchParams.set('tab', state.tab);

    if (normalizedSearch) url.searchParams.set('search', normalizedSearch);
    else url.searchParams.delete('search');

    url.searchParams.delete('tag');
    const selectedTags = new Set(state.tags);
    validTags.filter(tag => selectedTags.has(tag)).forEach(tag => url.searchParams.append('tag', tag));
    url.hash = '';
    return url;
  }

  function resourceMatches(searchText, resourceTags, state) {
    const normalizedText = searchText.toLocaleLowerCase();
    const searchTerms = state.search.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const matchesSearch = searchTerms.every(term => normalizedText.includes(term));
    const matchesTags = state.tags.every(tag => resourceTags.includes(tag));
    return matchesSearch && matchesTags;
  }

  const api = { readResourceState, createResourceUrl, resourceMatches };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  const directory = document.querySelector('[data-resources-directory]');
  if (!directory) return;

  const tabs = [...directory.querySelectorAll('[data-resource-tab]')];
  const validTabs = tabs.map(tab => tab.dataset.resourceTab);
  let validTags = [];
  try {
    validTags = JSON.parse(directory.dataset.resourceTags || '[]');
  } catch {
    validTags = [];
  }

  const panels = new Map(tabs.map(tab => [
    tab.dataset.resourceTab,
    document.getElementById(tab.getAttribute('aria-controls')),
  ]));
  const controls = [...directory.querySelectorAll('[data-resource-controls]')];
  let state = readResourceState(location.href, validTabs, validTags);

  function updateUrl(mode) {
    if (!mode) return;
    const nextUrl = createResourceUrl(location.href, state, validTags);
    const nextLocation = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
    if (mode === 'push' && nextUrl.href === location.href) return;
    history[`${mode}State`](null, '', nextLocation);
  }

  function closeFilterMenus(exceptControl = null) {
    controls.forEach(control => {
      if (control === exceptControl) return;
      const toggle = control.querySelector('[data-filter-toggle]');
      const menu = control.querySelector('[data-filter-menu]');
      toggle.setAttribute('aria-expanded', 'false');
      menu.hidden = true;
    });
  }

  function syncControls() {
    controls.forEach(control => {
      const searchInput = control.querySelector('[data-resource-search]');
      if (searchInput.value !== state.search) searchInput.value = state.search;

      control.querySelectorAll('[data-resource-filter]').forEach(input => {
        input.checked = state.tags.includes(input.value);
      });
      control.querySelector('[data-filter-count]').textContent = `(${state.tags.length})`;

      const activeFilterRow = control.querySelector('[data-active-filter-row]');
      const chipContainer = control.querySelector('[data-filter-chips]');
      chipContainer.replaceChildren();

      state.tags.forEach(tag => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'resource-filter-chip';
        chip.dataset.removeFilter = tag;
        chip.setAttribute('aria-label', `Remove ${tag} filter`);
        chip.append(document.createTextNode(tag));
        const removeIcon = document.createElement('span');
        removeIcon.setAttribute('aria-hidden', 'true');
        removeIcon.textContent = '\u00d7';
        chip.append(removeIcon);
        chipContainer.append(chip);
      });

      activeFilterRow.hidden = state.tags.length === 0;
    });
  }

  function filterPanel(panel) {
    const rows = [...panel.querySelectorAll('[data-resource-entry]')];
    const tableWrap = panel.querySelector('.resources-table-wrap');
    const noResults = panel.querySelector('[data-no-results]');
    const status = panel.querySelector('[data-results-status]');
    if (!tableWrap) {
      if (status) status.textContent = '0 resources shown';
      return;
    }

    const visibleBySection = new Map();
    let visibleCount = 0;
    rows.forEach(row => {
      const resourceTags = (row.dataset.resourceTags || '').split('|').filter(Boolean);
      const isVisible = resourceMatches(row.textContent, resourceTags, state);
      row.hidden = !isVisible;
      if (!isVisible) return;

      visibleCount += 1;
      const sectionId = row.dataset.resourceSectionId;
      visibleBySection.set(sectionId, (visibleBySection.get(sectionId) || 0) + 1);
    });

    panel.querySelectorAll('[data-resource-section]').forEach(sectionRow => {
      sectionRow.hidden = !visibleBySection.has(sectionRow.dataset.resourceSection);
    });

    tableWrap.hidden = visibleCount === 0;
    noResults.hidden = visibleCount !== 0;
    status.textContent = `${visibleCount} resource${visibleCount === 1 ? '' : 's'} shown`;
  }

  function applyState({ historyMode = null, focusTab = false } = {}) {
    tabs.forEach(tab => {
      const isActive = tab.dataset.resourceTab === state.tab;
      tab.setAttribute('aria-selected', String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
      panels.get(tab.dataset.resourceTab).hidden = !isActive;
      if (isActive && focusTab) tab.focus();
    });

    syncControls();
    panels.forEach(filterPanel);
    updateUrl(historyMode);
  }

  function selectTab(tab, { focus = false } = {}) {
    state = { ...state, tab: tab.dataset.resourceTab };
    closeFilterMenus();
    applyState({ historyMode: 'push', focusTab: focus });
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      let nextIndex;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % tabs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabs.length - 1;
      if (nextIndex === undefined) return;

      event.preventDefault();
      selectTab(tabs[nextIndex], { focus: true });
    });
  });

  controls.forEach(control => {
    const searchInput = control.querySelector('[data-resource-search]');
    const toggle = control.querySelector('[data-filter-toggle]');
    const menu = control.querySelector('[data-filter-menu]');

    searchInput.addEventListener('input', () => {
      state = { ...state, search: searchInput.value };
      applyState({ historyMode: 'replace' });
    });

    toggle.addEventListener('click', () => {
      const willOpen = toggle.getAttribute('aria-expanded') !== 'true';
      closeFilterMenus(willOpen ? control : null);
      toggle.setAttribute('aria-expanded', String(willOpen));
      menu.hidden = !willOpen;
    });

    control.querySelectorAll('[data-resource-filter]').forEach(input => {
      input.addEventListener('change', () => {
        const selected = new Set(state.tags);
        if (input.checked) selected.add(input.value);
        else selected.delete(input.value);
        state = { ...state, tags: validTags.filter(tag => selected.has(tag)) };
        applyState({ historyMode: 'push' });
      });
    });

    control.querySelector('[data-clear-filters]').addEventListener('click', () => {
      state = { ...state, tags: [] };
      applyState({ historyMode: 'push' });
    });
  });

  directory.addEventListener('click', event => {
    const removeFilter = event.target.closest('[data-remove-filter]');
    if (removeFilter) {
      state = { ...state, tags: state.tags.filter(tag => tag !== removeFilter.dataset.removeFilter) };
      applyState({ historyMode: 'push' });
      return;
    }

    const moreButton = event.target.closest('[data-more-tags]');
    if (!moreButton) return;
    const tagsContainer = moreButton.closest('.resource-entry-tags');
    const willExpand = moreButton.getAttribute('aria-expanded') !== 'true';
    tagsContainer.querySelectorAll('[data-overflow-tag]').forEach(tag => {
      tag.hidden = !willExpand;
    });
    moreButton.setAttribute('aria-expanded', String(willExpand));
    moreButton.textContent = willExpand ? 'Less' : '\u2026';
    moreButton.setAttribute('aria-label', willExpand ? 'Show fewer tags' : `Show ${tagsContainer.querySelectorAll('[data-overflow-tag]').length} more tags`);
  });

  document.addEventListener('click', event => {
    if (!event.target.closest('[data-resource-controls]')) closeFilterMenus();
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const openToggle = directory.querySelector('[data-filter-toggle][aria-expanded="true"]');
    if (!openToggle) return;
    closeFilterMenus();
    openToggle.focus();
  });

  window.addEventListener('popstate', () => {
    state = readResourceState(location.href, validTabs, validTags);
    closeFilterMenus();
    applyState();
  });

  applyState({ historyMode: 'replace' });
})();
