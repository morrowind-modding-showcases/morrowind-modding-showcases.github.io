# Morrowind Modding Showcases — Modathon Legacy

A static GitHub Pages site with no build step.

## URLs

- `https://darkelfmodding.com/` redirects visitors to
  `https://www.patreon.com/MorrowindModding`.
- `https://darkelfmodding.com/modathon/` serves Modathon Legacy.
- `https://darkelfmodding.com/modjam/` serves the Morrowind Modjam archive.

Modathon Legacy includes searchable databases for mods, modders, and
achievements. The mods view reads from the same year-grouped Nexus snapshot as
the home-page statistics, with filters for year and broad mod category.

The root `CNAME` keeps `darkelfmodding.com` assigned to this GitHub Pages site.
The root `index.html` performs the Patreon redirect, while the complete site is
stored in `modathon/` so its relative asset paths remain self-contained.

## Deploying

1. In **Settings → Pages**, publish from the `main` branch and `/ (root)`.
2. Set the custom domain to `darkelfmodding.com` and enable **Enforce HTTPS**.
3. Push changes to `main` and wait for the Pages deployment to complete.

Do not point the domain itself at Patreon: GitHub Pages must continue receiving
requests so it can serve `/modathon/`. The redirect is intentionally implemented
only by the root page.

## Maintaining event content

See `MAINTENANCE.md` for the owner workflow, annual checklist, source-data
inventory, and progress toward the Google Sheets publishing workflow.

Invited non-technical editors can use the Decap CMS administration interface.
See [`docs/admin-cms.md`](docs/admin-cms.md) for editor instructions, Netlify
setup, data schemas, safeguards, and known limitations.

Current-event settings shared by Modathon, Modjam, and Madness live in
`assets/event-config.js`. Proposed changes are checked by
`.github/workflows/validate-site.yml`; configure the repository to require its
**Validate site** check before pull requests can merge into `main`.

The versioned workbook contract lives in `publishing/schema-v1.json`.
`scripts/import-publishing.mjs` synchronizes all workbook-owned Modathon,
Modjam, and Madness events in one pass, updates current-event settings, and
preserves historical events and Nexus-derived metadata. The
**Sync site data from Google Sheets** action requires no event ID and opens one
review pull request containing every detected site-data change.

## Nexus statistics

`.github/workflows/nexus-stats.yml` runs daily at 04:17 UTC and refreshes Nexus
metadata for every unique mod across the Modathon, ModJam, and Madness datasets
in one API pass. It writes the primary Nexus `pictureUrl` to all three datasets
and updates Modathon's raw current Nexus category (`nexusCategory`), normalized
website category (`category`), and download statistics. ModJam and Madness keep
their event-specific `category` values. The shared Nexus category mapping lives
in `modathon/nexus-categories.js`; labels outside the known mapping, including
missing source labels, are kept in Modathon's `Unknown` category. The Modathon
mods page uses the stored `pictureUrl` for each card and displays a fallback when
Nexus has no image. The page displays the snapshot's update date. This keeps the
Nexus API credential in GitHub Actions instead of exposing it in public browser
code.

MMS showcase links live in `modathon/assets/data/showcases.json` as
`{ name, url }` records. Each name must exactly match the corresponding name
in the Nexus snapshot. Matching mods display a YouTube link on both the mods
database card and the modder profile card.

Mods whose Nexus IDs also occur in `map/data/mods.json` display a map-pin link
on both cards. The link opens `/map/?mod=<Nexus ID>&location=<cell>`, selects
the mod's mapped locations, zooms to one of them, and opens its popup. The
shared matching and deep-link helpers live in `assets/mod-map-links.js`.

Add a repository secret named `NEXUS_API_KEY` under **Settings → Secrets and
variables → Actions**. The workflow can also be run manually from the Actions
tab.

Run `node scripts/normalize-nexus-categories.mjs` after changing the mapping to
rewrite the existing snapshot, then verify it with
`node --test scripts/nexus-categories.test.mjs`.

## Achievement images

Achievement badges live under `modathon/assets/images/achievements/<year>/`.
Refresh the per-year achievement unlock lists from Google Sheets HTML exports
named `Modathon <year>.html` by running
`node scripts/convert-modathon-achievements.mjs <html-export-directory>`.
Run `node scripts/normalize-achievement-images.mjs` after adding badges to rename
them to lowercase achievement IDs and update the matching `imageUrl` values in
the yearly achievement data.

## Modder avatars

Site-wide modder IDs, display names, aliases, Nexus profile URLs, and avatar
URLs live in `assets/data/modders.json`. The Modathon, Modjam, and Madness
`modders.json` files contain only the IDs enabled for that event site; Madness
team members, Modjam entry authors, and judges use the same IDs. Run
`node scripts/cache-modder-avatars.mjs` after adding or changing avatar URLs.
The script builds `assets/data/modder-avatars.json` and stores same-origin
copies under `assets/images/modder-avatars/`.

## Modder titles

Title names, focus definitions, thresholds, and the fixed rarity hierarchy live
in `modathon/assets/data/titles.json`. Each title supports one to three
focus requirements, including optional maximums for exact counts and bounded
ranges. Higher `priority` values are rarer, and the title evaluator in
`modathon/title-system.js` assigns and displays only the highest-priority
eligible title. The priority formula is recorded alongside the data so
threshold edits can be checked rather than relying on an undocumented ordering.

Run `list-modder-titles.bat` to create `modder-titles.csv` in the project root.
The CSV has one row per title, with its criteria and required counts, the
modders who are assigned that title by the highest-priority selection rule,
and every eligible modder. The batch file calls
`scripts/list-modder-titles.mjs` as its internal data-processing helper.

## Madness team registration

The Madness registration page shows its form from September 1 at 12:00am UTC
through October 1 at 12:00am UTC, using the same schedule as the countdown.
To preview the form outside that window, open
`/madness/register?registration-test=1`. Preview submissions are real Formspree
submissions and are tagged with `registration_mode=test-preview`.

The current event is configured in `assets/event-config.js`. Its year, season
number, milestone dates, timezone, and Formspree form ID drive the home page,
registration page, countdown copy, milestones, and Roman-numeral season label.

## Modjam archive data

The Modjam site reads `modjam/data/modjams.json`, the Modjam ID list in
`modjam/data/modders.json`, and the central registry in
`assets/data/modders.json`. Regenerate them from Google Sheets HTML exports
with `scripts/convert-modjam-data.mjs`; pass the entries export first and the
complete modder-list export second.

Site-wide Modjam postcard thumbnails live in `modjam/assets/postcards/thumbnail`
and are assembled in the browser from `modjam/data/postcards.json`. Matching
full-size images live in `modjam/assets/postcards/full`. Keep filenames lowercase
and identical in both folders. After adding or removing a WebP, run
`node scripts/sync-modjam-postcards.mjs`; existing caption settings are preserved
and new images are added without captions. Each postcard record must also set the
`entryId` of its corresponding mod so modder profiles can prioritize scenes from
mods credited to that profile.

## Site files

- `modjam/index.html`, `modjam/style.css`, `modjam/app.js` — the searchable Modjam archive and modder profiles
- `modjam/assets/banners`, `modjam/assets/images` — WebP event banners and social-preview artwork
- `assets/data/modders.json` — site-wide modder IDs and base profile data
- `modjam/data/modjams.json`, `modjam/data/modders.json` — normalized Modjam entries/results and Modjam profile IDs
- `modjam/data/judges.json` — judge IDs and the names shown in judge credits
- `scripts/sync-modjam-postcards.mjs` — syncs the live postcard manifest with the postcard asset folder
- `scripts/convert-modjam-data.mjs` — converts the two Google Sheets HTML exports into the Modjam JSON files
- `modathon/index.html` — the published Modathon Legacy page and databases
- `modathon/support.js`, `modathon/image-slot.js` — runtime helpers
- `modathon/assets/data/nexus-stats.json` — year-grouped Modathon mods and Nexus stats
- `modjam/data/modjams.json`, `madness/data/madness-mods.json` — event entries enriched with Nexus picture URLs
- `madness/data/madness-teams.json` — Madness teams whose members reference central modder IDs
- `modathon/assets/data/showcases.json` — MMS YouTube links stored as mod-name/URL records
- `modathon/assets/data/*-achievements.json` — per-year achievements data
- `modathon/assets/data/modders.json` — Modathon references to central modder IDs
- `modathon/assets/data/titles.json` — title focuses, thresholds, and priority
- `.nojekyll` — tells GitHub Pages to serve files verbatim
