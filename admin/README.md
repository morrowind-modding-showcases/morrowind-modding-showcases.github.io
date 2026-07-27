# Decap admin styling

The CMS intentionally keeps Decap's native layout, typography, component
colors, form sizing, and responsive behavior.

`admin/style.css` adds only:

- a thin Dark Elf Modding gold accent on the Decap header;
- an inset accent on the currently selected collection;
- clearer keyboard focus outlines;
- focus and status-message accent colors; and
- reduced-motion and forced-colors support.

All JSON collections retain `editor.preview: false`. The Modathon yearly mods
and Modders collections now open one source file per entry; the remaining
nested documents still avoid Decap's large raw-text preview pane.

## Upgrade maintenance

The only Decap-generated class fragments targeted by the active stylesheet are
`AppHeader`, `Sidebar`, and `Drawer`. They are cosmetic selectors: if a future
Decap release renames them, the accents disappear but CMS controls and layout
continue to work.

When updating Decap, verify the login button, collection navigation, nested
list fields, media library, publish controls, and keyboard focus states. No
admin stylesheet rule should set Decap component widths, heights, positioning,
display, padding, margins, fonts, or backgrounds.
