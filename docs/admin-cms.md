# Decap CMS administrator guide

## What the CMS does

The Decap CMS page gives invited editors forms for the Modathon, Modjam,
Madness, and site-wide modder JSON data. Saving a form creates a commit on the repository's `main` branch through
Netlify Identity and Git Gateway. Modathon mods and central modders are stored
as one small source file per record. GitHub Pages validates those files and
generates the combined compatibility JSON used by the existing public site.
The public site still has no database.

Use the Netlify deployment for editing:

```text
https://<your-netlify-site>.netlify.app/admin/
```

The exact Netlify hostname is assigned when the repository is deployed. The
public site remains `https://darkelfmodding.com/`. Although the same `/admin/`
files are also visible on GitHub Pages, authentication is attached to the
Netlify deployment, so editors should bookmark the Netlify URL.

## Available collections

The CMS sidebar keeps the event/configuration collections separate from the
per-record archives. Mods, Madness teams, postcards, and central modders each
open one JSON record at a time.

| Top-level collection | Files available inside it |
| --- | --- |
| Madness | Events (`madness/data/madness-event.json`) |
| Madness Mods | Individual records under `content/madness/mods/` |
| Madness Teams | Individual records under `content/madness/teams/` |
| Modathon | Events (`modathon/assets/data/modathon-event.json`) and one Achievements file for each year from 2015 through 2026 |
| Modathon Mods | Individual records under `content/modathon/mods/` |
| Modders | Individual central profiles under `content/modders/` |
| ModJam | Judges (`modjam/data/judges.json`) and Events (`modjam/data/modjam-event.json`) |
| ModJam Mods | Individual records under `content/modjam/mods/` |
| ModJam Postcards | Individual records under `content/modjam/postcards/` |

Individual mod, Madness team, postcard, and modder records can be added, but
deletion remains disabled. Each Modathon and Madness record stores its editable
year in the JSON file instead of using a year subfolder. Each ModJam mod stores
the stable event ID that groups it into an event.

Record reordering is also disabled. Editors can still add and remove individual
names inside author, alias, and unlocker lists where that is part of correcting
a record.

### Start a new annual event

Open **Modathon → Events**, **Madness → Events**, or **ModJam → Events**, then
select **Add**. The year starts with the current year; choose another year when
needed. Every countdown starts with the days and UTC times used by the current
event and automatically follows the selected year. Madness also requires its
numeric season, while ModJam requires its named season.

The CMS creates the event names automatically. For ModJam it also creates the
stable event ID and public event label from the season and year. New Modathon
events start with the 2026 award categories and empty winning-mod lists. New
Madness events reuse the current registration Formspree ID. Review the
remaining event-specific fields, then publish the change.

Do not edit an older record to start a new event. The public page automatically
uses the event with the latest year; for multiple Modjams in one year, the
later record is current.

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

1. Open the applicable yearly collection, such as **2026 Mods**.
2. Select **New 2026 Mod**.
3. Enter the public mod name, every author name, website category, and mod page
   URL. Author values are stored as names, not stable IDs, so use the central
   Modders display name or an existing alias exactly.
4. Optionally add the mod's YouTube showcase URL directly on this record.
5. Select **Publish** and confirm.

The mod page URL is the closest thing these records have to a stable internal
identifier. Do not change it casually. Download totals, availability, the
Nexus category, status, and Nexus image are maintained by the daily Nexus
workflow even though the record form shows their stored values.

### Add a modder

1. Open **Modders**.
2. Select **New Modder**.
3. Enter a stable lowercase ID and the public display name. Add a Nexus
   profile URL, avatar URL/path, or aliases when available.
4. Select **Publish** and confirm.

The stable ID also becomes the JSON filename. Never change an existing ID in
Decap: the build requires the filename and ID to agree, and other event files
may reference it.

The central registry owns base profile information site-wide. Event rosters
are inferred from Modathon and Modjam authors and Madness team members. Those
fields and the judge selector all use this registry. If a display name changes,
keep the old spelling under **Previous names and aliases**.

### Add or edit an achievement

1. Open **Modathon** and choose the applicable Achievements year.
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

Open **Modathon → Events** and expand the applicable event. Add an award or
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

For a Modathon mod or central modder, Decap now serializes only that record's
source file. The admin-only `admin/cms.js` formatter preserves the original
property order, so a small edit produces a focused Git diff. The Pages workflow
then validates references and regenerates the public combined files without
committing them back to the repository.

## Data inventory and schema decisions

GitHub Pages deploys an Actions artifact built from `main`. The workflow runs
content validation, rebuilds the public compatibility JSON files, runs the site
tests, and then deploys the repository. The root `.nojekyll` and `CNAME` files
remain unchanged.

The public root page has one narrow authentication change: Identity callback
hashes for invitations, confirmations, recovery, and email changes are
forwarded to `/admin/`. Normal root visits and every public route behave as
before, and the Netlify Identity library is still loaded only by the admin
page.

The CMS-managed schemas are:

- `content/modathon/mods-metadata.json`: the preserved `generated` timestamp and `game`
  values used at the top level of the public compatibility document.
- Generated `modathon/assets/data/modathon-mods.json`:
  `{ generated: string, game: string, mods: object }`.
  `mods` has year keys `2015` through `2026`, each containing an ordered array.
- `<year>-achievements.json`: `{ schemaVersion: number, event: { name: string,
  year: number }, achievements: array }`. Each achievement has string `id`,
  `name`, and `requirement`; nullable string `rarity`; string `rarityKey` and
  `group`; string-array `unlockedBy`; and numeric `unlockedCount`. Optional
  fields are string `masteryName` and string `imageUrl`.
- `content/modathon/mods/*.json`: one Modathon submission per file. Each record
  has numeric `year` plus the public mod fields. Nexus statistics, availability,
  category, image, response status, and updater error are preserved as hidden,
  automation-managed values rather than editable CMS controls.
- `content/modjam/mods/*.json`: one ModJam submission per file with string
  `eventId`, stable entry `id`, results, author ID references, and media.
- `content/madness/mods/*.json`: one Madness submission per file with numeric
  `year`.
- `content/madness/teams/*.json`: one Madness team per file with numeric `year`,
  mod-name references, and central member IDs.
- `content/modjam/postcards/*.json`: one postcard per file.
- `content/modders/*.json`: one central record per file with
  string `id`, string `name`, optional `nexusProfileUrl` and `avatarUrl`, and
  optional string-array `aliases`.
- Generated `assets/data/modders.json`: `{ modders: array }`, assembled in
  display-name order for the existing public loaders.
- Generated `madness-teams.json` and `madness-mods.json`: `{ years: array }`; team
  members are `{ id }` references to the central registry. Team standings use
  `place`; the team mod list does not contain placement sentinel records.
- `judges.json`: `{ judges: [{ modderId }] }`. The displayed name is resolved
  from the central registry.
- `modjam-event.json`: `{ schemaVersion, eventType, events }` containing event
  metadata and optional current-event countdown settings without submissions.
- Generated `modjam-mods.json`: `{ generatedAt, summary, events: array }`; each event
  group has a stable `id` and a `mods` array. Mod authors are `{ id }`
  references.
- Generated `postcards.json`: `{ postcards: array }`.
- `modathon-event.json`: `{ schemaVersion, eventType, events }`. Each event has
  its name, year, UTC countdown, and an `awards` array; optional winner-history
  fields are string `note` and boolean
  `individualModCards`. Each award has string `award` and a `mods` array.
  Winning mods have string `name` and string-array `attribution`, plus optional string
  `archiveName`.
- `madness-event.json`: `{ schemaVersion, eventType, events }`. Events store
  year and season; the newest event also stores the live countdown and
  Formspree ID.

The public Modathon, Modjam, and Madness pages infer their rosters from mod
authors or team members and resolve them through `assets/data/modders.json`.
`titles.json` remains outside
the CMS because it is a complex calculation configuration.
The three event files are addable event lists. Public pages select the
latest event from the corresponding `*-event.json` file, and the publishing
importer adds or updates records in those same lists.

Compatibility consumers remain unchanged. `modathon/index.html`,
`modjam/app.js`, the Madness modder/team pages, and `admin/cms.js` fetch the
combined files in the browser. `map/tools/build_mock_mods.py`, the legacy
publishing importers, and public-data regression tests also read them. The
Nexus updater, category normalizer, avatar cache, and title report now read the
per-record sources; trusted publishing workflows rebuild or reconcile the
compatibility files around older importers.

Migrated record filenames begin with their event/year and original zero-padded
array position, so builds preserve historical order. New Decap entries sort
after the migrated records. Modders are generated in public display-name order. The
website also sorts its public mod and achievement search results.

Modathon authors remain plain string lists because historical values are stored
as display names or aliases rather than stable IDs; a Decap relation widget
would not reliably round-trip every alias. Validation resolves those names
against the central Modders records. Registry-backed dropdowns remain in use
for winner attributions and achievement unlockers. Madness and Modjam
references store stable central IDs.

## Generated and derived data

Several source files are also outputs of existing maintenance automation:

- The daily Nexus workflow enriches individual `content/modathon/mods/` records
  with statistics, availability, categories, and images, and refreshes Nexus
  pictures in the individual ModJam and Madness mod sources. These fields are
  deliberately hidden in Decap.
- The Google Sheets publishing importer can regenerate event data and the
  central registry for workbook-owned events. Its trusted workflow reconciles
  that legacy importer output back into the per-record source tree.
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

### Content commands

Run these from the repository root:

```text
npm run content:migrate
npm run content:validate
npm run content:build
npm run content:check
```

`content:migrate` is the idempotent one-time conversion from the combined
Modathon, ModJam, Madness, postcard, and modder JSON files. It refuses to
overwrite conflicting per-record files.
`content:validate` checks JSON syntax, schemas, types, unique IDs, filenames,
and author references, and proves the in-memory build is lossless.
`content:build` regenerates the public compatibility files.
`content:check` additionally confirms the checked-out compatibility files match
the sources, which is useful after a local build.

Edit the per-record files under `content/modathon/`, `content/modjam/`,
`content/madness/`, and `content/modders/`. Do not manually edit the combined
mod, team, postcard, or modder files used by the public pages; the content build
generates them. Metadata files under `content/modathon/` and `content/modjam/`
are maintained by automation.

## Netlify setup

These settings are intentionally not stored as repository credentials:

1. In Netlify, select **Add new project → Import an existing project**, connect
   the GitHub repository, and use `main` as the production branch.
2. Set the build command to `npm run content:build` and the publish directory
   to `.` (the repository root). Deploy the static site. Do not move
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
2. Confirm the yearly Mods collections and Modders collection show one entry
   per file, the three event files offer an **Add** control, and all twelve
   achievement years appear.
3. Open several yearly mod entries and confirm author, category, statistics,
   image, and showcase fields load without downloading the combined archive.
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

Modathon and modder saves now touch one record file. `modjam-mods.json` and
`madness-mods.json` remain nested documents and retain their smaller
whole-file concurrency consideration. Test a record edit on Netlify, inspect
the focused diff, and confirm the Pages build succeeds before inviting
additional editors.

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
- Add a folder collection and directory for each future Modathon year, along
  with its achievement file.
