# Pages CMS editor guide

## What Pages CMS does

Pages CMS provides forms for the hand-maintained Modathon, ModJam, Madness,
Resources, site-wide modder JSON sources, and wiki Markdown in this repository. It edits
those files directly in GitHub. The public site remains static and has no
content database.

The repository-root `.pages.yml` is the complete editor configuration. It:

- groups the content by event;
- supplies reference selectors for modders, teams, events, and postcards;
- constrains categories, dates, booleans, stable IDs, and other structured data;
- prevents record renaming and deletion;
- preserves automation-owned fields that are intentionally absent from forms;
- preserves unmanaged Obsidian and Quartz frontmatter through merge mode;
- stores uploaded images under `assets/images/uploads/`.

GitHub Actions validates source records, builds the combined compatibility JSON
used by the public pages, runs the site tests, and deploys valid changes.

## Access

Use the hosted editor at:

```text
https://app.pagescms.org/
```

Repository owners:

1. Sign in with GitHub.
2. Install the Pages CMS GitHub App for the account or organization that owns
   this repository.
3. Grant the app access to this repository.
4. Open the repository and select the branch to edit.

Editors with repository access can sign in with GitHub. Pages CMS also supports
email-invited collaborators who can edit content and media without a GitHub
account. Only a GitHub user with repository access can manage `.pages.yml` or
the collaborator list.

There is no CMS page hosted on `darkelfmodding.com`; bookmark the hosted editor.

## Publishing workflow

Pages CMS saves each change as a Git commit on the branch currently open in the
editor. It does not replace GitHub branch protection, pull requests, Actions,
or the deployment workflow.

For routine reviewed changes:

1. Open a content branch in Pages CMS.
2. Make and save the edit.
3. Open a pull request to `main`.
4. Wait for **Validate site** to pass.
5. Review the file diff and merge the pull request.

If an authorized maintainer edits `main` directly, the same validation and
deployment workflows run after the save. GitHub Pages normally reflects a
valid merged edit within a few minutes.

## Available content

| Group | Collections |
| --- | --- |
| Modders | Central profiles under `content/modders/` |
| Modathon | Mods, achievements, and events |
| Madness | Events, mods, and teams |
| ModJam | Mods, events, postcards, and judges |
| Resources | Resource categories and entries |
| Wiki | Mod articles and coordinate-owning location articles |

### Edit a wiki mod

Open **Wiki → Mods**. A new entry's initial title is slugified into its stable
Markdown filename; existing entries cannot be renamed in Pages CMS. Fill in the
article fields and leave **Draft** enabled until the page is ready. Turn on
**Show on TES3 Mod Map** only when at least one valid map location is selected.

The body editor writes Markdown and includes the Editor/Source switcher. Lists
such as authors, categories, tags, and map locations remain YAML lists. Valid
frontmatter that is not represented in the form is preserved when the entry is
saved.

### Add or edit a wiki location

Open **Wiki → Locations**. Each article owns one TES3 Mod Map marker: its
stable numeric ID, cell and region labels, worldspace coordinates, icon, zoom
level, and optional UESP title. Publishing the article adds the marker to the
generated map data. New display and cell names must also be added to the two
controlled mod-location lists documented in `wiki/README.md`.

Mods and achievements use year or event subfolders. Open the matching folder
before creating a record so its stored year or event ID agrees with its path.

All collections allow creation where the source model supports it. Renaming and
deletion are disabled because filenames and IDs are stable references. Remove a
bad new record with a reviewed Git revert rather than changing its identity.

## Editing rules

### Create an annual event

Open the event's **Events** collection and create a record:

- Modathon requires a four-digit year.
- Madness requires a year, numeric season, optional week themes, schedule, and
  registration form ID.
- ModJam requires a season, year, event-wide themes, schedule, images,
  competition type, and judge-award flag.

The build generates Modathon event names from the year. For ModJam it generates
the stable event ID, public label, and name from season and year. Do not add
those derived fields by hand.

Enter every event timestamp explicitly. Verify the saved JSON uses the intended
UTC instant and the `yyyy-MM-ddTHH:mm:ss.SSSZ` form. The public pages select the
latest applicable event, so never repurpose an older event record to start a
new one.

New Modathon events do not implicitly create achievements. Add each achievement
under **Modathon → Achievements** in the matching year folder.

Madness mod theme choices are maintained in `.pages.yml` because themes are
nested inside event records. When adding a new non-empty Madness theme list, a
configuration maintainer must add each stable theme ID and year-labelled choice
to the `madness_mods.themeId` options before editors assign it to mods.

### Add a Modathon mod

1. Open **Modathon → Mods** and the matching year folder.
2. Create a mod and enter the same year.
3. Enter the public name, mod URL, category, and each author.
4. Select each author from the central Modders collection. The form stores the
   public name because historical Modathon records use names and aliases.
5. Leave **Directly contributed** enabled unless the person is credited without
   directly working on that submission.
6. Optionally add a YouTube showcase URL and save. The field may be left blank.
   Pages CMS validates non-empty links before committing them. Timestamped
   `youtu.be` links may use either `?t=` or `&t=`.

The daily Nexus workflow owns download totals, availability, Nexus category,
picture, response status, and updater errors. These fields are omitted from the
form, and `.pages.yml` merge mode preserves them during normal edits.

### Add a modder

1. Open **Modders → Modders** and create a profile.
2. Enter a stable lowercase ID using letters, numbers, and single hyphens.
3. Enter the public name and optional Nexus profile URL, avatar URL/path, and
   historical aliases.
4. Save the record.

The stable ID becomes the filename and is referenced by ModJam, Madness, judges,
and other records. Never change an existing ID. If a display name changes, keep
the old spelling in **Historical aliases** so historical credits still resolve.

### Add or edit an achievement

1. Open **Modathon → Achievements** and the matching year folder.
2. Preserve the year and stable achievement ID for an existing record.
3. For a new achievement, use a unique lowercase, hyphen-separated ID.
4. Keep the public rarity, rarity key, and display group consistent.
5. Select unlockers from the central Modders reference field.
6. Save the record.

`unlockedCount` is derived from `unlockedBy` by the content build. Badge assets
normally live under `modathon/assets/images/achievements/<year>/`.

### Edit Modathon winner history

Open the applicable **Modathon → Events** record. Preserve award and winning-mod
order. Select every public attribution from the central registry.
`archiveName` is needed only when the public winning name differs from the name
in the submission archive.

### Edit Madness records

Madness mods store their year, normal site-wide category, optional team, and
optional stable theme ID. Team selectors show a year in their label; select a
team from the same year as the mod. Validation rejects cross-year teams and
themes.

Teams store mod names and central modder IDs. Team names are saved without a
leading `Team`; generated public data adds that prefix where required.

### Edit ModJam records

ModJam mods live under `content/modjam/mods/<event-id>/`. Select the event,
authors, and site-wide category. Nexus URLs generate stable numeric entry IDs
during the content build.

Postcards reference a ModJam entry ID and an image filename. Use
`node scripts/sync-modjam-postcards.mjs` after changing postcard WebP files;
then fill any new postcard's required entry reference in Pages CMS.

### Edit Resources

Open **Resources → Resource directory**. Resource categories contain editable
entry lists. Each entry has a display name, a complete HTTP(S) URL, an optional
description, and optional related links. Add or remove entries directly from
the list, or edit an existing entry without changing any filename or stable ID.

The page is generated from `content/resources/resources.json` by
`npm run content:build` or `npm run resources:build`; do not edit the generated
`resources/index.html` table by hand. The normal deployment build regenerates
the page before copying it into `dist/`.

## Media

The Pages CMS media library stores uploads in:

```text
assets/images/uploads/
```

It writes root-relative public paths beginning with:

```text
/assets/images/uploads/
```

Uploads are restricted to images and filenames are safely normalized. Fields
labelled **URL or path** remain string fields because existing content mixes
external HTTP(S) images with repository paths outside the upload folder. Upload
the file through **Media**, then paste its public path into the relevant field.

Event-specific optimized WebP assets should continue to live in their existing
event asset folders and be added through the normal repository workflow.

## Source and generated data

Edit the per-record sources, not their generated public counterparts:

| Editable source | Generated public data |
| --- | --- |
| `content/modders/*.json` | `assets/data/modders.json` |
| `content/modathon/mods/<year>/*.json` | `modathon/assets/data/modathon-mods.json` |
| `content/modathon/achievements/<year>/*.json` | `modathon/assets/data/<year>-achievements.json` |
| `content/modathon/events/*.json` | `modathon/assets/data/modathon-event.json` |
| `content/madness/events/*.json` | `madness/data/madness-event.json` |
| `content/madness/mods/<year>/*.json` | `madness/data/madness-mods.json` |
| `content/madness/teams/*.json` | `madness/data/madness-teams.json` |
| `content/modjam/events/*.json` | `modjam/data/modjam-event.json` |
| `content/modjam/mods/<event-id>/*.json` | `modjam/data/modjam-mods.json` |
| `content/modjam/postcards/*.json` | `modjam/data/postcards.json` |
| `content/resources/resources.json` | `resources/index.html` |
| `wiki/content/mods/*.md` | `dist/map/data/mods.json` |
| `wiki/content/locations/*.md` | `dist/map/data/locations.json` |

`modjam/data/judges.json` is an intentionally editable structured file.
`modathon/assets/data/titles.json` remains outside Pages CMS because it is a
calculation configuration maintained through the repository.

Several fields are also maintained by automation:

- the daily Nexus workflow updates statistics, availability, categories,
  pictures, and wiki short descriptions in individual mod sources;
- the content build derives event names and IDs, achievement unlock counts,
  compatibility summaries, and generated timestamps.

## Local validation

Run these commands from the repository root:

```text
npm run content:validate
npm run content:build
npm run content:check
npm run validate:wiki
npm test
npm run build:site
```

`content:validate` checks syntax, schemas, types, unique IDs, filenames, and
references. `content:build` regenerates the public compatibility files.
`content:check` confirms those generated files match the editable sources.
`validate:wiki` checks mod and location frontmatter and compares the Obsidian,
Pages CMS, and location-article vocabularies. `build:site` stages the complete
GitHub Pages artifact, generates both map datasets, and builds the wiki.

Local editing does not require a CMS server. Edit `.pages.yml` or the source
JSON directly on a Git branch, run the checks, and inspect `git diff`.

## Reverting a bad edit

1. Open the repository's commit history.
2. Find the Pages CMS commit and inspect its diff.
3. Revert the commit on a branch with `git revert <commit-sha>`.
4. Open or merge the normal review pull request.
5. Wait for validation and deployment.

Do not force-push or erase history. Reverting the entire commit is safest when
it changed both JSON and uploaded media.

## Troubleshooting

### The repository is missing

- Confirm the Pages CMS GitHub App is installed for the correct account or
  organization.
- Confirm the installation has access to this repository.
- Confirm a collaborator invitation used the same email address as the editor's
  Pages CMS sign-in.

### Saving fails

- Copy unsaved text somewhere safe before refreshing.
- Refresh the editor; another editor or an automation workflow may have changed
  the same file.
- Confirm the selected branch still exists and the editor can write to it.
- Check whether branch protection requires the edit to be made on a content
  branch and merged through a pull request.

### Validation fails

- Open the failed **Validate site** run for the exact file and field.
- A failure remains attached to every later commit until the invalid source is
  corrected because each deployment validates the complete archive.
- Use complete HTTP(S) URLs where a URL is required.
- Showcase links must be HTTPS YouTube watch or `youtu.be` URLs with an
  11-character video ID.
- Select modders, teams, events, and postcards from reference fields.
- Keep years and event IDs consistent with parent folders.
- Use lowercase, hyphen-separated stable IDs.
- Select wiki map locations from the controlled field; a spelling mismatch
  stops publication before it can break the live map.
- Revert an invalid save before layering more edits on top of it.
