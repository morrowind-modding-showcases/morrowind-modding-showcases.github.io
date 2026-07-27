(function (root, factory) {
  const initialConfig = typeof module === 'object' && module.exports
    ? require('./assets/data/modathon-event.json')
    : null;
  const schedule = factory(initialConfig);
  if (typeof module === 'object' && module.exports) module.exports = schedule;
  root.ModathonSchedule = schedule;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (initialConfig) {
  let EVENT = null;

  function configure(config) {
    if (!config || config.eventType !== 'modathon' || !config.countdown) {
      throw new Error('Modathon event configuration is missing');
    }
    EVENT = config;
    return api;
  }

  function event() {
    if (!EVENT) throw new Error('Modathon event configuration has not loaded');
    return EVENT;
  }

  function timestampForYear(value, year) {
    const date = new Date(value);
    return Date.UTC(
      year,
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
    );
  }

  function datesFor(year) {
    const countdown = event().countdown;
    return {
      start: timestampForYear(countdown.start, year),
      end: timestampForYear(countdown.end, year),
      graceEnd: timestampForYear(countdown.graceEnd, year),
      reset: timestampForYear(countdown.reset, year),
    };
  }

  function getState(nowValue) {
    const now = Number(nowValue);
    const configuredYear = Number(event().year);
    const dates = datesFor(configuredYear);

    if (now < dates.start) {
      return { mode: 'upcoming', year: configuredYear, durationMs: dates.start - now, targetMs: dates.start };
    }
    if (now < dates.end) {
      return { mode: 'live', year: configuredYear, durationMs: dates.end - now, targetMs: dates.end };
    }
    if (now < dates.graceEnd) {
      return { mode: 'grace', year: configuredYear, durationMs: now - dates.end, targetMs: dates.graceEnd };
    }
    if (now < dates.reset) {
      return { mode: 'over', year: configuredYear, durationMs: 0, targetMs: dates.reset };
    }

    const nextYear = configuredYear + 1;
    const nextStart = datesFor(nextYear).start;
    return { mode: 'upcoming', year: nextYear, durationMs: nextStart - now, targetMs: nextStart };
  }

  const api = { configure, datesFor, getState };
  Object.defineProperty(api, 'EVENT', { enumerable: true, get: () => event() });
  if (initialConfig) configure(initialConfig);
  return api;
});
