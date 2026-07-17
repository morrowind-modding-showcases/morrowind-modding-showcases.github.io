(function (root, factory) {
  'use strict';

  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MadnessProfiles = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PLACEMENT_RE = /^(\d+)(?:st|nd|rd|th) Place(?:\s*\(tie\))?$/i;

  function rankFromPlace(place) {
    var match = String(place || '').match(/(\d+)/);
    return match ? Number(match[1]) : 99;
  }

  function isPlacementSentinel(mod) {
    return !!mod && !mod.url && PLACEMENT_RE.test(String(mod.name || '').trim());
  }

  function getTeamPlace(team) {
    if (team && team.place) return team.place;
    var sentinel = (team && team.mods || []).find(isPlacementSentinel);
    return sentinel ? sentinel.name : null;
  }

  function placeColor(place) {
    var rank = rankFromPlace(place);
    return rank === 1 ? '#e8b23a' : rank === 2 ? '#b9b3a6' : rank === 3 ? '#c77b46' : '#8a8272';
  }

  function profileUrl(name) {
    return 'modder?name=' + encodeURIComponent(name);
  }

  function longestStreak(years, madnessYears) {
    var order = new Map(madnessYears.map(function (year, index) { return [year, index]; }));
    var entries = Array.from(new Set(years)).filter(function (year) { return order.has(year); })
      .sort(function (a, b) { return order.get(a) - order.get(b); });
    if (!entries.length) return { count: 0, startYear: null, endYear: null, years: [] };

    var best = [entries[0]];
    var current = [entries[0]];
    for (var i = 1; i < entries.length; i++) {
      if (order.get(entries[i]) === order.get(entries[i - 1]) + 1) current.push(entries[i]);
      else current = [entries[i]];
      if (current.length > best.length) best = current.slice();
    }
    return {
      count: best.length,
      startYear: best[0],
      endYear: best[best.length - 1],
      years: best
    };
  }

  function buildProfiles(modders, teamsByYear, modsByYear) {
    var profiles = new Map();
    var modDetails = new Map();
    var madnessYears = teamsByYear.map(function (group) { return group.year; }).sort(function (a, b) { return a - b; });

    (modders || []).forEach(function (modder) {
      profiles.set(modder.name.toLowerCase(), Object.assign({}, modder, {
        teamHistory: [],
        submissions: [],
        partnerCounts: new Map()
      }));
    });

    (modsByYear || []).forEach(function (group) {
      group.mods.forEach(function (mod) {
        modDetails.set(group.year + '\u0000' + mod.name, mod);
      });
    });

    function ensureProfile(member) {
      var key = member.name.toLowerCase();
      if (!profiles.has(key)) {
        profiles.set(key, {
          name: member.name,
          profileUrl: member.profileUrl || null,
          avatar: member.avatar || null,
          modathonProfile: null,
          teamHistory: [],
          submissions: [],
          partnerCounts: new Map()
        });
      }
      var profile = profiles.get(key);
      if (!profile.profileUrl && member.profileUrl) profile.profileUrl = member.profileUrl;
      if (!profile.avatar && member.avatar) profile.avatar = member.avatar;
      return profile;
    }

    (teamsByYear || []).forEach(function (group) {
      group.teams.forEach(function (team) {
        var place = getTeamPlace(team);
        var cleanMods = (team.mods || []).filter(function (mod) { return !isPlacementSentinel(mod); });
        var memberNames = (team.members || []).map(function (member) { return member.name; });

        (team.members || []).forEach(function (member) {
          var profile = ensureProfile(member);
          profile.teamHistory.push({
            year: group.year,
            name: team.name,
            place: place,
            rank: rankFromPlace(place),
            placeColor: placeColor(place),
            teamUrl: 'teams?year=' + group.year,
            partners: memberNames.filter(function (name) { return name !== member.name; })
          });

          cleanMods.forEach(function (teamMod) {
            var detail = modDetails.get(group.year + '\u0000' + teamMod.name);
            var modPlace = detail && detail.place || null;
            profile.submissions.push({
              year: group.year,
              name: teamMod.name,
              url: detail ? detail.url : teamMod.url || null,
              team: team.name,
              category: detail && detail.category || null,
              place: modPlace,
              rank: rankFromPlace(modPlace),
              placeColor: placeColor(modPlace),
              notes: detail && detail.notes || null
            });
          });

          (team.members || []).forEach(function (partner) {
            if (partner.name === member.name) return;
            var partnerKey = partner.name.toLowerCase();
            var pairing = profile.partnerCounts.get(partnerKey) || {
              name: partner.name,
              avatar: partner.avatar || null,
              years: []
            };
            pairing.years.push(group.year);
            if (!pairing.avatar && partner.avatar) pairing.avatar = partner.avatar;
            profile.partnerCounts.set(partnerKey, pairing);
          });
        });
      });
    });

    return Array.from(profiles.values()).map(function (profile) {
      var history = profile.teamHistory.sort(function (a, b) { return b.year - a.year; });
      var years = history.map(function (entry) { return entry.year; }).sort(function (a, b) { return a - b; });
      var bestRank = history.reduce(function (best, entry) { return Math.min(best, entry.rank); }, 99);
      var bestEntries = history.filter(function (entry) { return entry.rank === bestRank; });
      var streak = longestStreak(years, madnessYears);
      var pairings = Array.from(profile.partnerCounts.values()).map(function (pairing) {
        var partner = profiles.get(pairing.name.toLowerCase()) || pairing;
        return Object.assign({}, pairing, {
          avatar: partner.avatar || pairing.avatar || null,
          noAvatar: !(partner.avatar || pairing.avatar),
          initial: pairing.name.charAt(0).toUpperCase(),
          count: pairing.years.length,
          yearsLabel: pairing.years.join(', '),
          profileUrl: profileUrl(pairing.name)
        });
      }).sort(function (a, b) {
        return b.count - a.count || a.name.localeCompare(b.name);
      });

      var placementCounts = new Map();
      profile.submissions.forEach(function (mod) {
        if (!mod.place) return;
        var key = mod.place.replace(/\s*\(tie\)/i, '');
        placementCounts.set(key, (placementCounts.get(key) || 0) + 1);
      });

      var placementSummary = Array.from(placementCounts, function (entry) {
        return {
          place: entry[0].toUpperCase(),
          count: entry[1],
          rank: rankFromPlace(entry[0]),
          color: placeColor(entry[0])
        };
      }).sort(function (a, b) { return a.rank - b.rank; });

      var submissionGroups = history.map(function (entry) {
        return {
          year: entry.year,
          team: entry.name,
          mods: profile.submissions.filter(function (mod) { return mod.year === entry.year; })
            .map(function (mod) {
              return Object.assign({}, mod, {
                noUrl: !mod.url,
                noPlace: !mod.place,
                categoryLabel: mod.category || 'Uncategorized',
                placeLabel: mod.place ? mod.place.toUpperCase() : 'NOT PLACED'
              });
            })
        };
      });

      var bestPlace = bestEntries.length ? bestEntries[0].place : null;
      return Object.assign({}, profile, {
        firstYear: years[0] || profile.firstYear || null,
        years: years,
        totalCompetitions: history.length,
        highestPlace: bestPlace,
        highestPlaceYears: bestEntries.map(function (entry) { return entry.year; }).sort(),
        teamHistory: history,
        submissions: profile.submissions.sort(function (a, b) { return b.year - a.year; }),
        submissionGroups: submissionGroups,
        placementSummary: placementSummary,
        pairings: pairings,
        frequentPartners: pairings.filter(function (pairing) { return pairing.count > 1; }).slice(0, 6),
        longestStreak: streak,
        madnessProfile: profileUrl(profile.name),
        partnerCounts: undefined
      });
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  function findProfile(profiles, name) {
    var key = String(name || '').trim().toLowerCase();
    return profiles.find(function (profile) { return profile.name.toLowerCase() === key; }) || null;
  }

  return {
    buildProfiles: buildProfiles,
    findProfile: findProfile,
    getTeamPlace: getTeamPlace,
    isPlacementSentinel: isPlacementSentinel,
    longestStreak: longestStreak,
    placeColor: placeColor,
    profileUrl: profileUrl,
    rankFromPlace: rankFromPlace
  };
});
