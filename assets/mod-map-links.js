(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Tes3ModMapLinks = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  function nexusModId(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      const url = new URL(value);
      if (!/(^|\.)nexusmods\.com$/i.test(url.hostname)) return '';
      return url.pathname.match(/^\/morrowind\/mods\/(\d+)(?:\/|$)/i)?.[1] || '';
    } catch (error) {
      return '';
    }
  }

  function mappedModsById(modData) {
    const result = new Map();
    for (const mod of modData?.mods || []) {
      const id = nexusModId(mod.url);
      if (id && !result.has(id)) result.set(id, mod);
    }
    return result;
  }

  function mappedModIds(modData) {
    return new Set(mappedModsById(modData).keys());
  }

  function mergePrefixedLocations(locations) {
    const values = (Array.isArray(locations) ? locations : [])
      .map(value => String(value || '').trim())
      .filter(Boolean);
    const byKey = new Map();
    for (const value of values) {
      const key = value.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, value);
    }

    const parentByKey = new Map();
    for (const key of byKey.keys()) {
      let parent = '';
      for (const candidate of byKey.keys()) {
        if (candidate.length > parent.length && key.startsWith(candidate + ',')) parent = candidate;
      }
      if (parent) parentByKey.set(key, parent);
    }

    const rootKey = (key) => {
      const visited = new Set();
      while (parentByKey.has(key) && !visited.has(key)) {
        visited.add(key);
        key = parentByKey.get(key);
      }
      return key;
    };

    const merged = [];
    const seen = new Set();
    for (const value of values) {
      const key = rootKey(value.toLowerCase());
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(byKey.get(key));
    }
    return merged;
  }

  function mapUrlFor(modUrl, mappedMods) {
    const id = nexusModId(modUrl);
    if (!id) return '';
    const mappedMod = typeof mappedMods?.get === 'function'
      ? mappedMods.get(id)
      : (mappedMods?.has(id) ? true : null);
    if (!mappedMod) return '';
    const firstLocation = mappedMod !== true
      ? mergePrefixedLocations(mappedMod.locations)[0] || ''
      : '';
    return '/map/?mod=' + encodeURIComponent(id) +
      (firstLocation ? '&location=' + encodeURIComponent(firstLocation) : '');
  }

  function findMappedMod(mods, id) {
    const requestedId = String(id || '').trim();
    if (!requestedId) return null;
    return (mods || []).find(mod =>
      mod.id === requestedId ||
      mod.wiki_slug === requestedId ||
      (/^\d+$/.test(requestedId) && nexusModId(mod.url) === requestedId)
    ) || null;
  }

  return Object.freeze({
    nexusModId,
    mappedModsById,
    mappedModIds,
    mergePrefixedLocations,
    mapUrlFor,
    findMappedMod,
  });
}));
