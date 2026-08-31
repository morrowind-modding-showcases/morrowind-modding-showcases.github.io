---
title: "Skywind Concept Art Arena"
authors:
  - "RandomPal"
  - "Vegetto"
url: "https://www.nexusmods.com/morrowind/mods/53907"
categories:
  - "Towns and Cities"
map_enabled: true
map_locations:
  - "Vivec, Arena Pit"
  - "Vivec, Arena Waistworks"
map_exterior_edits:
  - cell: "4, -11"
    landscape: false
    references: 69
draft: false
events: []
picture_url: "https://staticdelivery.nexusmods.com/mods/100/images/53907/53907-1703958237-611791680.jpeg"
showcase_url: "https://youtu.be/EpBCDfM2Wok"
components:
  - id: "clutter-addon"
    name: "Clutter Addon"
    type: "optional"
    plugins:
      - "RPNR_Skywind_Style_Arena_Clutter_Addon.esp"
    relations: []
    map_locations: []
    map_exterior_edits:
      - cell: "4, -11"
        landscape: false
        references: 62
    notes: "Optional addon to add extra clutter to the Arena canton."
  - id: "fps-version"
    name: "FPS Version"
    type: "variant"
    plugins:
      - "RPNR_Skywind_Style_Arena_FPS_Version.ESP"
    relations: []
    map_locations:
      - "Vivec, Arena Pit"
      - "Vivec, Arena Waistworks"
    map_exterior_edits:
      - cell: "4, -11"
        landscape: false
        references: 41
    notes: "FPS-friendly alternative version."
---
> This mod aligns the Vivec Arena with the [concept art by RomanDubina](https://staticdelivery.nexusmods.com/mods/100/images/53907/53907-1703957910-561340150.jpeg), created for Skywind. The arena pit is now an exterior cell, covered by a semi-opened imposing tent serving as a dome.
> Additionally, an optional add-on is available, introducing banners atop the new open dome and creating cozy spots in the four corners of the arena pit.

## World Edits

Modifies the exterior and interior of the Vivec Arena Canton. Makes NO landscape edits.

## Other Notes

Will conflict with other open arena canton mods, but should be compatible with Beautiful Cities of Morrowind and most city overhauls that don't move or otherwise open up the arena canton.