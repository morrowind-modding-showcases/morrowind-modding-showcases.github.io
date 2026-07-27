# Decap admin styling

The CMS intentionally keeps Decap's native layout, typography, component
colors, form sizing, and responsive behavior.

`admin/style.css` adds only:

- a thin Dark Elf Modding gold accent on the Decap header;
- an inset accent on the currently selected collection;
- clearer keyboard focus outlines;
- focus and status-message accent colors; and
- reduced-motion and forced-colors support.

All JSON collections retain `editor.preview: false`. Modathon, ModJam, and
Madness mods, Madness teams, ModJam postcards, and Modders now open one source
file per entry. Madness events and Modathon achievements also open one source
file per event or achievement. All event and achievement documents avoid
Decap's large raw-text preview pane.

`admin/cms.js` groups the per-record collections in the content navigation.
Madness exposes Events, Mods, and Teams; Modathon exposes Mods and a creatable
Achievements collection grouped by year alongside Events; and ModJam exposes
Mods and Postcards alongside Judges and Events. The child collections remain independent Decap folder
collections so each entry is still saved to its own source file.
The single `display: none` rule in `admin/style.css` hides those child
collections only after the script has added their parent-page links.

## Upgrade maintenance

The only Decap-generated class fragments targeted by the active stylesheet are
`AppHeader`, `Sidebar`, and `Drawer`. They are cosmetic selectors: if a future
Decap release renames them, the accents disappear but CMS controls and layout
continue to work.

When updating Decap, verify the login button, grouped collection navigation,
nested list fields, media library, publish controls, and keyboard focus states.
In particular, confirm that each event landing page still shows its added
folder-collection cards. Apart from the targeted child-collection hiding rule,
no admin stylesheet rule should set Decap component widths, heights,
positioning, display, padding, margins, fonts, or backgrounds.
