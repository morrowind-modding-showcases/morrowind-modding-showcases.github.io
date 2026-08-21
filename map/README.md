# TES3 Mod Map

Interactive map of Vvardenfell and Solstheim showing which locations have
been modified by mods. Lives at `darkelfmodding.com/map`. The frontend is plain
Leaflet; its optimized data files are generated during the unified site build.

## Data files

- `data/locations.json` — generated location database (name, cell name, region,
  worldspace entrance coordinates, icon type, display level, UESP and local wiki links). Its
  editable source is `wiki/content/locations/*.md`; the JSON is intentionally
  not committed. One article represents one in-game cell. Its top-level
  `map_id`, `x`, `y`, and `level` define the primary entrance; optional
  `additional_entrances` entries add markers for other doors into that same
  cell without creating duplicate articles or search results.
- `data/mods.json` — generated map coverage data created during the site build
  from `wiki/content/mods/*.md`. It is intentionally not committed. The browser
  still consumes this optimized JSON shape:

  ```json
  {
    "mock": true,
    "mods": [
      {
        "id": "mod-name",
        "name": "Mod Name",
        "url": "https://www.nexusmods.com/morrowind/mods/12345",
        "authors": ["Author"],
        "locations": ["Cell Name", "Another Cell, Sub-Cell"],
        "component_locations": [
          {
            "id": "tr",
            "name": "Tamriel Rebuilt version",
            "type": "variant",
            "coverage_mode": "replace",
            "locations": ["Old Ebonheart"],
            "exterior_edits": [{"x": 12, "y": 11, "landscape": true, "references": 18}],
            "effective_locations": ["Old Ebonheart"],
            "effective_exterior_edits": [{"x": 12, "y": 11, "landscape": true, "references": 18}]
          }
        ],
        "exterior_edits": [
          {"x": 12, "y": 11, "landscape": true, "references": 0},
          {"x": -3, "y": 4, "landscape": false, "references": 50}
        ],
        "wiki_url": "/wiki/mods/mod-name"
      }
    ]
  }
  ```

  `locations` entries are **game cell names** and are matched
  (case-insensitively) against each location's cell name, falling back to its
  display name. Within one mod, an explicitly listed parent location also
  absorbs entries that begin with that parent followed by a comma; for example,
  `Kogoruhn` absorbs `Kogoruhn, Charma's Breath`. Distinct comma-qualified
  locations remain separate when their parent is not listed, as with Vivec's
  canton anchors. `authors` is optional. If a `"mock": true` flag is present
  the page shows a "mock data" banner.

  Component `locations` and `exterior_edits` are the cells authored for that
  install option. `effective_*` fields are what the map indexes. Variants and
  translations use `coverage_mode: "replace"`; patches and optional plugins use
  `"additive"` and combine their cells with the parent mod's coverage. Relationship
  targets never contribute geography.

  `component_locations` is optional. Its coverage is indexed alongside the
  parent mod, and popups show the component name and type as secondary
  information. Relationship metadata is not consumed by the map: a patch must
  author its own component locations and never inherits the locations of the
  mod it patches.

  Exterior edits are authored separately in mod frontmatter with one structured
  entry per cell, for example
  `map_exterior_edits: [{cell: "12, 11", landscape: true, references: 50}]`.
  They do not need location articles. `landscape` records binary LAND presence;
  `references` records the CELL FRMR count. A false/zero entry still records the
  presence of a CELL edit without contributing LAND or reference heat. The map
  starts with both exterior filters off, and Landscape and References are
  mutually exclusive when enabled.
  Landscape heat counts mods with LAND in a cell and caps at 100; References
  heat sums modified references and caps at 10,000. Legacy
  `map_exterior_cells` string lists remain readable as landscape-only coverage.

  `npm run build:map-data` and `npm run build:location-data` generate local
  compatibility files for map-only development. `npm run build:site` writes
  both production copies directly under `dist/map/data/`.

  `tools/build_mods_from_doc.py` and `data/source-dungeon-overhauls.html` are
  retained only as historical import references. New and existing mod metadata
  is edited in the wiki Markdown files rather than rebuilt from the old Google
  Docs export.

- `data/uesp-locations-raw.json` / `data/uesp-worlds-raw.json` — raw snapshots
  of the UESP gamemap API (`gamemap.php?action=get_locs|get_worlds&db=mw`),
  retained as historical import references. New coordinates are maintained in
  the wiki location articles.

## Location clustering

Comma-qualified cells cluster beneath one marker while zoomed out and split
apart again from zoom 4 (`LOCATION_SPLIT_ZOOM` in `js/map.js`). A cluster
forms in two ways:

- **Published parents** — if a location article exists whose name equals the
  prefix (`Balmora` for `Balmora, Temple`), its real marker represents every
  matching child. Publishing such a page is enough; no other data changes.
- **Synthesized containers** — when no article matches the prefix, the
  browser groups the children under the deepest prefix shared by at least
  two of them and renders a synthetic container marker at their centroid.
  This is how mod-added settlements (`Bo-muul, …`) and unpublished vanilla
  names (`Tel Fyr`, shipwreck decks) cluster. Members must lie within two
  exterior cells of each other, so region-wide naming patterns such as
  `Solstheim, …` never collapse into one misleading pin. A small alias table
  in `assets/mod-map-links.js` maps vanilla cell prefixes to their common
  name (`Tower of Tel Fyr` → `Tel Fyr`, `Ald-ruhn` → `Ald'ruhn`); extend it
  when a new mismatch shows up.

Synthetic containers are presentation-only: they are excluded from the stats
line and from per-mod place counts, and their popups list the member places.
A cluster styled blue contains only mod-added locations and honors the
new-locations filter; mixed clusters show green like other modified places.

## Tiles

`tiles/zoom{0..7}/morrowind-{x}-{y}.jpg` — one-time mirror of the UESP
Morrowind tile set (`maps.uesp.net/mwmap/`), zoom 0–7 (zoom 7 = 128x128 tiles,
~134 MiB total). `tools/mirror_tiles.sh` re-downloads any missing tiles.

The browser keeps the original UESP square as its minimum extent, then expands
its bounds to include the primary, additional, and variant entrances in the
current generated location data. Tiles outside the original square reuse blank
blue-sea JPGs from the mirrored set; zooms 0 and 1 reuse zoom 2's blank tile.
Because the extent is derived at load time, removing outlying locations shrinks
the map back toward (but never inside) the original square.

Imagery and location data © [UESP](https://en.uesp.net/wiki/UESPWiki:Maps),
game content © Bethesda Softworks. The map page credits both in its
attribution line.

## Coordinates

Everything uses raw Morrowind worldspace units. The world square
(`posLeft/posTop/posRight/posBottom` in `locations.json`, 524288 units on each
side = 64x64 cells of 8192 units) maps linearly onto the single 256px tile at
zoom 0; `js/map.js` does this with Leaflet's `CRS.Simple` + `unproject`.
UESP `displayLevel` values are offset by +10 from our zoom levels.
