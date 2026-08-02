import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import matter from "gray-matter"
import yaml from "js-yaml"

import { QuartzTransformerPlugin } from "../types"
import {
  FilePath,
  SimpleSlug,
  simplifySlug,
  slugifyFilePath,
} from "../../util/path"

type LocationLinkRecord = {
  slug: SimpleSlug
  title?: unknown
  cell?: unknown
  draft?: unknown
}

type LocationLinkIndex = Map<string, Set<SimpleSlug>>

const identityKey = (value: string): string =>
  value
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "")

const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
    : []

const markdownFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return markdownFiles(entryPath)
    return entry.isFile() &&
      path.extname(entry.name).toLocaleLowerCase("en-US") === ".md"
      ? [entryPath]
      : []
  })

export const buildLocationLinkIndex = (
  locations: LocationLinkRecord[],
): LocationLinkIndex => {
  const index: LocationLinkIndex = new Map()

  for (const location of locations) {
    if (location.draft === true || location.draft === "true") continue
    for (const value of [location.title, location.cell]) {
      if (typeof value !== "string" || value.trim().length === 0) continue
      const key = identityKey(value)
      const slugs = index.get(key) ?? new Set<SimpleSlug>()
      slugs.add(location.slug)
      index.set(key, slugs)
    }
  }

  return index
}

export const relatedLocationSlugs = (
  mapLocations: unknown,
  locationIndex: LocationLinkIndex,
): SimpleSlug[] => {
  const slugs = new Set<SimpleSlug>()
  for (const location of stringList(mapLocations)) {
    for (const slug of locationIndex.get(identityKey(location)) ?? [])
      slugs.add(slug)
  }
  return [...slugs]
}

const loadLocationLinkIndex = (contentDirectory: string): LocationLinkIndex => {
  const locationsDirectory = path.join(contentDirectory, "locations")
  const locations = markdownFiles(locationsDirectory)
    .filter(
      (filePath) =>
        path.basename(filePath).toLocaleLowerCase("en-US") !== "index.md",
    )
    .map((filePath): LocationLinkRecord => {
      const relativePath = path
        .relative(contentDirectory, filePath)
        .split(path.sep)
        .join("/")
      const parsed = matter(readFileSync(filePath, "utf8"), {
        engines: {
          yaml: (source) =>
            yaml.load(source, { schema: yaml.JSON_SCHEMA }) as object,
        },
      })
      return {
        slug: simplifySlug(slugifyFilePath(relativePath as FilePath)),
        title: parsed.data.title,
        cell: parsed.data.cell,
        draft: parsed.data.draft,
      }
    })

  return buildLocationLinkIndex(locations)
}

/**
 * Makes the canonical map_locations frontmatter visible to Quartz's graph and
 * backlink index. The rendered detail cards already expose the same links;
 * this transformer supplies their semantic equivalent during Markdown parsing.
 */
export const ModLocationLinks: QuartzTransformerPlugin = () => ({
  name: "ModLocationLinks",
  htmlPlugins(ctx) {
    const locationIndex = loadLocationLinkIndex(
      path.resolve(ctx.argv.directory),
    )

    return [
      () => (_tree, file) => {
        if (!file.data.slug?.startsWith("mods/")) return

        const relationshipLinks = relatedLocationSlugs(
          file.data.frontmatter?.map_locations,
          locationIndex,
        )
        if (relationshipLinks.length === 0) return

        file.data.links = [
          ...new Set([...(file.data.links ?? []), ...relationshipLinks]),
        ]
      },
    ]
  },
})
