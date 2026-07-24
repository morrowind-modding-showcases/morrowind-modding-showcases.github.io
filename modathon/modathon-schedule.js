(function (root, factory) {
  const config = typeof module === 'object' && module.exports
    ? require('../assets/event-config.js').modathon
    : root.MmsEventConfig && root.MmsEventConfig.modathon;
  const schedule = factory(config);
  if (typeof module === 'object' && module.exports) module.exports = schedule;
  root.ModathonSchedule = schedule;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (config) {
  if (!config || !config.schedule) throw new Error('Modathon event configuration is missing');

  function timestampFor(year, point) {
    return Date.UTC(
      year,
      point.month - 1,
      point.day,
      point.hour || 0,
      point.minute || 0,
      0,
    );
  }

  function datesFor(year) {
    return {
      start: timestampFor(year, config.schedule.start),
      end: timestampFor(year, config.schedule.end),
      graceEnd: timestampFor(year, config.schedule.graceEnd),
      reset: timestampFor(year, config.schedule.reset),
    };
  }

  function getState(nowValue) {
    const now = Number(nowValue);
    const year = new Date(now).getUTCFullYear();
    const dates = datesFor(year);

    if (now < dates.start) {
      return { mode: 'upcoming', year, durationMs: dates.start - now, targetMs: dates.start };
    }
    if (now < dates.end) {
      return { mode: 'live', year, durationMs: dates.end - now, targetMs: dates.end };
    }
    if (now < dates.graceEnd) {
      return { mode: 'grace', year, durationMs: now - dates.end, targetMs: dates.graceEnd };
    }
    if (now < dates.reset) {
      return { mode: 'over', year, durationMs: 0, targetMs: dates.reset };
    }

    const nextYear = year + 1;
    const nextStart = datesFor(nextYear).start;
    return { mode: 'upcoming', year: nextYear, durationMs: nextStart - now, targetMs: nextStart };
  }

  return { EVENT: config, datesFor, getState };
});
