(function (root, factory) {
  var initialConfig = typeof module === 'object' && module.exports
    ? require('./data/modjam-event.json')
    : null;
  var api = factory(initialConfig);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ModjamSchedule = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (initialConfig) {
  'use strict';

  var EVENT = null;

  function configure(config) {
    var events = config && config.eventType === 'modjam' && Array.isArray(config.events)
      ? config.events
      : [];
    EVENT = events.reduce(function (latest, candidate) {
      if (!latest || Number(candidate.year) > Number(latest.year)) return candidate;
      if (Number(candidate.year) < Number(latest.year)) return latest;
      var candidateStart = Date.parse(candidate.countdown && candidate.countdown.start);
      var latestStart = Date.parse(latest.countdown && latest.countdown.start);
      if (Number.isFinite(candidateStart) && Number.isFinite(latestStart)) {
        return candidateStart >= latestStart ? candidate : latest;
      }
      return candidate;
    }, null);
    if (!EVENT || !EVENT.countdown) {
      throw new Error('Modjam event configuration is missing');
    }
    return api;
  }

  function event() {
    if (!EVENT) throw new Error('Modjam event configuration has not loaded');
    return EVENT;
  }

  function dateLabel(value) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(new Date(value));
  }

  function timeLabel(value) {
    var date = new Date(value);
    return String(date.getUTCHours()).padStart(2, '0')
      + ':' + String(date.getUTCMinutes()).padStart(2, '0')
      + ' ' + event().timezoneLabel;
  }

  function scheduleDetail(value) {
    return dateLabel(value) + ' · ' + timeLabel(value);
  }

  function getEventSchedule() {
    var currentEvent = event();
    var countdown = currentEvent.countdown;
    return {
      ariaLabel: currentEvent.name + ' schedule',
      kickoff: {
        label: 'Kickoff Livestream',
        datetime: countdown.kickoffStart,
        detail: scheduleDetail(countdown.kickoffStart)
      },
      event: {
        label: 'The Modjam',
        startDatetime: countdown.start,
        startDetail: scheduleDetail(countdown.start),
        endDatetime: countdown.end,
        endDetail: scheduleDetail(countdown.end)
      }
    };
  }

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
    var currentEvent = event();
    var countdown = currentEvent.countdown;
    var current = typeof now === 'number' ? now : new Date(now || Date.now()).getTime();
    var start = new Date(countdown.start).getTime();
    var kickoffStart = new Date(countdown.kickoffStart).getTime();
    var end = new Date(countdown.end).getTime();

    if (current < kickoffStart) {
      return {
        mode: 'upcoming',
        eyebrow: '',
        title: 'Livestream begins in',
        detail: scheduleDetail(countdown.kickoffStart),
        segments: segments(kickoffStart - current),
        ariaLabel: 'Time remaining until the ' + currentEvent.name + ' kickoff livestream begins'
      };
    }

    if (current < start) {
      return {
        mode: 'upcoming',
        eyebrow: 'The kickoff livestream is live',
        title: 'The Modjam begins in',
        detail: scheduleDetail(countdown.start),
        segments: segments(start - current),
        ariaLabel: 'Time remaining until ' + currentEvent.name + ' begins'
      };
    }

    if (current < end) {
      return {
        mode: 'live',
        eyebrow: 'The Modjam is live',
        title: 'The Modjam ends in',
        detail: scheduleDetail(countdown.end),
        segments: segments(end - current),
        ariaLabel: 'Time remaining until ' + currentEvent.name + ' ends'
      };
    }

    return {
      mode: 'complete',
      eyebrow: 'That’s a wrap',
      title: currentEvent.name + ' is complete',
      detail: 'Watch this archive for the entries, results, and delightfully specific judge awards.',
      segments: [],
      ariaLabel: currentEvent.name + ' has ended'
    };
  }

  var api = {
    configure: configure,
    getCountdownView: getCountdownView,
    getEventSchedule: getEventSchedule
  };
  Object.defineProperty(api, 'EVENT', {
    enumerable: true,
    get: event
  });
  if (initialConfig) configure(initialConfig);
  return api;
});
