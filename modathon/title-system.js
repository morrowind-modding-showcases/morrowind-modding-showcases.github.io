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
    return 0;
  }

  function focusCounts(config, modder) {
    return Object.fromEntries(Object.entries(config?.focuses || {}).map(([id, focus]) => [id, countFocus(focus, modder)]));
  }

  function evaluate(config, modder) {
    const counts = focusCounts(config, modder);
    const eligible = (config?.titles || []).filter(title => (title.requirements || []).every(requirement => (
      (counts[requirement.focus] || 0) >= requirement.count
    ))).sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));

    return {
      selected: eligible[0] || null,
      eligible,
      focusCounts: counts,
    };
  }

  function validateConfig(config) {
    const errors = [];
    const focuses = config?.focuses || {};
    const titles = Array.isArray(config?.titles) ? config.titles : [];
    const ids = new Set();
    const priorities = new Set();

    if (config?.selection?.strategy !== 'highest-priority') errors.push('selection.strategy must be "highest-priority"');
    for (const title of titles) {
      if (!title.id || ids.has(title.id)) errors.push('title ids must be present and unique: ' + (title.id || '(missing)'));
      ids.add(title.id);
      if (!Number.isFinite(title.priority) || priorities.has(title.priority)) errors.push('title priorities must be finite and unique: ' + title.name);
      priorities.add(title.priority);
      if (!Array.isArray(title.requirements) || title.requirements.length < 1 || title.requirements.length > 3) {
        errors.push('titles must have between 1 and 3 requirements: ' + title.name);
      }
      for (const requirement of title.requirements || []) {
        if (!focuses[requirement.focus]) errors.push('unknown focus "' + requirement.focus + '" in ' + title.name);
        if (!Number.isInteger(requirement.count) || requirement.count < 1) errors.push('requirement counts must be positive integers: ' + title.name);
      }
    }
    return errors;
  }

  return Object.freeze({
    countFocus,
    evaluate,
    focusCounts,
    matchesAchievement,
    validateConfig,
  });
}));
