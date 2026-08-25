export type ContributorType = "external" | "modder"

export type ModderProfileOption = {
  id: string
  name: string
  aliases: string[]
}

export type ContributorIdentityState = {
  contributorName: string
  contributorType: ContributorType
  modderId: string | null
}

export function normalizeContributorName(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/gu, " ")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
}

export function switchContributorType(
  state: ContributorIdentityState,
  contributorType: ContributorType,
) {
  if (state.contributorType === contributorType) return
  state.contributorType = contributorType
  state.modderId = null
  if (contributorType === "modder") state.contributorName = ""
}

export function updateContributorQuery(
  state: ContributorIdentityState,
  value: string,
) {
  state.contributorName = value
  if (state.contributorType === "modder") state.modderId = null
}

export function selectModderProfile(
  state: ContributorIdentityState,
  profile: ModderProfileOption,
) {
  state.contributorType = "modder"
  state.contributorName = profile.name
  state.modderId = profile.id
}

export function selectedModderProfile(
  state: ContributorIdentityState,
  profiles: ModderProfileOption[],
): ModderProfileOption | null {
  if (state.contributorType !== "modder" || !state.modderId) return null
  const profile = profiles.find((candidate) => candidate.id === state.modderId)
  return profile && state.contributorName === profile.name ? profile : null
}

export function searchModderProfiles(
  profiles: ModderProfileOption[],
  query: string,
): ModderProfileOption[] {
  const key = normalizeContributorName(query)
  if (!key) return profiles.slice(0, 12)
  return profiles
    .filter((profile) =>
      [profile.name, ...(profile.aliases ?? [])].some((name) =>
        normalizeContributorName(name).includes(key),
      ),
    )
    .slice(0, 12)
}
