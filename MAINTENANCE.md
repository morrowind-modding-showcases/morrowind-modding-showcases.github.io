# Site Maintenance

This is the owner's guide for keeping the event sites current. Pages CMS is the
editor for hand-maintained content, while GitHub Actions validates, builds, and
deploys the static site.

## Owner workflow

1. Open the repository in [Pages CMS](https://app.pagescms.org/).
2. Select or create a content branch.
3. Edit the applicable record and save it.
4. Open a pull request to `main`.
5. Wait for **Validate site**, review the diff, and merge the pull request.
6. Confirm that **Deploy GitHub Pages** succeeds on `main`.

See `docs/pages-cms.md` for editor access, field-level instructions, media
handling, and troubleshooting. Repository maintainers can also edit the source
JSON directly and use the same pull-request workflow.

## Source and generated data

Pages CMS edits one-file-per-record sources under `content/`:

- `content/modders/` contains site-wide profiles and stable person IDs.
- `content/modathon/events/`, `content/modathon/mods/`, and
  `content/modathon/achievements/` contain Modathon records.
- `content/modjam/events/`, `content/modjam/mods/`, and
  `content/modjam/postcards/` contain ModJam records.
- `content/madness/events/`, `content/madness/mods/`, and
  `content/madness/teams/` contain Madness records.

The public pages consume combined JSON generated from those sources. Do not
edit generated compatibility files when an equivalent source record exists.
The complete source-to-output mapping is documented in `docs/pages-cms.md`.

## Validation and deployment

`.github/workflows/validate-site.yml` builds and tests every pull request and
every non-`main` branch push. Repository settings should require its
**Validate site** check before changes can merge into `main`.

`.github/workflows/deploy-pages.yml` repeats the build and tests on `main`, then
deploys the repository through GitHub Pages. Both workflows run:

```text
npm run content:build
npm run content:check
npm test
```

Run those commands locally before proposing structural or bulk content changes.
Use `npm run content:validate` for a source-only validation pass while editing.

## Automated Nexus metadata

`.github/workflows/nexus-stats.yml` refreshes Nexus pictures, availability,
categories, and download statistics daily. It updates individual mod sources,
rebuilds the public data, and runs the full checks before committing.

This job enriches mods already present in the event datasets. Add submissions
through Pages CMS first. Keep the `NEXUS_API_KEY` Actions secret current and
review failed workflow notifications.

## Supporting asset procedures

### Achievement badges

Badge files live under `modathon/assets/images/achievements/<year>/`. After
adding or renaming badges, run:

```text
node scripts/normalize-achievement-images.mjs
npm run content:build
```

### Modder avatars

After changing avatar URLs in `content/modders/`, run
`node scripts/cache-modder-avatars.mjs`. It refreshes the same-origin image
cache and `assets/data/modder-avatars.json`.

### ModJam postcards

Keep matching WebP filenames in `modjam/assets/postcards/thumbnail/` and
`modjam/assets/postcards/full/`. After adding or removing images, run
`node scripts/sync-modjam-postcards.mjs`, assign any missing `entryId` values in
Pages CMS, and rebuild the content.

### TES3 Mod Map

The map is a separate collection because it is not an annual-event dataset.
Follow `map/README.md` for its source update procedure. Event pages create map
links automatically when a Nexus ID occurs in both datasets.

## Annual operating checklist

### Before an event

- Create the new event in the matching **Events** collection.
- Enter every schedule value, season number, theme, banner, result link, and
  registration field required for that event type.
- Add achievements for a new Modathon year; creating the event does not create
  them automatically.
- Update the Madness `themeId` choices in `.pages.yml` when a new event defines
  themes.
- Validate the branch and preview the public pages before merging.

### During an event

- Add submissions, participants, teams, achievements, and results through the
  applicable Pages CMS collections.
- Reuse stable modder IDs and select referenced records from the CMS fields.
- Treat missing media, unresolved references, duplicate IDs, invalid dates,
  and failed checks as blocking issues.
- Verify a sample of generated pages after meaningful updates.

### After an event

- Enter final placements, awards, achievement unlockers, teams, and result
  links.
- Review the complete diff and generated counts before merging the final update.
- Verify participant profiles and a sample of entries after deployment.

### Once a year

- Confirm the Pages CMS GitHub App and editor access still work.
- Confirm scheduled GitHub workflows are enabled.
- Review failed-action notifications and dependency alerts.
- Test the next event setup before its announcement date.
- Confirm another trusted owner can access the repository, domain, Formspree
  account, Pages CMS configuration, and Nexus API credential.

## Publishing safeguards

- Never rename or reuse stable record IDs. Keep old display names as aliases.
- Do not remove historical event records without an explicit reviewed
  correction.
- Use pull requests for source-data updates and require **Validate site**.
- Keep editable source JSON and optimized images committed to the repository.
- Revert a bad Pages CMS commit instead of force-pushing or erasing history.
- Allow the Nexus workflow to own its derived fields; Pages CMS intentionally
  omits them from normal forms.
