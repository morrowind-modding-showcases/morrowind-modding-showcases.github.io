(function (root, factory) {
  const schedule = factory();
  if (typeof module === 'object' && module.exports) module.exports = schedule;
  root.ModathonSchedule = schedule;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MAY = 4;
  const JUNE = 5;
  const JULY = 6;

  function datesFor(year) {
    return {
      start: Date.UTC(year, MAY, 1, 0, 0, 0),
      end: Date.UTC(year, JUNE, 2, 0, 0, 0),
      graceEnd: Date.UTC(year, JUNE, 2, 12, 0, 0),
      reset: Date.UTC(year, JULY, 1, 0, 0, 0),
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

  return { datesFor, getState };
});
