import assert from "node:assert/strict"
import test from "node:test"

import {
  normalizeContributorName,
  searchModderProfiles,
  selectModderProfile,
  selectedModderProfile,
  switchContributorType,
  updateContributorQuery,
  type ContributorIdentityState,
} from "./contributor-identity"

const profiles = [
  { id: "darkelfguy", name: "Darkelfguy", aliases: ["Dark Elf Guy"] },
]

test("a typed modder name is invalid until its profile result is selected", () => {
  const state: ContributorIdentityState = {
    contributorName: "",
    contributorType: "modder",
    modderId: null,
  }
  updateContributorQuery(state, "Darkelfguy")
  assert.equal(selectedModderProfile(state, profiles), null)
  selectModderProfile(state, profiles[0])
  assert.equal(selectedModderProfile(state, profiles)?.id, "darkelfguy")
})

test("mode switching clears incompatible contributor identity", () => {
  const state: ContributorIdentityState = {
    contributorName: "Darkelfguy",
    contributorType: "modder",
    modderId: "darkelfguy",
  }
  switchContributorType(state, "external")
  assert.equal(state.modderId, null)
  updateContributorQuery(state, "Greatness7")
  switchContributorType(state, "modder")
  assert.equal(state.contributorName, "")
  assert.equal(state.modderId, null)
})

test("profile search includes aliases but selection stores the canonical identity", () => {
  const state: ContributorIdentityState = {
    contributorName: "",
    contributorType: "modder",
    modderId: null,
  }
  const match = searchModderProfiles(profiles, "elf guy")[0]
  assert.equal(match.id, "darkelfguy")
  selectModderProfile(state, match)
  assert.equal(state.contributorName, "Darkelfguy")
  assert.equal(state.modderId, "darkelfguy")
})

test("contributor normalization trims, collapses whitespace, normalizes NFKC, and folds case", () => {
  assert.equal(normalizeContributorName("  Greatness7  "), "greatness7")
  assert.equal(normalizeContributorName("Greatness   7"), "greatness 7")
  assert.equal(normalizeContributorName("ＧＲＥＡＴＮＥＳＳ７"), "greatness7")
})
