# Site Maintenance

This is the owner's guide for keeping the event sites current. The long-term
publishing model is:

1. Maintain event information in a private Google Sheets workbook.
2. Store source artwork in a matching Google Drive folder.
3. Run one GitHub **Sync site data from Google Sheets** workflow.
4. Review the generated summary and approve the update.

The public site will continue to use versioned files in this repository. It
will not depend on Google Sheets or Drive while a visitor is browsing it.

## Implementation status

- [x] Centralize current-event settings for Modathon, Modjam, and Madness.
- [x] Run the full site test suite on pushes, pull requests, and manual request.
- [x] Validate the daily Nexus refresh before it can commit refreshed data.
- [x] Create the versioned publishing workbook template and data contract.
- [x] Import Modathon entries and achievements from publishing-tab exports.
- [x] Import the workbook into Google Sheets.
- [ ] Protect the publishing tabs against accidental structural edits.
- [x] Import Modjam events, entries, results, and modder profiles.
- [x] Import Madness teams, members, submissions, and results.
- [ ] Download and optimize event artwork from the Drive media inbox.
- [x] Add the owner-facing **Sync site data from Google Sheets** workflow.
- [ ] Verify the first live GitHub-to-Sheets workflow run.
- [ ] Complete an unpublished future-year rehearsal.

## What is automated now

### Current event settings

All current-event schedule values are in `assets/event-config.js`.

- **Modathon:** recurring start, end, grace-period, and reset dates.
- **Modjam:** event name, season, year, kickoff, start, end, timezone, and
  participation-banner link.
- **Madness:** event name, year, season number, registration and competition
  milestones, timezone, and Formspree form ID.

The workbook-wide importer regenerates this file from the latest non-archived
event of each type. The event pages and countdowns derive their values from it.

### Validation

`.github/workflows/validate-site.yml` runs every repository test whenever a
change is proposed or published. Use a pull request for maintenance updates and
merge only after **Validate site** passes.

Repository settings should require the **Validate site** check before changes
can merge into `main`. That prevents an invalid data update from becoming the
GitHub Pages source.

### Nexus metadata

`.github/workflows/nexus-stats.yml` refreshes Nexus pictures, categories, and
download statistics every day. The refreshed files are tested before the
workflow commits them.

This job enriches mods that are already present in the event datasets. It does
not discover or add a newly submitted mod; the event importers will do that.

### Publishing workbook and all-site importer

`publishing/schema-v1.json` is the versioned contract for the Events, Modders,
Entries, Achievements, Teams, and Media tabs. The workbook template also
contains a Start Here guide, live row counts, dropdowns, a field guide, and the
starter Modathon 2027 event row.

`scripts/import-publishing.mjs` accepts CSV exports of all six publishing tabs
and synchronizes every workbook-owned event. It creates or updates Modathon
entries and achievements, Modjam events and modder profiles, Madness teams and
submissions, and the shared current-event configuration. Historical site
events not represented in the workbook remain unchanged, and existing
Nexus-derived metadata is retained when an entry URL has already been
refreshed.

Use dry-run mode first:

```text
node scripts/import-publishing.mjs <csv-directory> --mode publish --dry-run
```

The GitHub workflow requires no event ID. Publish mode synchronizes all
published and archived events and ignores unfinished draft events. Draft mode
also includes draft rows for review. Publish mode requires published media and
existing image files. Reducing a workbook-owned event's entry, achievement, or
team count is blocked unless the explicit removal option is supplied.

## Legacy and supporting source procedures

These procedures remain useful for historical corrections and supporting
assets even though the workbook-wide importer is now available.

### Modathon

- Entries and Nexus URLs live in
  `modathon/assets/data/modathon-mods.json`.
- Achievement definitions and unlockers live in the per-year
  `modathon/assets/data/<year>-achievements.json` files.
- `scripts/convert-modathon-achievements.mjs` refreshes unlockers from Google
  Sheets HTML exports.
- `scripts/normalize-achievement-images.mjs` standardizes achievement badge
  names and image links.
- `scripts/cache-modder-avatars.mjs` refreshes same-origin avatar copies.

The publishing importer creates or updates every connected Modathon year. The
older HTML achievement converter remains available for historical corrections.

### Modjam

- The two current Google Sheets HTML exports are converted by
  `scripts/convert-modjam-data.mjs`.
- Event metadata lives in `modjam/data/modjams.json`; submission records and
  Nexus pictures live in `modjam/data/modjam-mods.json`.
- Event media, formats, and results links are still partly defined inside that
  converter.
- Postcard images are synchronized by `scripts/sync-modjam-postcards.mjs`.

The workbook importer replaces the formatted-HTML assumptions for connected
events. The older converter remains available for historical source repair.

### Madness

- Teams and entries live directly in `madness/data/madness-teams.json` and
  `madness/data/madness-mods.json`. The roster is inferred from team-member IDs,
  which reference site-wide base profiles in `assets/data/modders.json`.

The workbook importer now updates connected Madness years while preserving
older years that have not yet been moved into the workbook.

### TES3 Mod Map

The map remains a separate collection because it is not an annual-event
dataset. Its `map/README.md` documents the Google Docs export process. Event
pages automatically create map links when a Nexus ID occurs in both datasets.

## Publishing workbook

The workbook defines these stable publishing tabs. Their Google Sheets versions
will be protected when the workbook is connected:

| Tab | Owns |
| --- | --- |
| Events | Event ID, type, year, season, dates, status, banners, and result links |
| Modders | Stable person ID, display name, aliases, Nexus profile, and avatar |
| Entries | Event ID, title, Nexus URL, author IDs, category, theme, and placement |
| Achievements | Achievement ID, requirement, rarity, unlocker IDs, and image |
| Teams | Event ID, team, members, submissions, and result |
| Media | Event ID, media type, Drive filename, and alternative text |

Friendly working tabs can use any layout. Import automation will read only
these protected publishing tabs.

## Annual operating checklist

### Before an event

- Duplicate the appropriate event template in the publishing workbook.
- Enter the event name, dates, season number, and publication status.
- Add the banner and other required art to the event's Drive folder.
- Run an update in draft mode and resolve any missing-data warnings.
- Publish the event schedule.

### During an event

- Add entrants and submissions to the workbook.
- Use stable person IDs for returning participants.
- Use the multi-select dropdown chips for entry authors, achievement unlockers,
  team members, and team submissions so those IDs stay linked to the Modders
  and Entries gold-source tabs.
- Rerun the importer whenever the public archive should be refreshed.
- Treat warnings about unmatched people, duplicate Nexus URLs, or missing
  images as blocking issues.

### After an event

- Enter final placements, awards, achievements, teams, and result links.
- Run the final import and review the reported counts.
- Verify a sample of entries and participant profiles.
- Approve the update, then mark the workbook event as archived.

### Once a year

- Confirm that scheduled GitHub workflows are still enabled.
- Review failed-action notifications and unresolved dependency alerts.
- Test the next event template before the announcement date.
- Confirm that another trusted owner can access the workbook, Drive folder,
  repository, domain, Formspree account, and Nexus API credential.

## Publishing safeguards

- Historical event records must not disappear unless a correction explicitly
  requests their removal.
- Modder records use stable person IDs; display-name changes belong in the alias list.
- Generated JSON and optimized images remain committed to the repository so
  every publication has an audit trail and can be reverted.
- Source-data updates use pull requests. The daily Nexus metadata refresh may
  continue to commit directly because it changes derived fields only and runs
  validation first.
- The importer stops without publishing when dates are out of order, required
  media is missing, references are unresolved, IDs are duplicated, or tests
  fail.
