(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ModathonTitles = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const text = value => String(value ?? '').trim().toLowerCase();

  function matchesCondition(achievement, condition) {
    const actual = text(achievement?.[condition.field]);
    if (Object.prototype.hasOwnProperty.call(condition, 'equals')) {
      return actual === text(condition.equals);
    }
    if (Object.prototype.hasOwnProperty.call(condition, 'startsWith')) {
      return actual.startsWith(text(condition.startsWith));
    }
    if (Object.prototype.hasOwnProperty.call(condition, 'includes')) {
      return actual.includes(text(condition.includes));
    }
    if (Array.isArray(condition.includesAny)) {
      return condition.includesAny.some(value => actual.includes(text(value)));
    }
    return false;
  }

  function matchesAchievement(achievement, match) {
    const all = Array.isArray(match?.all) ? match.all : [];
    const any = Array.isArray(match?.any) ? match.any : [];
    return all.every(condition => matchesCondition(achievement, condition))
      && (any.length === 0 || any.some(condition => matchesCondition(achievement, condition)));
  }

  function eventYears(mods, achievements) {
    return [...new Set([...mods, ...achievements]
      .map(entry => Number(entry?.year))
      .filter(Number.isFinite))]
      .sort((a, b) => a - b);
  }

  function maximumConsecutiveYears(years) {
    let longest = 0;
    let current = 0;
    years.forEach((year, index) => {
      current = index > 0 && year === years[index - 1] + 1 ? current + 1 : 1;
      longest = Math.max(longest, current);
    });
    return longest;
  }

  function countFocus(focus, modder) {
    const mods = Array.isArray(modder?.mods) ? modder.mods : [];
    const achievements = Array.isArray(modder?.ach) ? modder.ach
      : (Array.isArray(modder?.achievements) ? modder.achievements : []);

    if (focus.type === 'mod-category') {
      return mods.filter(mod => String(mod?.category || '').trim() === focus.category).length;
    }
    if (focus.type === 'distinct-mod-categories') {
      const excluded = new Set((focus.exclude || []).map(String));
      return new Set(mods.map(mod => String(mod?.category || '').trim()).filter(category => category && !excluded.has(category))).size;
    }
    if (focus.type === 'achievement') {
      return achievements.filter(achievement => matchesAchievement(achievement, focus.match)).length;
    }
    if (focus.type === 'exclusive-achievement') {
      return achievements.filter(achievement => {
        if (Array.isArray(achievement?.unlockedBy)) return achievement.unlockedBy.length === 1;
        return Number(achievement?.unlockedCount) === 1;
      }).length;
    }
    if (focus.type === 'mod-match') {
      return mods.filter(mod => matchesAchievement(mod, focus.match)).length;
    }
    if (focus.type === 'total-mods') return mods.length;
    if (focus.type === 'total-achievements') return achievements.length;
    if (focus.type === 'collaborative-mods') {
      return mods.filter(mod => Array.isArray(mod?.authors) && mod.authors.length > 1).length;
    }
    if (focus.type === 'unavailable-mods') {
      return mods.filter(mod => mod?.available === false).length;
    }
    if (focus.type === 'total-endorsements') {
      return mods.reduce((total, mod) => total + (Number(mod?.endorsements) || 0), 0);
    }
    const years = eventYears(mods, achievements);
    if (focus.type === 'active-event-years') return years.length;
    if (focus.type === 'first-active-year') return years[0] || 0;
    if (focus.type === 'career-span-years') return years.length ? years[years.length - 1] - years[0] + 1 : 0;
    if (focus.type === 'maximum-consecutive-event-years') return maximumConsecutiveYears(years);
    if (focus.type === 'maximum-mods-in-event-year') {
      const byYear = new Map();
      mods.forEach(mod => byYear.set(Number(mod?.year), (byYear.get(Number(mod?.year)) || 0) + 1));
      return Math.max(0, ...byYear.values());
    }
    return 0;
  }

  function focusCounts(config, modder) {
    return Object.fromEntries(Object.entries(config?.focuses || {}).map(([id, focus]) => [id, countFocus(focus, modder)]));
  }

  function meetsRequirement(counts, requirement) {
    const actual = counts[requirement.focus] || 0;
    const minimum = Number.isInteger(requirement.count) ? requirement.count : 0;
    const maximum = Number.isInteger(requirement.maximum) ? requirement.maximum : Infinity;
    return actual >= minimum && actual <= maximum;
  }

  function meetsRequirements(counts, subject) {
    return (subject.requirements || []).every(requirement => meetsRequirement(counts, requirement));
  }

  function evaluate(config, modder) {
    const counts = focusCounts(config, modder);
    const eligible = (config?.titles || []).filter(title => meetsRequirements(counts, title))
      .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
    const qualifiers = (config?.qualifierAxes || []).flatMap(axis => {
      const qualifier = (axis.qualifiers || []).find(candidate => meetsRequirements(counts, candidate));
      return qualifier ? [{ ...qualifier, axisId: axis.id, axisLabel: axis.label }] : [];
    });
    const selected = eligible[0] || null;
    const separator = config?.composition?.separator || ' · ';

    return {
      selected,
      eligible,
      qualifiers,
      displayName: selected ? [selected.name, ...qualifiers.map(qualifier => qualifier.name)].join(separator) : '',
      focusCounts: counts,
    };
  }

  function validateRequirements(subject, focuses, kind, errors) {
    const requirements = subject.requirements;
    if (!Array.isArray(requirements) || requirements.length < 1 || requirements.length > 3) {
      errors.push(kind + ' must have between 1 and 3 requirements: ' + subject.name);
      return;
    }
    for (const requirement of requirements) {
      if (!focuses[requirement.focus]) errors.push('unknown focus "' + requirement.focus + '" in ' + subject.name);
      if (Object.prototype.hasOwnProperty.call(requirement, 'count')
          && (!Number.isInteger(requirement.count) || requirement.count < 1)) {
        errors.push('requirement counts must be positive integers: ' + subject.name);
      }
      if (Object.prototype.hasOwnProperty.call(requirement, 'maximum')
          && (!Number.isInteger(requirement.maximum) || requirement.maximum < 0)) {
        errors.push('requirement maximums must be non-negative integers: ' + subject.name);
      }
      if (!Object.prototype.hasOwnProperty.call(requirement, 'count')
          && !Object.prototype.hasOwnProperty.call(requirement, 'maximum')) {
        errors.push('requirements must define count and/or maximum: ' + subject.name);
      }
      if (Number.isInteger(requirement.count) && Number.isInteger(requirement.maximum)
          && requirement.maximum < requirement.count) {
        errors.push('requirement maximum cannot be lower than count: ' + subject.name);
      }
    }
  }

  function validateConfig(config) {
    const errors = [];
    const focuses = config?.focuses || {};
    const titles = Array.isArray(config?.titles) ? config.titles : [];
    const qualifierAxes = Array.isArray(config?.qualifierAxes) ? config.qualifierAxes : [];
    const ids = new Set();
    const priorities = new Set();
    const axisIds = new Set();
    const qualifierIds = new Set();

    if (config?.selection?.strategy !== 'highest-priority') errors.push('selection.strategy must be "highest-priority"');
    for (const title of titles) {
      if (!title.id || ids.has(title.id)) errors.push('title ids must be present and unique: ' + (title.id || '(missing)'));
      ids.add(title.id);
      if (!Number.isFinite(title.priority) || priorities.has(title.priority)) errors.push('title priorities must be finite and unique: ' + title.name);
      priorities.add(title.priority);
      validateRequirements(title, focuses, 'titles', errors);
    }
    for (const axis of qualifierAxes) {
      if (!axis.id || axisIds.has(axis.id)) errors.push('qualifier axis ids must be present and unique: ' + (axis.id || '(missing)'));
      axisIds.add(axis.id);
      if (!Array.isArray(axis.qualifiers) || axis.qualifiers.length === 0) {
        errors.push('qualifier axes must contain qualifiers: ' + (axis.label || axis.id));
      }
      for (const qualifier of axis.qualifiers || []) {
        if (!qualifier.id || qualifierIds.has(qualifier.id)) errors.push('qualifier ids must be present and unique: ' + (qualifier.id || '(missing)'));
        qualifierIds.add(qualifier.id);
        validateRequirements(qualifier, focuses, 'qualifiers', errors);
      }
    }
    return errors;
  }

  return Object.freeze({
    countFocus,
    evaluate,
    focusCounts,
    matchesAchievement,
    meetsRequirement,
    validateConfig,
  });
}));
