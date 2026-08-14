# Wiki contributions

## Architecture

The contribution system has five intentionally separate trust boundaries:

1. Quartz publishes `/wiki/contribute`, individual article edit links, the generated `/wiki/static/contribution-options.json` asset, and the leaderboard and recent-changes views backed by `/wiki/static/contribution-history.json`.
2. The browser builds a structured version-2 payload with a required public contributor name, shows a sanitized Markdown review, obtains a single-use Turnstile token, and posts to the Worker. The validator still normalizes queued version-1 payloads.
3. `darkelfmodding-wiki-submissions` validates the request, Turnstile result, origin, timing, size, and rate limit. It replaces the client timestamp with the Worker receipt time, strips the retired private-note value, SHA-256 digests and gzip/base64url encodes the payload, and dispatches the repository's `Create wiki submission PR` workflow.
4. The Action verifies and decodes the payload, revalidates it against the checked-out repository, reconstructs exactly one wiki page plus one contribution audit record, validates the entire site, and opens a public pull request.
5. A maintainer reviews the canonical Git diff and either merges or closes the pull request. A merge triggers the normal site deployment.

The public browser never receives a GitHub token and never writes to GitHub directly. The Worker's fine-grained GitHub token can dispatch only the trusted workflow; repository write credentials remain in GitHub Actions. One submission always proposes exactly one wiki page. Contributor identity is public and survives review in `content/wiki-contributions/<submission UUID>.json`. The optional **Remember user name** preference stores only that name in a secure, site-scoped cookie for one year; no article form state is stored.

## Public flow

The navigation exposes **Mods | Locations | Resources | Leaderboard | Recent changes | Contribute**. The Contribute page offers **Add a new mod page**. Individual mod and mapped-location articles expose **Suggest an edit**; indexes, folder pages, tag pages, the wiki home, and the Contribute page do not. New locations are created through Pages CMS because they require maintainer-assigned map IDs, icons, levels, and final paths.

New mod filenames are generated with NFKD normalization, cannot be edited independently from the title, and are checked against the build-generated existing slug list. Categories come from the site's canonical `modathon/nexus-categories.js` taxonomy; validation keeps the copies in `wiki/content/_meta/ModWiki_properties.md` and `.pages.yml` synchronized with it. Locations come from the canonical wiki location loader; the optional event is a single controlled dropdown whose labels reuse `scripts/sync-wiki-event-metadata.mjs`. The browser fetches existing edits as exact bytes from the public main branch and hashes those bytes before decoding or parsing them.

The add/edit mod form accepts one local `.esp` or `.esm` file up to 256 MiB. The browser reads TES3 record headers and inspects `CELL` and `LAND` records. It compares each cell's case-insensitive interior name or exterior grid coordinates with a bundled index generated from `Morrowind.esm`, `Tribunal.esm`, and `Bloodmoon.esm`: matches are Modified and absent cells are New. Unnamed exterior cells use their `RGNN` map name, such as `Grazelands Region (8, 9)`, and each `FRMR` counts as one modified reference. Files are never transmitted or stored. Every available cell starts selected, including cells with no modified references, and the cell list provides a single Select all/Deselect all control. Selected exteriors add structured `map_exterior_edits` metadata containing canonical coordinates, binary LAND presence, and the exact FRMR count; selected interiors add matching canonical wiki locations. Unmatched interiors are reported to the contributor.

A complete HTTP(S) download URL is required for every mod contribution. Uploading a plugin only helps populate its map locations and exterior edits; contributors still provide the mod metadata in the same form. The article field is plain Markdown and links to Obsidian's formatting syntax reference. Preview rendering builds sanitized DOM nodes and treats submitted HTML as text. Description frontmatter is not submitted; Quartz derives page and SEO descriptions from article text. The review screen can download the complete generated Markdown using the generated filename for new pages or the repository filename for edits. The contributor field accepts an existing name from the searchable generated list or a new public display name; these names are self-reported and are not authenticated site accounts. There are no private-note, contact, tag, GitHub-login, or direct-edit fields. The form clearly states that the resulting pull request is public. A failed API request keeps the in-memory form state and resets Turnstile for a new token. A successful request saves or clears the optional name cookie, clears the remaining state, and reports that PR creation is pending validation.

The mod form progressively asks whether the download contains alternate
versions, patches, translations, or optional plugins. Leaving it off preserves
the original contribution shape. Turning it on allows multiple components with
stable IDs, names, types, plugin filenames, searchable related-mod references,
relationship types, component-specific map locations and exterior edits, and
notes. Each component accepts its own local ESP/ESM upload to prepopulate that
coverage. Variants and translations replace the parent coverage; patches and
optional plugins add to it. The importer revalidates those relationships and
cells against the checked-out wiki before writing the same `components` schema
used by Pages CMS. Turning the progressive question back off for a new mod
omits `components` entirely and preserves the legacy submission payload.

## Worker routes and controls

The Worker project is `workers/wiki-submissions` and has these routes:

- `GET /health` returns minimal health JSON.
- `GET /nexus-mod?url=…` returns one bounded Morrowind Nexus Mods metadata record to the production origin.
- `OPTIONS /nexus-mod` permits only `https://darkelfmodding.com` and `GET`.
- `OPTIONS /submit` permits only `https://darkelfmodding.com`, `POST`, and `Content-Type`.
- `POST /submit` accepts the strict JSON envelope.

Production requests require the exact public origin, `application/json`, an empty `website` honeypot, at least three seconds of completion time, a reasonably current start time, and bounded request sizes. `SUBMISSION_RATE_LIMITER` allows five submission or Nexus-metadata attempts per 60 seconds using a SHA-256 of the request IP and user agent; neither source value is stored or logged.

Before dispatching an `edit-mod` or `edit-location`, the Worker fetches the target Markdown again from the public `main` branch and hashes the exact response bytes with SHA-256. If that hash differs from `payload.target.baseSha256`, the Worker does not dispatch the workflow and tells the contributor that the page changed and the edit form must be reloaded. New-page submissions do not perform this source check.

Turnstile is explicitly rendered with action `wiki_contribution`. The Worker sends the token, externally configured secret, connecting IP when available, and an idempotency UUID to Siteverify. It requires success, hostname `darkelfmodding.com`, and the expected action. Tokens are single-use; the client resets the widget after every failed submission attempt.

Expected Worker secrets are:

- `GITHUB_WORKFLOW_TOKEN`
- `TURNSTILE_SECRET_KEY`
- `NEXUS_API_KEY`

Do not put production values for these names in source, Wrangler configuration, tests, documentation, or logs.

## Workflow dispatch and canonical review

The Worker reuses `scripts/wiki-submission-codec.mjs` to produce a compact `WIKI_SUBMISSION_V1.<sha256>.<gzip-base64url>` envelope. The complete encoded workflow input is capped at 60,000 characters, below GitHub's 65,535-character workflow-input limit. A contribution whose compressed representation exceeds the cap is rejected with instructions to download the Markdown and contact a maintainer.

The dispatch contains the encoded submission and its UUID. Concurrency is keyed by that UUID. The Action checks that the separately supplied UUID matches the decoded payload before it creates a branch. Never echo the encoded input or the decoded payload into public logs.

The Action revalidates schema and controlled values and reconstructs the file through the authoritative importer. Existing edits hash the exact checked-out bytes again and stop on a stale mismatch, independently of the Worker's earlier check. Mod edits preserve unknown frontmatter, hidden tags, and current draft state, but remove legacy `description` overrides so Quartz derives descriptions from article text. Location edits additionally preserve `map_id`, `icon`, `level`, `explorer_title`, draft state, and hidden per-entrance metadata selected by verified source index.

New mods are written only when the validated slug does not exist. Their reconstructed frontmatter has one category, `draft: false`, no tags, and no automatic article heading. Public `new-location` payloads are rejected; new locations remain a Pages CMS maintainer operation.

After all validation passes, the Action commits only the intended wiki page and its matching contribution record, pushes a unique `wiki-submission-<uuid>-<run>-<attempt>` branch, and opens a normal public PR. Its title and body contain no encoded payload or untrusted contributor text; the public contributor name appears in the audit-record diff. The PR's Git diff is the single canonical human review surface. Closing a rejected PR keeps the record out of `main`; merging an accepted PR makes it part of the generated contributor list, leaderboard, and recent-changes feed on the normal deployment.

The Action uses the externally configured `WIKI_IMPORT_TOKEN` to check out, push the generated branch, and create the pull request so normal `pull_request` validation runs. Do not grant the Worker's `GITHUB_WORKFLOW_TOKEN` repository contents or pull-request write access; it needs only Actions write permission for this repository.

## Controlled data updates

- Update categories through `wiki/content/_meta/ModWiki_properties.md` and the matching Pages CMS controlled list, then run normal wiki validation.
- Update event source records under `content/modathon/mods`, `content/modjam/mods`, or `content/madness/mods`. Event naming comes from `scripts/sync-wiki-event-metadata.mjs`; do not add a browser-only list.
- Update location articles and their controlled metadata through the existing wiki location workflow. The contribution asset uses `loadControlledVocabularies` and `canonicalMapLocations`; do not copy the vocabulary into client code.

`npm run build:site` builds Quartz, then explicitly generates `dist/wiki/static/contribution-options.json` and `dist/wiki/static/contribution-history.json`. The post-Quartz step is required because Quartz respects `.gitignore` while scanning its static source folder, and both development copies under `wiki/quartz/static/` are intentionally ignored. Leaderboard month/year buckets and recent-change windows use the Worker's trusted submission timestamp. Historical contributions made before audit records were introduced cannot be attributed and are not backfilled.

## Tests and validation

From the repository root:

```sh
npm ci
npm ci --prefix wiki
npm ci --prefix workers/wiki-submissions
npm run content:validate
npm run content:build
npm run content:check
npm run validate:wiki
npm test
npm test --prefix workers/wiki-submissions
npm run build:site
```

Worker tests mock Siteverify, Nexus Mods, and GitHub and make no live external requests.

## Troubleshooting

- **The form will not load:** confirm the contribution-options asset was generated and published under `/wiki/static/`, then check the browser network response.
- **An edit will not load:** confirm the encoded target is a permitted non-index `.md` path and exists on the public main branch. Invalid UTF-8, YAML, category shape, or controlled map values deliberately fail closed.
- **Turnstile keeps failing:** confirm the production hostname and `wiki_contribution` action, then retry with a newly reset token. Never log token or secret values.
- **Import reports a stale edit:** ask for a fresh submission based on the current page; do not bypass the byte hash.
- **Import reports a duplicate filename:** choose a different slug through a new reviewed proposal; the importer check is authoritative.
- **Payload reconstruction fails:** re-run the failed workflow once. If it fails again, compare the deployed Worker and default-branch codec versions. Never paste or echo the encoded workflow input into public logs.
- **The compressed submission is too large:** use the review screen's Markdown download and contact a maintainer; the Action input deliberately stays below 60,000 characters.
- **A new location is needed:** create it through Pages CMS, where the maintainer can assign its map ID, icon, level, and final path.

## Manual Worker deployment

The Worker normally needs to be deployed once, then redeployed only when its code or configuration changes. Deployment remains manual; there is no Cloudflare deployment workflow.

```sh
cd workers/wiki-submissions
npm ci
npx wrangler login
npx wrangler deploy
```

Resolve any existing private-queue issues before merging this workflow change; the issue-number importer is intentionally removed. Before deploying the updated Worker, add `GITHUB_WORKFLOW_TOKEN`, scoped to Actions write access on this repository only. After the direct-dispatch Worker is live, remove the retired queue token.
