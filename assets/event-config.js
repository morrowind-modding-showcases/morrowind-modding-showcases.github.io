(function (root, factory) {
  var config = factory();
  if (typeof module === 'object' && module.exports) module.exports = config;
  root.MmsEventConfig = config;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function deepFreeze(value) {
    Object.keys(value).forEach(function (key) {
      if (value[key] && typeof value[key] === 'object' && !Object.isFrozen(value[key])) {
        deepFreeze(value[key]);
      }
    });
    return Object.freeze(value);
  }

  return deepFreeze({
    schemaVersion: 1,
    modathon: {
      name: 'Morrowind Modathon',
      timezoneLabel: 'UTC',
      schedule: {
        start: { month: 5, day: 1, hour: 0, minute: 0 },
        end: { month: 6, day: 2, hour: 0, minute: 0 },
        graceEnd: { month: 6, day: 2, hour: 12, minute: 0 },
        reset: { month: 7, day: 1, hour: 0, minute: 0 }
      }
    },
    modjam: {
      name: 'Summer Modjam 2026',
      season: 'Summer',
      year: 2026,
      kickoffStart: '2026-08-21T23:00:00Z',
      start: '2026-08-22T00:00:00Z',
      end: '2026-08-24T00:00:00Z',
      timezoneLabel: 'UTC',
      participationBannerUrl: 'https://i.imgur.com/7nytO4q.png'
    },
    madness: {
      name: 'Morrowind Modding Madness 2026',
      year: 2026,
      seasonNumber: 10,
      registration: '2026-09-01T00:00:00Z',
      competition: '2026-10-01T00:00:00Z',
      submissions: '2026-11-07T00:00:00Z',
      bugFixEnd: '2026-11-15T00:00:00Z',
      timezoneLabel: 'UTC',
      registrationFormId: 'xkodjdza'
    }
  });
});
