(function loadEventConfiguration(root) {
  'use strict';

  var script = document.currentScript;
  var configPath = script && script.dataset.eventConfig;
  var scheduleName = script && script.dataset.eventSchedule;
  var runtimePath = script && script.dataset.eventRuntime;

  function domReady() {
    if (document.readyState !== 'loading') return Promise.resolve();
    return new Promise(function (resolve) {
      document.addEventListener('DOMContentLoaded', resolve, { once: true });
    });
  }

  function loadRuntime() {
    return new Promise(function (resolve, reject) {
      var runtime = document.createElement('script');
      runtime.src = runtimePath;
      runtime.async = false;
      runtime.onload = resolve;
      runtime.onerror = function () {
        reject(new Error('Could not load ' + runtimePath));
      };
      document.head.appendChild(runtime);
    });
  }

  function showLoadError(error) {
    console.error('[events] failed to load event settings:', error);
    var host = document.querySelector('main, x-dc, body');
    if (!host) return;
    var message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = 'The current event schedule could not be loaded. Please refresh the page.';
    message.style.cssText = 'margin:1rem;padding:1rem;background:#521;color:#fff;font:600 1rem/1.4 system-ui,sans-serif';
    host.prepend(message);
  }

  if (!configPath || !scheduleName || !runtimePath) {
    showLoadError(new Error('Event loader attributes are incomplete'));
    return;
  }

  root.MmsEventReady = Promise.all([
    fetch(configPath).then(function (response) {
      if (!response.ok) throw new Error('Could not load ' + configPath);
      return response.json();
    }),
    domReady()
  ]).then(function (values) {
    var schedule = root[scheduleName];
    if (!schedule || typeof schedule.configure !== 'function') {
      throw new Error(scheduleName + ' is not available');
    }
    schedule.configure(values[0]);
    return loadRuntime();
  }).catch(function (error) {
    showLoadError(error);
    throw error;
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
