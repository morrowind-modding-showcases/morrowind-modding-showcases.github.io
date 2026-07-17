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

  function mapUrlFor(modUrl, mappedMods) {
    const id = nexusModId(modUrl);
    if (!id) return '';
    const mappedMod = typeof mappedMods?.get === 'function'
      ? mappedMods.get(id)
      : (mappedMods?.has(id) ? true : null);
    if (!mappedMod) return '';
    const firstLocation = mappedMod !== true && Array.isArray(mappedMod.locations)
      ? String(mappedMod.locations[0] || '').trim()
      : '';
    return '/map/?mod=' + encodeURIComponent(id) +
      (firstLocation ? '&location=' + encodeURIComponent(firstLocation) : '');
  }

  function findMappedMod(mods, id) {
    const requestedId = String(id || '').trim();
    if (!/^\d+$/.test(requestedId)) return null;
    return (mods || []).find(mod => nexusModId(mod.url) === requestedId) || null;
  }

  return Object.freeze({ nexusModId, mappedModsById, mappedModIds, mapUrlFor, findMappedMod });
}));
