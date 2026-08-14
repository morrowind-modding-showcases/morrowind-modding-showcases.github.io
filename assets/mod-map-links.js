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

  function locationValue(location) {
    const record = location?.loc || location;
    if (typeof record === 'string') return record.trim();
    const value = record?.cell || record?.name;
    return typeof value === 'string' ? value.trim() : '';
  }

  const locationParentAliases = new Map([
    ['ald-ruhn', "ald'ruhn"],
  ]);

  function locationGroupKey(location) {
    const key = locationValue(location).toLowerCase();
    const comma = key.indexOf(',');
    if (comma === -1) return locationParentAliases.get(key) || key;
    const parent = key.slice(0, comma).trim();
    const canonicalParent = locationParentAliases.get(parent) || parent;
    return canonicalParent + key.slice(comma);
  }

  function groupPrefixedLocations(locations) {
    const values = Array.isArray(locations) ? locations : [];
    const byKey = new Map();
    for (const location of values) {
      const key = locationGroupKey(location);
      if (key && !byKey.has(key)) byKey.set(key, location);
    }

    const childrenByParent = new Map();
    for (const location of values) {
      const key = locationGroupKey(location);
      let comma = key.indexOf(',');
      while (comma !== -1) {
        const parentKey = key.slice(0, comma).trim();
        const parent = byKey.get(parentKey);
        if (parent) {
          if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
          childrenByParent.get(parent).push(location);
          break;
        }
        comma = key.indexOf(',', comma + 1);
      }
    }

    return [...childrenByParent].map(([parent, children]) => ({
      parent,
      locations: [parent, ...children],
    }));
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

  function normalizeExteriorEdits(edits, legacyCells) {
    const byKey = new Map();
    const add = (x, y, landscape, references) => {
      x = Number(x);
      y = Number(y);
      references = Number(references);
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return;
      const key = x + ',' + y;
      const current = byKey.get(key) || { x, y, landscape: false, references: 0 };
      current.landscape ||= landscape === true;
      if (Number.isSafeInteger(references) && references > 0) current.references += references;
      byKey.set(key, current);
    };
    for (const edit of Array.isArray(edits) ? edits : []) {
      if (!edit || typeof edit !== 'object' || Array.isArray(edit)) continue;
      let x = edit.x;
      let y = edit.y;
      if (typeof edit.cell === 'string') {
        const parsed = normalizeExteriorCells([edit.cell])[0];
        if (parsed) [x, y] = parsed;
      }
      add(x, y, edit.landscape, edit.references);
    }
    for (const [x, y] of normalizeExteriorCells(legacyCells)) add(x, y, true, 0);
    return [...byKey.values()].filter(edit => edit.landscape || edit.references > 0);
  }

  function allModLocations(mod) {
    const componentLocations = (Array.isArray(mod?.component_locations)
      ? mod.component_locations
      : [])
      .flatMap(component => Array.isArray(component?.effective_locations)
        ? component.effective_locations
        : Array.isArray(component?.locations) ? component.locations : []);
    return mergePrefixedLocations([...(Array.isArray(mod?.locations) ? mod.locations : []), ...componentLocations]);
  }

  function allModExteriorEdits(mod) {
    const componentEdits = (Array.isArray(mod?.component_locations)
      ? mod.component_locations
      : [])
      .flatMap(component => normalizeExteriorEdits(
        component?.effective_exterior_edits,
        component?.effective_exterior_cells || component?.exterior_cells,
      ));
    return normalizeExteriorEdits(
      [...(Array.isArray(mod?.exterior_edits) ? mod.exterior_edits : []), ...componentEdits],
      mod?.exterior_cells,
    );
  }

  function allModExteriorCells(mod) {
    return allModExteriorEdits(mod).map(edit => [edit.x, edit.y]);
  }

  function groupCoveragesByMod(coverages) {
    const groups = new Map();
    for (const coverage of Array.isArray(coverages) ? coverages : []) {
      const mod = coverage?.mod;
      if (!mod) continue;
      if (!groups.has(mod)) {
        groups.set(mod, { mod, includesMain: false, components: [] });
      }
      const group = groups.get(mod);
      const component = coverage?.component;
      if (!component) {
        group.includesMain = true;
        continue;
      }
      const componentKey = String(component.id || `${component.name || ''}:${component.type || ''}`);
      if (!group.components.some(existing =>
        String(existing.id || `${existing.name || ''}:${existing.type || ''}`) === componentKey
      )) {
        group.components.push(component);
      }
    }
    return [...groups.values()];
  }

  const LANDSCAPE_HEAT_LIMIT = 100;
  const REFERENCE_HEAT_LIMIT = 10000;
  const EXTERIOR_HEAT_COLORS = [
    '#39d8ae',
    '#86d94a',
    '#f2cf3a',
    '#ff8b3d',
    '#ff3d57',
  ];

  function exteriorHeatPosition(value, limit) {
    const numericCount = Number(value);
    const boundedCount = Number.isNaN(numericCount)
      ? 1
      : Math.max(1, Math.min(limit, numericCount));
    return Math.log(boundedCount) / Math.log(limit);
  }

  function heatColor(position) {
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

  function landscapeHeatPosition(modCount) {
    return exteriorHeatPosition(modCount, LANDSCAPE_HEAT_LIMIT);
  }

  function referenceHeatPosition(referenceCount) {
    return exteriorHeatPosition(referenceCount, REFERENCE_HEAT_LIMIT);
  }

  function landscapeHeatColor(modCount) {
    return heatColor(landscapeHeatPosition(modCount));
  }

  function referenceHeatColor(referenceCount) {
    return heatColor(referenceHeatPosition(referenceCount));
  }

  function combinedExteriorHeatColor(landscapeModCount, referenceCount) {
    return heatColor(Math.max(
      landscapeModCount > 0 ? landscapeHeatPosition(landscapeModCount) : 0,
      referenceCount > 0 ? referenceHeatPosition(referenceCount) : 0,
    ));
  }

  function mapUrlFor(modUrl, mappedMods) {
    const id = nexusModId(modUrl);
    if (!id) return '';
    const mappedMod = typeof mappedMods?.get === 'function'
      ? mappedMods.get(id)
      : (mappedMods?.has(id) ? true : null);
    if (!mappedMod) return '';
    const firstLocation = mappedMod !== true
      ? allModLocations(mappedMod)[0] || ''
      : '';
    const firstExteriorCell = mappedMod !== true
      ? allModExteriorCells(mappedMod)[0] || null
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
    groupPrefixedLocations,
    allModLocations,
    allModExteriorEdits,
    allModExteriorCells,
    groupCoveragesByMod,
    normalizeExteriorCells,
    normalizeExteriorEdits,
    landscapeHeatPosition,
    referenceHeatPosition,
    landscapeHeatColor,
    referenceHeatColor,
    combinedExteriorHeatColor,
    mapUrlFor,
    findMappedMod,
  });
}));
