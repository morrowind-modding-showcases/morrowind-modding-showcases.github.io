(function (root, factory) {
  'use strict';

  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MmsOrder = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

  function normalizedContributorName(value) {
    return String(value == null ? '' : value)
      .trim()
      .replace(/\s+/gu, ' ')
      .normalize('NFKC')
      .toLocaleLowerCase('en-US');
  }

  function wikiContributorNames(modder) {
    return Array.isArray(modder && modder.wiki && modder.wiki.contributorNames)
      ? modder.wiki.contributorNames
      : [];
  }

  function buildIdentityIndex(modders) {
    var byId = new Map();
    var byContributorName = new Map();
    (modders || []).forEach(function (modder) {
      byId.set(modder.id, modder);
      wikiContributorNames(modder).forEach(function (name) {
        var key = normalizedContributorName(name);
        if (!key) return;
        var existing = byContributorName.get(key);
        if (existing && existing.id !== modder.id) {
          throw new Error(
            'Ambiguous wiki contributor identity ' + JSON.stringify(name)
            + ': modder profiles "' + existing.name + '" (' + existing.id + ') and "'
            + modder.name + '" (' + modder.id + ') both claim the normalized name '
            + JSON.stringify(key) + '.'
          );
        }
        byContributorName.set(key, modder);
      });
    });
    return { byId: byId, byContributorName: byContributorName };
  }

  function resolveContribution(record, identityIndex) {
    if (record && record.contributorType === 'modder' && record.modderId) {
      var direct = identityIndex.byId.get(record.modderId);
      if (!direct) {
        throw new Error(
          'Wiki contribution ' + JSON.stringify(record.submissionId || '<unknown>')
          + ' references unknown modderId ' + JSON.stringify(record.modderId) + '.'
        );
      }
      return direct;
    }
    return identityIndex.byContributorName.get(
      normalizedContributorName(record && record.contributor)
    ) || null;
  }

  function decayOrderliness(value, fromTimestamp, toTimestamp, rules) {
    if (!(value > 0) || !fromTimestamp) return 0;
    var from = Date.parse(fromTimestamp);
    var to = toTimestamp instanceof Date
      ? toTimestamp.getTime()
      : typeof toTimestamp === 'number'
        ? toTimestamp
        : Date.parse(toTimestamp);
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      throw new Error('Orderliness decay requires valid timestamps.');
    }
    var elapsedDays = Math.max(0, (to - from) / DAY_MILLISECONDS);
    var floor = rules.orderliness.floor;
    var result = floor + (value - floor)
      * Math.exp(-rules.orderliness.decayLambda * elapsedDays);
    return value > floor && result === floor ? floor + Number.EPSILON : result;
  }

  function emptyOrderState() {
    return {
      orderScore: 0,
      hasMarkOfOrder: false,
      orderlinessAtLastActivity: 0,
      lastOrderActivityAt: null,
      orderActivityDays: 0,
      lastOrderActivityDay: null,
    };
  }

  function applyOrderEvent(state, event, rules) {
    var next = Object.assign({}, state || emptyOrderState());
    if (!event || event.type !== 'wiki-contribution') return next;
    var timestamp = new Date(event.at).toISOString();
    var activityDay = timestamp.slice(0, 10);

    next.orderScore += rules.orderScorePerContribution;
    next.hasMarkOfOrder = next.orderScore > 0;
    if (!next.lastOrderActivityAt) {
      next.orderlinessAtLastActivity = rules.orderliness.gainPerActiveDay;
      next.orderActivityDays = 1;
    } else {
      next.orderlinessAtLastActivity = decayOrderliness(
        next.orderlinessAtLastActivity,
        next.lastOrderActivityAt,
        timestamp,
        rules
      );
      if (next.lastOrderActivityDay !== activityDay) {
        next.orderlinessAtLastActivity = Math.min(
          100,
          next.orderlinessAtLastActivity + rules.orderliness.gainPerActiveDay
        );
        next.orderActivityDays += 1;
      }
    }
    next.lastOrderActivityAt = timestamp;
    next.lastOrderActivityDay = activityDay;
    return next;
  }

  function publicOrderState(modder, state) {
    return {
      modderId: modder.id,
      name: modder.name,
      orderScore: state.orderScore,
      hasMarkOfOrder: state.hasMarkOfOrder,
      orderlinessAtLastActivity: state.orderlinessAtLastActivity,
      lastOrderActivityAt: state.lastOrderActivityAt,
      orderActivityDays: state.orderActivityDays,
    };
  }

  function buildOrderDocument(input) {
    input = input || {};
    var rules = input.rules;
    if (!rules) throw new Error('Order rules are required.');
    var modders = input.modders || [];
    var contributions = input.contributions || [];
    var identities = buildIdentityIndex(modders);
    var states = new Map(modders.map(function (modder) {
      return [modder.id, emptyOrderState()];
    }));
    var unlinked = new Map();

    contributions.slice().sort(function (left, right) {
      return String(left.submittedAt).localeCompare(String(right.submittedAt))
        || String(left.submissionId).localeCompare(String(right.submissionId));
    }).forEach(function (record) {
      var modder = resolveContribution(record, identities);
      if (!modder) {
        var displayName = String(record.contributor || '').trim();
        var key = normalizedContributorName(displayName);
        var summary = unlinked.get(key) || { contributor: displayName, contributions: 0 };
        summary.contributions += 1;
        unlinked.set(key, summary);
        return;
      }
      states.set(modder.id, applyOrderEvent(states.get(modder.id), {
        type: 'wiki-contribution',
        at: record.submittedAt,
        contribution: record,
      }, rules));
    });

    var profiles = {};
    modders.slice().sort(function (left, right) {
      return left.id.localeCompare(right.id);
    }).forEach(function (modder) {
      profiles[modder.id] = publicOrderState(modder, states.get(modder.id));
    });
    return {
      schemaVersion: 1,
      rules: rules,
      modders: profiles,
      unlinkedContributors: Array.from(unlinked.values()).sort(function (left, right) {
        return right.contributions - left.contributions
          || left.contributor.localeCompare(right.contributor, 'en', {
            sensitivity: 'base', numeric: true
          });
      }),
    };
  }

  function currentOrderliness(profile, rules, now) {
    if (!profile || !profile.lastOrderActivityAt) return 0;
    return decayOrderliness(
      profile.orderlinessAtLastActivity,
      profile.lastOrderActivityAt,
      now == null ? Date.now() : now,
      rules
    );
  }

  function orderlinessState(rawValue, rules, hasContributed) {
    if (!hasContributed || !(rawValue > 0)) return '---';
    var state = rules.orderliness.states.find(function (candidate) {
      return rawValue > candidate.minExclusive && rawValue <= candidate.maxInclusive;
    });
    return state ? state.title : '---';
  }

  function profileView(profile, rules, now) {
    var hasContributed = !!(profile && profile.orderScore > 0);
    var rawOrderliness = currentOrderliness(profile, rules, now);
    return {
      modderId: profile && profile.modderId,
      orderScore: profile && profile.orderScore || 0,
      hasMarkOfOrder: !!(profile && profile.hasMarkOfOrder),
      rawOrderliness: rawOrderliness,
      displayOrderliness: hasContributed ? Math.max(1, Math.round(rawOrderliness)) : 0,
      orderlinessState: orderlinessState(rawOrderliness, rules, hasContributed),
      lastOrderActivityAt: profile && profile.lastOrderActivityAt || null,
      orderActivityDays: profile && profile.orderActivityDays || 0,
    };
  }

  function externalContributors(contributions, modders) {
    var identities = buildIdentityIndex(modders || []);
    var names = new Map();
    (contributions || []).forEach(function (record) {
      if (resolveContribution(record, identities)) return;
      var name = String(record.contributor || '').trim();
      var key = normalizedContributorName(name);
      if (key && !names.has(key)) names.set(key, name);
    });
    return Array.from(names.values()).sort(function (left, right) {
      return left.localeCompare(right, 'en', { sensitivity: 'base', numeric: true });
    });
  }

  return {
    applyOrderEvent: applyOrderEvent,
    buildIdentityIndex: buildIdentityIndex,
    buildOrderDocument: buildOrderDocument,
    currentOrderliness: currentOrderliness,
    decayOrderliness: decayOrderliness,
    externalContributors: externalContributors,
    normalizedContributorName: normalizedContributorName,
    orderlinessState: orderlinessState,
    profileView: profileView,
    resolveContribution: resolveContribution,
  };
});
