import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import matter from "gray-matter"
import yaml from "js-yaml"
import { visit } from "unist-util-visit"

import { QuartzTransformerPlugin } from "../types"
import {
  FilePath,
  SimpleSlug,
  simplifySlug,
  slugifyFilePath,
} from "../../util/path"

type WikiLinkRecord = {
  slug: SimpleSlug
  title?: unknown
  cell?: unknown
  explorerTitle?: unknown
  aliases?: unknown
  draft?: unknown
}

export type WikiLinkIndex = Map<string, Set<SimpleSlug>>

const identityKey = (value: string): string =>
  value
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "")

const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.trim().length > 0,
      )
    : []

export const buildWikiLinkIndex = (
  records: WikiLinkRecord[],
): WikiLinkIndex => {
  const index: WikiLinkIndex = new Map()

  for (const record of records) {
    if (record.draft === true || record.draft === "true") continue
    const labels = [
      record.title,
      record.cell,
      record.explorerTitle,
      ...stringList(record.aliases),
    ]
    for (const label of labels) {
      if (typeof label !== "string" || label.trim().length === 0) continue
      const key = identityKey(label)
      const matches = index.get(key) ?? new Set<SimpleSlug>()
      matches.add(record.slug)
      index.set(key, matches)
    }
  }

  return index
}

export const resolveWikiLinkAlias = (
  target: string,
  index: WikiLinkIndex,
): string | null => {
  let decoded: string
  try {
    decoded = decodeURI(target)
  } catch {
    return null
  }
  const anchorIndex = decoded.indexOf("#")
  const anchor = anchorIndex >= 0 ? decoded.slice(anchorIndex) : ""
  const file = (anchorIndex >= 0 ? decoded.slice(0, anchorIndex) : decoded)
    .trim()
    .replace(/\.md$/iu, "")
  if (
    !file ||
    file.includes("/") ||
    file.includes("\\") ||
    file.startsWith(".")
  )
    return null
  const matches = index.get(identityKey(file))
  if (!matches || matches.size !== 1) return null
  return `${[...matches][0]}${anchor}`
}

const markdownFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return markdownFiles(entryPath)
    return entry.isFile() &&
      path.extname(entry.name).toLocaleLowerCase("en-US") === ".md"
      ? [entryPath]
      : []
  })

const loadWikiLinkIndex = (contentDirectory: string): WikiLinkIndex => {
  const records = ["mods", "locations"].flatMap((collection) => {
    const collectionDirectory = path.join(contentDirectory, collection)
    return markdownFiles(collectionDirectory)
      .filter(
        (filePath) =>
          path.basename(filePath).toLocaleLowerCase("en-US") !== "index.md",
      )
      .map((filePath): WikiLinkRecord => {
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
          explorerTitle: parsed.data.explorer_title,
          aliases: parsed.data.aliases,
          draft: parsed.data.draft,
        }
      })
  })
  return buildWikiLinkIndex(records)
}

/** Resolves unique mod and location titles/cell aliases before Quartz rebases links. */
export const WikiLinkResolver: QuartzTransformerPlugin = () => ({
  name: "WikiLinkResolver",
  htmlPlugins(ctx) {
    const linkIndex = loadWikiLinkIndex(path.resolve(ctx.argv.directory))
    return [
      () => (tree) => {
        visit(tree, "element", (node) => {
          if (
            node.tagName !== "a" ||
            typeof node.properties?.href !== "string" ||
            /^(?:[a-z][a-z0-9+.-]*:|#|\/)/iu.test(node.properties.href)
          )
            return
          const resolved = resolveWikiLinkAlias(node.properties.href, linkIndex)
          if (resolved) node.properties.href = resolved
        })
      },
    ]
  },
})
