import { FullSlug } from "./path"

const cityTransportPrefixes = new Set(["boat transport", "silt strider"])

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("en-US")
}

function slugifyName(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function explorerTitleForFile(
  slug: FullSlug,
  frontmatter: Record<string, unknown> | undefined,
): string | undefined {
  const title = typeof frontmatter?.title === "string" ? frontmatter.title.trim() : undefined
  const cell = typeof frontmatter?.cell === "string" ? frontmatter.cell.trim() : undefined
  if (!title || !cell || !slug.startsWith("locations/")) return title

  const slugSegments = slug.split("/")
  if (slugSegments.length < 3) return title
  const parentSlug = slugSegments.at(-2)
  const comma = cell.indexOf(",")
  if (!parentSlug || comma < 0) return title

  const prefix = cell.slice(0, comma).trim()
  const suffix = cell.slice(comma + 1).trim()
  const explicitTitle =
    typeof frontmatter?.explorer_title === "string" ? frontmatter.explorer_title.trim() : ""
  if (slugifyName(prefix) === parentSlug) return explicitTitle || suffix || title
  if (cityTransportPrefixes.has(normalized(prefix)) && slugifyName(suffix) === parentSlug) {
    return prefix
  }

  return title
}
