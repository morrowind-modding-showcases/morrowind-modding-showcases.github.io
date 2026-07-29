(function (root, factory) {
  'use strict';

  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MmsModders = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function referenceId(reference) {
    if (typeof reference === 'string') return reference;
    return reference && (reference.id || reference.modderId) || '';
  }

  function referenceIds(data) {
    return (data && Array.isArray(data.modders) ? data.modders : [])
      .map(referenceId)
      .filter(Boolean);
  }

  function identityKey(value) {
    return String(value || '')
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  function modathonAuthorName(author) {
    return typeof author === 'string' ? author : author && author.name || '';
  }

  function uniqueIds(values) {
    return Array.from(new Set(values.filter(Boolean)));
  }

  function registryProfiles(data) {
    return data && Array.isArray(data.modders) ? data.modders : [];
  }

  function registryById(data) {
    return new Map(registryProfiles(data).map(function (profile) {
      return [profile.id, profile];
    }));
  }

  function resolveProfiles(registry, references) {
    var byId = registryById(registry);
    return referenceIds(references).map(function (id) {
      return byId.get(id);
    }).filter(Boolean);
  }

  function asModathonProfiles(registry, references) {
    return resolveProfiles(registry, references).map(function (profile) {
      return {
        id: profile.id,
        name: profile.name,
        url: profile.nexusProfileUrl || null,
        avatar: profile.avatarUrl || null,
        aliases: Array.isArray(profile.aliases) ? profile.aliases : []
      };
    }).sort(function (left, right) { return left.name.localeCompare(right.name); });
  }

  function inferModathonReferences(data, registry) {
    var profilesByName = new Map();
    registryProfiles(registry).forEach(function (profile) {
      [profile.name].concat(profile.aliases || []).forEach(function (name) {
        profilesByName.set(identityKey(name), profile.id);
      });
    });
    var groups = data && data.mods || {};
    var mods = Array.isArray(groups)
      ? groups
      : Object.values(groups).flat();
    return {
      modders: uniqueIds(mods.flatMap(function (mod) {
        return (mod.authors || []).map(function (author) {
          return profilesByName.get(identityKey(modathonAuthorName(author)));
        });
      }))
    };
  }

  function inferModjamReferences(data) {
    var events = data && data.events || [];
    return {
      modders: uniqueIds(events.flatMap(function (event) {
        var mods = event.mods || event.entries || [];
        return mods.flatMap(function (mod) {
          return (mod.authors || []).map(referenceId);
        });
      }))
    };
  }

  function inferMadnessReferences(data) {
    var years = Array.isArray(data) ? data : data && data.years || [];
    return {
      modders: uniqueIds(years.flatMap(function (group) {
        return (group.teams || []).flatMap(function (team) {
          return (team.members || []).map(referenceId);
        });
      }))
    };
  }

  function hydrateMadnessTeams(data, registry) {
    var years = Array.isArray(data) ? data : data && data.years || [];
    var byId = registryById(registry);

    return years.map(function (group) {
      return Object.assign({}, group, {
        teams: (group.teams || []).map(function (team) {
          return Object.assign({}, team, {
            members: (team.members || []).map(function (reference) {
              var id = referenceId(reference);
              var profile = byId.get(id);
              if (!profile && reference && typeof reference === 'object' && reference.name) {
                return reference;
              }
              if (!profile) return { id: id, name: id, profileUrl: null, avatar: null };
              return {
                id: profile.id,
                name: profile.name,
                profileUrl: profile.nexusProfileUrl || null,
                avatar: profile.avatarUrl || null
              };
            })
          });
        })
      });
    });
  }

  function combineModjamData(archive, mods) {
    var modsByEventId = new Map(
      (mods && Array.isArray(mods.events) ? mods.events : []).map(function (group) {
        return [group.id, Array.isArray(group.mods) ? group.mods : []];
      })
    );

    var combined = Object.assign({}, archive || {}, {
      generatedAt: mods && mods.generatedAt || null,
      summary: mods && mods.summary || {},
      events: (archive && Array.isArray(archive.events) ? archive.events : []).map(function (event) {
        return Object.assign({}, event, {
          entries: modsByEventId.get(event.id) || []
        });
      })
    });
    return combined;
  }

  function separateModjamData(archive) {
    var metadata = Object.assign({}, archive || {});
    delete metadata.generatedAt;
    delete metadata.summary;
    delete metadata.events;
    return {
      archive: Object.assign(metadata, {
        events: (archive && Array.isArray(archive.events) ? archive.events : []).map(function (event) {
          var metadata = Object.assign({}, event);
          delete metadata.entries;
          if (!Array.isArray(metadata.themes)) {
            metadata.themes = Array.from(new Set(
              (event.entries || []).flatMap(function (entry) { return entry.themes || []; })
            ));
          }
          return metadata;
        })
      }),
      mods: {
        generatedAt: archive && archive.generatedAt || null,
        summary: archive && archive.summary || {},
        events: (archive && Array.isArray(archive.events) ? archive.events : []).map(function (event) {
          return {
            id: event.id,
            mods: Array.isArray(event.entries) ? event.entries.map(function (entry) {
              var mod = Object.assign({}, entry);
              delete mod.themes;
              return mod;
            }) : []
          };
        })
      }
    };
  }

  function hydrateModjam(archive, registry, references, modathonReferences, madnessReferences) {
    references = references || inferModjamReferences(archive);
    var byId = registryById(registry);
    var modathonIds = new Set(referenceIds(modathonReferences));
    var madnessIds = new Set(referenceIds(madnessReferences));
    var profiles = resolveProfiles(registry, references).map(function (profile) {
      return {
        id: profile.id,
        name: profile.name,
        nexusProfileUrl: profile.nexusProfileUrl || null,
        avatarUrl: profile.avatarUrl || null,
        modathonProfileUrl: modathonIds.has(profile.id)
          ? 'https://darkelfmodding.com/modathon/modder/' + encodeURIComponent(profile.id)
          : null,
        madnessProfileUrl: madnessIds.has(profile.id)
          ? 'https://darkelfmodding.com/madness/modder?name=' + encodeURIComponent(profile.name)
          : null,
        firstModjam: null,
        participations: [],
        listedModjamCount: 0,
        entryIds: [],
        placementEntryIds: [],
        awardCount: 0
      };
    });
    var profilesById = new Map(profiles.map(function (profile) {
      return [profile.id, profile];
    }));

    (archive.events || []).forEach(function (event) {
      (event.entries || []).forEach(function (entry) {
        entry.authors = (entry.authors || []).map(function (reference) {
          var id = referenceId(reference);
          var profile = byId.get(id);
          return {
            id: id,
            name: profile ? profile.name : reference && reference.name || id
          };
        });

        entry.authors.forEach(function (author) {
          var profile = profilesById.get(author.id);
          if (!profile) return;
          profile.entryIds.push(entry.id);
          if (entry.placement) profile.placementEntryIds.push(entry.id);
          profile.awardCount += (entry.awards || []).length;
          if (!profile.participations.includes(event.label)) profile.participations.push(event.label);
        });
      });
    });

    profiles.forEach(function (profile) {
      profile.firstModjam = profile.participations[0] || null;
      profile.listedModjamCount = profile.participations.length;
    });
    profiles.sort(function (left, right) { return left.name.localeCompare(right.name); });

    return { modders: profiles };
  }

  return {
    asModathonProfiles: asModathonProfiles,
    combineModjamData: combineModjamData,
    hydrateMadnessTeams: hydrateMadnessTeams,
    hydrateModjam: hydrateModjam,
    inferMadnessReferences: inferMadnessReferences,
    inferModathonReferences: inferModathonReferences,
    inferModjamReferences: inferModjamReferences,
    referenceId: referenceId,
    referenceIds: referenceIds,
    registryById: registryById,
    registryProfiles: registryProfiles,
    separateModjamData: separateModjamData,
    resolveProfiles: resolveProfiles
  };
});
