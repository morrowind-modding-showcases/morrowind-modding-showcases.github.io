import assert from "node:assert/strict"
import test from "node:test"

import { SimpleSlug } from "../../util/path"
import { buildWikiLinkIndex, resolveWikiLinkAlias } from "./wikiLinkResolver"

const slug = (value: string): SimpleSlug => value as SimpleSlug

test("bare mod and location titles resolve to their canonical collection paths", () => {
  const index = buildWikiLinkIndex([
    { slug: slug("locations/balmora"), title: "Balmora", draft: false },
    {
      slug: slug("mods/oaab-seyda-neen-damp-little-squat"),
      title: "OAAB Seyda Neen - Damp Little Squat",
      draft: false,
    },
  ])

  assert.equal(resolveWikiLinkAlias("Balmora", index), "locations/balmora")
  assert.equal(
    resolveWikiLinkAlias(
      "OAAB%20Seyda%20Neen%20-%20Damp%20Little%20Squat#Details",
      index,
    ),
    "mods/oaab-seyda-neen-damp-little-squat#Details",
  )
})

test("cell names and declared aliases resolve, while ambiguity and explicit paths stay untouched", () => {
  const index = buildWikiLinkIndex([
    {
      slug: slug("locations/balmora/guild-of-mages-867"),
      title: "Balmora, Guild of Mages",
      cell: "Balmora, Guild of Mages",
      aliases: ["Balmora Mages Guild"],
      draft: false,
    },
    { slug: slug("locations/ashinabi-1104"), title: "Ashinabi", draft: false },
    { slug: slug("locations/ashinabi-1105"), title: "Ashinabi", draft: false },
    { slug: slug("locations/draft"), title: "Draft Place", draft: true },
  ])

  assert.equal(
    resolveWikiLinkAlias("Balmora Mages Guild", index),
    "locations/balmora/guild-of-mages-867",
  )
  assert.equal(resolveWikiLinkAlias("Ashinabi", index), null)
  assert.equal(resolveWikiLinkAlias("Draft Place", index), null)
  assert.equal(resolveWikiLinkAlias("locations/balmora", index), null)
})
