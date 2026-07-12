# Morrowind Modding Showcases — Modathon Replay

A static site for GitHub Pages. No build step.

## Deploying

1. Push this folder to a GitHub repo (root of the default branch).
2. Repo **Settings → Pages** → Source: *Deploy from a branch* → branch `main`, folder `/ (root)`.
3. The site will be live at `https://<user>.github.io/<repo>/`.

`index.html` redirects to the main page (`Modathon Replay.dc.html`), which loads
`support.js` and reads its data from `assets/data/*.json` — all relative paths,
so it works at any base URL.

## Nexus download/endorsement stats

`.github/workflows/nexus-stats.yml` runs daily and regenerates
`assets/data/nexus-stats.json` via `scripts/fetch-nexus-stats.mjs`.

Setup: add a repo secret **NEXUS_API_KEY** (your personal Nexus Mods API key)
under **Settings → Secrets and variables → Actions**. You can also trigger the
workflow manually from the Actions tab. If the file is missing, the page falls
back gracefully.

## Files

- `Modathon Replay.dc.html` — the main page (edit this one)
- `support.js`, `image-slot.js` — runtime helpers loaded by the page
- `assets/data/` — per-year mods/achievements JSON + `modders.json`
- `Modathon Replay.html` — self-contained offline bundle (optional; not used by the site)
- `standalone-src.html`, `Modder Page Directions.dc.html` — working files (optional)
- `.nojekyll` — tells GitHub Pages to serve files verbatim (no Jekyll processing)
