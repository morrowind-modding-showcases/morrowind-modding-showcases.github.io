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
  const CITY_ICONS = new Set([1, 2]); // City, Town
  const LABEL_ZOOM = 2; // show city labels from this zoom

  // ---------- mod index: normalized cell name -> [mods] ----------
  const norm = (s) => (s || "").trim().toLowerCase();
  const modsByCell = new Map();
  for (const mod of modData.mods) {
    for (const cell of mod.locations) {
      const key = norm(cell);
      if (!modsByCell.has(key)) modsByCell.set(key, []);
      modsByCell.get(key).push(mod);
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
    const full = page.includes(":") ? page : "Morrowind:" + page;
    return "https://en.uesp.net/wiki/" + encodeURI(full.replace(/ /g, "_"));
  };

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function popupHtml(entry) {
    const { loc, mods } = entry;
    let html = `<h3 class="popup-title">${esc(loc.name)}</h3>`;
    const subBits = [];
    if (loc.cell && loc.cell !== loc.name) subBits.push(esc(loc.cell));
    if (loc.region) subBits.push(esc(loc.region));
    if (subBits.length) html += `<p class="popup-cell">${subBits.join(" &middot; ")}</p>`;
    if (mods.length) {
      html += '<div class="popup-mods"><h4>Modified by</h4><ul>';
      for (const mod of mods) {
        const label = mod.url
          ? `<a href="${esc(mod.url)}" target="_blank" rel="noopener">${esc(mod.name)}</a>`
          : esc(mod.name);
        html += `<li>${label}</li>`;
      }
      html += "</ul></div>";
    }
    const wiki = wikiUrl(loc.wiki);
    if (wiki) html += `<div class="popup-links"><a href="${wiki}" target="_blank" rel="noopener">UESP wiki &#8599;</a></div>`;
    return html;
  }

  // Build one entry per location.
  const entries = locData.locations.map((loc) => {
    const mods = modsByCell.get(norm(loc.cell)) || modsByCell.get(norm(loc.name)) || [];
    const modded = mods.length > 0;
    // UESP displayLevel is an absolute zoom (world zoom offset 10); convert to
    // our 0..7 scale. Vanilla markers above MAX_ZOOM simply never show
    // (interior shops/houses); modded markers are forced visible early.
    const lvl = Math.max(0, Math.ceil((loc.level || 10) - 10));
    const showZoom = modded ? Math.min(lvl, LABEL_ZOOM) : lvl;
    const entry = { loc, mods, modded, showZoom, marker: null, pinned: false };

    const marker = L.circleMarker(worldToLatLng(loc.x, loc.y), {
      renderer,
      clickTolerance: 4,
      ...STYLE[modded ? "modded" : "vanilla"],
    });
    marker.bindPopup(() => popupHtml(entry), { maxWidth: 300 });
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
    entry.marker = marker;
    return entry;
  });

  // ---------- visibility ----------
  // Browsers restore radio state across reloads, so trust the DOM.
  let filterMode = document.querySelector('input[name="filter"]:checked')?.value || "all";
  let activeMod = null;

  function isVisible(entry, zoom) {
    if (entry.pinned) return true;
    if (activeMod) return entry.mods.includes(activeMod);
    if (filterMode === "modded" && !entry.modded) return false;
    if (filterMode === "vanilla" && entry.modded) return false;
    return zoom >= entry.showZoom;
  }

  function refreshMarkers() {
    const zoom = map.getZoom();
    for (const entry of entries) {
      const show = isVisible(entry, zoom);
      const onMap = map.hasLayer(entry.marker);
      if (show && !onMap) entry.marker.addTo(map);
      else if (!show && onMap) entry.marker.remove();
      if (show && entry.marker.getTooltip()) {
        if (zoom >= LABEL_ZOOM) entry.marker.openTooltip();
        else entry.marker.closeTooltip();
      }
    }
    // Draw (and hit-test) modded markers above vanilla ones.
    for (const entry of entries) {
      if (entry.modded && map.hasLayer(entry.marker)) entry.marker.bringToFront();
    }
  }

  map.on("zoomend", refreshMarkers);

  // ---------- initial view ----------
  const contentBounds = L.latLngBounds(entries.map((e) => e.marker.getLatLng()));
  map.fitBounds(contentBounds.pad(0.05));
  refreshMarkers();

  // ---------- stats / banner ----------
  const moddedCount = entries.filter((e) => e.modded).length;
  document.getElementById("stats").innerHTML =
    `<strong>${modData.mods.length} mods</strong> covering <strong>${moddedCount}</strong> ` +
    `of ${entries.length} known locations.`;

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

  function setActiveMod(mod, options = {}) {
    let focusEntry = options.focusEntry || null;
    if (activeMod) {
      for (const e of entries) {
        if (e.mods.includes(activeMod)) e.marker.setStyle(STYLE[e.modded ? "modded" : "vanilla"]);
      }
    }
    activeMod = mod;
    activeModBox.hidden = !mod;
    if (mod) {
      activeModName.textContent = mod.name;
      const locs = entries.filter((e) => e.mods.includes(mod));
      for (const e of locs) e.marker.setStyle(STYLE.active);
      if (locs.length) {
        if (focusEntry && locs.includes(focusEntry)) {
          map.setView(focusEntry.marker.getLatLng(), 4);
        } else if (options.openSingleLocation && locs.length === 1) {
          focusEntry = locs[0];
          map.setView(focusEntry.marker.getLatLng(), 4);
        } else {
          map.fitBounds(L.latLngBounds(locs.map((e) => e.marker.getLatLng())).pad(0.4), {
            maxZoom: 4,
          });
        }
      }
    }
    refreshMarkers();
    if (focusEntry) focusEntry.marker.openPopup();
  }

  document.getElementById("active-mod-clear").addEventListener("click", () => setActiveMod(null));

  const requestedParams = new URLSearchParams(window.location.search);
  const requestedMod = Tes3ModMapLinks.findMappedMod(modData.mods, requestedParams.get("mod"));
  if (requestedMod) {
    const requestedLocation = norm(requestedParams.get("location"));
    const focusEntry = requestedLocation
      ? entries.find((entry) => entry.mods.includes(requestedMod) &&
          (norm(entry.loc.cell) === requestedLocation || norm(entry.loc.name) === requestedLocation))
      : null;
    setActiveMod(requestedMod, { focusEntry, openSingleLocation: true });
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
    ...modData.mods.map((m) => ({
      type: "mod",
      label: m.name,
      sub: `${m.locations.length} location${m.locations.length === 1 ? "" : "s"}`,
      text: norm(m.name),
      mod: m,
    })),
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
          `<li data-i="${i}"><span class="kind ${it.type}">${it.type === "mod" ? "mod" : "place"}</span>` +
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
        } else {
          const e = hit.entry;
          e.pinned = true;
          refreshMarkers();
          map.flyTo(e.marker.getLatLng(), Math.max(map.getZoom(), 4), { duration: 0.8 });
          map.once("moveend", () => e.marker.openPopup());
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
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  });
  document.addEventListener("click", (ev) => {
    if (!ev.target.closest(".searchbox")) resultsBox.hidden = true;
  });
})();
