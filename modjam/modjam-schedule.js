(function (root, factory) {
  var config = typeof module === 'object' && module.exports
    ? require('../assets/event-config.js').modjam
    : root.MmsEventConfig && root.MmsEventConfig.modjam;
  var api = factory(config);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ModjamSchedule = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (config) {
  'use strict';

  if (!config) throw new Error('Modjam event configuration is missing');
  var EVENT = config;

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
      + ' ' + EVENT.timezoneLabel;
  }

  function scheduleDetail(value) {
    return dateLabel(value) + ' · ' + timeLabel(value);
  }

  function getEventSchedule() {
    return {
      ariaLabel: EVENT.name + ' schedule',
      kickoff: {
        label: 'Kickoff Livestream',
        datetime: EVENT.kickoffStart,
        detail: scheduleDetail(EVENT.kickoffStart)
      },
      event: {
        label: 'The Modjam',
        startDatetime: EVENT.start,
        startDetail: scheduleDetail(EVENT.start),
        endDatetime: EVENT.end,
        endDetail: scheduleDetail(EVENT.end)
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
    var current = typeof now === 'number' ? now : new Date(now || Date.now()).getTime();
    var start = new Date(EVENT.start).getTime();
    var kickoffStart = new Date(EVENT.kickoffStart).getTime();
    var end = new Date(EVENT.end).getTime();

    if (current < kickoffStart) {
      return {
        mode: 'upcoming',
        eyebrow: '',
        title: 'Livestream begins in',
        detail: scheduleDetail(EVENT.kickoffStart),
        segments: segments(kickoffStart - current),
        ariaLabel: 'Time remaining until the ' + EVENT.name + ' kickoff livestream begins'
      };
    }

    if (current < start) {
      return {
        mode: 'upcoming',
        eyebrow: 'The kickoff livestream is live',
        title: 'The Modjam begins in',
        detail: scheduleDetail(EVENT.start),
        segments: segments(start - current),
        ariaLabel: 'Time remaining until ' + EVENT.name + ' begins'
      };
    }

    if (current < end) {
      return {
        mode: 'live',
        eyebrow: 'The Modjam is live',
        title: 'The Modjam ends in',
        detail: scheduleDetail(EVENT.end),
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

  return {
    EVENT: EVENT,
    getCountdownView: getCountdownView,
    getEventSchedule: getEventSchedule
  };
});
