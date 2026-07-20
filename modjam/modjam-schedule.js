(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ModjamSchedule = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var EVENT = Object.freeze({
    name: 'Summer Modjam 2026',
    kickoffStart: '2026-08-21T23:00:00Z',
    start: '2026-08-22T00:00:00Z',
    end: '2026-08-24T00:00:00Z',
    kickoffDateLabel: 'August 21, 2026',
    startDateLabel: 'August 22, 2026',
    endDateLabel: 'August 24, 2026',
    timezoneLabel: 'UTC'
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
    var kickoffStart = new Date(EVENT.kickoffStart).getTime();
    var end = new Date(EVENT.end).getTime();

    if (current < kickoffStart) {
      return {
        mode: 'upcoming',
        eyebrow: '',
        title: 'Kickoff livestream begins in',
        detail: EVENT.kickoffDateLabel + ' · 23:00 ' + EVENT.timezoneLabel,
        segments: segments(kickoffStart - current),
        ariaLabel: 'Time remaining until the Summer Modjam 2026 kickoff livestream begins'
      };
    }

    if (current < start) {
      return {
        mode: 'upcoming',
        eyebrow: 'The kickoff livestream is live',
        title: 'The Modjam begins in',
        detail: EVENT.startDateLabel + ' · 00:00 ' + EVENT.timezoneLabel,
        segments: segments(start - current),
        ariaLabel: 'Time remaining until Summer Modjam 2026 begins'
      };
    }

    if (current < end) {
      return {
        mode: 'live',
        eyebrow: 'The Modjam is live',
        title: 'The Modjam ends in',
        detail: EVENT.endDateLabel + ' · 00:00 ' + EVENT.timezoneLabel,
        segments: segments(end - current),
        ariaLabel: 'Time remaining until ' + EVENT.name + ' ends'
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
