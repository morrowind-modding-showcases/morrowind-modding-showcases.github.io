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
            "locations": ["Old Ebonheart"]
          }
        ],
        "exterior_cells": [[12, 11], [-3, 4]],
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

  `component_locations` is optional. Its coverage is indexed alongside the
  parent mod, and popups show the component name and type as secondary
  information. Relationship metadata is not consumed by the map: a patch must
  author its own component locations and never inherits the locations of the
  mod it patches.

  Exterior edits are authored separately in mod frontmatter as canonical grid
  strings such as `map_exterior_cells: ["12, 11", "-3, 4"]`. They do not need
  location articles. The generated `exterior_cells` pairs drive the soft-edged
  map overlay, cell popups, and mod selection. Overlay colors use a logarithmic
  green-to-red heat scale based on the number of mods in each cell; 100 or more
  mods is the red endpoint.

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

## Tiles

`tiles/zoom{0..5}/morrowind-{x}-{y}.jpg` — one-time mirror of the UESP
Morrowind tile set (`maps.uesp.net/mwmap/`), zoom 0–5 (zoom 5 = 32x32 tiles,
~12 MB total). `tools/mirror_tiles.sh` re-downloads any missing tiles.

Imagery and location data © [UESP](https://en.uesp.net/wiki/UESPWiki:Maps),
game content © Bethesda Softworks. The map page credits both in its
attribution line.

## Coordinates

Everything uses raw Morrowind worldspace units. The world square
(`posLeft/posTop/posRight/posBottom` in `locations.json`, 524288 units on each
side = 64x64 cells of 8192 units) maps linearly onto the single 256px tile at
zoom 0; `js/map.js` does this with Leaflet's `CRS.Simple` + `unproject`.
UESP `displayLevel` values are offset by +10 from our zoom levels.
