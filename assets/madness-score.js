(function (root, factory) {
  'use strict';

  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MmsMadnessScore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var RULES = Object.freeze({
    entry: Object.freeze({
      modathon: 10,
      modjam: 10,
      madness: 10
    }),
    placement: Object.freeze({
      first: 100,
      second: 50,
      third: 25
    }),
    modderthlon: 100,
    achievement: Object.freeze({
      gold: 100,
      silver: 50,
      bronze: 25,
      hidden: 40,
      challenge: 30,
      category: 20,
      metrics: 10,
      other: 15
    })
  });

  function identityKey(value) {
    return String(value || '')
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  function referenceId(reference) {
    if (typeof reference === 'string') return reference;
    return reference && (reference.id || reference.modderId) || '';
  }

  function achievementBucket(achievement) {
    var key = String(
      (achievement && achievement.rarityKey || '') + ' '
      + (achievement && achievement.rarity || '')
    ).toLowerCase();
    if (key.includes('gold') || key.includes('ruby')) return 'gold';
    if (key.includes('silver')) return 'silver';
    if (key.includes('copper') || key.includes('bronze')) return 'bronze';
    if (key.includes('category')) return 'category';
    if (key.includes('challenge')) return 'challenge';
    if (key.includes('metric')) return 'metrics';
    if (key.includes('hidden')) return 'hidden';
    return 'other';
  }

  function achievementPoints(achievement) {
    return RULES.achievement[achievementBucket(achievement)] || RULES.achievement.other;
  }

  function placementRank(value) {
    var key = String(value || '').trim().toLowerCase();
    if (!key) return null;
    if (
      key === 'first'
      || key === 'popular-choice'
      || /\b(1st|first|overall winner|people'?s choice winner|popular choice winner)\b/.test(key)
    ) return 1;
    if (key === 'runner-up' || /\b(2nd|second|runner-up)\b/.test(key)) return 2;
    if (key === 'third' || /\b(3rd|third)\b/.test(key)) return 3;
    return null;
  }

  function placementPoints(rank) {
    return rank === 1
      ? RULES.placement.first
      : rank === 2
        ? RULES.placement.second
        : rank === 3
          ? RULES.placement.third
          : 0;
  }

  function createProfile(modder) {
    return {
      id: modder.id,
      name: modder.name,
      total: 0,
      entries: {
        modathon: { count: 0, points: 0 },
        modjam: { count: 0, points: 0 },
        madness: { count: 0, points: 0 }
      },
      achievements: { count: 0, points: 0 },
      placements: { first: 0, second: 0, third: 0, count: 0, points: 0 },
      modderthlons: { count: 0, years: [], points: 0 },
      _participationYears: {
        modathon: new Set(),
        modjam: new Set(),
        madness: new Set()
      }
    };
  }

  function createResolver(registry, profilesById) {
    var resolved = new Map();
    var ambiguous = new Set();

    (registry.modders || []).forEach(function (modder) {
      [modder.name].concat(modder.aliases || []).forEach(function (name) {
        var key = identityKey(name);
        if (!key || ambiguous.has(key)) return;
        var existing = resolved.get(key);
        if (existing && existing !== modder.id) {
          resolved.delete(key);
          ambiguous.add(key);
        } else {
          resolved.set(key, modder.id);
        }
      });
    });

    return function resolveName(name) {
      var id = resolved.get(identityKey(name));
      return id ? profilesById.get(id) || null : null;
    };
  }

  function uniqueProfiles(profiles) {
    var seen = new Set();
    return profiles.filter(function (profile) {
      if (!profile || seen.has(profile.id)) return false;
      seen.add(profile.id);
      return true;
    });
  }

  function addEntry(profile, eventType, year) {
    if (!profile || !profile.entries[eventType]) return;
    profile.entries[eventType].count += 1;
    profile.entries[eventType].points += RULES.entry[eventType];
    if (Number.isFinite(Number(year))) profile._participationYears[eventType].add(Number(year));
  }

  function addPlacement(profile, rank) {
    var points = placementPoints(rank);
    if (!profile || !points) return;
    var key = rank === 1 ? 'first' : rank === 2 ? 'second' : 'third';
    profile.placements[key] += 1;
    profile.placements.count += 1;
    profile.placements.points += points;
  }

  function buildScoreDocument(input) {
    input = input || {};
    var registry = input.registry || { modders: [] };
    var profilesById = new Map((registry.modders || []).map(function (modder) {
      return [modder.id, createProfile(modder)];
    }));
    var resolveName = createResolver(registry, profilesById);

    var modathonMods = input.modathonMods && input.modathonMods.mods || {};
    Object.entries(modathonMods).forEach(function (entry) {
      var year = Number(entry[0]);
      (entry[1] || []).forEach(function (mod) {
        var authors = (Array.isArray(mod.authors) ? mod.authors : [mod.authors])
          .filter(function (author) {
            return typeof author === 'string' || !author || author.contributed !== false;
          })
          .map(function (author) {
            return resolveName(typeof author === 'string' ? author : author && author.name);
          });
        uniqueProfiles(authors).forEach(function (profile) {
          addEntry(profile, 'modathon', year);
        });
      });
    });

    var modjamEventYears = new Map(
      ((input.modjamEvents && input.modjamEvents.events) || []).map(function (event) {
        return [event.id, Number(event.year)];
      })
    );
    (((input.modjamMods && input.modjamMods.events) || [])).forEach(function (event) {
      var year = modjamEventYears.get(event.id);
      if (!Number.isFinite(year)) {
        year = Number(String(event.id || '').match(/\b(20\d{2})\b/)?.[1]);
      }
      (event.mods || event.entries || []).forEach(function (mod) {
        var authors = uniqueProfiles((mod.authors || []).map(function (author) {
          return profilesById.get(referenceId(author)) || null;
        }));
        var rank = placementRank(mod.placement || mod.placementLabel);
        authors.forEach(function (profile) {
          addEntry(profile, 'modjam', year);
          addPlacement(profile, rank);
        });
      });
    });

    (((input.madnessTeams && input.madnessTeams.years) || [])).forEach(function (group) {
      var year = Number(group.year);
      (group.teams || []).forEach(function (team) {
        var members = uniqueProfiles((team.members || []).map(function (member) {
          return profilesById.get(referenceId(member)) || null;
        }));
        members.forEach(function (profile) {
          (team.mods || []).forEach(function () {
            addEntry(profile, 'madness', year);
          });
          addPlacement(profile, placementRank(team.place));
        });
      });
    });

    (input.achievementDocuments || []).forEach(function (document) {
      (document.achievements || []).forEach(function (achievement) {
        (achievement.unlockedBy || []).forEach(function (name) {
          var profile = resolveName(name);
          if (!profile) return;
          profile.achievements.count += 1;
          profile.achievements.points += achievementPoints(achievement);
        });
      });
    });

    (((input.modathonEvents && input.modathonEvents.events) || [])).forEach(function (event) {
      (event.awards || []).forEach(function (award) {
        var rank = placementRank(award.award);
        (award.mods || []).forEach(function (mod) {
          uniqueProfiles((mod.attribution || []).map(resolveName)).forEach(function (profile) {
            if (rank) addPlacement(profile, rank);
          });
        });
      });
    });

    var output = {};
    profilesById.forEach(function (profile) {
      var modderthlonYears = Array.from(profile._participationYears.modathon)
        .filter(function (year) {
          return profile._participationYears.modjam.has(year)
            && profile._participationYears.madness.has(year);
        })
        .sort(function (left, right) { return left - right; });
      profile.modderthlons.count = modderthlonYears.length;
      profile.modderthlons.years = modderthlonYears;
      profile.modderthlons.points = modderthlonYears.length * RULES.modderthlon;
      profile.total = Object.values(profile.entries).reduce(function (sum, entry) {
        return sum + entry.points;
      }, 0)
        + profile.achievements.points
        + profile.placements.points
        + profile.modderthlons.points;
      delete profile._participationYears;
      if (profile.total > 0) output[profile.id] = profile;
    });

    return {
      schemaVersion: 1,
      rules: JSON.parse(JSON.stringify(RULES)),
      modders: output
    };
  }

  function entryCount(profile) {
    if (!profile || !profile.entries) return 0;
    return Object.values(profile.entries).reduce(function (sum, entry) {
      return sum + (entry.count || 0);
    }, 0);
  }

  function summaryParts(profile) {
    if (!profile) return ['No scored event activity'];
    var parts = [
      entryCount(profile) + (entryCount(profile) === 1 ? ' entry' : ' entries'),
      profile.achievements.count + (profile.achievements.count === 1 ? ' achievement' : ' achievements')
    ];
    if (profile.placements.count) {
      parts.push(profile.placements.count + (profile.placements.count === 1 ? ' placement' : ' placements'));
    }
    if (profile.modderthlons.count) {
      parts.push(profile.modderthlons.count + (profile.modderthlons.count === 1 ? ' Modderthlon' : ' Modderthlons'));
    }
    return parts;
  }

  function summary(profile) {
    return summaryParts(profile).join(' · ');
  }

  function summaryRows(profile) {
    var parts = summaryParts(profile);
    return [
      parts.slice(0, 2).join(' · '),
      parts.slice(2).join(' · ')
    ].filter(Boolean);
  }

  return {
    RULES: RULES,
    achievementBucket: achievementBucket,
    achievementPoints: achievementPoints,
    buildScoreDocument: buildScoreDocument,
    entryCount: entryCount,
    identityKey: identityKey,
    placementPoints: placementPoints,
    placementRank: placementRank,
    summary: summary,
    summaryParts: summaryParts,
    summaryRows: summaryRows
  };
});
