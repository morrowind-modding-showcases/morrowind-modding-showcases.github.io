# Publishing Data Contract

`schema-v1.json` is the versioned contract between the owner-facing publishing
workbook and the repository importers.

## Rules

- Do not rename or reorder workbook headers without creating a new schema
  version and updating the importers.
- IDs use lowercase letters, numbers, and hyphens.
- ID-list cells use the workbook's multi-select dropdown chips. Google Sheets
  stores their values with commas, for example `first-modder, second-modder`.
  The importer also accepts legacy semicolon-separated ID lists.
- Historical person references may use a unique slug of a Modders display name
  or alias. The importer resolves it to the canonical person while preserving
  the historical display name.
- Achievement unlockers may use a stable group ID without a Modders row, such
  as `team-target-dummies`. Entry authors and team members must always resolve
  to a Modders row.
- Free-text list cells, such as aliases and themes, use semicolons.
- Dates use ISO 8601 UTC values such as `2027-05-01T00:00:00Z`.
- Media `published_path` values are relative to that event site's directory,
  for example `assets/banners/summer-2027.webp`, not `modjam/assets/...`.
  Legacy site-prefixed paths are normalized during import.
- Rows with a blank primary ID are ignored.
- Draft imports include `draft` and `published` records.
- Publish-mode imports include only `published` content rows. Events marked
  `published` or `archived` are synchronized; unfinished `draft` events are
  left out.
- Archived events may omit operational schedule fields and Madness registration
  form IDs because those values are not stored in the historical site archives.
  Draft and published events still require their complete live-event schedule.
- Archived Modathon entries may retain valid HTTP links to historical sources
  outside Nexus Mods and may repeat a Nexus mod when the checked-in archive
  contains that duplicate. Draft and published events still require a unique
  Morrowind Nexus mod URL for every entry.
- Archived Modjam entries marked `withdrawn` remain in the historical archive
  when their original download URL is no longer available.
- Media status `unreleased` is reserved for hidden achievements that were never
  unlocked and therefore never had artwork released. Importers must reject that
  status for visible or unlocked achievements and omit their `imageUrl`.
- Historical records are never deleted implicitly.

## Google Sheets export

The **Sync site data from Google Sheets** GitHub workflow reads the six
publishing tabs through the Google Sheets API, validates the row 2 headers
against this schema, and synchronizes every connected Modathon, Modjam, and
Madness event in one run. It authenticates with a dedicated read-only Google
service account through short-lived workload identity credentials; no Google
key is stored in GitHub.

There is no event-ID workflow input. An Events row makes that event
workbook-owned. The importer updates every workbook-owned event and preserves
historical site events that have not yet been moved into the workbook. Git
records only generated files whose content changed, so editing one cell
produces an ordinary update rather than requiring a new-event load.

For local development, export each tab as CSV using the exact file names
recorded in `schema-v1.json`.

Run the same all-site importer locally with:

```text
node scripts/import-publishing.mjs <csv-directory> --mode publish --dry-run
```

Draft mode also includes unfinished rows for review:

```text
node scripts/import-publishing.mjs <csv-directory> --mode draft --dry-run
```

Run without `--dry-run` only after reviewing its summary. Reducing a connected
event's entry, achievement, or team count requires the explicit
`--allow-removals` flag.

## Site mappings

- **Events** updates archive metadata and the latest non-archived event in
  `assets/event-config.js`.
- **Modathon** uses Entries, Achievements, Modders, and achievement Media.
- **Modjam** uses Entries and Modders; the Placement cell may contain a
  placement followed by semicolon-separated judge awards. Banner and header
  Media rows update archive artwork.
- **Madness** uses Teams to connect members to Entries through
  `submission_entry_ids`; team and individual placements are generated into
  the two yearly archives.
- Existing Nexus pictures, statistics, and other derived metadata are retained
  when a matching Nexus mod is updated.

The importer references media already present in the repository. Downloading
and optimizing new source artwork from Google Drive remains a separate step.
