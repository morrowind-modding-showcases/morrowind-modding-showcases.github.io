/* TES3 Mod Map
 *
 * Base imagery + location data mirrored from the UESP gamemap
 * (https://gamemap.uesp.net/mw/, MIT-licensed app, CC-BY-SA data).
 * Coordinates are raw Morrowind worldspace units; the world square
 * (posLeft..posRight, posBottom..posTop) maps onto a 256px tile at zoom 0.
 */
(async function () {
  "use strict";

  const [locData, modData] = await Promise.all([
    fetch("data/locations.json").then((r) => r.json()),
    fetch("data/mods.json").then((r) => r.json()),
  ]);

  const WORLD = locData.world;
  const MIN_ZOOM = 0;
  const MAX_ZOOM = 7;
  const CELL_SIZE = Number(WORLD.cellSize) || 8192;
  const CITY_ICONS = new Set([1, 2]); // City, Town
  const LABEL_ZOOM = 2; // show city labels from this zoom
  const LOCATION_SPLIT_ZOOM = 4;

  // ---------- mod index: normalized cell name -> [mods] ----------
  const norm = (s) => (s || "").trim().toLowerCase();
  const modsByCell = new Map();
  const locationsByMod = new Map();
  const modsByExteriorCell = new Map();
  const exteriorCellKey = (x, y) => `${x},${y}`;
  const uniqueLocations = (locations) => {
    const byKey = new Map();
    for (const value of Array.isArray(locations) ? locations : []) {
      const location = String(value || "").trim();
      const key = norm(location);
      if (key && !byKey.has(key)) byKey.set(key, location);
    }
    return [...byKey.values()];
  };
  for (const mod of modData.mods) {
    // Keep exact sublocations for the zoomed-in markers. Prefix grouping is a
    // presentation concern and is applied to the published location registry
    // below, where a real parent marker (for example Balmora) is available.
    const baseLocations = uniqueLocations(mod.locations);
    const componentCoverages = Array.isArray(mod.component_locations)
      ? mod.component_locations.map((component) => ({
          mod,
          component,
          locations: uniqueLocations(component.locations),
          exteriorEdits: Tes3ModMapLinks.normalizeExteriorEdits(
            component.exterior_edits,
            component.exterior_cells,
          ),
        }))
      : [];
    const coverages = [
      {
        mod,
        component: null,
        locations: baseLocations,
        exteriorEdits: Tes3ModMapLinks.normalizeExteriorEdits(
          mod.exterior_edits,
          mod.exterior_cells,
        ),
      },
      ...componentCoverages,
    ];
    const locations = Tes3ModMapLinks.allModLocations(mod);
    locationsByMod.set(mod, locations);
    for (const coverage of coverages) {
      for (const cell of coverage.locations) {
        const key = norm(cell);
        if (!modsByCell.has(key)) modsByCell.set(key, []);
        modsByCell.get(key).push({ mod, component: coverage.component });
      }
      for (const edit of coverage.exteriorEdits) {
        const { x, y } = edit;
        const key = exteriorCellKey(x, y);
        if (!modsByExteriorCell.has(key)) modsByExteriorCell.set(key, []);
        modsByExteriorCell.get(key).push({
          mod,
          component: coverage.component,
          landscape: edit.landscape,
          references: edit.references,
        });
      }
    }
  }

  // ---------- map ----------
  const map = L.map("map", {
    crs: L.CRS.Simple,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    zoomControl: false,
    attributionControl: true,
  });
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution(
    'Imagery &amp; location data &copy; <a href="https://en.uesp.net/wiki/UESPWiki:Maps" target="_blank" rel="noopener">UESP</a>' +
      " &middot; The Elder Scrolls &copy; Bethesda Softworks"
  );
  L.control.zoom({ position: "bottomright" }).addTo(map);

  const worldW = WORLD.posRight - WORLD.posLeft;
  const worldH = WORLD.posTop - WORLD.posBottom;
  const worldToLatLng = (x, y) =>
    map.unproject(
      [((x - WORLD.posLeft) / worldW) * 256, ((WORLD.posTop - y) / worldH) * 256],
      0
    );
  const latLngToWorld = (latLng) => {
    const point = map.project(latLng, 0);
    return {
      x: WORLD.posLeft + (point.x / 256) * worldW,
      y: WORLD.posTop - (point.y / 256) * worldH,
    };
  };
  const exteriorCellBounds = (x, y) => L.latLngBounds(
    worldToLatLng(x * CELL_SIZE, y * CELL_SIZE),
    worldToLatLng((x + 1) * CELL_SIZE, (y + 1) * CELL_SIZE)
  );

  const extendedWorld = Tes3ModMapTiles.extendedWorldBounds(WORLD, locData.locations);
  const tileBounds = L.latLngBounds(
    worldToLatLng(extendedWorld.left, extendedWorld.top),
    worldToLatLng(extendedWorld.right, extendedWorld.bottom)
  );
  map.setMaxBounds(tileBounds.pad(0.15));

  const ExtendedTileLayer = L.TileLayer.extend({
    getTileUrl(coords) {
      if (!Tes3ModMapTiles.isNativeTile(coords)) {
        return Tes3ModMapTiles.blankSeaTileUrl(coords.z);
      }
      return L.TileLayer.prototype.getTileUrl.call(this, coords);
    },
  });

  new ExtendedTileLayer("tiles/zoom{z}/morrowind-{x}-{y}.jpg", {
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    tileSize: 256,
    noWrap: true,
    bounds: tileBounds,
  }).addTo(map);

  // ---------- exterior-cell coverage ----------
  const exteriorEntries = [...modsByExteriorCell].map(([key, coverages]) => {
    const [x, y] = key.split(",").map(Number);
    const mods = [...new Set(coverages.map((coverage) => coverage.mod))];
    return { key, x, y, mods, coverages, bounds: exteriorCellBounds(x, y) };
  });
  const exteriorEntryByKey = new Map(exteriorEntries.map((entry) => [entry.key, entry]));
  const selectedMods = new Map();
  let selectionMode = "any";
  let landscapeFilterEnabled = false;
  let referenceFilterEnabled = false;

  const stableModId = (mod) => Tes3ModMapLinks.stableModId(mod);
  const isModSelected = (mod) => selectedMods.has(stableModId(mod));
  const getSelectedModState = (mod) => selectedMods.get(stableModId(mod)) || null;
  const selectedModStates = () => [...selectedMods.values()];
  const selectedModObjects = () => selectedModStates().map((state) => state.mod);
  const hasSelectedMods = () => selectedMods.size > 0;
  const isCoverageSelected = (coverage) =>
    Tes3ModMapLinks.coverageIsSelected(coverage, selectedMods);
  const selectedCoverages = (coverages) =>
    (Array.isArray(coverages) ? coverages : []).filter(isCoverageSelected);
  const selectedModsForCoverages = (coverages) => [
    ...new Set(selectedCoverages(coverages).map((coverage) => coverage.mod)),
  ];
  const selectedModCountForCoverages = (coverages) =>
    selectedModsForCoverages(coverages).length;
  const isSelectionOverlap = (coverages) => selectedModCountForCoverages(coverages) >= 2;

  function visibleExteriorCoverages(entry) {
    if (!hasSelectedMods()) {
      return entry.coverages.filter((coverage) => coverage.component === null);
    }
    return selectedCoverages(entry.coverages);
  }

  const visibleExteriorMods = (entry) => [
    ...new Set(visibleExteriorCoverages(entry).map((coverage) => coverage.mod)),
  ];

  function filteredExteriorCoverages(entry) {
    const coverages = visibleExteriorCoverages(entry);
    if (hasSelectedMods() && selectionMode === "overlap" && !isSelectionOverlap(coverages)) {
      return [];
    }
    return coverages.filter((coverage) =>
      (landscapeFilterEnabled && coverage.landscape) ||
      (referenceFilterEnabled && coverage.references > 0)
    );
  }

  const visibleLandscapeMods = (entry) => [
    ...new Set(filteredExteriorCoverages(entry)
      .filter((coverage) => coverage.landscape)
      .map((coverage) => coverage.mod)),
  ];

  const visibleReferenceCount = (entry) => filteredExteriorCoverages(entry)
    .reduce((total, coverage) => total + coverage.references, 0);

  function locationCoveragesForEntry(entry) {
    const combinedGroup = map.getZoom() < LOCATION_SPLIT_ZOOM &&
      entry.locationGroup?.parent === entry
      ? entry.locationGroup
      : null;
    return combinedGroup ? combinedGroup.coverages : entry.coverages;
  }

  function visibleLocationCoverages(entry) {
    const coverages = locationCoveragesForEntry(entry);
    return hasSelectedMods() ? selectedCoverages(coverages) : coverages;
  }

  const ExteriorCellOverlay = L.Layer.extend({
    initialize(entriesForLayer) {
      this._entries = entriesForLayer;
      this._hoverKey = null;
      this._visible = true;
      this._moving = false;
      this._frame = null;
    },

    onAdd(mapForLayer) {
      this._map = mapForLayer;
      this._canvas = L.DomUtil.create(
        "canvas",
        "exterior-cell-overlay leaflet-layer leaflet-zoom-hide"
      );
      this._canvas.setAttribute("aria-hidden", "true");
      this._canvas.style.display = this._visible ? "" : "none";
      mapForLayer.getPane("overlayPane").appendChild(this._canvas);
      mapForLayer.on("movestart zoomstart", this._handleMoveStart, this);
      mapForLayer.on("moveend zoomend", this._handleMoveEnd, this);
      mapForLayer.on("resize viewreset", this._scheduleDraw, this);
      this._scheduleDraw();
    },

    onRemove(mapForLayer) {
      mapForLayer.off("movestart zoomstart", this._handleMoveStart, this);
      mapForLayer.off("moveend zoomend", this._handleMoveEnd, this);
      mapForLayer.off("resize viewreset", this._scheduleDraw, this);
      if (this._frame) cancelAnimationFrame(this._frame);
      this._canvas.remove();
    },

    refreshSelection() {
      this._hoverKey = null;
      this._map?.getContainer().classList.remove("has-exterior-cell-hover");
      this._scheduleDraw();
    },

    setVisible(visible) {
      this._visible = Boolean(visible);
      if (!this._visible) this._hoverKey = null;
      if (this._canvas) this._canvas.style.display = this._visible ? "" : "none";
      if (this._visible) this._scheduleDraw();
    },

    setHoverKey(key) {
      if (this._hoverKey === key) return;
      this._hoverKey = key;
      this._scheduleDraw();
    },

    _handleMoveStart() {
      this._moving = true;
      if (this._frame) {
        cancelAnimationFrame(this._frame);
        this._frame = null;
      }
    },

    _handleMoveEnd() {
      this._moving = false;
      this._scheduleDraw();
    },

    _scheduleDraw() {
      if (!this._visible || this._moving || this._frame) return;
      this._frame = requestAnimationFrame(() => {
        this._frame = null;
        this._draw();
      });
    },

    _draw() {
      if (!this._visible || !this._map || !this._canvas) return;
      const size = this._map.getSize();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(size.x * ratio));
      const height = Math.max(1, Math.round(size.y * ratio));
      const resized = this._canvas.width !== width || this._canvas.height !== height;
      if (resized) {
        this._canvas.width = width;
        this._canvas.height = height;
      }
      if (this._canvas.style.width !== `${size.x}px`) {
        this._canvas.style.width = `${size.x}px`;
      }
      if (this._canvas.style.height !== `${size.y}px`) {
        this._canvas.style.height = `${size.y}px`;
      }
      L.DomUtil.setPosition(
        this._canvas,
        this._map.containerPointToLayerPoint([0, 0])
      );

      const context = this._canvas.getContext("2d");
      if (!resized) context.clearRect(0, 0, width, height);
      const paddedBounds = this._map.getBounds().pad(0.08);
      const visible = this._entries.filter((entry) =>
        filteredExteriorCoverages(entry).length > 0 &&
        paddedBounds.intersects(entry.bounds)
      );
      if (!visible.length) return;

      const rectFor = (entry) => {
        const first = this._map.latLngToContainerPoint(entry.bounds.getNorthWest());
        const second = this._map.latLngToContainerPoint(entry.bounds.getSouthEast());
        return {
          entry,
          x: Math.min(first.x, second.x) * ratio,
          y: Math.min(first.y, second.y) * ratio,
          width: Math.abs(second.x - first.x) * ratio,
          height: Math.abs(second.y - first.y) * ratio,
        };
      };
      const actualRects = visible.map(rectFor);
      const surface = (surfaceWidth, surfaceHeight) => {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, surfaceWidth);
        canvas.height = Math.max(1, surfaceHeight);
        return { canvas, context: canvas.getContext("2d") };
      };
      const hardenMask = (sourceCanvas, cutoff = 128) => {
        const maskWidth = sourceCanvas.width;
        const maskHeight = sourceCanvas.height;
        const hardened = surface(maskWidth, maskHeight);
        hardened.context.drawImage(sourceCanvas, 0, 0);
        const pixels = hardened.context.getImageData(0, 0, maskWidth, maskHeight);
        for (let index = 3; index < pixels.data.length; index += 4) {
          pixels.data[index] = pixels.data[index] >= cutoff ? 255 : 0;
        }
        hardened.context.putImageData(pixels, 0, 0);
        return hardened;
      };
      const maskFor = (records) => {
        if (!records.length) return null;
        const averageCellSize = records.reduce(
          (sum, rect) => sum + Math.min(rect.width, rect.height),
          0
        ) / records.length;
        const smoothing = Math.max(
          4 * ratio,
          Math.min(18 * ratio, averageCellSize * 0.09)
        );
        const feather = Math.max(
          3 * ratio,
          Math.min(16 * ratio, averageCellSize * 0.14)
        );
        // Only rasterize the painted region plus room for the feather kernel.
        // This is especially important on 2x displays.
        const padding = Math.ceil((smoothing + feather) * 3 + 4 * ratio);
        const left = Math.max(
          0,
          Math.floor(Math.min(...records.map((rect) => rect.x)) - padding)
        );
        const top = Math.max(
          0,
          Math.floor(Math.min(...records.map((rect) => rect.y)) - padding)
        );
        const right = Math.min(
          width,
          Math.ceil(Math.max(...records.map((rect) => rect.x + rect.width)) + padding)
        );
        const bottom = Math.min(
          height,
          Math.ceil(Math.max(...records.map((rect) => rect.y + rect.height)) + padding)
        );
        if (right <= left || bottom <= top) return null;
        const maskWidth = right - left;
        const maskHeight = bottom - top;
        const raw = surface(maskWidth, maskHeight);
        const overlap = Math.max(1, ratio);
        raw.context.fillStyle = "#fff";
        // Smooth one seamless union so convex corners, concave corners, and
        // the boundaries of interior gaps all receive the same curve.
        for (const rect of records) {
          raw.context.fillRect(
            rect.x - left - overlap,
            rect.y - top - overlap,
            rect.width + 2 * overlap,
            rect.height + 2 * overlap
          );
        }
        const soft = surface(maskWidth, maskHeight);
        soft.context.filter = `blur(${smoothing}px)`;
        soft.context.drawImage(raw.canvas, 0, 0);
        soft.context.filter = "none";
        const mask = hardenMask(soft.canvas);
        mask.x = left;
        mask.y = top;
        mask.averageCellSize = averageCellSize;
        mask.smoothing = smoothing;
        mask.softCanvas = soft.canvas;
        return mask;
      };
      const tintMask = (records, color, fillOpacity, featherOpacity, mask = maskFor(records)) => {
        if (!records.length || !mask) return;
        const maskWidth = mask.canvas.width;
        const maskHeight = mask.canvas.height;
        const effect = surface(maskWidth, maskHeight);
        effect.context.filter = `blur(${Math.max(3 * ratio, Math.min(16 * ratio, mask.averageCellSize * 0.14))}px)`;
        effect.context.drawImage(mask.canvas, 0, 0);
        effect.context.filter = "none";
        effect.context.globalCompositeOperation = "source-in";
        effect.context.fillStyle = color;
        effect.context.fillRect(0, 0, maskWidth, maskHeight);
        const crisp = surface(maskWidth, maskHeight);
        crisp.context.drawImage(mask.canvas, 0, 0);
        crisp.context.globalCompositeOperation = "source-in";
        crisp.context.fillStyle = color;
        crisp.context.fillRect(0, 0, maskWidth, maskHeight);
        context.save();
        context.globalAlpha = featherOpacity;
        context.drawImage(effect.canvas, mask.x, mask.y);
        context.globalAlpha = fillOpacity;
        context.globalCompositeOperation = "screen";
        context.drawImage(crisp.canvas, mask.x, mask.y);
        context.restore();
        return mask;
      };
      const paintHeatMap = (records, mask) => {
        if (!records.length || !mask) return null;
        const rawHeat = surface(mask.canvas.width, mask.canvas.height);
        const overlap = Math.max(1, ratio);
        for (const rect of records) {
          rawHeat.context.fillStyle = Tes3ModMapLinks.combinedExteriorHeatColor(
            landscapeFilterEnabled ? visibleLandscapeMods(rect.entry).length : 0,
            referenceFilterEnabled ? visibleReferenceCount(rect.entry) : 0,
          );
          rawHeat.context.fillRect(
            rect.x - mask.x - overlap,
            rect.y - mask.y - overlap,
            rect.width + 2 * overlap,
            rect.height + 2 * overlap
          );
        }
        // Blur and harden the colors with the same kernel and cutoff as the
        // silhouette. This paints the complete curve instead of leaving clear
        // wedges where a concave corner extends beyond the raw cell rectangles.
        const smoothHeat = surface(mask.canvas.width, mask.canvas.height);
        smoothHeat.context.filter = `blur(${mask.smoothing}px)`;
        smoothHeat.context.drawImage(rawHeat.canvas, 0, 0);
        smoothHeat.context.filter = "none";
        const heat = hardenMask(smoothHeat.canvas);
        heat.context.globalCompositeOperation = "destination-in";
        heat.context.drawImage(mask.canvas, 0, 0);

        const feather = surface(mask.canvas.width, mask.canvas.height);
        feather.context.filter = `blur(${Math.max(3 * ratio, Math.min(16 * ratio, mask.averageCellSize * 0.14))}px)`;
        feather.context.drawImage(heat.canvas, 0, 0);
        feather.context.filter = "none";
        context.save();
        context.globalAlpha = 0.31;
        context.drawImage(feather.canvas, mask.x, mask.y);
        context.globalAlpha = 0.2;
        context.globalCompositeOperation = "screen";
        context.drawImage(heat.canvas, mask.x, mask.y);
        context.restore();
        return heat;
      };
      const drawHeatOutline = (mask, heat, opacity = 0.9) => {
        if (!mask || !heat) return;
        const borderWidth = Math.max(
          1.25 * ratio,
          Math.min(2.5 * ratio, mask.averageCellSize * 0.035)
        );
        const outline = hardenMask(
          mask.softCanvas,
          Math.max(24, 128 - borderWidth * 10)
        );
        outline.context.globalCompositeOperation = "destination-out";
        outline.context.drawImage(mask.canvas, 0, 0);
        const coloredOutline = surface(outline.canvas.width, outline.canvas.height);
        coloredOutline.context.filter = `blur(${Math.max(2 * ratio, borderWidth * 2)}px)`;
        coloredOutline.context.drawImage(heat.canvas, 0, 0);
        coloredOutline.context.filter = "none";
        coloredOutline.context.globalCompositeOperation = "destination-in";
        coloredOutline.context.drawImage(outline.canvas, 0, 0);
        context.save();
        context.globalAlpha = opacity;
        context.globalCompositeOperation = "screen";
        context.drawImage(coloredOutline.canvas, mask.x, mask.y);
        context.restore();
      };

      const baseMask = maskFor(actualRects);
      const heat = paintHeatMap(actualRects, baseMask);
      drawHeatOutline(baseMask, heat);

      if (hasSelectedMods()) {
        const overlapRects = actualRects.filter(({ entry }) =>
          isSelectionOverlap(visibleExteriorCoverages(entry))
        );
        if (overlapRects.length) {
          const overlapMask = maskFor(overlapRects);
          tintMask(overlapRects, "#fff2bf", 0.12, 0.3, overlapMask);
        }
      }

      const hovered = actualRects.find(({ entry }) => entry.key === this._hoverKey);
      if (hovered) {
        const hoverMask = maskFor([hovered]);
        tintMask([hovered], "#fff2bf", 0.06, 0.12, hoverMask);
      }
    },
  });

  const exteriorOverlay = new ExteriorCellOverlay(exteriorEntries).addTo(map);

  // ---------- markers ----------
  // Single canvas renderer for all markers: stacked canvases would swallow
  // clicks meant for the one underneath. Modded markers are kept visually on
  // top via bringToFront() in refreshMarkers().
  const renderer = L.canvas();

  const STYLE = {
    modded: { radius: 6.5, fillColor: "#58c470", color: "#10321a", weight: 1.5, fillOpacity: 0.95 },
    newLocation: { radius: 6.5, fillColor: "#4c9cff", color: "#102a4f", weight: 1.5, fillOpacity: 0.95 },
    locationVariant: {
      radius: 6.5,
      fillColor: "#4c9cff",
      color: "#102a4f",
      weight: 1.5,
      opacity: 0.5,
      fillOpacity: 0.5,
    },
    vanilla: { radius: 4, fillColor: "#8d93a5", color: "#22242c", weight: 1, fillOpacity: 0.8 },
    active: { radius: 8, fillColor: "#e8a33d", color: "#4a2f08", weight: 2, fillOpacity: 1 },
    activeOverlap: { radius: 9, fillColor: "#e8a33d", color: "#fff2bf", weight: 4, fillOpacity: 1 },
  };

  const wikiUrl = (page) => {
    if (!page) return null;
    if (/^https?:\/\//i.test(page)) return page;
    const full = page.includes(":") ? page : "Morrowind:" + page;
    return "https://en.uesp.net/wiki/" + encodeURI(full.replace(/ /g, "_"));
  };

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const MAP_PIN_PLUS_INSIDE_ICON = '<svg class="lucide lucide-map-pin-plus-inside" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><path d="M9 10h6"/><path d="M12 7v6"/></svg>';
  const MAP_PIN_MINUS_INSIDE_ICON = '<svg class="lucide lucide-map-pin-minus-inside" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><path d="M9 10h6"/></svg>';

  const componentListHtml = (components) => components.length
    ? `<ul class="popup-components">${components.map((component) =>
        `<li class="popup-component">${esc(component.name)} &middot; ${esc(component.type)}</li>`
      ).join("")}</ul>`
    : "";

  function modCoverageHtml(group, context = {}) {
    const { mod } = group;
    const label = mod.url
      ? `<a href="${esc(mod.url)}" target="_blank" rel="noopener">${esc(mod.name)}</a>`
      : esc(mod.name);
    const wiki = mod.wiki_url
      ? ` <a class="popup-icon-link popup-wiki-link" href="${esc(mod.wiki_url)}" target="_blank" rel="noopener" title="Open the ${esc(mod.name)} wiki article" aria-label="Open the ${esc(mod.name)} wiki article">W</a>`
      : "";
    const selected = isModSelected(mod);
    const contextAttributes = context.location
      ? ` data-location-name="${esc(context.location)}"`
      : context.cellKey
        ? ` data-cell-key="${esc(context.cellKey)}"`
        : "";
    const selectionLabel = `${selected ? "Remove" : "Add"} ${mod.name} ${selected ? "from" : "to"} selection`;
    const selectionIcon = selected ? MAP_PIN_MINUS_INSIDE_ICON : MAP_PIN_PLUS_INSIDE_ICON;
    const selectionControl = ` <button type="button" class="popup-selection-toggle popup-mod-map${selected ? " is-selected" : ""}" data-mod-id="${esc(stableModId(mod))}"${contextAttributes} aria-pressed="${selected ? "true" : "false"}" aria-label="${esc(selectionLabel)}" title="${esc(selectionLabel)}">${selectionIcon}</button>`;
    return `${label}${wiki}${selectionControl}${componentListHtml(group.components)}`;
  }

  function addAllSelectionHtml(coverages, context = {}) {
    const ids = [...new Set((coverages || []).map((coverage) => stableModId(coverage.mod)).filter(Boolean))];
    if (ids.length < 2) return "";
    const contextAttributes = context.location
      ? ` data-location-name="${esc(context.location)}"`
      : context.cellKey
        ? ` data-cell-key="${esc(context.cellKey)}"`
        : "";
    return `<button type="button" class="popup-add-all" data-add-all-mods="${esc(ids.join("|"))}"${contextAttributes}>Add all to selection</button>`;
  }

  function popupHtml(entry, entrance) {
    const { loc } = entry;
    const coverages = locationCoveragesForEntry(entry);
    const selectedCount = selectedModCountForCoverages(coverages);
    const mods = [...new Set(coverages.map((coverage) => coverage.mod))];
    const locationTitle = loc.wiki_url
      ? `<a href="${esc(loc.wiki_url)}" target="_blank" rel="noopener">${esc(loc.name)}</a>`
      : esc(loc.name);
    let html = `<h3 class="popup-title">${locationTitle}</h3>`;
    const subBits = [];
    if (loc.cell && loc.cell !== loc.name) subBits.push(esc(loc.cell));
    const region = entrance.region || loc.region;
    if (region) subBits.push(esc(region));
    if (subBits.length) html += `<p class="popup-cell">${subBits.join(" &middot; ")}</p>`;
    if (hasSelectedMods() && selectedCount > 1) {
      html += `<p class="popup-overlap"><strong>${selectedCount} selected mods overlap here</strong>: ${selectedModsForCoverages(coverages).map((mod) => esc(mod.name)).join(", ")}</p>`;
    }
    if (mods.length) {
      html += `<div class="popup-mods${entry.newLocation ? " popup-added-by" : ""}"><h4>${entry.newLocation ? "Added by" : "Modified by"}</h4><ul>`;
      for (const group of Tes3ModMapLinks.groupCoveragesByMod(coverages)) {
        html += `<li>${modCoverageHtml(group, { location: loc.cell || loc.name })}</li>`;
      }
      html += `</ul>${addAllSelectionHtml(coverages, { location: loc.cell || loc.name })}</div>`;
    }
    if (entry.synthetic) {
      html += '<div class="popup-mods"><h4>Places</h4><ul>';
      for (const member of entry.locationGroup.entries) {
        const label = esc(member.loc.name);
        html += `<li>${
          member.loc.wiki_url ? `<a href="${esc(member.loc.wiki_url)}" target="_blank" rel="noopener">${label}</a>` : label
        }</li>`;
      }
      html += "</ul></div>";
    }
    const wiki = wikiUrl(loc.wiki);
    if (wiki) html += `<div class="popup-links"><a href="${wiki}" target="_blank" rel="noopener">UESP wiki &#8599;</a></div>`;
    return html;
  }

  function exteriorPopupHtml(entry) {
    const coverages = entry.coverages.filter((coverage) =>
      (!landscapeFilterEnabled && !referenceFilterEnabled) ||
      (landscapeFilterEnabled && coverage.landscape) ||
      (referenceFilterEnabled && coverage.references > 0)
    );
    const groups = Tes3ModMapLinks.groupCoveragesByMod(coverages);
    const selectedCount = selectedModCountForCoverages(entry.coverages);
    const overlap = selectedCount > 1
      ? `<span class="popup-overlap-badge">${selectedCount} selected mods overlap</span>`
      : "";
    let html = `<div class="popup-cell-heading"><div><p class="popup-eyebrow">Exterior cell</p>` +
      `<h3 class="popup-title">(${entry.x}, ${entry.y})</h3></div>${overlap}</div>`;
    if (selectedCount > 1) {
      html += `<p class="popup-overlap">${selectedModsForCoverages(entry.coverages).map((mod) => esc(mod.name)).join(", ")}</p>`;
    }
    html += '<div class="popup-mods popup-exterior-mods"><h4>Modified by</h4><ul>';
    for (const group of groups) {
      const groupCoverages = coverages.filter((coverage) => coverage.mod === group.mod);
      const landscape = groupCoverages.some((coverage) => coverage.landscape);
      const references = groupCoverages.reduce((total, coverage) => total + coverage.references, 0);
      const editSummary = [
        landscape ? "LAND" : "",
        references > 0 ? `${references} reference${references === 1 ? "" : "s"}` : "",
      ].filter(Boolean).join(" · ");
      html += `<li><span>${modCoverageHtml(group, { cellKey: entry.key })}</span>` +
        `<small>${editSummary}</small></li>`;
    }
    html += `</ul>${addAllSelectionHtml(coverages, { cellKey: entry.key })}</div>`;
    return html;
  }

  // Build one logical entry per cell. A cell may have several entrance markers,
  // but it remains one search result, wiki link, and location in the stats.
  const bindLocationMarker = (boundEntry, marker, entrance) => {
    marker.bindPopup(() => popupHtml(boundEntry, entrance), { maxWidth: 300 });
    marker.on("popupopen", () => {
      if (!boundEntry.newLocation || boundEntry.pinned || hasSelectedMods()) return;
      boundEntry.pinned = true;
      refreshMarkers();
    });
    marker.on("popupclose", () => {
      if (boundEntry.pinned) {
        boundEntry.pinned = false;
        refreshMarkers();
      }
    });
  };
  const entries = locData.locations.map((loc) => {
    const coverages = modsByCell.get(norm(loc.cell)) || modsByCell.get(norm(loc.name)) || [];
    const mods = [...new Set(coverages.map((coverage) => coverage.mod))];
    const modded = mods.length > 0;
    const mainSource = loc.main_source || (loc.mod_added_by ? { mod: loc.mod_added_by } : null);
    const entranceGeometry = [
      {
        id: loc.id,
        x: loc.x,
        y: loc.y,
        level: loc.level,
        region: loc.region,
        source: mainSource,
        sourceMode: "main",
      },
      ...(Array.isArray(loc.entrances) ? loc.entrances.map((entrance) => ({
        ...entrance,
        source: entrance.source || mainSource,
        sourceMode: entrance.source ? "entrance" : "main",
      })) : []),
    ];
    const newLocation = loc.mod_added === true;
    const entry = {
      loc,
      mods,
      coverages,
      modded,
      newLocation,
      markerRecords: [],
      variantMarkerRecords: [],
      mainSource,
      pinned: false,
    };

    entry.markerRecords = entranceGeometry.map((entrance) => {
      // UESP displayLevel is an absolute zoom (world zoom offset 10); convert
      // to our 0..7 scale. Modded markers are forced visible early.
      const lvl = Math.max(0, Math.ceil((entrance.level || 10) - 10));
      const markerRecord = {
        entrance,
        source: entrance.source,
        sourceMode: entrance.sourceMode,
        showZoom: modded ? Math.min(lvl, LABEL_ZOOM) : lvl,
        marker: null,
      };
      const marker = L.circleMarker(worldToLatLng(entrance.x, entrance.y), {
        renderer,
        clickTolerance: 4,
        ...STYLE[newLocation ? "newLocation" : modded ? "modded" : "vanilla"],
      });
      bindLocationMarker(entry, marker, entrance);
      if (CITY_ICONS.has(loc.icon)) {
        marker.bindTooltip(loc.name, {
          permanent: true,
          direction: "right",
          offset: [8, 0],
          className: "city-label",
        });
      }
      markerRecord.marker = marker;
      return markerRecord;
    });
    entry.variantMarkerRecords = (Array.isArray(loc.variants) ? loc.variants : [])
      .flatMap((variant) => [
        variant,
        ...(Array.isArray(variant.entrances)
          ? variant.entrances.map((entrance) => ({
              ...entrance,
              mod: variant.mod,
              component: variant.component,
              plugin: variant.plugin,
            }))
          : []),
      ])
      .map((entrance) => {
        const marker = L.circleMarker(worldToLatLng(entrance.x, entrance.y), {
          renderer,
          clickTolerance: 4,
          ...STYLE.locationVariant,
        });
        bindLocationMarker(entry, marker, entrance);
        return {
          entrance,
          marker,
          source: {
            mod: entrance.mod,
            component: entrance.component,
            plugin: entrance.plugin,
          },
          sourceMode: "variant",
        };
      });
    return entry;
  });

  // Published parent locations define the grouping boundary. At low zoom a
  // settlement/stronghold marker represents every comma-qualified location
  // beneath it; zooms 4 and 5 reveal those exact locations again. Clusters
  // without a published marker (mod-added settlements like Bo-muul, or
  // vanilla names such as Tel Fyr whose cells never got their own page) get
  // a synthesized container entry so they behave exactly like published
  // ones: one marker while zoomed out, split apart from zoom 4.
  const locationGroups = Tes3ModMapLinks.groupPrefixedLocations(entries).map((group) => {
    const coverages = group.locations.flatMap((entry) => entry.coverages);
    const mods = [...new Set(coverages.map((coverage) => coverage.mod))];
    return {
      parent: group.parent,
      name: group.name,
      entries: group.locations,
      coverages,
      mods,
      modded: mods.length > 0,
      newLocation: group.locations.every((entry) => entry.newLocation),
    };
  });
  for (const group of locationGroups) {
    if (!group.parent) {
      const count = group.entries.length;
      const x = group.entries.reduce((total, entry) => total + entry.loc.x, 0) / count;
      const y = group.entries.reduce((total, entry) => total + entry.loc.y, 0) / count;
      const level = Math.min(...group.entries.map((entry) => entry.loc.level || 10));
      const region = group.entries.map((entry) => entry.loc.region).find(Boolean);
      const entrance = { id: undefined, x, y, level, region, source: null, sourceMode: "main" };
      // Cluster markers appear as soon as any member would, but never later
      // than one zoom step before the split, so clusters get to exist.
      const lvl = Math.max(0, Math.ceil(level - 10));
      const showZoom = group.modded ? Math.min(lvl, LABEL_ZOOM) : Math.min(lvl, LOCATION_SPLIT_ZOOM - 1);
      const syntheticEntry = {
        loc: { name: group.name, x, y, icon: group.entries[0].loc.icon, level, region },
        coverages: group.coverages,
        mods: group.mods,
        modded: group.modded,
        newLocation: group.entries.every((entry) => entry.newLocation),
        synthetic: true,
        markerRecords: [],
        variantMarkerRecords: [],
        mainSource: null,
        pinned: false,
      };
      const marker = L.circleMarker(worldToLatLng(x, y), {
        renderer,
        clickTolerance: 4,
        ...STYLE[syntheticEntry.newLocation ? "newLocation" : syntheticEntry.modded ? "modded" : "vanilla"],
      });
      bindLocationMarker(syntheticEntry, marker, entrance);
      // Label only real settlements; two-cell pairs (ship decks) stay quiet.
      if (group.entries.length >= 3) {
        marker.bindTooltip(group.name, {
          permanent: true,
          direction: "right",
          offset: [8, 0],
          className: "city-label",
        });
      }
      syntheticEntry.markerRecords.push({
        entrance,
        source: null,
        sourceMode: "main",
        showZoom,
        marker,
      });
      group.parent = syntheticEntry;
      syntheticEntry.locationGroup = group;
      entries.push(syntheticEntry);
    }
    for (const entry of group.entries) entry.locationGroup = group;
  }

  // ---------- visibility ----------
  // Browsers may restore form state across reloads, so trust the DOM.
  let filterMode = document.querySelector('input[name="filter"]:checked')?.value || "all";
  const newLocationFilterToggle = document.getElementById("new-location-filter-toggle");
  let newLocationsVisible = Boolean(newLocationFilterToggle?.checked);
  const landscapeFilterToggle = document.getElementById("landscape-filter-toggle");
  const referenceFilterToggle = document.getElementById("reference-filter-toggle");
  const landscapeHeatLegend = document.getElementById("landscape-heat-legend");
  const referenceHeatLegend = document.getElementById("reference-heat-legend");

  function setExteriorFilters({ landscape, references, preferred = "landscape" }) {
    let nextLandscape = Boolean(landscape);
    let nextReferences = Boolean(references);
    if (nextLandscape && nextReferences) {
      if (preferred === "references") nextLandscape = false;
      else nextReferences = false;
    }
    landscapeFilterEnabled = nextLandscape;
    referenceFilterEnabled = nextReferences;
    if (landscapeFilterToggle) landscapeFilterToggle.checked = landscapeFilterEnabled;
    if (referenceFilterToggle) referenceFilterToggle.checked = referenceFilterEnabled;
    if (landscapeHeatLegend) landscapeHeatLegend.hidden = !landscapeFilterEnabled;
    if (referenceHeatLegend) referenceHeatLegend.hidden = !referenceFilterEnabled;
    const exteriorOverlayVisible = landscapeFilterEnabled || referenceFilterEnabled;
    exteriorOverlay.setVisible(exteriorOverlayVisible);
    if (!exteriorOverlayVisible) {
      exteriorOverlay.setHoverKey(null);
      map.getContainer().classList.remove("has-exterior-cell-hover");
    }
  }

  const refreshExteriorFilters = (preferred = "landscape") => setExteriorFilters({
    landscape: landscapeFilterToggle?.checked ?? false,
    references: referenceFilterToggle?.checked ?? false,
    preferred,
  });
  refreshExteriorFilters();
  landscapeFilterToggle?.addEventListener("change", () => refreshExteriorFilters("landscape"));
  referenceFilterToggle?.addEventListener("change", () => refreshExteriorFilters("references"));

  function exteriorEntryAt(latLng) {
    if (!landscapeFilterEnabled && !referenceFilterEnabled) return null;
    const world = latLngToWorld(latLng);
    const key = exteriorCellKey(
      Math.floor(world.x / CELL_SIZE),
      Math.floor(world.y / CELL_SIZE)
    );
    const entry = exteriorEntryByKey.get(key) || null;
    return entry && filteredExteriorCoverages(entry).length > 0 ? entry : null;
  }

  function focusExteriorEntry(entry, animate = false) {
    map.fitBounds(entry.bounds.pad(0.7), { maxZoom: 5, animate });
  }

  function openExteriorPopup(entry, latLng = entry.bounds.getCenter()) {
    L.popup({ maxWidth: 340 })
      .setLatLng(latLng)
      .setContent(exteriorPopupHtml(entry))
      .openOn(map);
  }

  map.on("mousemove", (event) => {
    const entry = exteriorEntryAt(event.latlng);
    exteriorOverlay.setHoverKey(entry?.key || null);
    map.getContainer().classList.toggle("has-exterior-cell-hover", Boolean(entry));
  });
  map.on("mouseout", () => {
    exteriorOverlay.setHoverKey(null);
    map.getContainer().classList.remove("has-exterior-cell-hover");
  });
  map.on("click", (event) => {
    if (event.sourceTarget !== map) return;
    const entry = exteriorEntryAt(event.latlng);
    if (entry) openExteriorPopup(entry, event.latlng);
  });

  function displayedEntryIsModded(entry, zoom) {
    return zoom < LOCATION_SPLIT_ZOOM && entry.locationGroup?.parent === entry
      ? entry.locationGroup.modded
      : entry.modded;
  }

  function displayedEntryIsNewLocation(entry, zoom) {
    return zoom < LOCATION_SPLIT_ZOOM && entry.locationGroup?.parent === entry
      ? entry.locationGroup.newLocation
      : entry.newLocation;
  }

  function defaultEntryStyle(entry, zoom = map.getZoom()) {
    if (newLocationsVisible && displayedEntryIsNewLocation(entry, zoom)) return STYLE.newLocation;
    return STYLE[displayedEntryIsModded(entry, zoom) ? "modded" : "vanilla"];
  }

  function isVisible(entry, markerRecord, zoom) {
    const group = entry.locationGroup;
    if (zoom < LOCATION_SPLIT_ZOOM && group) {
      if (group.parent !== entry || markerRecord !== entry.markerRecords[0]) return false;
    }
    if (entry.newLocation && !newLocationsVisible && !hasSelectedMods() && !entry.pinned) return false;
    if (entry.pinned) return true;
    if (hasSelectedMods()) {
      const coverages = visibleLocationCoverages(entry);
      if (coverages.length === 0) return false;
      if (selectionMode === "overlap" && !isSelectionOverlap(coverages)) return false;
      if (entry.newLocation) {
        const replacementSelected = locationReplacementMatchesSelection(entry);
        if (replacementSelected) return locationSourceMatchesSelection(markerRecord.source);
        if (markerRecord.sourceMode === "entrance") {
          return locationSourceMatchesSelection(markerRecord.source);
        }
      }
      return true;
    }
    const modded = displayedEntryIsModded(entry, zoom);
    if (!entry.newLocation && filterMode === "modded" && !modded) return false;
    if (!entry.newLocation && filterMode === "vanilla" && modded) return false;
    if (group && zoom >= LOCATION_SPLIT_ZOOM) return true;
    if (group?.parent === entry && group.modded) {
      return zoom >= Math.min(markerRecord.showZoom, LABEL_ZOOM);
    }
    return zoom >= markerRecord.showZoom;
  }

  function selectedStateForLocationSource(source) {
    if (!source) return null;
    return selectedModStates().find(({ mod }) =>
      norm(source.mod) === norm(mod.wiki_slug || mod.id) ||
      norm(source.mod) === norm(mod.id)
    ) || null;
  }

  function locationSourceMatchesSelection(source) {
    const state = selectedStateForLocationSource(source);
    if (!state) return false;
    if (source.component) {
      return state.componentKeys.has(String(source.component));
    }
    return state.mainVisible;
  }

  function locationReplacementMatchesSelection(entry) {
    return entry.markerRecords.some((record) =>
      record.sourceMode === "main" && locationSourceMatchesSelection(record.source)
    ) || entry.variantMarkerRecords.some((record) =>
      locationSourceMatchesSelection(record.source)
    );
  }

  function locationVariantMatchesSelection(markerRecord) {
    return locationSourceMatchesSelection(markerRecord.source);
  }

  function isLocationVariantVisible(entry, markerRecord) {
    if (entry.newLocation && !newLocationsVisible && !hasSelectedMods()) return false;
    if (!locationVariantMatchesSelection(markerRecord)) return false;
    return selectionMode !== "overlap" || isSelectionOverlap(visibleLocationCoverages(entry));
  }

  function visibleEntryMarkerRecords(entry, zoom = map.getZoom()) {
    return [
      ...entry.markerRecords.filter((record) => isVisible(entry, record, zoom)),
      ...entry.variantMarkerRecords.filter((record) =>
        isLocationVariantVisible(entry, record),
      ),
    ];
  }

  function refreshMarkers() {
    const zoom = map.getZoom();
    for (const entry of entries) {
      for (const markerRecord of entry.markerRecords) {
        const { marker } = markerRecord;
        const show = isVisible(entry, markerRecord, zoom);
        const selectedCount = hasSelectedMods()
          ? selectedModCountForCoverages(visibleLocationCoverages(entry))
          : 0;
        marker.setStyle(selectedCount > 0
          ? STYLE[selectedCount > 1 ? "activeOverlap" : "active"]
          : defaultEntryStyle(entry, zoom));
        const onMap = map.hasLayer(marker);
        if (show && !onMap) marker.addTo(map);
        else if (!show && onMap) marker.remove();
        if (show && marker.getTooltip()) {
          if (zoom >= LABEL_ZOOM) marker.openTooltip();
          else marker.closeTooltip();
        }
      }
      for (const markerRecord of entry.variantMarkerRecords) {
        const { marker } = markerRecord;
        marker.setStyle(
          locationVariantMatchesSelection(markerRecord)
            ? STYLE[selectedModCountForCoverages(visibleLocationCoverages(entry)) > 1 ? "activeOverlap" : "active"]
            : STYLE.locationVariant,
        );
        const show = isLocationVariantVisible(entry, markerRecord);
        const onMap = map.hasLayer(marker);
        if (show && !onMap) marker.addTo(map);
        else if (!show && onMap) marker.remove();
      }
    }
    // Draw (and hit-test) modded markers above vanilla ones.
    for (const entry of entries) {
      if (!displayedEntryIsModded(entry, zoom)) continue;
      for (const { marker } of entry.markerRecords) {
        if (map.hasLayer(marker)) marker.bringToFront();
      }
      for (const { marker } of entry.variantMarkerRecords) {
        if (map.hasLayer(marker)) marker.bringToFront();
      }
    }
  }

  map.on("zoomend", refreshMarkers);

  // ---------- initial view ----------
  const contentBounds = L.latLngBounds(entries.flatMap((entry) =>
    entry.markerRecords.map(({ marker }) => marker.getLatLng())));
  map.fitBounds(contentBounds.pad(0.05));
  refreshMarkers();

  // ---------- stats / banner ----------
  // Synthesized cluster containers are presentation-only: they never count
  // toward the published location totals.
  const mappedEntries = entries.filter((entry) => !entry.synthetic);
  const moddedCount = mappedEntries.filter((e) => e.modded).length;
  const defaultExteriorEntries = exteriorEntries.filter(
    (entry) => visibleExteriorCoverages(entry).length > 0,
  );
  const overlapCellCount = defaultExteriorEntries.filter(
    (entry) => visibleExteriorMods(entry).length > 1,
  ).length;
  const statsBox = document.getElementById("stats");

  function updateStats() {
    if (hasSelectedMods()) {
      const locations = selectedLocationEntries();
      const exteriorCells = selectedExteriorEntries();
      const overlappingLocations = locations.filter((entry) =>
        isSelectionOverlap(selectedCoverages(entry.coverages))
      ).length;
      const overlappingCells = exteriorCells.filter((entry) =>
        isSelectionOverlap(visibleExteriorCoverages(entry))
      ).length;
      statsBox.innerHTML =
        `<strong>${selectedMods.size} selected mod${selectedMods.size === 1 ? "" : "s"}</strong> covering ` +
        `<strong>${locations.length}</strong> place${locations.length === 1 ? "" : "s"} and ` +
        `<strong>${exteriorCells.length}</strong> exterior cell${exteriorCells.length === 1 ? "" : "s"}` +
        (overlappingLocations || overlappingCells
          ? ` (${overlappingLocations} overlapping place${overlappingLocations === 1 ? "" : "s"}, ${overlappingCells} overlapping cell${overlappingCells === 1 ? "" : "s"}).`
          : ".");
      return;
    }
    statsBox.innerHTML =
      `<strong>${modData.mods.length} mods</strong> covering <strong>${moddedCount}</strong> ` +
      `of ${mappedEntries.length} known locations and <strong>${defaultExteriorEntries.length}</strong> exterior cells` +
      (overlapCellCount ? ` (${overlapCellCount} overlaps).` : ".");
  }
  updateStats();

  if (modData.mock) {
    const banner = document.getElementById("mock-banner");
    banner.hidden = false;
    document.getElementById("mock-banner-close").addEventListener("click", () => (banner.hidden = true));
  }

  // ---------- filter controls ----------
  for (const input of document.querySelectorAll('input[name="filter"]')) {
    input.addEventListener("change", () => {
      filterMode = input.value;
      refreshMarkers();
    });
  }
  function refreshNewLocationVisibility() {
    newLocationsVisible = Boolean(newLocationFilterToggle?.checked);
  }
  newLocationFilterToggle?.addEventListener("change", () => {
    refreshNewLocationVisibility();
    refreshMarkers();
  });
  refreshNewLocationVisibility();

  // ---------- panel toggle ----------
  const panel = document.getElementById("panel");
  document.getElementById("panel-toggle").addEventListener("click", () => panel.classList.toggle("collapsed"));
  if (window.innerWidth < 640) panel.classList.add("collapsed");

  // ---------- selected mods ----------
  const selectedModsBox = document.getElementById("selected-mods");
  const selectedModList = document.getElementById("selected-mod-list");
  const selectionSummary = document.getElementById("selection-summary");
  const selectionModeAny = document.getElementById("selection-mode-any");
  const selectionModeOverlap = document.getElementById("selection-mode-overlap");
  const fitSelectionButton = document.getElementById("fit-selection");
  const copySelectionLinkButton = document.getElementById("copy-selection-link");

  const mapComponents = (mod) => (Array.isArray(mod?.component_locations)
    ? mod.component_locations
    : []).filter((component) =>
      Tes3ModMapLinks.mergePrefixedLocations(component.locations).length > 0 ||
      Tes3ModMapLinks.normalizeExteriorEdits(
        component.exterior_edits,
        component.exterior_cells,
      ).length > 0
    );

  const coverageCountHtml = (locationCount, cellCount) => [
    locationCount > 0 ? `${locationCount} place${locationCount === 1 ? "" : "s"}` : "",
    cellCount > 0 ? `${cellCount} cell${cellCount === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" · ") || "No mapped coverage";

  function stateSelectionMap(state) {
    return new Map([[stableModId(state.mod), state]]);
  }

  function stateCoversEntry(state, entry) {
    return entry.coverages.some((coverage) =>
      Tes3ModMapLinks.coverageIsSelected(coverage, stateSelectionMap(state))
    );
  }

  function selectedLocationEntries() {
    return entries.filter((entry) =>
      !entry.synthetic && selectedCoverages(entry.coverages).length > 0
    );
  }

  function selectedExteriorEntries() {
    return exteriorEntries.filter((entry) => visibleExteriorCoverages(entry).length > 0);
  }

  function renderSelectedModsPanel() {
    const states = selectedModStates();
    selectedModsBox.hidden = states.length === 0;
    selectedModList.innerHTML = states.map((state) => {
      const { mod } = state;
      const modId = stableModId(mod);
      const components = mapComponents(mod);
      const locationCount = entries.filter((entry) => !entry.synthetic && stateCoversEntry(state, entry)).length;
      const exteriorCount = exteriorEntries.filter((entry) => stateCoversEntry(state, entry)).length;
      const mainLocationCount = Tes3ModMapLinks.mergePrefixedLocations(mod.locations).length;
      const mainCellCount = Tes3ModMapLinks.normalizeExteriorEdits(
        mod.exterior_edits,
        mod.exterior_cells,
      ).length;
      const componentOptions = components.map((component) => {
        const componentId = String(component.id);
        const componentLocationCount = Tes3ModMapLinks.mergePrefixedLocations(component.locations).length;
        const componentCellCount = Tes3ModMapLinks.normalizeExteriorEdits(
          component.exterior_edits,
          component.exterior_cells,
        ).length;
        return `<label class="selected-component-option"><input type="checkbox" data-selected-component="${esc(componentId)}" data-mod-id="${esc(modId)}"${state.componentKeys.has(componentId) ? " checked" : ""}>` +
          `<span>${esc(component.name)}</span><small>${coverageCountHtml(componentLocationCount, componentCellCount)}</small></label>`;
      }).join("");
      const mainOption = mainLocationCount || mainCellCount
        ? `<label class="selected-component-option"><input type="checkbox" data-selected-main data-mod-id="${esc(modId)}"${state.mainVisible ? " checked" : ""}>` +
          `<span>Main mod</span><small>${coverageCountHtml(mainLocationCount, mainCellCount)}</small></label>`
        : "";
      return `<article class="selected-mod-row${state.expanded ? " selected-mod-expanded" : ""}">` +
        `<div class="selected-mod-heading">` +
        (components.length ? `<button type="button" class="selected-mod-expand" data-expand-mod="${esc(modId)}" aria-expanded="${state.expanded ? "true" : "false"}" aria-label="${state.expanded ? "Collapse" : "Expand"} components for ${esc(mod.name)}" title="${state.expanded ? "Collapse" : "Expand"} component controls">${state.expanded ? "▾" : "▸"}</button>` : "") +
        `<span class="selected-mod-name">${esc(mod.name)}</span>` +
        `<button type="button" class="selected-mod-remove" data-remove-mod="${esc(modId)}" title="Remove ${esc(mod.name)}" aria-label="Remove ${esc(mod.name)}">×</button></div>` +
        `<p class="selected-mod-counts">${coverageCountHtml(locationCount, exteriorCount)}</p>` +
        (components.length ? `<div class="selected-mod-components"${state.expanded ? "" : " hidden"}>${mainOption}${componentOptions}</div>` : "") +
        `</article>`;
    }).join("");

    if (selectionModeAny) selectionModeAny.checked = selectionMode === "any";
    if (selectionModeOverlap) selectionModeOverlap.checked = selectionMode === "overlap";
    if (fitSelectionButton) fitSelectionButton.disabled = states.length === 0;
    if (copySelectionLinkButton) copySelectionLinkButton.disabled = states.length === 0;

    const locations = selectedLocationEntries();
    const exteriorCells = selectedExteriorEntries();
    const overlappingLocations = locations.filter((entry) =>
      isSelectionOverlap(selectedCoverages(entry.coverages))
    ).length;
    const overlappingCells = exteriorCells.filter((entry) =>
      isSelectionOverlap(visibleExteriorCoverages(entry))
    ).length;
    selectionSummary.innerHTML =
      `<strong>${states.length}</strong> mod${states.length === 1 ? "" : "s"} · ` +
      `<strong>${locations.length}</strong> place${locations.length === 1 ? "" : "s"} · ` +
      `<strong>${exteriorCells.length}</strong> cell${exteriorCells.length === 1 ? "" : "s"}<br>` +
      `${overlappingLocations} overlapping place${overlappingLocations === 1 ? "" : "s"} · ` +
      `${overlappingCells} overlapping cell${overlappingCells === 1 ? "" : "s"}`;
  }

  function focusEntryGeometry(entry, markerRecord = entry.markerRecords[0], animate = false) {
    const visibleRecords = visibleEntryMarkerRecords(entry);
    if (!visibleRecords.includes(markerRecord)) {
      markerRecord = visibleRecords[0] || markerRecord;
    }
    const latLngs = visibleRecords.map(({ marker }) => marker.getLatLng());
    if (latLngs.length > 1) {
      map.fitBounds(L.latLngBounds(latLngs).pad(0.4), { maxZoom: 4, animate });
    } else if (animate) {
      map.flyTo(markerRecord.marker.getLatLng(), Math.max(map.getZoom(), 4), { duration: 0.8 });
    } else {
      map.setView(markerRecord.marker.getLatLng(), 4);
    }
  }

  function syncSelectionUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete("mod");
    url.searchParams.delete("component");
    url.searchParams.delete("view");
    const selectionParams = Tes3ModMapLinks.serializeModSelectionParams(selectedMods, selectionMode);
    for (const [key, value] of selectionParams) url.searchParams.append(key, value);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }

  function refreshSelection(options = {}) {
    exteriorOverlay.refreshSelection();
    renderSelectedModsPanel();
    updateStats();
    refreshMarkers();
    if (options.syncUrl !== false) syncSelectionUrl();
  }

  function configureStateForFocus(state, focusEntry, focusExteriorCell) {
    const focusCoverages = (focusEntry?.coverages || focusExteriorCell?.coverages || [])
      .filter((coverage) => coverage.mod === state.mod);
    if (!focusCoverages.length || focusCoverages.some((coverage) => coverage.component === null)) return;
    state.mainVisible = false;
    for (const coverage of focusCoverages) {
      if (coverage.component) {
        Tes3ModMapLinks.setComponentSelection(
          state,
          mapComponents(state.mod),
          coverage.component,
          true,
        );
      }
    }
  }

  function addSelectedMod(mod, options = {}) {
    if (!mod) return null;
    const id = stableModId(mod);
    let state = selectedMods.get(id);
    const added = !state;
    if (!state) {
      state = Tes3ModMapLinks.selectionStateForMod(mod, {
        mainVisible: options.mainVisible,
        componentIds: options.componentIds,
      });
      state.expanded = false;
      selectedMods.set(id, state);
    } else if (options.componentIds) {
      state.componentKeys = new Set(options.componentIds);
      if (typeof options.mainVisible === "boolean") state.mainVisible = options.mainVisible;
    }
    if (added && options.configureFocus !== false && !options.componentIds) {
      configureStateForFocus(state, options.focusEntry, options.focusExteriorCell);
    }
    if (!options.deferRefresh) refreshSelection({ syncUrl: options.syncUrl });
    return state;
  }

  function removeSelectedMod(mod, options = {}) {
    if (!mod || !selectedMods.delete(stableModId(mod))) return;
    if (!selectedMods.size) selectionMode = "any";
    if (!options.deferRefresh) refreshSelection();
  }

  function toggleSelectedMod(mod, options = {}) {
    if (isModSelected(mod)) removeSelectedMod(mod, options);
    else addSelectedMod(mod, options);
  }

  function clearSelectedMods(options = {}) {
    selectedMods.clear();
    selectionMode = "any";
    if (!options.deferRefresh) refreshSelection({ syncUrl: options.syncUrl });
  }

  function setSelectedMainVisible(mod, visible) {
    const state = getSelectedModState(mod);
    if (!state) return;
    Tes3ModMapLinks.setMainSelection(state, mapComponents(mod), visible);
    map.closePopup();
    refreshSelection();
  }

  function setSelectedComponentVisible(mod, component, visible) {
    const state = getSelectedModState(mod);
    if (!state || !component) return;
    Tes3ModMapLinks.setComponentSelection(state, mapComponents(mod), component, visible);
    map.closePopup();
    refreshSelection();
  }

  function fitSelectedMods() {
    if (!hasSelectedMods()) return;
    const locations = selectedLocationEntries().filter((entry) =>
      selectionMode !== "overlap" || isSelectionOverlap(selectedCoverages(entry.coverages))
    );
    const exteriorCells = selectedExteriorEntries().filter((entry) =>
      selectionMode !== "overlap" || isSelectionOverlap(visibleExteriorCoverages(entry))
    );
    if (locations.length + exteriorCells.length === 1) {
      if (locations.length === 1) focusEntryGeometry(locations[0]);
      else focusExteriorEntry(exteriorCells[0]);
      return;
    }
    const coverageBounds = L.latLngBounds([]);
    for (const entry of locations) {
      for (const { marker } of entry.markerRecords) coverageBounds.extend(marker.getLatLng());
      for (const record of entry.variantMarkerRecords) {
        if (locationVariantMatchesSelection(record)) coverageBounds.extend(record.marker.getLatLng());
      }
    }
    for (const entry of exteriorCells) {
      coverageBounds.extend(entry.bounds.getNorthWest());
      coverageBounds.extend(entry.bounds.getSouthEast());
    }
    if (coverageBounds.isValid()) map.fitBounds(coverageBounds.pad(0.32), { maxZoom: 4 });
  }

  selectedModsBox.addEventListener("click", async (event) => {
    const removeButton = event.target.closest?.("[data-remove-mod]");
    if (removeButton) {
      const mod = Tes3ModMapLinks.findMappedMod(modData.mods, removeButton.dataset.removeMod);
      removeSelectedMod(mod);
      return;
    }
    const expandButton = event.target.closest?.("[data-expand-mod]");
    if (expandButton) {
      const mod = Tes3ModMapLinks.findMappedMod(modData.mods, expandButton.dataset.expandMod);
      const state = getSelectedModState(mod);
      if (state) {
        state.expanded = !state.expanded;
        renderSelectedModsPanel();
      }
    }
  });
  selectedModsBox.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const mod = Tes3ModMapLinks.findMappedMod(modData.mods, input.dataset.modId);
    if (!mod) return;
    if (input.hasAttribute("data-selected-main")) {
      setSelectedMainVisible(mod, input.checked);
      return;
    }
    const component = mapComponents(mod).find((candidate) =>
      String(candidate.id) === input.dataset.selectedComponent
    );
    if (component) setSelectedComponentVisible(mod, component, input.checked);
  });
  document.getElementById("selected-mod-clear").addEventListener("click", () => clearSelectedMods());
  selectionModeAny?.addEventListener("change", () => {
    if (!selectionModeAny.checked) return;
    selectionMode = "any";
    map.closePopup();
    refreshSelection();
  });
  selectionModeOverlap?.addEventListener("change", () => {
    if (!selectionModeOverlap.checked) return;
    selectionMode = "overlap";
    map.closePopup();
    refreshSelection();
  });
  fitSelectionButton?.addEventListener("click", fitSelectedMods);
  copySelectionLinkButton?.addEventListener("click", async () => {
    const originalText = copySelectionLinkButton.textContent;
    try {
      await navigator.clipboard.writeText(window.location.href);
      copySelectionLinkButton.textContent = "Copied";
    } catch {
      copySelectionLinkButton.textContent = "Copy failed";
    }
    window.setTimeout(() => { copySelectionLinkButton.textContent = originalText; }, 1400);
  });

  map.getContainer().addEventListener("click", (event) => {
    const addAllButton = event.target.closest?.("[data-add-all-mods]");
    if (addAllButton) {
      const focusEntry = addAllButton.dataset.locationName
        ? entries.find((entry) =>
            norm(entry.loc.cell) === norm(addAllButton.dataset.locationName) ||
            norm(entry.loc.name) === norm(addAllButton.dataset.locationName)
          ) || null
        : null;
      const focusExteriorCell = exteriorEntryByKey.get(addAllButton.dataset.cellKey) || null;
      for (const id of addAllButton.dataset.addAllMods.split("|").filter(Boolean)) {
        const mod = Tes3ModMapLinks.findMappedMod(modData.mods, id);
        addSelectedMod(mod, { focusEntry, focusExteriorCell, deferRefresh: true });
      }
      map.closePopup();
      refreshSelection();
      return;
    }
    const filterButton = event.target.closest?.(".popup-mod-map");
    if (!filterButton) return;
    const mod = Tes3ModMapLinks.findMappedMod(modData.mods, filterButton.dataset.modId);
    if (!mod) return;
    const focusEntry = filterButton.dataset.locationName
      ? entries.find((entry) =>
          norm(entry.loc.cell) === norm(filterButton.dataset.locationName) ||
          norm(entry.loc.name) === norm(filterButton.dataset.locationName)
        ) || null
      : null;
    const focusExteriorCell = exteriorEntryByKey.get(filterButton.dataset.cellKey) || null;
    map.closePopup();
    toggleSelectedMod(mod, { focusEntry, focusExteriorCell });
  });

  const requestedParams = new URLSearchParams(window.location.search);
  const restoredSelection = Tes3ModMapLinks.parseModSelectionParams(requestedParams, modData.mods);
  selectionMode = restoredSelection.selections.length ? restoredSelection.view : "any";
  for (const restoredState of restoredSelection.selections) {
    addSelectedMod(restoredState.mod, {
      mainVisible: restoredState.mainVisible,
      componentIds: [...restoredState.componentKeys],
      configureFocus: false,
      deferRefresh: true,
    });
  }

  if (restoredSelection.selections.length) {
    const rawRequestedLocation = norm(requestedParams.get("location"));
    const requestedLocation = selectedModObjects()
      .flatMap((mod) => locationsByMod.get(mod) || [])
      .map(norm)
      .filter((location) => rawRequestedLocation === location || rawRequestedLocation.startsWith(location + ","))
      .sort((a, b) => b.length - a.length)[0] || rawRequestedLocation;
    const focusEntry = requestedLocation
      ? entries.find((entry) => entry.mods.some((mod) => isModSelected(mod)) &&
          (norm(entry.loc.cell) === requestedLocation || norm(entry.loc.name) === requestedLocation))
      : null;
    const requestedCell = Tes3ModMapLinks.normalizeExteriorCells([
      requestedParams.get("cell") || "",
    ])[0];
    const focusExteriorCell = requestedCell
      ? exteriorEntryByKey.get(exteriorCellKey(requestedCell[0], requestedCell[1])) || null
      : null;
    for (const state of selectedModStates()) {
      if (state.componentKeys.size === 0) configureStateForFocus(state, focusEntry, focusExteriorCell);
    }
    refreshSelection({ syncUrl: false });
    if (focusExteriorCell) {
      focusExteriorEntry(focusExteriorCell);
      openExteriorPopup(focusExteriorCell);
    } else if (focusEntry) {
      focusEntryGeometry(focusEntry);
      const focusMarker = visibleEntryMarkerRecords(focusEntry)[0] || focusEntry.markerRecords[0];
      focusMarker?.marker.openPopup();
    } else if (requestedParams.getAll("mod").length === 1) {
      fitSelectedMods();
    }
  } else {
    const requestedLocationId = requestedParams.get("location");
    let focusMarkerRecord = null;
    const focusEntry = requestedLocationId ? entries.find((entry) => {
      focusMarkerRecord = entry.markerRecords.find(({ entrance }) =>
        String(entrance.id) === requestedLocationId) || null;
      return focusMarkerRecord !== null;
    }) : null;
    if (focusEntry) {
      focusEntry.pinned = true;
      focusEntryGeometry(focusEntry, focusMarkerRecord);
      refreshMarkers();
      focusMarkerRecord.marker.openPopup();
    } else {
      const requestedCell = Tes3ModMapLinks.normalizeExteriorCells([
        requestedParams.get("cell") || "",
      ])[0];
      const exteriorEntry = requestedCell
        ? exteriorEntryByKey.get(exteriorCellKey(requestedCell[0], requestedCell[1])) || null
        : null;
      if (exteriorEntry) {
        focusExteriorEntry(exteriorEntry);
        openExteriorPopup(exteriorEntry);
      }
    }
    renderSelectedModsPanel();
  }

  // ---------- search ----------
  const searchInput = document.getElementById("search");
  const resultsBox = document.getElementById("search-results");

  const searchIndex = [
    ...entries.map((e) => ({
      type: "loc",
      label: e.loc.name,
      sub: e.synthetic
        ? `${e.loc.region ? e.loc.region + " · " : ""}${e.locationGroup.entries.length} place${e.locationGroup.entries.length === 1 ? "" : "s"}`
        : e.loc.region || "",
      text: norm(e.loc.name) + " " + norm(e.loc.cell),
      entry: e,
    })),
    ...defaultExteriorEntries.map((entry) => ({
      type: "cell",
      label: `Exterior cell (${entry.x}, ${entry.y})`,
      sub: `${entry.coverages.filter((coverage) => coverage.landscape).length} LAND edit${entry.coverages.filter((coverage) => coverage.landscape).length === 1 ? "" : "s"} · ${entry.coverages.reduce((total, coverage) => total + coverage.references, 0)} references`,
      text: `exterior cell ${entry.x}, ${entry.y} ${entry.x},${entry.y}`,
      exteriorEntry: entry,
    })),
    ...modData.mods.map((m) => {
      const locationCount = Tes3ModMapLinks.mergePrefixedLocations(m.locations).length;
      const exteriorCount = Tes3ModMapLinks.allModExteriorCells(m).length;
      return {
        type: "mod",
        label: m.name,
        sub: `${locationCount} place${locationCount === 1 ? "" : "s"} · ${exteriorCount} cell${exteriorCount === 1 ? "" : "s"}`,
        text: norm(m.name),
        mod: m,
      };
    }),
  ];

  function runSearch(q) {
    q = norm(q);
    if (q.length < 2) {
      resultsBox.hidden = true;
      resultsBox.innerHTML = "";
      return;
    }
    const hits = searchIndex
      .filter((it) => it.text.includes(q))
      .sort((a, b) => {
        const aStarts = a.text.startsWith(q) ? 0 : 1;
        const bStarts = b.text.startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.label.localeCompare(b.label);
      })
      .slice(0, 14);
    resultsBox.innerHTML = hits
      .map(
        (it, i) => {
          const selected = it.type === "mod" && isModSelected(it.mod);
          return `<li data-i="${i}" class="${selected ? "search-result-selected" : ""}"><span class="kind ${it.type}">${it.type === "mod" ? "mod" : it.type === "cell" ? "cell" : "place"}</span>` +
            `${selected ? '<span class="search-selected-check" aria-hidden="true">✓</span>' : ""}${esc(it.label)}<span class="sub">${esc(it.sub)}</span></li>`;
        }
      )
      .join("");
    resultsBox.hidden = hits.length === 0;
    for (const li of resultsBox.querySelectorAll("li")) {
      li.addEventListener("click", () => {
        const hit = hits[Number(li.dataset.i)];
        resultsBox.hidden = true;
        if (hit.type === "mod") {
          toggleSelectedMod(hit.mod);
          searchInput.value = "";
        } else if (hit.type === "cell") {
          searchInput.value = hit.label;
          focusExteriorEntry(hit.exteriorEntry, true);
          openExteriorPopup(hit.exteriorEntry);
        } else {
          searchInput.value = hit.label;
          const e = hit.entry;
          e.pinned = true;
          refreshMarkers();
          focusEntryGeometry(e, e.markerRecords[0], true);
          e.markerRecords[0].marker.openPopup();
        }
      });
    }
  }

  searchInput.addEventListener("input", () => runSearch(searchInput.value));
  searchInput.addEventListener("focus", () => runSearch(searchInput.value));
  document.getElementById("clear-filters").addEventListener("click", () => {
    searchInput.value = "";
    resultsBox.hidden = true;
    resultsBox.innerHTML = "";

    filterMode = "all";
    document.querySelector('input[name="filter"][value="all"]').checked = true;
    if (newLocationFilterToggle) newLocationFilterToggle.checked = false;
    refreshNewLocationVisibility();
    setExteriorFilters({ landscape: false, references: false });

    for (const entry of entries) entry.pinned = false;
    map.closePopup();
    clearSelectedMods({ deferRefresh: true });

    const url = new URL(window.location.href);
    url.searchParams.delete("mod");
    url.searchParams.delete("location");
    url.searchParams.delete("cell");
    url.searchParams.delete("component");
    url.searchParams.delete("view");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    refreshSelection({ syncUrl: false });
  });
  document.addEventListener("click", (ev) => {
    if (!ev.target.closest(".searchbox")) resultsBox.hidden = true;
  });
})();
