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

A mod article represents one download or project. Existing articles need no
changes and are treated internally as one implicit main component. Downloads
with installable choices may add `components`, and either a page or a component
may author one-way `relations`:

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
    map_exterior_cells:
      - 12, 11
    notes: Install only this version.
```

Component types are `main`, `variant`, `patch`, `translation`, and `optional`.
Relationship types are `requires`, `patch_for`, `variant_of`,
`translation_of`, `compatible_with`, and `incompatible_with`. Targets are the
stable Markdown filename slugs. Only the source side is authored; the build
generates incoming relationships for the target page in
`/wiki/static/wiki-data.json`. Component map locations and exterior cells are
explicit geography and never derive from relationships. A `variant` or
`translation` replaces the parent mod's landscape coverage with its own cells.
A `patch` or `optional` component adds its cells to the parent coverage. The
generated map data records both the authored component cells and this effective
coverage.

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

When adding a new location, also add its exact display name and optional cell
name to both controlled mod-location lists:

- `content/_meta/ModWiki_properties.md` for Obsidian suggestions;
- the `map_locations` options in `.pages.yml` for Pages CMS.

`npm run validate:wiki` compares the location articles with both controlled
lists and reports every mismatch.

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
