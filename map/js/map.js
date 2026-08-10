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
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 5;
  const CELL_SIZE = Number(WORLD.cellSize) || 8192;
  const CITY_ICONS = new Set([1, 2]); // City, Town
  const LABEL_ZOOM = 2; // show city labels from this zoom

  // ---------- mod index: normalized cell name -> [mods] ----------
  const norm = (s) => (s || "").trim().toLowerCase();
  const modsByCell = new Map();
  const locationsByMod = new Map();
  const modsByExteriorCell = new Map();
  const exteriorCellsByMod = new Map();
  const exteriorCellKey = (x, y) => `${x},${y}`;
  for (const mod of modData.mods) {
    const locations = Tes3ModMapLinks.mergePrefixedLocations(mod.locations);
    const exteriorCells = Tes3ModMapLinks.normalizeExteriorCells(mod.exterior_cells);
    locationsByMod.set(mod, locations);
    exteriorCellsByMod.set(mod, exteriorCells);
    for (const cell of locations) {
      const key = norm(cell);
      if (!modsByCell.has(key)) modsByCell.set(key, []);
      modsByCell.get(key).push(mod);
    }
    for (const [x, y] of exteriorCells) {
      const key = exteriorCellKey(x, y);
      if (!modsByExteriorCell.has(key)) modsByExteriorCell.set(key, []);
      modsByExteriorCell.get(key).push(mod);
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

  const tileBounds = L.latLngBounds(
    map.unproject([0, 0], 0),
    map.unproject([256, 256], 0)
  );
  map.setMaxBounds(tileBounds.pad(0.15));

  L.tileLayer("tiles/zoom{z}/morrowind-{x}-{y}.jpg", {
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    tileSize: 256,
    noWrap: true,
    bounds: tileBounds,
  }).addTo(map);

  // ---------- exterior-cell coverage ----------
  const exteriorEntries = [...modsByExteriorCell].map(([key, mods]) => {
    const [x, y] = key.split(",").map(Number);
    return { key, x, y, mods, bounds: exteriorCellBounds(x, y) };
  });
  const exteriorEntryByKey = new Map(exteriorEntries.map((entry) => [entry.key, entry]));

  const ExteriorCellOverlay = L.Layer.extend({
    initialize(entriesForLayer) {
      this._entries = entriesForLayer;
      this._activeMod = null;
      this._hoverKey = null;
      this._frame = null;
    },

    onAdd(mapForLayer) {
      this._map = mapForLayer;
      this._canvas = L.DomUtil.create(
        "canvas",
        "exterior-cell-overlay leaflet-layer leaflet-zoom-hide"
      );
      this._canvas.setAttribute("aria-hidden", "true");
      mapForLayer.getPane("overlayPane").appendChild(this._canvas);
      mapForLayer.on("move zoom resize viewreset", this._scheduleDraw, this);
      this._scheduleDraw();
    },

    onRemove(mapForLayer) {
      mapForLayer.off("move zoom resize viewreset", this._scheduleDraw, this);
      if (this._frame) cancelAnimationFrame(this._frame);
      this._canvas.remove();
    },

    setActiveMod(mod) {
      this._activeMod = mod;
      this._scheduleDraw();
    },

    setHoverKey(key) {
      if (this._hoverKey === key) return;
      this._hoverKey = key;
      this._scheduleDraw();
    },

    _scheduleDraw() {
      if (this._frame) return;
      this._frame = requestAnimationFrame(() => {
        this._frame = null;
        this._draw();
      });
    },

    _draw() {
      if (!this._map || !this._canvas) return;
      const size = this._map.getSize();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(size.x * ratio));
      const height = Math.max(1, Math.round(size.y * ratio));
      this._canvas.width = width;
      this._canvas.height = height;
      this._canvas.style.width = `${size.x}px`;
      this._canvas.style.height = `${size.y}px`;
      L.DomUtil.setPosition(
        this._canvas,
        this._map.containerPointToLayerPoint([0, 0])
      );

      const visible = this._entries.filter((entry) =>
        (!this._activeMod || entry.mods.includes(this._activeMod)) &&
        this._map.getBounds().pad(0.08).intersects(entry.bounds)
      );
      if (!visible.length) return;

      const rects = visible.map((entry) => {
        const first = this._map.latLngToContainerPoint(entry.bounds.getNorthWest());
        const second = this._map.latLngToContainerPoint(entry.bounds.getSouthEast());
        return {
          entry,
          x: Math.min(first.x, second.x) * ratio,
          y: Math.min(first.y, second.y) * ratio,
          width: Math.abs(second.x - first.x) * ratio,
          height: Math.abs(second.y - first.y) * ratio,
        };
      });
      const conflicts = rects.filter(({ entry }) => entry.mods.length > 1);
      const context = this._canvas.getContext("2d");
      const surface = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        return { canvas, context: canvas.getContext("2d") };
      };
      const maskFor = (records, expansion = 0) => {
        const mask = surface();
        const averageCellSize = records.reduce(
          (sum, rect) => sum + Math.min(rect.width, rect.height),
          0
        ) / Math.max(1, records.length);
        const radius = Math.max(
          ratio,
          Math.min(14 * ratio, averageCellSize * 0.14)
        );
        const overlap = Math.min(1.5 * ratio, radius * 0.3);
        mask.context.fillStyle = "#fff";
        mask.context.strokeStyle = "#fff";
        mask.context.lineJoin = "round";
        mask.context.lineWidth = 2 * (radius + expansion);
        // Slightly overlapping rounded strokes turn adjacent grid cells into
        // one continuous contour while leaving disconnected cells separate.
        for (const rect of records) {
          const inset = Math.max(
            0,
            Math.min(radius - overlap, rect.width * 0.35, rect.height * 0.35)
          );
          const x = rect.x + inset;
          const y = rect.y + inset;
          const cellWidth = Math.max(1, rect.width - 2 * inset);
          const cellHeight = Math.max(1, rect.height - 2 * inset);
          mask.context.fillRect(x, y, cellWidth, cellHeight);
          mask.context.strokeRect(x, y, cellWidth, cellHeight);
        }
        mask.averageCellSize = averageCellSize;
        return mask;
      };
      const tintMask = (records, color, fillOpacity, featherOpacity, mask = maskFor(records)) => {
        if (!records.length) return;
        const effect = surface();
        effect.context.filter = `blur(${Math.max(3 * ratio, Math.min(16 * ratio, mask.averageCellSize * 0.14))}px)`;
        effect.context.drawImage(mask.canvas, 0, 0);
        effect.context.filter = "none";
        effect.context.globalCompositeOperation = "source-in";
        effect.context.fillStyle = color;
        effect.context.fillRect(0, 0, width, height);
        const crisp = surface();
        crisp.context.drawImage(mask.canvas, 0, 0);
        crisp.context.globalCompositeOperation = "source-in";
        crisp.context.fillStyle = color;
        crisp.context.fillRect(0, 0, width, height);
        context.save();
        context.globalAlpha = featherOpacity;
        context.drawImage(effect.canvas, 0, 0);
        context.globalAlpha = fillOpacity;
        context.globalCompositeOperation = "screen";
        context.drawImage(crisp.canvas, 0, 0);
        context.restore();
        return mask;
      };
      const drawMaskOutline = (records, mask, color, opacity = 0.9) => {
        if (!records.length) return;
        const borderWidth = Math.max(
          1.25 * ratio,
          Math.min(2.5 * ratio, mask.averageCellSize * 0.035)
        );
        const outline = maskFor(records, borderWidth);
        outline.context.globalCompositeOperation = "destination-out";
        outline.context.drawImage(mask.canvas, 0, 0);
        outline.context.globalCompositeOperation = "source-in";
        outline.context.fillStyle = color;
        outline.context.fillRect(0, 0, width, height);
        context.save();
        context.globalAlpha = opacity;
        context.globalCompositeOperation = "screen";
        context.drawImage(outline.canvas, 0, 0);
        context.restore();
      };

      const baseColor = this._activeMod ? "#ffb04a" : "#39d8ae";
      const baseMask = maskFor(rects);
      tintMask(rects, baseColor, this._activeMod ? 0.17 : 0.125, 0.31, baseMask);
      drawMaskOutline(rects, baseMask, baseColor);

      if (conflicts.length) {
        const conflictColor = "#ff668f";
        const conflictMask = maskFor(conflicts);
        tintMask(conflicts, conflictColor, 0.12, 0.26, conflictMask);
        const hatch = surface();
        hatch.context.strokeStyle = "rgba(255, 232, 173, 0.72)";
        hatch.context.lineWidth = Math.max(1.25, ratio * 1.25);
        const step = 13 * ratio;
        for (let offset = -height; offset < width + height; offset += step) {
          hatch.context.beginPath();
          hatch.context.moveTo(offset, 0);
          hatch.context.lineTo(offset + height, height);
          hatch.context.stroke();
        }
        hatch.context.globalCompositeOperation = "destination-in";
        hatch.context.drawImage(conflictMask.canvas, 0, 0);
        context.save();
        context.globalCompositeOperation = "screen";
        context.drawImage(hatch.canvas, 0, 0);
        context.restore();
        drawMaskOutline(conflicts, conflictMask, conflictColor, 0.95);
      }

      const hovered = rects.find(({ entry }) => entry.key === this._hoverKey);
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
    vanilla: { radius: 4, fillColor: "#8d93a5", color: "#22242c", weight: 1, fillOpacity: 0.8 },
    active: { radius: 8, fillColor: "#e8a33d", color: "#4a2f08", weight: 2, fillOpacity: 1 },
  };

  const wikiUrl = (page) => {
    if (!page) return null;
    if (/^https?:\/\//i.test(page)) return page;
    const full = page.includes(":") ? page : "Morrowind:" + page;
    return "https://en.uesp.net/wiki/" + encodeURI(full.replace(/ /g, "_"));
  };

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function popupHtml(entry, entrance) {
    const { loc, mods } = entry;
    const locationTitle = loc.wiki_url
      ? `<a href="${esc(loc.wiki_url)}">${esc(loc.name)}</a>`
      : esc(loc.name);
    let html = `<h3 class="popup-title">${locationTitle}</h3>`;
    const subBits = [];
    if (loc.cell && loc.cell !== loc.name) subBits.push(esc(loc.cell));
    const region = entrance.region || loc.region;
    if (region) subBits.push(esc(region));
    if (subBits.length) html += `<p class="popup-cell">${subBits.join(" &middot; ")}</p>`;
    if (mods.length) {
      html += '<div class="popup-mods"><h4>Modified by</h4><ul>';
      for (const mod of mods) {
        const label = mod.url
          ? `<a href="${esc(mod.url)}" target="_blank" rel="noopener">${esc(mod.name)}</a>`
          : esc(mod.name);
        const wiki = mod.wiki_url
          ? ` <a class="popup-download" href="${esc(mod.wiki_url)}" aria-label="Open the ${esc(mod.name)} wiki article">wiki</a>`
          : '';
        html += `<li>${label}${wiki}</li>`;
      }
      html += "</ul></div>";
    }
    const wiki = wikiUrl(loc.wiki);
    if (wiki) html += `<div class="popup-links"><a href="${wiki}" target="_blank" rel="noopener">UESP wiki &#8599;</a></div>`;
    return html;
  }

  function exteriorPopupHtml(entry) {
    const conflict = entry.mods.length > 1
      ? `<span class="popup-conflict">${entry.mods.length}-mod overlap</span>`
      : "";
    let html = `<div class="popup-cell-heading"><div><p class="popup-eyebrow">Exterior cell</p>` +
      `<h3 class="popup-title">(${entry.x}, ${entry.y})</h3></div>${conflict}</div>`;
    html += '<div class="popup-mods popup-exterior-mods"><h4>Modified by</h4><ul>';
    for (const mod of entry.mods) {
      const label = mod.url
        ? `<a href="${esc(mod.url)}" target="_blank" rel="noopener">${esc(mod.name)}</a>`
        : esc(mod.name);
      const wiki = mod.wiki_url
        ? ` <a class="popup-download" href="${esc(mod.wiki_url)}" aria-label="Open the ${esc(mod.name)} wiki article">wiki</a>`
        : "";
      html += `<li><span>${label}${wiki}</span>` +
        `<button type="button" class="popup-map-mod" data-mod-id="${esc(mod.id)}" data-cell-key="${entry.key}">show coverage</button></li>`;
    }
    html += "</ul></div>";
    return html;
  }

  // Build one logical entry per cell. A cell may have several entrance markers,
  // but it remains one search result, wiki link, and location in the stats.
  const entries = locData.locations.map((loc) => {
    const mods = modsByCell.get(norm(loc.cell)) || modsByCell.get(norm(loc.name)) || [];
    const modded = mods.length > 0;
    const entranceGeometry = [
      { id: loc.id, x: loc.x, y: loc.y, level: loc.level, region: loc.region },
      ...(Array.isArray(loc.entrances) ? loc.entrances : []),
    ];
    const entry = { loc, mods, modded, markerRecords: [], pinned: false };

    entry.markerRecords = entranceGeometry.map((entrance) => {
      // UESP displayLevel is an absolute zoom (world zoom offset 10); convert
      // to our 0..7 scale. Modded markers are forced visible early.
      const lvl = Math.max(0, Math.ceil((entrance.level || 10) - 10));
      const markerRecord = {
        entrance,
        showZoom: modded ? Math.min(lvl, LABEL_ZOOM) : lvl,
        marker: null,
      };
      const marker = L.circleMarker(worldToLatLng(entrance.x, entrance.y), {
        renderer,
        clickTolerance: 4,
        ...STYLE[modded ? "modded" : "vanilla"],
      });
      marker.bindPopup(() => popupHtml(entry, entrance), { maxWidth: 300 });
      if (CITY_ICONS.has(loc.icon)) {
        marker.bindTooltip(loc.name, {
          permanent: true,
          direction: "right",
          offset: [8, 0],
          className: "city-label",
        });
      }
      marker.on("popupclose", () => {
        if (entry.pinned) {
          entry.pinned = false;
          refreshMarkers();
        }
      });
      markerRecord.marker = marker;
      return markerRecord;
    });
    return entry;
  });

  // ---------- visibility ----------
  // Browsers restore radio state across reloads, so trust the DOM.
  let filterMode = document.querySelector('input[name="filter"]:checked')?.value || "all";
  let activeMod = null;

  function exteriorEntryAt(latLng) {
    const world = latLngToWorld(latLng);
    const key = exteriorCellKey(
      Math.floor(world.x / CELL_SIZE),
      Math.floor(world.y / CELL_SIZE)
    );
    const entry = exteriorEntryByKey.get(key) || null;
    return entry && (!activeMod || entry.mods.includes(activeMod)) ? entry : null;
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

  function isVisible(entry, markerRecord, zoom) {
    if (entry.pinned) return true;
    if (activeMod) return entry.mods.includes(activeMod);
    if (filterMode === "modded" && !entry.modded) return false;
    if (filterMode === "vanilla" && entry.modded) return false;
    return zoom >= markerRecord.showZoom;
  }

  function refreshMarkers() {
    const zoom = map.getZoom();
    for (const entry of entries) {
      for (const markerRecord of entry.markerRecords) {
        const { marker } = markerRecord;
        const show = isVisible(entry, markerRecord, zoom);
        const onMap = map.hasLayer(marker);
        if (show && !onMap) marker.addTo(map);
        else if (!show && onMap) marker.remove();
        if (show && marker.getTooltip()) {
          if (zoom >= LABEL_ZOOM) marker.openTooltip();
          else marker.closeTooltip();
        }
      }
    }
    // Draw (and hit-test) modded markers above vanilla ones.
    for (const entry of entries) {
      if (!entry.modded) continue;
      for (const { marker } of entry.markerRecords) {
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
  const moddedCount = entries.filter((e) => e.modded).length;
  const conflictCellCount = exteriorEntries.filter((entry) => entry.mods.length > 1).length;
  document.getElementById("stats").innerHTML =
    `<strong>${modData.mods.length} mods</strong> covering <strong>${moddedCount}</strong> ` +
    `of ${entries.length} known locations and <strong>${exteriorEntries.length}</strong> exterior cells` +
    (conflictCellCount ? ` (${conflictCellCount} overlaps).` : ".");

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

  // ---------- panel toggle ----------
  const panel = document.getElementById("panel");
  document.getElementById("panel-toggle").addEventListener("click", () => panel.classList.toggle("collapsed"));
  if (window.innerWidth < 640) panel.classList.add("collapsed");

  // ---------- active mod selection ----------
  const activeModBox = document.getElementById("active-mod");
  const activeModName = document.getElementById("active-mod-name");

  function focusEntryGeometry(entry, markerRecord = entry.markerRecords[0], animate = false) {
    const latLngs = entry.markerRecords.map(({ marker }) => marker.getLatLng());
    if (latLngs.length > 1) {
      map.fitBounds(L.latLngBounds(latLngs).pad(0.4), { maxZoom: 4, animate });
    } else if (animate) {
      map.flyTo(markerRecord.marker.getLatLng(), Math.max(map.getZoom(), 4), { duration: 0.8 });
    } else {
      map.setView(markerRecord.marker.getLatLng(), 4);
    }
  }

  function setEntryStyle(entry, style) {
    for (const { marker } of entry.markerRecords) marker.setStyle(style);
  }

  function setActiveMod(mod, options = {}) {
    let focusEntry = options.focusEntry || null;
    let focusExteriorCell = options.focusExteriorCell || null;
    if (activeMod) {
      for (const e of entries) {
        if (e.mods.includes(activeMod)) setEntryStyle(e, STYLE[e.modded ? "modded" : "vanilla"]);
      }
    }
    activeMod = mod;
    exteriorOverlay.setActiveMod(mod);
    activeModBox.hidden = !mod;
    if (mod) {
      const locs = entries.filter((e) => e.mods.includes(mod));
      const exteriorCells = exteriorEntries.filter((entry) => entry.mods.includes(mod));
      activeModName.textContent = `${mod.name} · ${locs.length} place${locs.length === 1 ? "" : "s"} · ${exteriorCells.length} exterior cell${exteriorCells.length === 1 ? "" : "s"}`;
      for (const e of locs) setEntryStyle(e, STYLE.active);
      if (focusExteriorCell && exteriorCells.includes(focusExteriorCell)) {
        focusExteriorEntry(focusExteriorCell);
      } else if (focusEntry && locs.includes(focusEntry)) {
        focusEntryGeometry(focusEntry);
      } else if (options.openSingleLocation && locs.length + exteriorCells.length === 1) {
        if (locs.length === 1) {
          focusEntry = locs[0];
          focusEntryGeometry(focusEntry);
        } else {
          focusExteriorCell = exteriorCells[0];
          focusExteriorEntry(focusExteriorCell);
        }
      } else if (locs.length || exteriorCells.length) {
        const coverageBounds = L.latLngBounds([]);
        for (const entry of locs) {
          for (const { marker } of entry.markerRecords) coverageBounds.extend(marker.getLatLng());
        }
        for (const entry of exteriorCells) {
          coverageBounds.extend(entry.bounds.getNorthWest());
          coverageBounds.extend(entry.bounds.getSouthEast());
        }
        if (coverageBounds.isValid()) {
          map.fitBounds(coverageBounds.pad(0.32), { maxZoom: 4 });
        }
      }
    } else {
      activeModName.textContent = "";
    }
    refreshMarkers();
    if (focusEntry) focusEntry.markerRecords[0].marker.openPopup();
    else if (focusExteriorCell) openExteriorPopup(focusExteriorCell);
  }

  document.getElementById("active-mod-clear").addEventListener("click", () => setActiveMod(null));
  map.getContainer().addEventListener("click", (event) => {
    const button = event.target.closest?.(".popup-map-mod");
    if (!button) return;
    const mod = Tes3ModMapLinks.findMappedMod(modData.mods, button.dataset.modId);
    const focusExteriorCell = exteriorEntryByKey.get(button.dataset.cellKey) || null;
    if (mod) setActiveMod(mod, { focusExteriorCell });
  });

  const requestedParams = new URLSearchParams(window.location.search);
  const requestedMod = Tes3ModMapLinks.findMappedMod(modData.mods, requestedParams.get("mod"));
  if (requestedMod) {
    const rawRequestedLocation = norm(requestedParams.get("location"));
    const requestedLocation = (locationsByMod.get(requestedMod) || [])
      .map(norm)
      .filter((location) => rawRequestedLocation === location || rawRequestedLocation.startsWith(location + ","))
      .sort((a, b) => b.length - a.length)[0] || rawRequestedLocation;
    const focusEntry = requestedLocation
      ? entries.find((entry) => entry.mods.includes(requestedMod) &&
          (norm(entry.loc.cell) === requestedLocation || norm(entry.loc.name) === requestedLocation))
      : null;
    const requestedCell = Tes3ModMapLinks.normalizeExteriorCells([
      requestedParams.get("cell") || "",
    ])[0];
    const focusExteriorCell = requestedCell
      ? exteriorEntryByKey.get(exteriorCellKey(requestedCell[0], requestedCell[1])) || null
      : null;
    setActiveMod(requestedMod, { focusEntry, focusExteriorCell, openSingleLocation: true });
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
  }

  // ---------- search ----------
  const searchInput = document.getElementById("search");
  const resultsBox = document.getElementById("search-results");

  const searchIndex = [
    ...entries.map((e) => ({
      type: "loc",
      label: e.loc.name,
      sub: e.loc.region || "",
      text: norm(e.loc.name) + " " + norm(e.loc.cell),
      entry: e,
    })),
    ...exteriorEntries.map((entry) => ({
      type: "cell",
      label: `Exterior cell (${entry.x}, ${entry.y})`,
      sub: `${entry.mods.length} mod${entry.mods.length === 1 ? "" : "s"}`,
      text: `exterior cell ${entry.x}, ${entry.y} ${entry.x},${entry.y}`,
      exteriorEntry: entry,
    })),
    ...modData.mods.map((m) => {
      const locationCount = locationsByMod.get(m).length;
      const exteriorCount = exteriorCellsByMod.get(m).length;
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
        (it, i) =>
          `<li data-i="${i}"><span class="kind ${it.type}">${it.type === "mod" ? "mod" : it.type === "cell" ? "cell" : "place"}</span>` +
          `${esc(it.label)}<span class="sub">${esc(it.sub)}</span></li>`
      )
      .join("");
    resultsBox.hidden = hits.length === 0;
    for (const li of resultsBox.querySelectorAll("li")) {
      li.addEventListener("click", () => {
        const hit = hits[Number(li.dataset.i)];
        resultsBox.hidden = true;
        searchInput.value = hit.label;
        if (hit.type === "mod") {
          setActiveMod(hit.mod);
        } else if (hit.type === "cell") {
          focusExteriorEntry(hit.exteriorEntry, true);
          openExteriorPopup(hit.exteriorEntry);
        } else {
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

    for (const entry of entries) entry.pinned = false;
    map.closePopup();
    setActiveMod(null);

    const url = new URL(window.location.href);
    url.searchParams.delete("mod");
    url.searchParams.delete("location");
    url.searchParams.delete("cell");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  });
  document.addEventListener("click", (ev) => {
    if (!ev.target.closest(".searchbox")) resultsBox.hidden = true;
  });
})();
