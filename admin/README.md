# Decap admin presentation

The admin UI uses Decap CMS `3.12.2`, pinned in `admin/index.html`. Its visual
layer is intentionally separate from the public website:

- `style.css` themes Decap's own login, navigation, collection, form, panel,
  button, and status UI.
- `preview.css` is loaded into Decap's isolated preview frame with
  `CMS.registerPreviewStyle`.
- `cms.js` registers document-aware preview templates for the real top-level
  collections: `madness`, `modathon`, `modders`, and `modjam`.

The templates account for the repository's file-collection shape. Mod and
modder records are nested inside large JSON documents, so previews provide
year/event filters, text search, array-aware author labels, missing-image
fallbacks, and a 60-card rendering cap. The cap affects only the preview and
does not hide or change any editor controls or stored content.

## Branding and shared design references

The admin header reuses `assets/images/logo.webp`; the browser icon reuses
`assets/images/icon.png`; and the login backdrop reuses
`assets/images/mms.webp`. Typography and core colors come from the root page:
Cinzel, EB Garamond, `#0d0b08`, `#e8dfc8`, `#d9bc7a`, and `#f0dca4`.
Preview variants also borrow the public Modathon, ModJam, and Madness card
palettes from their section stylesheets.

## Selectors to review after a Decap upgrade

Decap creates Emotion class names whose hashes are not stable. `style.css`
does not target those hashes. It uses component-name substrings, always scoped
under `#nc-root`, for cosmetic overrides only. No matched element is hidden or
disabled.

The following selector families are the maintenance-sensitive ones:

- `[class*="AppHeader"]`, `[class*="Sidebar"]`, and `[class*="Drawer"]`
- `[class*="CollectionTop"]`, `[class*="CollectionHeader"]`, and
  `[class*="EntriesContainer"]`
- `[class*="EditorControlPane"]`, `[class*="ControlPaneContainer"]`,
  `[class*="PreviewPane"]`, and `[class*="EditorToolbar"]`
- `[class*="Card"]`, `[class*="Panel"]`, `[class*="Pane"]`, and
  `[class*="ListCard"]`
- `[class*="FieldLabel"]`, `[class*="FieldDescription"]`,
  `[class*="FieldHint"]`, and `[class*="ObjectWidget"]`
- `[class*="Button"]`, `[class*="PublishButton"]`, and
  `[class*="ToolbarButton"]`
- `[class*="Notification"]`, `[class*="Status"]`,
  `[class*="Authentication"]`, `[class*="Login"]`, and
  `[class*="AuthPage"]`

When changing the pinned Decap version, inspect the rendered class suffixes on
the login page, collection list, nested list editor, preview pane, publish
menu, and notification toast. Update only suffixes that have actually changed,
then repeat desktop and mobile keyboard testing. Semantic selectors for native
inputs, buttons, `role="alert"`, `role="status"`, and `aria-live` regions should
remain stable.

## Manual production checks

Local preview testing cannot fully exercise Netlify Identity or Git Gateway.
After deployment, verify invitation acceptance, login/logout, password
recovery, collection loading, a reversible previewed edit, publishing status
messages, image upload, and the resulting Git commit diff. Test at approximately
1440, 1024, 760, 390, and 320 CSS pixels, including keyboard-only navigation
and browser zoom at 200%.
