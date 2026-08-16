---
title: "OAAB Dwemer Pavements"
authors:
  - "Melchior Dahrk"
url: "https://www.nexusmods.com/morrowind/mods/50237"
categories:
  - "Dungeon"
map_enabled: true
map_locations:
  - "Mzanchend"
map_exterior_edits:
  - cell: "-5, 16"
    landscape: true
    references: 3
  - cell: "-6, 17"
    landscape: true
    references: 5
  - cell: "4, 15"
    landscape: true
    references: 12
  - cell: "7, 19"
    landscape: true
    references: 0
  - cell: "8, 20"
    landscape: true
    references: 0
  - cell: "9, 1"
    landscape: true
    references: 0
  - cell: "15, -5"
    landscape: true
    references: 5
  - cell: "8, 0"
    landscape: true
    references: 11
  - cell: "9, 2"
    landscape: true
    references: 22
  - cell: "8, -10"
    landscape: true
    references: 22
  - cell: "6, 21"
    landscape: false
    references: 5
  - cell: "8, 12"
    landscape: true
    references: 10
  - cell: "10, -3"
    landscape: true
    references: 13
  - cell: "17, -6"
    landscape: true
    references: 10
  - cell: "7, 20"
    landscape: true
    references: 10
  - cell: "-13, 14"
    landscape: true
    references: 3
draft: false
events: []
picture_url: "https://staticdelivery.nexusmods.com/mods/100/images/50237/50237-1631297943-623246093.png"
showcase_url: "https://youtu.be/CppuJKj7fu4?t=244s"
components:
  - id: "ashfront-patch"
    name: "Ashfront Patch"
    type: "patch"
    plugins:
      - "OAAB Dwemer Pavements_Ashfront Patch.ESP"
    relations: []
    map_locations: []
    map_exterior_edits:
      - cell: "6, 21"
        landscape: false
        references: 5
      - cell: "6, 18"
        landscape: false
        references: 0
      - cell: "-1, 20"
        landscape: false
        references: 0
      - cell: "-3, 24"
        landscape: false
        references: 0
      - cell: "-4, 20"
        landscape: false
        references: 0
      - cell: "1, 19"
        landscape: false
        references: 0
      - cell: "2, 19"
        landscape: false
        references: 0
      - cell: "2, 21"
        landscape: false
        references: 0
      - cell: "2, 22"
        landscape: false
        references: 0
      - cell: "4, 21"
        landscape: false
        references: 0
      - cell: "4, 23"
        landscape: false
        references: 0
      - cell: "5, 21"
        landscape: false
        references: 0
      - cell: "5, 23"
        landscape: false
        references: 0
      - cell: "6, 16"
        landscape: false
        references: 0
      - cell: "6, 20"
        landscape: false
        references: 0
      - cell: "6, 22"
        landscape: false
        references: 0
      - cell: "6, 23"
        landscape: false
        references: 0
      - cell: "7, 17"
        landscape: false
        references: 0
      - cell: "7, 20"
        landscape: true
        references: 10
      - cell: "7, 21"
        landscape: false
        references: 0
      - cell: "8, 20"
        landscape: true
        references: 0
      - cell: "8, 21"
        landscape: false
        references: 0
      - cell: "9, 21"
        landscape: false
        references: 0
    notes: "Compatibility patch for Ashfront Sheogorad and Ashfront - Bitter Coast."
  - id: "trackless-grazelands-compatibility-patch"
    name: "Trackless Grazelands Compatibility Patch"
    type: "patch"
    plugins:
      - "Trackless Grazeland OAAB Dwemer Pavements Patch.ESP"
    relations: []
    map_locations: []
    map_exterior_edits:
      - cell: "8, 12"
        landscape: true
        references: 0
    notes: ""
---
Many of the Dwemer ruins use unfitting cobblestone textures in their exteriors. This mod replaces the cobblestone textures outside of all Vvardenfell-based Dwemer ruins with a new texture. In addition to the texture swap, it also uses a "road edge" mesh which helps blend this new pavement into the ruins and the surrounding landscape.

## World Edits:

Mostly exterior terrain editing around Dwemer ruins, replacing landscape textures and adding new assets.

## Other Notes:

Comes with a compatibility patch for Ashfront and Trackless Grazelands. Note, main file is a ESM, which means that plugin files will always overwrite the terrain edits made by OAAB Dwemer Pavements.