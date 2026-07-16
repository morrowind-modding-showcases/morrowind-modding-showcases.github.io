# Morrowind Modding Showcases — Modathon Legacy

A static GitHub Pages site with no build step.

## URLs

- `https://darkelfmodding.com/` redirects visitors to
  `https://www.patreon.com/MorrowindModding`.
- `https://darkelfmodding.com/modathon/` serves Modathon Legacy.

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

## Nexus statistics

`.github/workflows/nexus-stats.yml` runs daily at 04:17 UTC and refreshes
`modathon/assets/data/nexus-stats.json`. This is the site's single source for mod
metadata, including each mod's raw current Nexus category (`nexusCategory`), its
normalized website category (`category`), Nexus download statistics, and the
primary image shown on Nexus Hot Files, with mods grouped by calendar year. The
shared mapping lives in `modathon/nexus-categories.js`; labels outside the known
mapping, including missing source labels, are kept in the website's `Unknown`
category. The mods page uses the stored
`pictureUrl` for each card and displays a fallback when Nexus has no image. The
page displays the snapshot's update date. This keeps the Nexus API credential in
GitHub Actions instead of exposing it in public browser code.

Add a repository secret named `NEXUS_API_KEY` under **Settings → Secrets and
variables → Actions**. The workflow can also be run manually from the Actions
tab.

Run `node scripts/normalize-nexus-categories.mjs` after changing the mapping to
rewrite the existing snapshot, then verify it with
`node --test scripts/nexus-categories.test.mjs`.

## Achievement images

Achievement badges live under `modathon/assets/images/achievements/<year>/`.
Run `node scripts/normalize-achievement-images.mjs` after adding badges to rename
them to lowercase achievement IDs and update the matching `imageUrl` values in
the yearly achievement data.

## Modder avatars

Modder avatar source URLs live in `modathon/assets/data/modders.json`. Run
`node scripts/cache-modder-avatars.mjs` after adding or changing avatar URLs.
The script stores same-origin WebP copies under
`modathon/assets/images/avatars/` so avatars can appear in both the modder
database and downloadable modder cards.

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

## Site files

- `modathon/index.html` — the published Modathon Legacy page and databases
- `modathon/support.js`, `modathon/image-slot.js` — runtime helpers
- `modathon/assets/data/nexus-stats.json` — year-grouped mods and Nexus stats
- `modathon/assets/data/*-achievements.json` — per-year achievements data
- `modathon/assets/data/modders.json` — canonical modder profiles
- `modathon/assets/data/titles.json` — title focuses, thresholds, and priority
- `.nojekyll` — tells GitHub Pages to serve files verbatim
