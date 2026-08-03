(() => {
  const directory = document.querySelector('[data-resources-directory]');
  if (!directory) return;

  const tabs = [...directory.querySelectorAll('[role="tab"]')];
  const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));

  function activateTab(nextTab, { focus = false } = {}) {
    tabs.forEach((tab, index) => {
      const isActive = tab === nextTab;
      tab.setAttribute('aria-selected', String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
      panels[index].hidden = !isActive;
    });

    if (focus) nextTab.focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', event => {
      let nextIndex;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % tabs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabs.length - 1;
      if (nextIndex === undefined) return;

      event.preventDefault();
      activateTab(tabs[nextIndex], { focus: true });
    });
  });

  const hashTarget = location.hash ? document.getElementById(location.hash.slice(1)) : null;
  const hashTab = hashTarget?.matches('[role="tab"]')
    ? hashTarget
    : tabs.find(tab => tab.getAttribute('aria-controls') === hashTarget?.id);
  if (hashTab) activateTab(hashTab);
})();
