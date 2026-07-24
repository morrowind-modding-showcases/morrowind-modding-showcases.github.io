(function (root, factory) {
  const config = typeof module === 'object' && module.exports
    ? require('../assets/event-config.js').madness
    : root.MmsEventConfig && root.MmsEventConfig.madness;
  const schedule = factory(config);
  if (typeof module === 'object' && module.exports) module.exports = schedule;
  root.MadnessSchedule = schedule;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (config) {
  if (!config) throw new Error('Madness event configuration is missing');
  const EVENT = config;
  const EVENT_YEAR = EVENT.year;
  const MONTH_LONG = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const MONTH_SHORT = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  ];

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
    return {
      registration: timestampForYear(EVENT.registration, year),
      competition: timestampForYear(EVENT.competition, year),
      submissions: timestampForYear(EVENT.submissions, year),
      bugFixEnd: timestampForYear(EVENT.bugFixEnd, year),
    };
  }

  function toRoman(value) {
    let number = Math.max(1, Math.floor(Number(value) || 1));
    const numerals = [
      [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
      [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
      [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
    ];
    let result = '';
    for (const [amount, numeral] of numerals) {
      while (number >= amount) {
        result += numeral;
        number -= amount;
      }
    }
    return result;
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    const hour = date.getUTCHours();
    const minute = String(date.getUTCMinutes()).padStart(2, '0');
    const hour12 = hour % 12 || 12;
    return hour12 + ':' + minute + (hour < 12 ? 'am' : 'pm') + ' UTC';
  }

  function formatDetailDate(timestamp) {
    const date = new Date(timestamp);
    return MONTH_LONG[date.getUTCMonth()] + ' ' + date.getUTCDate() + ' at ' + formatTime(timestamp);
  }

  function formatMilestoneDate(timestamp) {
    const date = new Date(timestamp);
    const hour = date.getUTCHours() % 12 || 12;
    const minute = date.getUTCMinutes();
    const time = hour + (minute ? ':' + String(minute).padStart(2, '0') : '') + (date.getUTCHours() < 12 ? 'AM' : 'PM');
    return MONTH_SHORT[date.getUTCMonth()] + ' ' + date.getUTCDate() + ' · ' + time + ' UTC';
  }

  function getEventDetails() {
    const dates = datesFor(EVENT_YEAR);
    const seasonRoman = toRoman(EVENT.seasonNumber);
    const registrationStart = new Date(dates.registration);
    const registrationEnd = new Date(dates.competition);
    const registrationWindowLabel = 'Registration: '
      + MONTH_LONG[registrationStart.getUTCMonth()] + ' ' + registrationStart.getUTCDate()
      + '–' + MONTH_LONG[registrationEnd.getUTCMonth()] + ' ' + registrationEnd.getUTCDate()
      + ', ' + EVENT_YEAR;

    return {
      eventYear: EVENT_YEAR,
      eventName: EVENT.name,
      eventScheduleAriaLabel: 'Madness ' + EVENT_YEAR + ' schedule',
      eventEyebrow: 'MADNESS ' + EVENT_YEAR,
      seasonNumber: EVENT.seasonNumber,
      seasonRoman,
      seasonReturnLabel: 'SEASON ' + seasonRoman + ' · RETURNS OCTOBER ' + EVENT_YEAR,
      seasonDetailsText: 'Season ' + seasonRoman + ' details arrive soon — sharpen your Construction Set.',
      registrationIntroText: 'Gather two to five modders, choose a name worthy of the annals, and declare your team for Season ' + seasonRoman + '.',
      registrationWindowLabel,
      registrationFormSubject: 'Madness ' + EVENT_YEAR + ' team registration',
      registrationClosedDetail: 'New teams can no longer apply for the ' + EVENT_YEAR + ' competition.',
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

  function getRegistrationAvailability(nowValue, searchValue) {
    const schedule = getState(nowValue);
    const params = new URLSearchParams(String(searchValue || ''));
    const isTestMode = params.get('registration-test') === '1';
    const isOpen = schedule.mode === 'competition';

    return {
      isOpen,
      isTestMode,
      isFormAvailable: isOpen || isTestMode,
    };
  }

  function getCountdownView(nowValue) {
    const schedule = getState(nowValue);
    const dates = datesFor(EVENT_YEAR);
    let seconds = Math.max(0, Math.ceil(schedule.durationMs / 1000));
    const days = Math.floor(seconds / 86400);
    seconds %= 86400;
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    seconds %= 60;
    const pad = value => String(value).padStart(2, '0');
    const segments = [
      { value: pad(days), unit: 'DAYS' },
      { value: pad(hours), unit: 'HOURS' },
      { value: pad(minutes), unit: 'MINUTES' },
      { value: pad(seconds), unit: 'SECONDS' },
    ];
    const spokenDuration = days + ' days, ' + hours + ' hours, ' + minutes + ' minutes, and ' + seconds + ' seconds';
    const milestoneData = [
      { label: 'Team registration', timestamp: dates.registration },
      { label: 'Competition begins', timestamp: dates.competition },
      { label: 'Submissions close', timestamp: dates.submissions },
      { label: 'Bug-fixing ends', timestamp: dates.bugFixEnd },
    ];
    const milestones = milestoneData.map((milestone, index) => ({
      label: milestone.label,
      date: formatMilestoneDate(milestone.timestamp),
      datetime: new Date(milestone.timestamp).toISOString(),
      state: index < schedule.activeIndex ? 'complete' : index === schedule.activeIndex ? 'active' : 'upcoming',
    }));
    const base = {
      countdownMode: schedule.mode,
      countdownHasTimer: schedule.mode !== 'over',
      countdownHasDetail: schedule.mode !== 'over',
      countdownSegments: schedule.mode === 'over' ? [] : segments,
      countdownMilestones: milestones,
      eventScheduleAriaLabel: 'Madness ' + EVENT_YEAR + ' schedule',
    };

    if (schedule.mode === 'registration') return {
      ...base,
      countdownEyebrow: 'MADNESS ' + EVENT_YEAR + ' · TEAM REGISTRATION',
      countdownTitle: 'Team registration opens in',
      countdownDetail: formatDetailDate(schedule.targetMs),
      countdownAriaLabel: spokenDuration + ' until team registration opens',
    };
    if (schedule.mode === 'competition') return {
      ...base,
      countdownEyebrow: 'TEAM REGISTRATION IS OPEN',
      countdownTitle: 'Madness begins in',
      countdownDetail: formatDetailDate(schedule.targetMs),
      countdownAriaLabel: spokenDuration + ' until Madness begins',
    };
    if (schedule.mode === 'submissions') return {
      ...base,
      countdownEyebrow: 'MADNESS ' + EVENT_YEAR + ' IS LIVE',
      countdownTitle: 'Submissions close in',
      countdownDetail: formatDetailDate(schedule.targetMs),
      countdownAriaLabel: spokenDuration + ' until submissions close',
    };
    if (schedule.mode === 'bugfix') return {
      ...base,
      countdownEyebrow: 'BUG-FIXING PERIOD',
      countdownTitle: 'Bug-fixing ends in',
      countdownDetail: formatDetailDate(schedule.targetMs),
      countdownAriaLabel: spokenDuration + ' until the bug-fixing period ends',
    };
    return {
      ...base,
      countdownEyebrow: 'MADNESS ' + EVENT_YEAR,
      countdownTitle: 'This year’s Madness has ended',
      countdownDetail: '',
      countdownAriaLabel: '',
    };
  }

  return {
    EVENT,
    EVENT_YEAR,
    datesFor,
    getState,
    getRegistrationAvailability,
    getEventDetails,
    getCountdownView,
    toRoman,
  };
});
