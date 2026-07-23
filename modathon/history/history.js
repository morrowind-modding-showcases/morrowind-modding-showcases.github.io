(() => {
  const themeButton = document.querySelector('[data-history-theme]');
  const progress = document.querySelector('[data-history-progress]');
  const sections = [...document.querySelectorAll('[data-history-section]')];
  const railLinks = new Map(
    [...document.querySelectorAll('[data-history-rail-link]')]
      .map(link => [link.dataset.historyRailLink, link]),
  );
  const dialog = document.querySelector('[data-history-dialog]');
  const dialogImage = document.querySelector('[data-history-dialog-image]');
  const dialogCaption = document.querySelector('[data-history-dialog-caption]');
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const setTheme = (theme, persist = true) => {
    const night = theme === 'night';
    document.body.classList.toggle('night', night);
    if (themeButton) {
      themeButton.textContent = night ? '☀ DAY' : '☾ NIGHT';
      themeButton.setAttribute('aria-label', night ? 'Switch to day theme' : 'Switch to night theme');
    }
    if (persist) {
      try {
        localStorage.setItem('mmr-theme', theme);
      } catch (error) {
        // Theme persistence is optional when storage is blocked.
      }
    }
  };

  setTheme(document.body.classList.contains('night') ? 'night' : 'day', false);
  themeButton?.addEventListener('click', () => {
    setTheme(document.body.classList.contains('night') ? 'day' : 'night');
  });

  let frameRequested = false;
  const updateProgress = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const amount = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
    if (progress) progress.style.transform = `scaleX(${amount})`;
    frameRequested = false;
  };
  const requestProgressUpdate = () => {
    if (frameRequested) return;
    frameRequested = true;
    requestAnimationFrame(updateProgress);
  };
  updateProgress();
  window.addEventListener('scroll', requestProgressUpdate, { passive: true });
  window.addEventListener('resize', requestProgressUpdate, { passive: true });

  const setActiveSection = sectionId => {
    railLinks.forEach((link, id) => {
      const active = id === sectionId;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };

  if ('IntersectionObserver' in window && sections.length) {
    const visible = new Map();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
        else visible.delete(entry.target.id);
      });
      const active = [...visible.entries()].sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]))[0]?.[0];
      if (active) setActiveSection(active);
    }, { rootMargin: '-18% 0px -62% 0px', threshold: [0, 0.05] });
    sections.forEach(section => observer.observe(section));
  } else if (sections[0]) {
    setActiveSection(sections[0].id);
  }

  document.querySelectorAll('[data-history-chart]').forEach(chart => {
    const button = chart.querySelector('[data-history-chart-sort]');
    const list = chart.querySelector('.history-bars');
    if (!button || !list) return;
    const rows = [...list.querySelectorAll('.history-bar-row')];

    button.addEventListener('click', () => {
      const ranked = button.getAttribute('aria-pressed') !== 'true';
      const sorted = [...rows].sort((left, right) => ranked
        ? Number(right.dataset.value) - Number(left.dataset.value) || Number(left.dataset.order) - Number(right.dataset.order)
        : Number(left.dataset.order) - Number(right.dataset.order));
      sorted.forEach(row => list.append(row));
      button.setAttribute('aria-pressed', String(ranked));
      button.textContent = ranked ? 'RESTORE SOURCE ORDER' : 'RANK CATEGORIES ↓';
      if (!reducedMotion) {
        rows.forEach(row => row.animate?.(
          [{ opacity: 0.35, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 180, easing: 'ease-out' },
        ));
      }
    });
  });

  const closeDialog = () => {
    if (dialog?.open) dialog.close();
  };

  document.querySelectorAll('[data-history-lightbox]').forEach(button => {
    button.addEventListener('click', () => {
      const source = button.querySelector('img');
      const caption = button.closest('figure')?.querySelector('figcaption')?.textContent?.trim() || source?.alt || '';
      if (!dialog || !dialogImage || !source) return;
      dialogImage.src = source.currentSrc || source.src;
      dialogImage.alt = source.alt;
      if (dialogCaption) dialogCaption.textContent = caption;
      dialog.showModal();
    });
  });

  document.querySelector('[data-history-dialog-close]')?.addEventListener('click', closeDialog);
  dialog?.addEventListener('click', event => {
    if (event.target === dialog) closeDialog();
  });
})();
