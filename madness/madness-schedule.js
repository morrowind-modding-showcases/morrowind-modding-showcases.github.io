(function (root, factory) {
  const schedule = factory();
  if (typeof module === 'object' && module.exports) module.exports = schedule;
  root.MadnessSchedule = schedule;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const EVENT_YEAR = 2026;
  const SEPTEMBER = 8;
  const OCTOBER = 9;
  const NOVEMBER = 10;

  function datesFor(year) {
    return {
      registration: Date.UTC(year, SEPTEMBER, 1, 0, 0, 0),
      competition: Date.UTC(year, OCTOBER, 1, 0, 0, 0),
      submissions: Date.UTC(year, NOVEMBER, 7, 0, 0, 0),
      bugFixEnd: Date.UTC(year, NOVEMBER, 15, 0, 0, 0),
    };
  }

  function getState(nowValue) {
    const now = Number(nowValue);
    const dates = datesFor(EVENT_YEAR);

    if (now < dates.registration) {
      return { mode: 'registration', year: EVENT_YEAR, durationMs: dates.registration - now, targetMs: dates.registration, activeIndex: 0 };
    }
    if (now < dates.competition) {
      return { mode: 'competition', year: EVENT_YEAR, durationMs: dates.competition - now, targetMs: dates.competition, activeIndex: 1 };
    }
    if (now < dates.submissions) {
      return { mode: 'submissions', year: EVENT_YEAR, durationMs: dates.submissions - now, targetMs: dates.submissions, activeIndex: 2 };
    }
    if (now < dates.bugFixEnd) {
      return { mode: 'bugfix', year: EVENT_YEAR, durationMs: dates.bugFixEnd - now, targetMs: dates.bugFixEnd, activeIndex: 3 };
    }
    return { mode: 'over', year: EVENT_YEAR, durationMs: 0, targetMs: dates.bugFixEnd, activeIndex: 4 };
  }

  return { EVENT_YEAR, datesFor, getState };
});
