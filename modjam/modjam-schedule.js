(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ModjamSchedule = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var EVENT = Object.freeze({
    name: 'Summer Modjam 2026',
    start: '2026-08-22T00:00:00-04:00',
    end: '2026-08-24T00:00:00-04:00',
    dateLabel: 'August 22–23, 2026',
    timezoneLabel: 'Eastern Time'
  });

  function segments(milliseconds) {
    var totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    var days = Math.floor(totalSeconds / 86400);
    var hours = Math.floor((totalSeconds % 86400) / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    return [
      { value: String(days), unit: 'days' },
      { value: String(hours).padStart(2, '0'), unit: 'hours' },
      { value: String(minutes).padStart(2, '0'), unit: 'minutes' },
      { value: String(seconds).padStart(2, '0'), unit: 'seconds' }
    ];
  }

  function getCountdownView(now) {
    var current = typeof now === 'number' ? now : new Date(now || Date.now()).getTime();
    var start = new Date(EVENT.start).getTime();
    var end = new Date(EVENT.end).getTime();

    if (current < start) {
      return {
        mode: 'upcoming',
        eyebrow: 'The next two-day sprint begins in',
        title: EVENT.name,
        detail: EVENT.dateLabel + ' · begins at midnight ' + EVENT.timezoneLabel,
        segments: segments(start - current),
        ariaLabel: 'Time remaining until ' + EVENT.name
      };
    }

    if (current < end) {
      return {
        mode: 'live',
        eyebrow: 'The jam is live',
        title: 'Make something wonderful',
        detail: EVENT.name + ' ends at midnight ' + EVENT.timezoneLabel,
        segments: segments(end - current),
        ariaLabel: 'Time remaining in ' + EVENT.name
      };
    }

    return {
      mode: 'complete',
      eyebrow: 'That’s a wrap',
      title: EVENT.name + ' is complete',
      detail: 'Watch this archive for the entries, results, and delightfully specific judge awards.',
      segments: [],
      ariaLabel: EVENT.name + ' has ended'
    };
  }

  return { EVENT: EVENT, getCountdownView: getCountdownView };
});
