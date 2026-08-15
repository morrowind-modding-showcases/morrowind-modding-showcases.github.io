---
title: "Hlaalu Seyda Neen"
authors:
  - "Pickles"
url: "https://www.nexusmods.com/morrowind/mods/58163"
categories:
  - "Towns and Cities"
map_enabled: true
map_locations:
  - "Seyda Neen, Arrille's Tradehouse"
  - "Seyda Neen, Census and Excise Office"
  - "Seyda Neen, Census and Excise Warehouse"
  - "Seyda Neen, Draren Thiralas' House"
  - "Seyda Neen, Eldafire's House"
  - "Seyda Neen, Fargoth's House"
  - "Seyda Neen, Lighthouse"
  - "Seyda Neen, Terurise Girvayne's House"
  - "Seyda Neen, Vodunius Nuccius' House"
draft: false
events: []
picture_url: "https://staticdelivery.nexusmods.com/mods/100/images/58163/58163-1770166247-2061438763.png"
map_exterior_edits:
  - cell: "-1, -10"
    landscape: false
    references: 0
  - cell: "-1, -9"
    landscape: true
    references: 1
  - cell: "-2, -9"
    landscape: true
    references: 366
  - cell: "-2, -10"
    landscape: true
    references: 63
components:
  - id: "lighthouse-only-version"
    name: "Lighthouse Only Version"
    type: "variant"
    plugins:
      - "HSN - Lighthouse Only.esp"
    relations: []
    map_locations:
      - "Seyda Neen, Lighthouse"
    map_exterior_edits:
      - cell: "-2, -9"
        landscape: true
        references: 0
      - cell: "-2, -10"
        landscape: true
        references: 63
    notes: "A lighthouse only version of Hlaalu Seyda Neen that adds only the new lighthouse overhaul and nothing else."
  - id: "hlaalu-lighthouse-patch-for-oaab-seyda-neen"
    name: "Hlaalu Lighthouse Patch for OAAB Seyda Neen"
    type: "patch"
    plugins:
      - "HSN - Lighthouse Only.esp"
    relations: []
    map_locations:
      - "Seyda Neen, Lighthouse"
    map_exterior_edits:
      - cell: "-3, -10"
        landscape: true
        references: 0
      - cell: "-3, -9"
        landscape: true
        references: 0
      - cell: "18, 4"
        landscape: false
        references: 0
      - cell: "17, 5"
        landscape: false
        references: 0
      - cell: "17, 4"
        landscape: false
        references: 0
      - cell: "-2, -9"
        landscape: true
        references: 0
      - cell: "-2, -10"
        landscape: true
        references: 61
      - cell: "18, 3"
        landscape: false
        references: 0
    notes: "A patch replacer for the Hlaalu Seyda Neen - Lighthouse Only Version that makes it compatible with OAAB Seyda Neen - Damp Little Squat."
---
This mod offers an alternative take on the starting town of Seyda Neen by replacing the Imperial and Nord building such as the Census and Excise, Lighthouse, Trade house and Civilian housing with Hlaalu styled architecture. In addition to that, no base game quests have been changed and an extra low level beginner quest has been added to the Census warehouse.

## World Edits:

Overhauls and replaces most of the interiors and exteriors in Seyda Neen, and additionally makes landscape edits to the cells (-1, -9), (-2, -9) and (-2, -10).

## Other Notes:

A lighthouse only version is available for improved compatibility. Additional patches include support for AFFresh, Tamriel Rebuilt's Firemoth plugin, Thirteen Telvanni, and Nine Holes.

A patch is available for [Bathhouses of Vvardenfell](https://www.nexusmods.com/morrowind/mods/59765).

A [lighthouse only patch](https://www.nexusmods.com/morrowind/mods/58567) for OAAB Seyda Neen - Damp Little Squat is likewise available for OAAB Seyda Neen users.

Full version will have compatibility conflicts with most other Seyda Neen mods.

Confirmed compatible with Graht Morrowind Swamp Trees.