# Decap CMS administrator guide

## What the CMS does

The Decap CMS page gives invited editors forms for the Modathon, Modjam,
Madness, and site-wide modder JSON data. Saving a form creates a commit on the repository's `main` branch through
Netlify Identity and Git Gateway. GitHub Pages then publishes the same static
files it publishes today; the public site has no database and no new build
step.

Use the Netlify deployment for editing:

```text
https://<your-netlify-site>.netlify.app/admin/
```

The exact Netlify hostname is assigned when the repository is deployed. The
public site remains `https://darkelfmodding.com/`. Although the same `/admin/`
files are also visible on GitHub Pages, authentication is attached to the
Netlify deployment, so editors should bookmark the Netlify URL.

## Available collections

| CMS collection | Repository file or files | Add records | Delete records |
| --- | --- | --- | --- |
| Madness Mods | `madness/data/madness-mods.json` | Yes | No |
| Madness Teams | `madness/data/madness-teams.json` | Yes | No |
| Modathon Achievements | `modathon/assets/data/2015-achievements.json` through `2026-achievements.json` | Yes | No |
| Modathon Mods | `modathon/assets/data/modathon-mods.json` | Yes | No |
| Modathon Winner History | `modathon/assets/data/winners.json` | Yes | No |
| Modders | `assets/data/modders.json` | Yes | No |
| Modjam Judges | `modjam/data/judges.json` | Yes | No |
| Modjam Mods | `modjam/data/modjam-mods.json` | Yes, inside an existing event | No |
| Modjam Postcards | `modjam/data/postcards.json` | Yes | No |
| Modjams | `modjam/data/modjams.json` | Yes, for event metadata | No |

Record reordering is also disabled. Editors can still add and remove individual
names inside author, alias, and unlocker lists where that is part of correcting
a record.

Image uploads are enabled. Every image field displays its stored URL or path
once in a text input, with the preview below it. Uploaded files are committed under
`assets/images/uploads/`, and CMS image fields store URLs beginning with
`/assets/images/uploads/`. This repository is an organization Pages root site
with a root custom domain, so those URLs resolve on both GitHub Pages and a
root Netlify deployment. Do not configure the Netlify site to publish this
repository below a URL subpath.

## Signing in

1. Accept the invitation sent by the Netlify project owner.
2. Follow the invitation link. A small token-only redirect sends Netlify's
   default root callback to the deployment's `/admin/` page.
3. Set a password or complete the configured external-provider sign-in.
4. Return to `https://<your-netlify-site>.netlify.app/admin/` for later edits.

Registration must remain **Invite only** in Netlify. Knowing the `/admin/` URL
does not grant repository access.

## Adding and editing content

### Add a Modathon mod

1. Open **Modathon Mods**, then **Modathon mods**.
2. Select **Add Mod**.
3. Choose the year and each author from the central registry, then enter the
   public mod name, website category, and mod page URL.
4. Optionally add the mod's YouTube showcase URL directly on this record.
5. Select **Publish** and confirm.

The mod page URL is the closest thing these records have to a stable internal
identifier. Do not change it casually. Download totals, availability, the
Nexus category, and the Nexus image are hidden because the daily Nexus workflow
owns those fields.

### Add a modder

1. Open **Modders**, then **Central modder registry**.
2. Select **Add Modder**.
3. Enter a stable lowercase ID and the public display name. Add a Nexus
   profile URL, avatar URL/path, or aliases when available.
4. Select **Publish** and confirm.

The central registry owns base profile information site-wide. Event rosters
are inferred from Modathon and Modjam authors and Madness team members. Those
fields and the judge selector all use this registry. If a display name changes,
keep the old spelling under **Previous names and aliases**.

### Add or edit an achievement

1. Open **Modathon Achievements** and choose the year.
2. Select **Add Achievement**, or expand an existing achievement.
3. Preserve an existing **Internal achievement ID**. For a new achievement,
   use a unique lowercase, hyphen-separated ID compatible with the badge
   filename.
4. Keep **Public rarity label**, **Rarity key**, and **Display group**
   consistent.
5. Select each unlocker from the central **Modders** dropdown. The stored
   unlock count is hidden and recalculated from the number of unlockers when
   the file is saved.
6. Select **Publish** and confirm.

### Edit winner history

Open **Modathon Winner History**, then **Winner history**. Add a year, award, or
winning mod without changing the existing order. Select the winning mod from
the dropdown for that year and select each public attribution from the central
registry. `archiveName` is needed only
when the public winning-mod name differs from the name in the submission
archive.

## Publishing and delay

The CMS uses direct publishing. Each save commits immediately to `main`; it
does not create an editorial branch or a pull request. Netlify will redeploy
its copy, and the existing GitHub Pages deployment will also run. GitHub Pages
usually reflects a valid edit within a few minutes, but deployment queues can
take longer. Check the repository's Actions page when a change has not appeared.

Decap serializes the entire containing JSON file when one nested item changes.
The admin-only `admin/cms.js` formatter preserves the original property order
of existing records so a small edit produces a focused Git diff; it also gives
new records the repository's normal property order. This safeguard depends on
the record deletion and reordering controls remaining disabled. Always review
the commit diff after the first production save in each collection, especially
for `modathon-mods.json`, which contains every Modathon submission.

## Data inventory and schema decisions

The site directly serves repository files and has no build step. GitHub Pages
is configured to publish the `main` branch from `/ (root)`. The root
`.nojekyll` and `CNAME` files remain unchanged.

The public root page has one narrow authentication change: Identity callback
hashes for invitations, confirmations, recovery, and email changes are
forwarded to `/admin/`. Normal root visits and every public route behave as
before, and the Netlify Identity library is still loaded only by the admin
page.

The CMS-managed schemas are:

- `modathon-mods.json`: `{ generated: string, game: string, mods: object }`.
  `mods` has year keys `2015` through `2026`, each containing an ordered array.
  Every submission has string `name`, string-array `authors`, string
  `category`, and HTTP(S) string `url`. Optional workflow-owned fields are
  numeric `downloads`, `uniqueDownloads`, and `endorsements`; boolean
  `available`; string `nexusCategory` and `pictureUrl`; and numeric `status`.
  Optional editor-owned `showcaseUrl` stores the mod's YouTube showcase. The
  CMS presents this year-grouped storage as one mod list with a year selector.
- `<year>-achievements.json`: `{ schemaVersion: number, event: { name: string,
  year: number }, achievements: array }`. Each achievement has string `id`,
  `name`, and `requirement`; nullable string `rarity`; string `rarityKey` and
  `group`; string-array `unlockedBy`; and numeric `unlockedCount`. Optional
  fields are string `masteryName` and string `imageUrl`.
- `assets/data/modders.json`: `{ modders: array }`. Each central record has
  string `id`, string `name`, optional `nexusProfileUrl` and `avatarUrl`, and
  optional string-array `aliases`.
- `madness-teams.json` and `madness-mods.json`: `{ years: array }`; team
  members are `{ id }` references to the central registry. Team standings use
  `place`; the team mod list does not contain placement sentinel records.
- `judges.json`: `{ judges: [{ modderId }] }`. The displayed name is resolved
  from the central registry.
- `modjams.json`: `{ events: array }` containing event metadata without
  submissions.
- `modjam-mods.json`: `{ generatedAt, summary, events: array }`; each event
  group has a stable `id` and a `mods` array. Mod authors are `{ id }`
  references.
- `postcards.json`: `{ postcards: array }`.
- `winners.json`: `{ years: array }`. Each year has numeric `year` and an
  `awards` array; optional fields are string `note` and boolean
  `individualModCards`. Each award has string `award` and a `mods` array.
  Winning mods have string `name` and string-array `attribution`, plus optional string
  `archiveName`.

The public Modathon, Modjam, and Madness pages infer their rosters from mod
authors or team members and resolve them through `assets/data/modders.json`.
`titles.json` remains outside
the CMS because it is a complex calculation configuration.
`assets/event-config.js` is generated executable JavaScript and is deliberately
not editable through the CMS.

The website sorts the public mod and achievement search results, but the CMS
still prevents accidental array reordering. Winner-year order has semantic
importance because the last year becomes the default winner view.

Registry-backed dropdowns use the central Modders names for Modathon authors,
winner attributions, and achievement unlockers. Madness and Modjam references
store stable central IDs. Archive-backed dropdowns provide winner, Madness
team-mod, and Modjam postcard selections.

## Generated and derived data

Several CMS-managed files are also outputs of existing maintenance automation:

- The daily Nexus workflow enriches `modathon-mods.json` with statistics,
  availability, categories, and images, and refreshes Nexus pictures in
  `modjam-mods.json` and `madness-mods.json`.
- The Google Sheets publishing importer can regenerate event data and the
  central registry for workbook-owned events. Event membership remains
  implicit in authors and team members.
- Achievement importers and the CMS serializer calculate `unlockedCount` from
  `unlockedBy`.
- The `generated` snapshot timestamp is derived.

The CMS preserves those fields, but a later importer run may overwrite a direct
CMS correction if the upstream publishing workbook still contains the old
value. Make the matching correction in the publishing workbook as well, or
formally choose one system as the long-term source of truth.

## Reverting a bad edit

1. Open the GitHub repository's **Commits** history.
2. Find the CMS commit, normally named `Update <collection>: <entry>`, and
   inspect its file diff.
3. Ask a repository maintainer to create a normal revert commit for that SHA
   (for example, `git revert <commit-sha>`) and push it to `main`.
4. Do not force-push or erase history. Wait for GitHub Pages to deploy the
   revert.

For a single-file correction, a maintainer can instead open the file's GitHub
**History**, copy the last good version into the current file editor, and
commit that restoration. Reverting the entire CMS commit is safer when it
changed both JSON and uploaded media.

## Local development

Local editing is optional and is not needed by normal editors. The committed
configuration enables Decap's local backend when a proxy is present.

From the repository root, run these in separate terminals:

```text
npx decap-server
node scripts/serve-gh-pages.mjs 8123
```

Then visit `http://localhost:8123/admin/`. Keep the Decap proxy on localhost;
do not expose it to a network or the public internet. Local saves write to the
working tree, so use a temporary Git branch and inspect `git diff` afterward.

## Netlify setup

These settings are intentionally not stored as repository credentials:

1. In Netlify, select **Add new project → Import an existing project**, connect
   the GitHub repository, and use `main` as the production branch.
2. Leave the build command empty and set the publish directory to `.` (the
   repository root). Deploy the static site. Do not move
   `darkelfmodding.com` away from GitHub Pages.
3. In **Project configuration → Identity**, enable Netlify Identity.
4. Set **Registration preferences** to **Invite only**. Do not enable public
   registration.
5. In **Project configuration → Identity → Services → Git Gateway**, enable
   Git Gateway and confirm it is connected to this repository. If roles are
   configured, assign the same CMS role to every invited editor.
6. In **Identity → Users**, invite the first editor.
7. Visit `https://<your-netlify-site>.netlify.app/admin/`, sign in, and complete
   the manual tests below.

The checked-in root page forwards Netlify's default Identity callback hashes
to `/admin/`, so custom email templates are not required. If your Netlify plan
supports custom Identity email templates, you may instead point their
invitation, confirmation, recovery, and email-change links directly to
`{{ .SiteURL }}/admin/#...`.

Netlify currently marks Git Gateway as deprecated: it still works, but new
features and non-security bug fixes are not planned. This implementation uses
it because it is the requested backend. Confirm Netlify still permits enabling
it for the new deployment before inviting editors, and plan an authentication
backend review as a second phase.

## Manual tests before inviting editors

The following require the deployed Netlify site and cannot be completed from
the repository alone:

1. Confirm an invited user can accept the invite at `/admin/`, sign in, sign
   out, recover a password, and cannot self-register without an invitation.
2. Confirm all ten alphabetized collections load and all twelve achievement years appear.
3. Confirm the large Modathon Mods list remains responsive and its year,
   author, and showcase fields load correctly.
4. Make one harmless, reversible text correction. Before publishing, note the
   containing file. After publishing, inspect the GitHub commit and verify that
   no records, optional fields, nulls, or numeric/boolean types changed.
5. Revert that test commit and confirm the revert reaches GitHub Pages.
6. Add a temporary test record, verify the add control works and record
   deletion is unavailable, then have a maintainer remove it through a reviewed
   Git revert.
7. Upload a small test image. Confirm its saved value begins with
   `/assets/images/uploads/` and the file loads on both the Netlify deployment
   and `https://darkelfmodding.com/`.
8. Confirm a Modathon edit still leaves the public home, mods, modders,
   achievements, winner, and deep-link routes working.
9. Confirm GitHub's **Validate site** workflow passes after a CMS commit.
10. After the next daily Nexus refresh, confirm the test business-field
    correction remains and only derived Nexus fields changed.

The most potentially destructive behavior is a save to the large
`modathon-mods.json` document: Decap rewrites the containing JSON document, and
a concurrent daily updater can also touch it. `modjam-mods.json` and
`madness-mods.json` have the same concurrency consideration at a smaller scale.
The custom serializer was added after a local save test exposed a 26,000-line
property-order-only diff, and the repository test suite now guards against that
regression. Test the collection first on Netlify with a small reversible
change, inspect the full diff, and do not invite additional editors until the
result is clean.

## Troubleshooting

### Authentication does not open or an invitation returns to the home page

- Confirm the editor is using the Netlify hostname, not
  `darkelfmodding.com/admin/`.
- Confirm Identity and Git Gateway are enabled on the same Netlify project.
- Confirm registration is Invite only and the email address has been invited.
- Confirm the deployed root page still forwards its Identity token to
  `/admin/#`. If using custom Identity emails, confirm their links contain
  `/admin/#`.
- Try a private browser window to rule out an expired Identity session.

### Saving fails

- Refresh the CMS before retrying; the daily Nexus workflow or another editor
  may have changed the same file.
- Confirm Git Gateway still points to this GitHub repository and has access to
  `main`.
- Check Netlify's Identity user and role settings.
- Copy unsaved text somewhere safe before refreshing.

### The data is rejected or the public page breaks

- Use complete HTTP(S) URLs.
- Select modder references and achievement unlockers from the central Modders list.
- Check that achievement IDs are lowercase and hyphen-separated.
- Inspect the failed **Validate site** run for the exact record and field, then
  revert the bad CMS commit before making another change.

## Recommended second phase

- Decide whether Decap or the Google Sheets publishing workbook is authoritative
  for each event to prevent later imports from undoing CMS edits.
- Reassess Git Gateway because Netlify has deprecated it.
- Consider a controlled one-file-per-record migration only if real editor
  testing shows the 1,941-record submission snapshot is too slow or produces
  unsafe whole-file diffs. Such a migration would require compatibility output
  during deployment and should not be done casually.
- Add a future year to the Modathon year selector and create its achievement
  file as part of each annual setup; Decap cannot add a new file from these
  file collections.
