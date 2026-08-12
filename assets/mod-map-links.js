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

  function normalizeExteriorCells(cells) {
    const byKey = new Map();
    for (const value of Array.isArray(cells) ? cells : []) {
      let x;
      let y;
      if (Array.isArray(value) && value.length === 2) {
        [x, y] = value;
      } else if (typeof value === 'string') {
        const match = value.match(/^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/);
        if (match) [, x, y] = match;
      }
      x = Number(x);
      y = Number(y);
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) continue;
      const key = x + ',' + y;
      if (!byKey.has(key)) byKey.set(key, [x, y]);
    }
    return [...byKey.values()];
  }

  const EXTERIOR_HEAT_LIMIT = 100;
  const EXTERIOR_HEAT_COLORS = [
    '#39d8ae',
    '#86d94a',
    '#f2cf3a',
    '#ff8b3d',
    '#ff3d57',
  ];

  function exteriorHeatPosition(modCount) {
    const numericCount = Number(modCount);
    const boundedCount = Number.isNaN(numericCount)
      ? 1
      : Math.max(1, Math.min(EXTERIOR_HEAT_LIMIT, numericCount));
    return Math.log(boundedCount) / Math.log(EXTERIOR_HEAT_LIMIT);
  }

  function exteriorHeatColor(modCount) {
    const position = exteriorHeatPosition(modCount);
    const scaled = position * (EXTERIOR_HEAT_COLORS.length - 1);
    const lowerIndex = Math.min(EXTERIOR_HEAT_COLORS.length - 2, Math.floor(scaled));
    const mix = scaled - lowerIndex;
    const channels = (hex) => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
    const lower = channels(EXTERIOR_HEAT_COLORS[lowerIndex]);
    const upper = channels(EXTERIOR_HEAT_COLORS[lowerIndex + 1]);
    return '#' + lower.map((channel, index) =>
      Math.round(channel + (upper[index] - channel) * mix).toString(16).padStart(2, '0')
    ).join('');
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
    const firstExteriorCell = mappedMod !== true
      ? normalizeExteriorCells(mappedMod.exterior_cells)[0] || null
      : null;
    return '/map/?mod=' + encodeURIComponent(id) +
      (firstLocation
        ? '&location=' + encodeURIComponent(firstLocation)
        : firstExteriorCell
          ? '&cell=' + encodeURIComponent(firstExteriorCell.join(','))
          : '');
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
    normalizeExteriorCells,
    exteriorHeatPosition,
    exteriorHeatColor,
    mapUrlFor,
    findMappedMod,
  });
}));
