# Anonymous wiki contributions

## Architecture

The contribution system has four intentionally separate trust boundaries:

1. Quartz publishes `/wiki/contribute/`, individual article edit links, and the generated `/wiki/static/contribution-options.json` asset.
2. The browser builds a structured version-1 payload, shows a sanitized Markdown review, obtains a single-use Turnstile token, and posts to the Worker.
3. `darkelfmodding-wiki-submissions` validates the request, Turnstile result, origin, timing, size, and rate limit before creating an issue in the private `morrowind-modding-showcases/wiki-submissions` queue.
4. The manually dispatched `Import wiki submission` Action reads only an approved private issue, verifies the hidden machine payload, reconstructs one wiki file, validates the entire site, and opens a public pull request.

The public browser never receives a GitHub token and never writes to GitHub directly. One submission always proposes exactly one wiki page. No form state or contributor identity is stored in browser storage.

## Public flow

The navigation exposes **Mods | Locations | Contribute**. The Contribute page offers only **Add a new mod page** and **Add a new map location**. Individual mod and mapped-location articles expose **Suggest an edit**; indexes, folder pages, tag pages, the wiki home, and the Contribute page do not.

New mod filenames are generated with NFKD normalization and checked against the build-generated existing slug list. Categories come from `wiki/content/_meta/ModWiki_properties.md`; locations come from the canonical wiki location loader; event labels reuse `scripts/sync-wiki-event-metadata.mjs`. The browser fetches existing edits as exact bytes from the public main branch and hashes those bytes before decoding or parsing them.

The article field is plain Markdown. Preview rendering builds sanitized DOM nodes and treats submitted HTML as text. There are no uploads, contact fields, tags, GitHub login, or direct-edit links. A failed API request keeps the in-memory form state and resets Turnstile for a new token. A successful request clears the state and displays only the private submission number.

## Worker routes and controls

The Worker project is `workers/wiki-submissions` and has these routes:

- `GET /health` returns minimal health JSON.
- `OPTIONS /submit` permits only `https://darkelfmodding.com`, `POST`, and `Content-Type`.
- `POST /submit` accepts the strict JSON envelope.

Production requests require the exact public origin, `application/json`, an empty `website` honeypot, at least three seconds of completion time, a reasonably current start time, and bounded request sizes. `SUBMISSION_RATE_LIMITER` allows five attempts per 60 seconds using a SHA-256 of the request IP and user agent; neither source value is stored or logged.

Turnstile is explicitly rendered with action `wiki_contribution`. The Worker sends the token, externally configured secret, connecting IP when available, and an idempotency UUID to Siteverify. It requires success, hostname `darkelfmodding.com`, and the expected action. Tokens are single-use; the client resets the widget after every failed submission attempt.

Expected Worker secrets, already configured externally, are:

- `GITHUB_QUEUE_TOKEN`
- `TURNSTILE_SECRET_KEY`

Do not put values for these names in source, Wrangler configuration, tests, documentation, or logs.

## Private issue format and review

New mods receive `wiki-submission`, `pending`, and `new-page`. Existing edits receive `wiki-submission`, `pending`, and `edit`. New locations receive `wiki-submission`, `pending`, and `location-proposal`.

The readable issue body escapes contributor-controlled Markdown and includes contributor name, exact submission type, target or suggested filename, private notes, and a safely fenced generated-Markdown preview. The authoritative version-1 payload is UTF-8 JSON, SHA-256 digested, gzipped, base64url encoded, and split into hidden numbered comments. The importer requires exactly one manifest and rejects missing, duplicate, reordered, malformed, or corrupt chunks. Large human previews may be truncated; machine data is never truncated.

To approve a submission, a maintainer reviews the readable proposal and adds `approved`. Leave `pending` and the type label in place. Use `needs-information` or `rejected` according to the existing queue practice when the proposal cannot proceed. Do not copy contributor identity or notes into a public issue or pull request.

## Manual import

Run **Import wiki submission** in the main repository and enter the positive private issue number. The workflow uses these externally configured repository secrets:

- `WIKI_QUEUE_TOKEN` reads, comments on, and updates the private queue issue.
- `WIKI_IMPORT_TOKEN` checks out, pushes the generated branch, and creates the pull request so normal `pull_request` validation runs.

The importer requires `wiki-submission`, `pending`, and `approved`, and refuses `imported` or `rejected`. It revalidates schema and controlled values. Existing edits hash the exact current bytes and stop on a stale mismatch. Mod edits preserve unknown frontmatter, hidden tags, and current draft state. Location edits additionally preserve `map_id`, `icon`, `level`, `explorer_title`, draft state, and hidden per-entrance metadata selected by verified source index.

New mods are written only when the validated slug does not exist. Their reconstructed frontmatter has one category, `draft: false`, no tags, and no automatic article heading. New location proposals are always refused by automatic import because a maintainer must assign `map_id`, `icon`, `level`, and the final folder/path manually.

After all validation passes, the Action commits only the intended wiki file, pushes a unique `wiki-submission-<issue>-<run>-<attempt>` branch, and opens a public PR. Its title/body contain no contributor name, private notes, hidden payload, or private issue link. The private issue receives the PR URL, loses `pending`, and gains `imported`; `approved` and the type label remain.

## Controlled data updates

- Update categories through `wiki/content/_meta/ModWiki_properties.md` and the matching Pages CMS controlled list, then run normal wiki validation.
- Update event source records under `content/modathon/mods`, `content/modjam/mods`, or `content/madness/mods`. Event naming comes from `scripts/sync-wiki-event-metadata.mjs`; do not add a browser-only list.
- Update location articles and their controlled metadata through the existing wiki location workflow. The contribution asset uses `loadControlledVocabularies` and `canonicalMapLocations`; do not copy the vocabulary into client code.

`npm run build:site` regenerates `wiki/quartz/static/contribution-options.json` before Quartz builds. That transient build asset and `dist/` are intentionally ignored.

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

Worker tests mock both Siteverify and GitHub and make no live external requests.

## Troubleshooting

- **The form will not load:** confirm the contribution-options asset was generated and published under `/wiki/static/`, then check the browser network response.
- **An edit will not load:** confirm the encoded target is a permitted non-index `.md` path and exists on the public main branch. Invalid UTF-8, YAML, category shape, or controlled map values deliberately fail closed.
- **Turnstile keeps failing:** confirm the production hostname and `wiki_contribution` action, then retry with a newly reset token. Never log token or secret values.
- **Import reports a stale edit:** ask for a fresh submission based on the current page; do not bypass the byte hash.
- **Import reports a duplicate filename:** choose a different slug through a new reviewed proposal; the importer check is authoritative.
- **Payload reconstruction fails:** inspect chunk presence/order in the private queue only. Do not paste the hidden payload into public logs.
- **New location import is refused:** this is expected; assign the maintainer-only map and path properties manually, then use the normal content review process.

## Manual Worker deployment

The Worker normally needs to be deployed once, then redeployed only when its code or configuration changes. Deployment remains manual; there is no Cloudflare deployment workflow.

```sh
cd workers/wiki-submissions
npm ci
npx wrangler login
npx wrangler deploy
```

The expected secrets listed above are already managed externally. Do not recreate them as part of a normal deployment.
