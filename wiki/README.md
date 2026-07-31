# Dark Elf Modding Wiki

`content/` is the Obsidian vault and the single editable source for wiki pages
and TES3 Mod Map metadata. Quartz is implementation infrastructure; do not edit
generated files in `dist/wiki/`.

## Add a mod in Obsidian

1. Open `wiki/content/` as a vault.
2. Create a note from `_meta/templates/Mod.md` under `mods/`.
3. Choose the filename once; it becomes the stable wiki and map identifier.
4. Enter the title, authors, categories, URL, and article text.
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

## Add a map location

Map locations are controlled values derived from `map/data/locations.json`.
Add or update the location there first, then add the exact same value to both:

- `content/_meta/ModWiki_properties.md` for Obsidian suggestions;
- the `map_locations` options in `.pages.yml` for Pages CMS.

`npm run validate:wiki` compares all three sources and reports every mismatch.

## Local checks and build

From the repository root:

```text
npm run validate:wiki
npm test
npm run build:site
```

The complete deployable site is written to `dist/`, including the existing
site, the generated map data, and the Quartz wiki at `dist/wiki/`.

The public mod page for `content/mods/example-mod.md` is
`/wiki/mods/example-mod`. Its map link is derived from that filename.
