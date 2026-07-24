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
- Free-text list cells, such as aliases and themes, use semicolons.
- Dates use ISO 8601 UTC values such as `2027-05-01T00:00:00Z`.
- Rows with a blank primary ID are ignored.
- Draft imports include `draft` and `published` records.
- Final imports include only `published` records and require the selected event
  to be published.
- Media status `unreleased` is reserved for hidden achievements that were never
  unlocked and therefore never had artwork released. Importers must reject that
  status for visible or unlocked achievements and omit their `imageUrl`.
- Historical records are never deleted implicitly.

## Google Sheets export

The **Update event data** GitHub workflow reads the six publishing tabs through
the Google Sheets API, validates the row 2 headers against this schema, and
provides the same tabular values to the importers. It authenticates with a
dedicated read-only Google service account through short-lived workload
identity credentials; no Google key is stored in GitHub.

For local development, export each tab as CSV using the exact file names
recorded in `schema-v1.json`.

The first supported importer is:

```text
node scripts/import-modathon-publishing.mjs <csv-directory> --event modathon-2027 --dry-run
```

Run without `--dry-run` only after reviewing its summary. Replacing an existing
year with fewer entries requires the explicit `--allow-removals` flag.
