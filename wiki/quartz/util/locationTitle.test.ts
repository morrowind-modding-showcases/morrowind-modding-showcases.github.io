import assert from "node:assert/strict"
import { test } from "node:test"

import { FullSlug } from "./path"
import { explorerTitleForFile } from "./locationTitle"

test("shortens ordinary cell names only in the explorer", () => {
  assert.equal(
    explorerTitleForFile("locations/andasreth/lower-level-1048" as FullSlug, {
      title: "Andasreth, Lower Level",
      cell: "Andasreth, Lower Level",
      explorer_title: "Lower Level",
    }),
    "Lower Level",
  )
  assert.equal(
    explorerTitleForFile("locations/ald-ruhn/ald-ruhn-temple" as FullSlug, {
      title: "Ald-ruhn, Temple",
      cell: "Ald-ruhn, Temple",
      explorer_title: "Ald'ruhn Temple",
    }),
    "Ald'ruhn Temple",
  )
})

test("shortens transport cells while nesting them under their city", () => {
  assert.equal(
    explorerTitleForFile("locations/molag-mar/silt-strider-molag-mar" as FullSlug, {
      title: "Silt Strider, Molag Mar",
      cell: "Silt Strider, Molag Mar",
    }),
    "Silt Strider",
  )
  assert.equal(
    explorerTitleForFile("locations/dagon-fel/boat-transport-dagon-fel" as FullSlug, {
      title: "Boat Transport, Dagon Fel",
      cell: "Boat Transport, Dagon Fel",
    }),
    "Boat Transport",
  )
})

test("leaves non-location and top-level titles unchanged", () => {
  assert.equal(
    explorerTitleForFile("mods/example" as FullSlug, {
      title: "Example Mod",
      cell: "Andasreth, Lower Level",
    }),
    "Example Mod",
  )
  assert.equal(
    explorerTitleForFile("locations/andasreth" as FullSlug, {
      title: "Andasreth",
    }),
    "Andasreth",
  )
})
