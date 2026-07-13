# Morrowind Modding Showcases — Modathon Replay

A static GitHub Pages site with no build step.

## URLs

- `https://darkelfmodding.com/` redirects visitors to
  `https://www.patreon.com/MorrowindModding`.
- `https://darkelfmodding.com/modathon/` serves Modathon Replay.

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
metadata and Nexus download statistics, with mods grouped by calendar year. The
page displays the snapshot's update date. This keeps the Nexus API credential in
GitHub Actions instead of exposing it in public browser code.

Add a repository secret named `NEXUS_API_KEY` under **Settings → Secrets and
variables → Actions**. The workflow can also be run manually from the Actions
tab.

## Site files

- `modathon/index.html` — the published Modathon Replay page
- `modathon/support.js`, `modathon/image-slot.js` — runtime helpers
- `modathon/assets/data/nexus-stats.json` — year-grouped mods and Nexus stats
- `modathon/assets/data/*-achievements.json` — per-year achievements data
- `modathon/assets/data/modders.json` — canonical modder profiles
- `.nojekyll` — tells GitHub Pages to serve files verbatim
