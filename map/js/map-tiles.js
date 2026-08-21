(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Tes3ModMapTiles = api;
}(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const BLANK_SEA_TILES = Object.freeze({
    0: "tiles/zoom2/morrowind-0-2.jpg",
    1: "tiles/zoom2/morrowind-0-2.jpg",
    2: "tiles/zoom2/morrowind-0-2.jpg",
    3: "tiles/zoom3/morrowind-0-0.jpg",
    4: "tiles/zoom4/morrowind-0-0.jpg",
    5: "tiles/zoom5/morrowind-0-0.jpg",
    6: "tiles/zoom6/morrowind-0-0.jpg",
    7: "tiles/zoom7/morrowind-0-0.jpg",
  });

  function isFinitePoint(value) {
    return Number.isFinite(Number(value?.x)) && Number.isFinite(Number(value?.y));
  }

  function locationGeometry(locations) {
    const points = [];
    const append = (value) => {
      if (isFinitePoint(value)) points.push({ x: Number(value.x), y: Number(value.y) });
    };

    for (const location of Array.isArray(locations) ? locations : []) {
      append(location);
      for (const entrance of Array.isArray(location?.entrances) ? location.entrances : []) {
        append(entrance);
      }
      for (const variant of Array.isArray(location?.variants) ? location.variants : []) {
        append(variant);
        for (const entrance of Array.isArray(variant?.entrances) ? variant.entrances : []) {
          append(entrance);
        }
      }
    }
    return points;
  }

  function extendedWorldBounds(world, locations) {
    const bounds = {
      left: Number(world.posLeft),
      top: Number(world.posTop),
      right: Number(world.posRight),
      bottom: Number(world.posBottom),
    };
    for (const point of locationGeometry(locations)) {
      bounds.left = Math.min(bounds.left, point.x);
      bounds.top = Math.max(bounds.top, point.y);
      bounds.right = Math.max(bounds.right, point.x);
      bounds.bottom = Math.min(bounds.bottom, point.y);
    }
    return bounds;
  }

  function isNativeTile(coords) {
    const zoom = Number(coords?.z);
    const width = 2 ** zoom;
    return Number.isInteger(zoom) && zoom >= 0 &&
      Number.isInteger(coords?.x) && coords.x >= 0 && coords.x < width &&
      Number.isInteger(coords?.y) && coords.y >= 0 && coords.y < width;
  }

  function blankSeaTileUrl(zoom) {
    return BLANK_SEA_TILES[zoom] || BLANK_SEA_TILES[7];
  }

  return Object.freeze({
    BLANK_SEA_TILES,
    locationGeometry,
    extendedWorldBounds,
    isNativeTile,
    blankSeaTileUrl,
  });
}));
