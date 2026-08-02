import assert from "node:assert/strict"
import test from "node:test"

import {
  buildLocationLinkIndex,
  relatedLocationSlugs,
} from "./modLocationLinks"
import { SimpleSlug } from "../../util/path"

const slug = (value: string): SimpleSlug => value as SimpleSlug

test("mod locations resolve title and cell aliases to graph links", () => {
  const index = buildLocationLinkIndex([
    {
      slug: slug("locations/balmora"),
      title: "Balmora",
      cell: "Balmora, Guild of Mages",
      draft: false,
    },
    {
      slug: slug("locations/draft-location"),
      title: "Draft Location",
      draft: true,
    },
  ])

  assert.deepEqual(
    relatedLocationSlugs(["Balmora, Guild of Mages", "Draft Location"], index),
    ["locations/balmora"],
  )
})

test("duplicate map markers produce distinct, de-duplicated graph links", () => {
  const index = buildLocationLinkIndex([
    {
      slug: slug("locations/ashinabi-1104"),
      title: "Ashinabi",
      cell: "Ashinabi",
      draft: false,
    },
    {
      slug: slug("locations/ashinabi-1105"),
      title: "Ashinabi",
      cell: "Ashinabi",
      draft: false,
    },
  ])

  assert.deepEqual(relatedLocationSlugs(["ashinabi", "Ashinabi"], index), [
    "locations/ashinabi-1104",
    "locations/ashinabi-1105",
  ])
})
