---
title: "Smith - The Weapon Crafting Framework"
authors:
  - "Safebox"
url: "https://www.nexusmods.com/morrowind/mods/56443"
categories:
  - "Gameplay, Patch, or UI"
map_enabled: true
map_locations:
  - "Ald Velothi, Outpost"
  - "Ald-ruhn, Guild of Fighters"
  - "Ald-ruhn, Guild of Mages"
  - "Buckmoth Legion Fort, Interior"
  - "Ebonheart, Hawkmoth Legion Garrison"
  - "Hla Oad, Fatleg's Drop Off"
  - "Kunirai"
  - "Maar Gan, Outpost"
  - "Milk"
  - "Tel Branora, Galen Berer: Armorer"
map_exterior_edits:
  - cell: "-2, 7"
    landscape: false
    references: 1
  - cell: "-2, 2"
    landscape: false
    references: 1
  - cell: "18, 4"
    landscape: false
    references: 2
  - cell: "17, 4"
    landscape: false
    references: 0
  - cell: "-20, 25"
    landscape: false
    references: 1
  - cell: "6, -7"
    landscape: false
    references: 1
  - cell: "-19, 23"
    landscape: false
    references: 1
  - cell: "18, 3"
    landscape: false
    references: 1
draft: false
events: []
picture_url: "https://staticdelivery.nexusmods.com/mods/100/images/56443/56443-1775605732-987092107.png"
components:
  - id: "tomb-of-the-snow-prince"
    name: "Tomb of the Snow Prince"
    type: "patch"
    plugins:
      - "sb_smith_totsp.ESP"
    relations: []
    map_locations: []
    map_exterior_edits:
      - cell: "-15, 23"
        landscape: false
        references: 0
      - cell: "-20, 25"
        landscape: false
        references: 0
      - cell: "-13, 31"
        landscape: false
        references: 1
      - cell: "-19, 23"
        landscape: false
        references: 0
      - cell: "-12, 29"
        landscape: false
        references: 1
    notes: ""
---
A framework for splitting and forging new weapons.
- Original weapons are divided into a handle part and a blade (or head) part.
- New weapons can be given a custom name.
- New weapons can be split back into the individual parts.
- Original Weapons can be created using the original parts.
- Immersion mode can be enabled in the MCM, allowing for skill-based splitting and crafting using the same formula as repair tools.
- Failing to split or craft weapons with immersion mode enabled results in the parts or weapon being destroyed.
