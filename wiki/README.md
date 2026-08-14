# Dark Elf Modding Wiki

`content/` is the Obsidian vault and the single editable source for wiki pages
and TES3 Mod Map metadata. Quartz is implementation infrastructure; do not edit
generated files in `dist/wiki/`.

## Add a mod in Obsidian

1. Open `wiki/content/` as a vault.
2. Create a note from `_meta/templates/Mod.md` under `mods/`.
3. Choose the filename once; it becomes the stable wiki and map identifier.
4. Enter the title, authors, event, categories, Nexus URL, picture, and article text.
5. Set `map_enabled: true` and select one or more `map_locations` when the mod
   belongs on the map.
6. Change `draft` to `false` when the article is ready to publish.
7. Run `npm run validate:wiki`, then commit and push.

## Add a mod in Pages CMS

1. Open **Wiki → Mods**.
2. Create an entry and choose its filename through the initial title.
3. Fill in the fields, select map locations, and write the article.
4. Disable **Draft** when the article is ready.
5. Save. The Pages CMS commit uses the same validation and deployment workflow
   as an Obsidian edit.

Pages CMS merge mode is enabled so valid frontmatter not represented in its
form is preserved.

## Optional components and relationships

A mod article represents one download or project, including its main plugin.
Downloads with installable choices may add `components`, and either a page or a
component may author one-way `relations`:

```yaml
relations:
  - type: requires
    target: tamriel-rebuilt
components:
  - id: tr
    name: Tamriel Rebuilt version
    type: variant
    plugins:
      - Example - TR.esp
    relations:
      - type: requires
        target: tamriel-rebuilt
    map_locations:
      - Old Ebonheart
    map_exterior_edits:
      - cell: 12, 11
        landscape: true
        references: 18
    notes: Install only this version.
```

Component types are `variant`, `patch`, `translation`, and `optional`.
Relationship types are `requires`, `patch_for`, `variant_of`,
`translation_of`, `compatible_with`, and `incompatible_with`. Targets are the
stable Markdown filename slugs. Only the source side is authored; the build
generates incoming relationships for the target page in
`/wiki/static/wiki-data.json`. Component map locations and exterior edits are
explicit geography and never derive from relationships. A `variant` or
`translation` replaces the parent mod's landscape coverage with its own cells.
A `patch` or `optional` component adds its cells to the parent coverage. The
generated map data records both the authored component edits and this effective
coverage.

Each `map_exterior_edits` entry stores canonical `cell` coordinates, binary
`landscape` LAND presence, and the non-negative `references` (FRMR) count.
An entry with `landscape: false` and `references: 0` records a CELL edit that
does not include either kind of map heat data.
Legacy `map_exterior_cells` lists are accepted as landscape-only metadata so
existing articles remain valid, but new edits and submissions use the structured
field.

## Add a map location

Create a note from `_meta/templates/Location.md` under `locations/`, or open
**Wiki → Locations** in Pages CMS. When multiple comma-qualified names share
the same text before their first comma, put them in a folder named for that
shared text. For example, Vivec's cells go under `locations/vivec/`, with the
shared `Vivec,` prefix omitted from each article title. A comma-qualified
location with no sibling stays directly under `locations/` and keeps its full
name. This grouping is based only on the location or cell name, not its region
or category. Assign a unique positive map ID, enter the worldspace coordinates
and marker fields, and set `draft: false` when ready. The next build generates
the browser's `locations.json` from these articles.

When manually adding a vanilla location, also add its exact display name and optional
cell name to both editor suggestion lists:

- `content/_meta/ModWiki_properties.md` for Obsidian suggestions;
- the `map_locations` options in `.pages.yml` for Pages CMS.

`npm run validate:wiki` ensures those legacy editor lists do not contain missing
locations. The canonical browser submission list is generated directly from
location articles, so doormarker-derived mod locations can be added in the same
pull request as their mod without editing shared suggestion files. Those files
use `mod_added: true`, record the parent slug in `mod_added_by`, and remain at
the top level even when their cell name contains a comma.

## Local checks and build

From the repository root:

```text
npm run organize:wiki-locations
npm run validate:wiki
npm run build:wiki-data
npm test
npm run build:site
```

The complete deployable site is written to `dist/`, including the existing
site, the generated map data, and the Quartz wiki at `dist/wiki/`.

The public mod page for `content/mods/example-mod.md` is
`/wiki/mods/example-mod`. Its map link is derived from that filename.
