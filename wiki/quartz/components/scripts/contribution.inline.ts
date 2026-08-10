import yaml from "js-yaml"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import { transformInternalLink } from "../../util/path"
import {
  matchSelectedTes3CellsToLocations,
  MAX_TES3_PLUGIN_BYTES,
  parseTes3Plugin,
} from "./tes3-plugin-parser"
import type { ParsedTes3Cell } from "./tes3-plugin-parser"

type SubmissionKind = "new-mod" | "edit-mod" | "edit-location" | "new-location"
type Entrance = { sourceIndex?: number; x: string; y: string; region: string }
type ContributionOptions = {
  schemaVersion: number
  categories: string[]
  events: string[]
  mapLocations: string[]
  modSlugs: string[]
}
type ContributionState = {
  kind: SubmissionKind
  startedAt: string
  contributorName: string
  notes: string
  website: string
  targetPath: string
  baseSha256: string
  originalFrontmatter: Record<string, unknown>
  title: string
  slug: string
  slugTouched: boolean
  authors: string[]
  url: string
  description: string
  pictureUrl: string
  showcaseUrl: string
  category: string
  events: string[]
  legacyEvents: string[]
  mapEnabled: boolean
  mapLocations: string[]
  mapPluginMessage: string
  mapPluginError: boolean
  cell: string
  region: string
  x: string
  y: string
  uespUrl: string
  entrances: Entrance[]
  article: string
  reviewPayload: Record<string, unknown> | null
}

type NexusModMetadata = {
  name: string
  author: string
  description: string
  pictureUrl: string
}

type PluginParserState = {
  downloadUrl: string
  file: File | null
  fileName: string
  cells: ParsedTes3Cell[]
  nexus: NexusModMetadata | null
}

const WORKER_ENDPOINT = "https://darkelfmodding-wiki-submissions.melchior-dahrk.workers.dev/submit"
const NEXUS_METADATA_ENDPOINT = WORKER_ENDPOINT.replace(/\/submit$/u, "/nexus-mod")
const TURNSTILE_SITE_KEY = "0x4AAAAAAEGiDP91lRPZHrbI"
const TYPE_LABELS: Record<SubmissionKind, string> = {
  "new-mod": "Add a new mod page",
  "edit-mod": "Edit an existing mod page",
  "edit-location": "Edit an existing map location",
  "new-location": "Add a new map location",
}
const encoder = new TextEncoder()
let turnstileLoader: Promise<void> | null = null

const filenamePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const modTargetPattern = /^wiki\/content\/mods\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/u
const locationTargetPattern =
  /^wiki\/content\/locations\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*[a-z0-9]+(?:-[a-z0-9]+)*\.md$/u
const isValidWikiFilename = (value: string): boolean => filenamePattern.test(value)
const isSafeEditTargetPath = (value: string): boolean =>
  !value.endsWith("/index.md") &&
  !value.includes("..") &&
  !value.includes("\\") &&
  !value.includes("\0") &&
  (modTargetPattern.test(value) || locationTargetPattern.test(value))
const slugifyWikiFilename = (value: string): string =>
  value
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")

const create = (tag: string, className = "", text = ""): HTMLElement => {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

const makeButton = (
  label: string,
  onClick: () => void,
  className = "contribution-button",
): HTMLButtonElement => {
  const button = create("button", className, label) as HTMLButtonElement
  button.type = "button"
  button.addEventListener("click", onClick)
  return button
}

const intro = (): HTMLParagraphElement => {
  const paragraph = create("p", "wiki-contribution-intro") as HTMLParagraphElement
  paragraph.textContent =
    "Help expand the Morrowind Modding Showcases Wiki by submitting a new mod page or map location. Submissions are reviewed by the wiki maintainers before publication."
  return paragraph
}

const notice = (): HTMLParagraphElement => {
  const paragraph = create("p", "contribution-notice") as HTMLParagraphElement
  paragraph.textContent =
    "Your submission will be sent to a private moderation queue. It will not appear publicly until it has been reviewed and approved."
  return paragraph
}

function appendChildren(parent: HTMLElement, ...children: Array<Node | null | undefined>) {
  for (const child of children) if (child) parent.append(child)
  return parent
}

function textInput(
  value: string,
  onInput: (value: string) => void,
  options: {
    required?: boolean
    maxLength?: number
    type?: string
    placeholder?: string
  } = {},
): HTMLInputElement {
  const input = document.createElement("input")
  input.type = options.type ?? "text"
  input.value = value
  input.required = options.required ?? false
  if (options.maxLength) input.maxLength = options.maxLength
  if (options.placeholder) input.placeholder = options.placeholder
  input.addEventListener("input", () => onInput(input.value))
  return input
}

function field(labelText: string, control: HTMLElement, helpText = ""): HTMLElement {
  const wrapper = create("div", "contribution-field")
  const label = document.createElement("label")
  const caption = create("span", "contribution-label", labelText)
  appendChildren(label, caption, control)
  wrapper.append(label)
  if (helpText) wrapper.append(create("p", "contribution-help", helpText))
  return wrapper
}

function fieldset(title: string): HTMLFieldSetElement {
  const result = create("fieldset", "contribution-fieldset") as HTMLFieldSetElement
  result.append(create("legend", "", title))
  return result
}

function blankState(kind: SubmissionKind): ContributionState {
  return {
    kind,
    startedAt: new Date().toISOString(),
    contributorName: "",
    notes: "",
    website: "",
    targetPath: "",
    baseSha256: "",
    originalFrontmatter: {},
    title: "",
    slug: "",
    slugTouched: false,
    authors: [""],
    url: "",
    description: "",
    pictureUrl: "",
    showcaseUrl: "",
    category: "",
    events: [],
    legacyEvents: [],
    mapEnabled: false,
    mapLocations: [],
    mapPluginMessage: "",
    mapPluginError: false,
    cell: "",
    region: "",
    x: "",
    y: "",
    uespUrl: "",
    entrances: [],
    article: "",
    reviewPayload: null,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function stringArray(value: unknown, label: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} has an unsupported value in the current page.`)
  }
  return value.map((item) => String(item).trim()).filter(Boolean)
}

function parseWikiMarkdown(source: string): {
  frontmatter: Record<string, unknown>
  body: string
} {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/u)
  if (!match)
    throw new Error("The current page does not contain valid YAML frontmatter delimiters.")
  const parsed = yaml.load(match[1])
  if (!isRecord(parsed)) throw new Error("The current page frontmatter is not an object.")
  return { frontmatter: parsed, body: match[2] }
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
  return [...digest].map((value) => value.toString(16).padStart(2, "0")).join("")
}

function legacyUespUrl(value: string): string {
  if (!value) return ""
  if (/^https?:\/\//iu.test(value)) return value
  return `https://en.uesp.net/wiki/Morrowind:${encodeURI(value.replace(/ /gu, "_"))}`
}

async function loadEditState(
  path: string,
  options: ContributionOptions,
): Promise<ContributionState> {
  if (!isSafeEditTargetPath(path))
    throw new Error("The requested edit target is not a supported wiki article path.")
  const rawUrl = `https://raw.githubusercontent.com/morrowind-modding-showcases/morrowind-modding-showcases.github.io/main/${path}`
  const response = await fetch(rawUrl, {
    headers: { Accept: "text/plain" },
    cache: "no-store",
  })
  if (!response.ok)
    throw new Error("The current wiki source could not be loaded from the main branch.")
  const bytes = await response.arrayBuffer()
  let source: string
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new Error("The current wiki source is not valid UTF-8.")
  }
  const parsed = parseWikiMarkdown(source)
  const isMod = path.startsWith("wiki/content/mods/")
  const state = blankState(isMod ? "edit-mod" : "edit-location")
  state.targetPath = path
  state.baseSha256 = await sha256Hex(bytes)
  state.originalFrontmatter = parsed.frontmatter
  state.article = parsed.body.replace(/^\r?\n/u, "")
  if (isMod) {
    const categories = parsed.frontmatter.categories
    if (
      !Array.isArray(categories) ||
      categories.length !== 1 ||
      typeof categories[0] !== "string"
    ) {
      throw new Error(
        "The current mod has an invalid category shape and cannot be safely edited with this form.",
      )
    }
    if (!options.categories.includes(categories[0])) {
      throw new Error("The current mod category is no longer in the controlled category list.")
    }
    const currentLocations = stringArray(parsed.frontmatter.map_locations, "Map locations")
    if (currentLocations.some((location) => !options.mapLocations.includes(location))) {
      throw new Error("The current mod contains a map location outside the controlled list.")
    }
    const currentEvents = stringArray(parsed.frontmatter.events, "Events")
    state.title = stringValue(parsed.frontmatter.title)
    state.authors = stringArray(parsed.frontmatter.authors, "Authors")
    state.url = stringValue(parsed.frontmatter.url)
    state.description = stringValue(parsed.frontmatter.description)
    state.pictureUrl = stringValue(parsed.frontmatter.picture_url)
    state.showcaseUrl = stringValue(parsed.frontmatter.showcase_url)
    state.category = categories[0]
    state.events = currentEvents
    state.legacyEvents = currentEvents.filter((event) => !options.events.includes(event))
    state.mapEnabled = parsed.frontmatter.map_enabled === true
    state.mapLocations = state.mapEnabled ? currentLocations : []
  } else {
    const rawEntrances = parsed.frontmatter.additional_entrances ?? []
    if (!Array.isArray(rawEntrances) || rawEntrances.some((entrance) => !isRecord(entrance))) {
      throw new Error("The current location has unsupported additional-entrance metadata.")
    }
    state.cell = stringValue(parsed.frontmatter.cell) || stringValue(parsed.frontmatter.title)
    state.region = stringValue(parsed.frontmatter.region)
    state.x = Number.isInteger(parsed.frontmatter.x) ? String(parsed.frontmatter.x) : ""
    state.y = Number.isInteger(parsed.frontmatter.y) ? String(parsed.frontmatter.y) : ""
    if (!state.x || !state.y)
      throw new Error("The current location coordinates are not signed whole numbers.")
    state.uespUrl = legacyUespUrl(stringValue(parsed.frontmatter.uesp_wiki))
    state.entrances = rawEntrances.map((entrance, sourceIndex) => {
      if (!Number.isInteger(entrance.x) || !Number.isInteger(entrance.y)) {
        throw new Error("An existing additional entrance has unsupported coordinates.")
      }
      return {
        sourceIndex,
        x: String(entrance.x),
        y: String(entrance.y),
        region: stringValue(entrance.region),
      }
    })
  }
  return state
}

function serializeWikiMarkdown(frontmatter: Record<string, unknown>, body: string): string {
  const content = String(body).replace(/^(?:\r\n|\n)/u, "")
  return `---\n${yaml.dump(frontmatter, {
    lineWidth: -1,
    noRefs: true,
    forceQuotes: true,
    quotingType: '"',
  })}---\n${content}`
}

function optionalProperty(record: Record<string, unknown>, key: string, value: string) {
  if (value.trim()) record[key] = value.trim()
  else delete record[key]
}

function generatedMarkdown(state: ContributionState): string {
  let frontmatter: Record<string, unknown>
  if (state.kind === "new-mod") {
    frontmatter = {
      title: state.title.trim(),
      authors: state.authors,
      url: state.url.trim(),
      categories: [state.category],
      map_enabled: state.mapEnabled,
      map_locations: state.mapLocations,
      draft: false,
      events: state.events,
    }
    if (state.description.trim()) frontmatter.description = state.description.trim()
    if (state.pictureUrl.trim()) frontmatter.picture_url = state.pictureUrl.trim()
    if (state.showcaseUrl.trim()) frontmatter.showcase_url = state.showcaseUrl.trim()
  } else if (state.kind === "edit-mod") {
    frontmatter = {
      ...state.originalFrontmatter,
      title: state.title.trim(),
      authors: state.authors,
      categories: [state.category],
      events: state.events,
      map_enabled: state.mapEnabled,
      map_locations: state.mapLocations,
    }
    optionalProperty(frontmatter, "url", state.url)
    optionalProperty(frontmatter, "description", state.description)
    optionalProperty(frontmatter, "picture_url", state.pictureUrl)
    optionalProperty(frontmatter, "showcase_url", state.showcaseUrl)
  } else if (state.kind === "new-location") {
    frontmatter = {
      title: state.cell.trim(),
      cell: state.cell.trim(),
      x: Number(state.x),
      y: Number(state.y),
    }
    optionalProperty(frontmatter, "region", state.region)
    optionalProperty(frontmatter, "uesp_wiki", state.uespUrl)
    if (state.entrances.length) {
      frontmatter.additional_entrances = state.entrances.map((entrance) => {
        const result: Record<string, unknown> = {
          x: Number(entrance.x),
          y: Number(entrance.y),
        }
        optionalProperty(result, "region", entrance.region)
        return result
      })
    }
  } else {
    frontmatter = {
      ...state.originalFrontmatter,
      title: state.cell.trim(),
      cell: state.cell.trim(),
      x: Number(state.x),
      y: Number(state.y),
    }
    optionalProperty(frontmatter, "region", state.region)
    optionalProperty(frontmatter, "uesp_wiki", state.uespUrl)
    const originals = Array.isArray(state.originalFrontmatter.additional_entrances)
      ? state.originalFrontmatter.additional_entrances
      : []
    const entrances = state.entrances.map((entrance) => {
      const original = isRecord(originals[entrance.sourceIndex ?? -1])
        ? (originals[entrance.sourceIndex ?? -1] as Record<string, unknown>)
        : {}
      const result = {
        ...original,
        x: Number(entrance.x),
        y: Number(entrance.y),
      }
      optionalProperty(result, "region", entrance.region)
      return result
    })
    if (entrances.length) frontmatter.additional_entrances = entrances
    else delete frontmatter.additional_entrances
  }
  return serializeWikiMarkdown(frontmatter, state.article)
}

function downloadTextFile(contents: string, filename: string) {
  const blobUrl = URL.createObjectURL(new Blob([contents], { type: "text/markdown;charset=utf-8" }))
  const link = document.createElement("a")
  link.href = blobUrl
  link.download = filename
  link.hidden = true
  document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0)
  }
}

function downloadMarkdownFile(state: ContributionState) {
  const markdown = state.reviewPayload?.generatedMarkdown
  if (typeof markdown !== "string") return

  const filename = state.targetPath
    ? (state.targetPath.split("/").pop() ?? "wiki-page.md")
    : `${state.slug}.md`
  downloadTextFile(markdown, filename)
}

function deduplicate(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of values) {
    const value = raw.trim()
    const key = value.toLocaleLowerCase("en-US")
    if (value && !seen.has(key)) {
      seen.add(key)
      result.push(value)
    }
  }
  return result
}

function isSingleLine(value: string): boolean {
  return !/[\r\n\u0000-\u001f\u007f-\u009f]/u.test(value)
}

function wholeNumber(value: string): number | null {
  if (!/^-?\d+$/u.test(value.trim())) return null
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : null
}

function validateState(state: ContributionState, options: ContributionOptions): string[] {
  const errors: string[] = []
  state.contributorName = state.contributorName.trim()
  if (
    state.contributorName.length < 2 ||
    state.contributorName.length > 100 ||
    !isSingleLine(state.contributorName) ||
    /[<>]/u.test(state.contributorName)
  ) {
    errors.push("Contributor name must be 2–100 characters on one line and contain no HTML markup.")
  }
  if (state.notes.length > 5_000)
    errors.push("Notes for maintainers must be at most 5,000 characters.")
  if (!state.article.trim()) errors.push("Article text is required.")
  if (state.kind === "new-mod" || state.kind === "edit-mod") {
    state.title = state.title.trim()
    state.authors = deduplicate(state.authors)
    state.url = state.url.trim()
    state.description = state.description.trim()
    if (!state.title || !isSingleLine(state.title))
      errors.push("Mod title is required on one line.")
    if (state.kind === "new-mod" && state.authors.length === 0)
      errors.push("At least one author is required.")
    if (!/^https?:\/\/[^\s]+$/iu.test(state.url))
      errors.push("Download URL is required and must be a complete HTTP(S) URL.")
    if (state.description.length > 1_000)
      errors.push("Description must be at most 1,000 characters.")
    for (const [label, value] of [
      ["Picture URL", state.pictureUrl],
      ["Showcase URL", state.showcaseUrl],
    ] as const) {
      if (value.trim() && !/^https?:\/\/[^\s]+$/iu.test(value.trim()))
        errors.push(`${label} must be a complete HTTP(S) URL.`)
    }
    if (state.kind === "new-mod") {
      if (!isValidWikiFilename(state.slug))
        errors.push("Page filename may use only lowercase letters, numbers, and single hyphens.")
      if (
        options.modSlugs.some(
          (slug) => slug.toLocaleLowerCase("en-US") === state.slug.toLocaleLowerCase("en-US"),
        )
      ) {
        errors.push("That mod filename already exists.")
      }
    }
    if (!options.categories.includes(state.category)) errors.push("Choose one controlled category.")
    const allowedEvents = new Set([...options.events, ...state.legacyEvents])
    if (state.events.some((event) => !allowedEvents.has(event)))
      errors.push("Events must use the controlled list.")
    if (state.mapLocations.some((location) => !options.mapLocations.includes(location)))
      errors.push("Map locations must use the controlled list.")
    if (state.mapEnabled && state.mapLocations.length === 0)
      errors.push("Choose at least one map location when map inclusion is enabled.")
    if (!state.mapEnabled) state.mapLocations = []
  } else {
    state.cell = state.cell.trim()
    if (!state.cell || !isSingleLine(state.cell)) errors.push("Cell name is required on one line.")
    if (state.kind === "new-location" && !isValidWikiFilename(state.slug)) {
      errors.push("Suggested filename may use only lowercase letters, numbers, and single hyphens.")
    }
    if (wholeNumber(state.x) === null || wholeNumber(state.y) === null) {
      errors.push("X and Y coordinates must be signed whole numbers.")
    }
    if (state.uespUrl.trim() && !/^https?:\/\/[^\s]+$/iu.test(state.uespUrl.trim())) {
      errors.push("UESP URL must be a complete HTTP(S) URL.")
    }
    for (const [index, entrance] of state.entrances.entries()) {
      if (wholeNumber(entrance.x) === null || wholeNumber(entrance.y) === null) {
        errors.push(
          `Additional entrance ${index + 1} requires signed whole-number X and Y coordinates.`,
        )
      }
    }
  }
  try {
    if (encoder.encode(generatedMarkdown(state)).byteLength > 100 * 1024) {
      errors.push("Generated Markdown must be at most 100 KiB.")
    }
  } catch {
    errors.push("The proposed Markdown could not be generated.")
  }
  return errors
}

function changesFor(state: ContributionState): Record<string, unknown> {
  if (state.kind === "new-mod" || state.kind === "edit-mod") {
    const changes: Record<string, unknown> = {
      title: state.title,
      authors: state.authors,
      url: state.url,
      description: state.description,
      picture_url: state.pictureUrl.trim(),
      showcase_url: state.showcaseUrl.trim(),
      categories: [state.category],
      events: state.events,
      map_enabled: state.mapEnabled,
      map_locations: state.mapEnabled ? state.mapLocations : [],
    }
    if (state.kind === "new-mod") changes.slug = state.slug
    return changes
  }
  return {
    cell: state.cell,
    region: state.region.trim(),
    x: Number(state.x),
    y: Number(state.y),
    uesp_wiki: state.uespUrl.trim(),
    additional_entrances: state.entrances.map((entrance) => {
      const result: Record<string, unknown> = {
        x: Number(entrance.x),
        y: Number(entrance.y),
        region: entrance.region.trim(),
      }
      if (state.kind === "edit-location") result.sourceIndex = entrance.sourceIndex
      return result
    }),
  }
}

function buildPayload(state: ContributionState): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    schemaVersion: 1,
    submissionId: crypto.randomUUID(),
    kind: state.kind,
    contributorName: state.contributorName,
    notes: state.notes.trim(),
    createdAt: new Date().toISOString(),
    changes: changesFor(state),
    generatedMarkdown: generatedMarkdown(state),
  }
  if (state.kind === "edit-mod" || state.kind === "edit-location") {
    payload.target = { path: state.targetPath, baseSha256: state.baseSha256 }
  }
  if (state.kind === "new-location") payload.suggestedFilename = state.slug
  return payload
}

function safeUrl(value: unknown, image = false): string | null {
  if (typeof value !== "string") return null
  try {
    const url = new URL(value, window.location.origin)
    if (image && !/^https?:$/u.test(url.protocol)) return null
    if (!image && !["http:", "https:", "mailto:"].includes(url.protocol)) return null
    return url.href
  } catch {
    return null
  }
}

function renderObsidianLinks(value: string): DocumentFragment {
  const fragment = document.createDocumentFragment()
  const obsidianLinkPattern = /\[\[([^\[\]\|#\\]+)?(#+[^\[\]\|#\\]+)?(?:\\?\|([^\[\]#]*))?\]\]/gu
  let cursor = 0

  for (const match of value.matchAll(obsidianLinkPattern)) {
    const index = match.index ?? 0
    if (index > 0 && value[index - 1] === "!") continue

    fragment.append(document.createTextNode(value.slice(cursor, index)))
    const [source, rawFile = "", rawAnchor = "", rawAlias] = match
    const file = rawFile.trim()
    const anchor = rawAnchor.trim()
    const target = `${file}${anchor}`
    if (!target) {
      fragment.append(document.createTextNode(source))
      cursor = index + source.length
      continue
    }

    const link = document.createElement("a")
    const externalUrl = /^https?:\/\//iu.test(file) ? safeUrl(target) : null
    if (externalUrl) {
      link.href = externalUrl
      link.target = "_blank"
      link.rel = "noopener noreferrer"
    } else {
      link.classList.add("internal")
      link.setAttribute("href", transformInternalLink(target))
    }
    const fallbackLabel = anchor
      ? anchor.replace(/^#+/u, "")
      : (file.split(/[\\/]/u).at(-1) ?? file).replace(/\.md$/iu, "")
    link.textContent = rawAlias === undefined ? fallbackLabel : rawAlias.trim()
    fragment.append(link)
    cursor = index + source.length
  }

  fragment.append(document.createTextNode(value.slice(cursor)))
  return fragment
}

function renderMarkdown(markdown: string, container: HTMLElement) {
  container.replaceChildren()
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as any
  const definitions = new Map<string, any>()
  for (const child of tree.children ?? [])
    if (child.type === "definition") definitions.set(child.identifier, child)
  const renderNode = (node: any, allowObsidianLinks = true): Node | null => {
    if (node.type === "text")
      return allowObsidianLinks
        ? renderObsidianLinks(node.value ?? "")
        : document.createTextNode(node.value ?? "")
    if (node.type === "html") return document.createTextNode(node.value ?? "")
    if (node.type === "break") return document.createElement("br")
    if (node.type === "thematicBreak") return document.createElement("hr")
    if (node.type === "inlineCode") return create("code", "", node.value ?? "")
    if (node.type === "code") {
      const pre = document.createElement("pre")
      pre.append(create("code", "", node.value ?? ""))
      return pre
    }
    if (node.type === "image" || node.type === "imageReference") {
      const source =
        node.type === "imageReference" ? definitions.get(node.identifier)?.url : node.url
      const url = safeUrl(source, true)
      if (!url) return document.createTextNode(node.alt ?? "")
      const image = document.createElement("img")
      image.src = url
      image.alt = node.alt ?? ""
      image.loading = "lazy"
      image.referrerPolicy = "no-referrer"
      return image
    }
    const tag =
      node.type === "root"
        ? "div"
        : node.type === "paragraph"
          ? "p"
          : node.type === "heading"
            ? `h${Math.min(6, Math.max(1, node.depth ?? 2))}`
            : node.type === "strong"
              ? "strong"
              : node.type === "emphasis"
                ? "em"
                : node.type === "delete"
                  ? "del"
                  : node.type === "blockquote"
                    ? "blockquote"
                    : node.type === "list"
                      ? node.ordered
                        ? "ol"
                        : "ul"
                      : node.type === "listItem"
                        ? "li"
                        : node.type === "link" || node.type === "linkReference"
                          ? "a"
                          : "span"
    const element = document.createElement(tag)
    if (tag === "a") {
      const target =
        node.type === "linkReference" ? definitions.get(node.identifier)?.url : node.url
      const url = safeUrl(target)
      if (!url)
        return document.createTextNode(
          (node.children ?? []).map((child: any) => child.value ?? "").join(""),
        )
      ;(element as HTMLAnchorElement).href = url
      if (new URL(url).origin !== window.location.origin) {
        ;(element as HTMLAnchorElement).target = "_blank"
        ;(element as HTMLAnchorElement).rel = "noopener noreferrer"
      }
    }
    for (const child of node.children ?? []) {
      const rendered = renderNode(child, allowObsidianLinks && tag !== "a")
      if (rendered) element.append(rendered)
    }
    return element
  }
  const rendered = renderNode(tree)
  if (rendered) container.append(...Array.from(rendered.childNodes))
}

function authorEditor(state: ContributionState, rerender: () => void): HTMLElement {
  const wrapper = create("div", "contribution-field")
  wrapper.append(create("span", "contribution-label", "Authors"))
  state.authors.forEach((author, index) => {
    const row = create("div", "contribution-repeat-row")
    const input = textInput(
      author,
      (value) => {
        state.authors[index] = value
      },
      { maxLength: 200 },
    )
    input.setAttribute("aria-label", `Author ${index + 1}`)
    row.append(input)
    if (state.authors.length > 1) {
      row.append(
        makeButton("Remove", () => {
          state.authors.splice(index, 1)
          rerender()
        }),
      )
    }
    wrapper.append(row)
  })
  wrapper.append(
    makeButton("Add another author", () => {
      state.authors.push("")
      rerender()
    }),
  )
  return wrapper
}

function entranceEditor(state: ContributionState, rerender: () => void): HTMLElement {
  const wrapper = create("div", "contribution-field")
  wrapper.append(create("span", "contribution-label", "Additional entrance coordinates"))
  state.entrances.forEach((entrance, index) => {
    const row = create("div", "contribution-repeat-row")
    row.append(
      field(
        "X coordinate",
        textInput(
          entrance.x,
          (value) => {
            entrance.x = value
          },
          { required: true },
        ),
      ),
      field(
        "Y coordinate",
        textInput(
          entrance.y,
          (value) => {
            entrance.y = value
          },
          { required: true },
        ),
      ),
      field(
        "Region (optional)",
        textInput(
          entrance.region,
          (value) => {
            entrance.region = value
          },
          { maxLength: 200 },
        ),
      ),
      makeButton("Remove", () => {
        state.entrances.splice(index, 1)
        rerender()
      }),
    )
    wrapper.append(row)
  })
  if (state.kind === "new-location") {
    wrapper.append(
      makeButton("Add another entrance", () => {
        state.entrances.push({ x: "", y: "", region: "" })
        rerender()
      }),
    )
  } else if (state.entrances.length === 0) {
    wrapper.append(
      create(
        "p",
        "contribution-help",
        "This location has no existing additional entrances. New entrances require maintainer-assigned map metadata and cannot be added in edit mode.",
      ),
    )
  }
  return wrapper
}

function eventSelect(state: ContributionState, options: ContributionOptions): HTMLSelectElement {
  const select = document.createElement("select")
  select.multiple = true
  select.size = Math.min(9, Math.max(4, options.events.length + state.legacyEvents.length))
  for (const event of [...options.events, ...state.legacyEvents]) {
    const option = document.createElement("option")
    option.value = event
    option.textContent = state.legacyEvents.includes(event) ? `${event} (legacy value)` : event
    option.selected = state.events.includes(event)
    select.append(option)
  }
  select.addEventListener("change", () => {
    state.events = Array.from(select.selectedOptions).map((option) => option.value)
  })
  return select
}

function mapLocationSelect(state: ContributionState, options: ContributionOptions): HTMLElement {
  const wrapper = create("div")
  const search = textInput("", () => {}, {
    placeholder: "Search map locations",
  })
  search.className = "contribution-search"
  search.setAttribute("aria-label", "Search map locations")
  const choices = create("div", "contribution-multiselect")
  const renderChoices = () => {
    const query = search.value.trim().toLocaleLowerCase("en-US")
    const searchMatches = query
      ? options.mapLocations.filter((location) =>
          location.toLocaleLowerCase("en-US").includes(query),
        )
      : []
    const displayedLocations = new Set([...state.mapLocations, ...searchMatches])
    choices.replaceChildren()
    choices.hidden = displayedLocations.size === 0 && !query
    for (const location of options.mapLocations) {
      if (!displayedLocations.has(location)) continue
      const label = document.createElement("label")
      const input = document.createElement("input")
      input.type = "checkbox"
      input.checked = state.mapLocations.includes(location)
      input.addEventListener("change", () => {
        state.mapLocations = input.checked
          ? [...state.mapLocations, location]
          : state.mapLocations.filter((value) => value !== location)
        renderChoices()
      })
      appendChildren(label, input, document.createTextNode(location))
      choices.append(label)
    }
    if (query && searchMatches.length === 0)
      choices.append(create("p", "contribution-help", "No controlled locations match that search."))
  }
  search.addEventListener("input", renderChoices)
  renderChoices()
  appendChildren(wrapper, search, choices)
  return wrapper
}

function mapLocationEditor(
  root: HTMLElement,
  state: ContributionState,
  options: ContributionOptions,
  rerender: () => void,
): HTMLElement {
  const wrapper = create("div")
  const file = document.createElement("input")
  file.type = "file"
  file.accept = ".esp,.esm"
  file.hidden = true
  const upload = makeButton("Upload plugin", () => {
    file.value = ""
    file.click()
  })
  const actions = create("div", "contribution-actions")
  actions.append(upload, file)
  wrapper.append(mapLocationSelect(state, options), actions)

  if (state.mapPluginMessage) {
    const status = create(
      "p",
      state.mapPluginError ? "contribution-error" : "contribution-notice",
      state.mapPluginMessage,
    )
    status.setAttribute(
      state.mapPluginError ? "role" : "aria-live",
      state.mapPluginError ? "alert" : "polite",
    )
    wrapper.append(status)
  } else {
    wrapper.append(
      create(
        "p",
        "contribution-help",
        `Upload an ESP or ESM up to ${MAX_TES3_PLUGIN_BYTES / (1024 * 1024)} MiB to prepopulate locations. The file is parsed locally and is never uploaded.`,
      ),
    )
  }

  file.addEventListener("change", async () => {
    const plugin = file.files?.[0]
    if (!plugin) return
    if (!/\.(?:esp|esm)$/iu.test(plugin.name)) {
      state.mapPluginMessage = "Choose a plugin file ending in .esp or .esm."
      state.mapPluginError = true
      rerender()
      return
    }
    if (plugin.size > MAX_TES3_PLUGIN_BYTES) {
      state.mapPluginMessage = `The plugin file must be no larger than ${MAX_TES3_PLUGIN_BYTES / (1024 * 1024)} MiB.`
      state.mapPluginError = true
      rerender()
      return
    }

    upload.disabled = true
    upload.textContent = "Parsing..."
    state.mapPluginMessage = ""
    state.mapPluginError = false
    try {
      const parserState = blankPluginParserState()
      parserState.file = plugin
      parserState.fileName = plugin.name
      parserState.cells = parseTes3Plugin(await plugin.arrayBuffer())
      renderPluginCells(root, options, parserState, {
        backLabel: "Back to mod page",
        onBack: () => renderForm(root, state, options),
        continueLabel: "Use selected locations",
        onContinue: () => {
          const selectedCount = selectedParserCells(parserState).length
          const transfer = parserLocationTransfer(parserState, options)
          const previousCount = state.mapLocations.length
          state.mapLocations = deduplicate([...state.mapLocations, ...transfer.matched])
          const addedCount = state.mapLocations.length - previousCount
          const unmatchedMessage = transfer.unmatched.length
            ? ` ${transfer.unmatched.length} selected cell${transfer.unmatched.length === 1 ? " does" : "s do"} not yet have a matching wiki map location.`
            : ""
          state.mapPluginMessage = `${plugin.name}: added ${addedCount} map location${addedCount === 1 ? "" : "s"} from ${selectedCount} selected cell${selectedCount === 1 ? "" : "s"}.${unmatchedMessage}`
          state.mapPluginError = false
          renderForm(root, state, options)
        },
      })
    } catch (error) {
      state.mapPluginMessage =
        error instanceof Error ? error.message : "The plugin file could not be parsed."
      state.mapPluginError = true
      rerender()
    }
  })

  return wrapper
}

function blankPluginParserState(): PluginParserState {
  return {
    downloadUrl: "",
    file: null,
    fileName: "",
    cells: [],
    nexus: null,
  }
}

function nexusModId(value: string): string {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" && url.protocol !== "http:") return ""
    if (!/(?:^|\.)nexusmods\.com$/iu.test(url.hostname)) return ""
    return url.pathname.match(/^\/morrowind\/mods\/(\d+)(?:\/|$)/iu)?.[1] ?? ""
  } catch {
    return ""
  }
}

function plainNexusDescription(value: string): string {
  if (!value) return ""
  const document = new DOMParser().parseFromString(value, "text/html")
  return (document.body.textContent ?? "").replace(/\s+/gu, " ").trim().slice(0, 1_000)
}

async function fetchNexusMetadata(downloadUrl: string): Promise<NexusModMetadata | null> {
  if (!nexusModId(downloadUrl)) return null
  const endpoint = new URL(NEXUS_METADATA_ENDPOINT)
  endpoint.searchParams.set("url", downloadUrl)
  let response: Response
  try {
    response = await fetch(endpoint, {
      headers: { Accept: "application/json" },
    })
  } catch {
    throw new Error("The Nexus metadata service could not be reached.")
  }
  let result: any = null
  try {
    result = await response.json()
  } catch {
    /* public error below */
  }
  if (!response.ok || result?.ok !== true || !isRecord(result.mod)) {
    if (response.status === 404 && result?.error === "Not found.") {
      throw new Error(
        "The deployed submission service does not yet expose the Nexus lookup endpoint.",
      )
    }
    throw new Error(
      typeof result?.error === "string" ? result.error : "Nexus Mods metadata could not be loaded.",
    )
  }
  return {
    name: stringValue(result.mod.name).trim().slice(0, 200),
    author: stringValue(result.mod.author).trim().slice(0, 200),
    description: plainNexusDescription(stringValue(result.mod.description)),
    pictureUrl: stringValue(result.mod.pictureUrl).trim().slice(0, 2_000),
  }
}

function selectedParserCells(state: PluginParserState): ParsedTes3Cell[] {
  return state.cells.filter((cell) => cell.selected)
}

function parserLocationTransfer(
  state: PluginParserState,
  options: ContributionOptions,
): { matched: string[]; unmatched: string[] } {
  return matchSelectedTes3CellsToLocations(state.cells, options.mapLocations)
}

function parserTitle(state: PluginParserState): string {
  return (
    state.nexus?.name ||
    state.fileName.replace(/\.(?:esp|esm)$/iu, "").trim() ||
    "Parsed Morrowind plugin"
  )
}

function parsedPluginMarkdown(state: PluginParserState): string {
  const selected = selectedParserCells(state)
  const frontmatter: Record<string, unknown> = {
    title: parserTitle(state),
    authors: state.nexus?.author ? [state.nexus.author] : [],
    url: state.downloadUrl.trim(),
    categories: ["Unknown"],
    map_enabled: selected.length > 0,
    map_locations: selected.map((cell) => cell.name),
    draft: false,
    events: [],
  }
  if (state.nexus?.description) frontmatter.description = state.nexus.description
  if (state.nexus?.pictureUrl) frontmatter.picture_url = state.nexus.pictureUrl
  return serializeWikiMarkdown(
    frontmatter,
    state.nexus?.description ? `${state.nexus.description}\n` : "",
  )
}

function parserDownloadFilename(state: PluginParserState): string {
  return `${slugifyWikiFilename(parserTitle(state)) || "parsed-plugin"}.md`
}

function renderPluginUpload(
  root: HTMLElement,
  options: ContributionOptions,
  state = blankPluginParserState(),
  message = "",
) {
  const form = create("form", "contribution-form") as HTMLFormElement
  form.noValidate = true
  const details = fieldset("Plugin source")
  const downloadUrl = textInput(
    state.downloadUrl,
    (value) => {
      state.downloadUrl = value
    },
    {
      required: true,
      maxLength: 2_000,
      type: "url",
      placeholder: "https://www.nexusmods.com/morrowind/mods/…",
    },
  )
  details.append(
    field(
      "Download URL",
      downloadUrl,
      "Required. Nexus Mods links automatically provide the mod name, author, description, and picture URL.",
    ),
  )
  const file = document.createElement("input")
  file.type = "file"
  file.accept = ".esp,.esm"
  file.required = true
  file.addEventListener("change", () => {
    state.file = file.files?.[0] ?? null
    state.fileName = state.file?.name ?? ""
  })
  details.append(
    field(
      "Plugin file",
      file,
      `Choose one ESP or ESM file up to ${MAX_TES3_PLUGIN_BYTES / (1024 * 1024)} MiB. It is parsed locally and is never uploaded.`,
    ),
  )
  const status = create("p", message ? "contribution-error" : "contribution-help", message)
  status.setAttribute("role", "status")
  if (!message) status.textContent = "No plugin data leaves your browser."
  const actions = create("div", "contribution-actions")
  const back = makeButton("Back to choices", () => renderChoices(root, options))
  const parse = makeButton(
    "Parse plugin file",
    () => {},
    "contribution-button contribution-button-primary",
  )
  parse.type = "submit"
  actions.append(back, parse)
  form.append(details, status, actions)
  form.addEventListener("submit", async (event) => {
    event.preventDefault()
    state.downloadUrl = state.downloadUrl.trim()
    if (!/^https?:\/\/[^\s]+$/iu.test(state.downloadUrl)) {
      renderPluginUpload(root, options, state, "Enter a complete HTTP(S) download URL.")
      return
    }
    if (!state.file || !/\.(?:esp|esm)$/iu.test(state.file.name)) {
      renderPluginUpload(root, options, state, "Choose a plugin file ending in .esp or .esm.")
      return
    }
    if (state.file.size > MAX_TES3_PLUGIN_BYTES) {
      renderPluginUpload(
        root,
        options,
        state,
        `The plugin file must be no larger than ${MAX_TES3_PLUGIN_BYTES / (1024 * 1024)} MiB.`,
      )
      return
    }
    parse.disabled = true
    parse.textContent = "Parsing…"
    status.className = "wiki-contribution-loading"
    status.textContent = "Reading CELL records locally…"
    try {
      state.cells = parseTes3Plugin(await state.file.arrayBuffer())
      state.nexus = null
      if (nexusModId(state.downloadUrl)) {
        status.textContent = "Loading Nexus Mods metadata…"
        try {
          state.nexus = await fetchNexusMetadata(state.downloadUrl)
        } catch {
          // Nexus enrichment is optional; the locally parsed plugin remains fully usable.
        }
      }
      renderPluginCells(root, options, state)
    } catch (error) {
      renderPluginUpload(
        root,
        options,
        state,
        error instanceof Error ? error.message : "The plugin file could not be parsed.",
      )
    }
  })
  root.replaceChildren(intro(), create("h2", "", "Parse plugin file"), form)
}

function renderPluginCells(
  root: HTMLElement,
  options: ContributionOptions,
  state: PluginParserState,
  formActions?: {
    backLabel: string
    onBack: () => void
    continueLabel: string
    onContinue: () => void
  },
) {
  const section = create("section", "contribution-parser")
  section.append(
    create("h2", "", "Choose edited cells"),
    create(
      "p",
      "contribution-help",
      `${state.fileName}: ${state.cells.length} unique CELL record${state.cells.length === 1 ? "" : "s"}. Cells with no modified references start unchecked.`,
    ),
  )
  if (state.nexus) {
    section.append(
      create(
        "p",
        "contribution-notice",
        `Nexus Mods metadata loaded for ${state.nexus.name || "this mod"}.`,
      ),
    )
  }
  const list = create("div", "contribution-cell-list")
  if (state.cells.length === 0) {
    list.append(create("p", "contribution-help", "This plugin does not contain any CELL records."))
  }
  const wikiLocations = new Set(
    options.mapLocations.map((location) => location.toLocaleLowerCase("en-US")),
  )
  for (const cell of state.cells) {
    const isOnWiki = wikiLocations.has(cell.name.toLocaleLowerCase("en-US"))
    if (!isOnWiki) cell.selected = false
    const row = document.createElement("label")
    row.className = "contribution-cell-row"
    const checkbox = document.createElement("input")
    checkbox.type = "checkbox"
    checkbox.checked = cell.selected
    checkbox.disabled = !isOnWiki
    if (!isOnWiki) {
      const unavailableMessage = "This location is not on the wiki yet and cannot be selected."
      checkbox.title = unavailableMessage
      row.title = unavailableMessage
    }
    checkbox.addEventListener("change", () => {
      cell.selected = checkbox.checked
    })
    const content = create("span", "contribution-cell-content")
    content.append(create("strong", "", cell.displayName))
    const locationKind = cell.interior
      ? "Interior"
      : `Exterior (${cell.grid?.x ?? 0}, ${cell.grid?.y ?? 0})`
    const regionDetail =
      cell.region && !cell.displayName.startsWith(`${cell.region} (`) ? ` · ${cell.region}` : ""
    content.append(
      create(
        "span",
        "contribution-cell-meta",
        `${cell.changeType} · ${cell.modifiedReferences} modified reference${cell.modifiedReferences === 1 ? "" : "s"} · ${locationKind}${regionDetail}`,
      ),
    )
    appendChildren(row, checkbox, content)
    list.append(row)
  }
  const actions = create("div", "contribution-actions")
  actions.append(
    makeButton(
      formActions?.backLabel ?? "Choose another file",
      formActions?.onBack ?? (() => renderPluginUpload(root, options, state)),
    ),
    makeButton(
      formActions?.continueLabel ?? "Continue",
      formActions?.onContinue ?? (() => renderPluginDestination(root, options, state)),
      "contribution-button contribution-button-primary",
    ),
  )
  section.append(list, actions)
  root.replaceChildren(intro(), section)
}

function renderPluginDestination(
  root: HTMLElement,
  options: ContributionOptions,
  state: PluginParserState,
) {
  const selected = selectedParserCells(state)
  const transfer = parserLocationTransfer(state, options)
  const section = create("section", "contribution-parser")
  section.append(
    create("h2", "", "Use parsed plugin data"),
    create(
      "p",
      "contribution-help",
      `${selected.length} selected cell${selected.length === 1 ? "" : "s"}; ${transfer.matched.length} match existing wiki map locations.`,
    ),
  )
  if (transfer.unmatched.length) {
    section.append(
      create(
        "p",
        "contribution-stale-notice",
        `${transfer.unmatched.length} selected cell${transfer.unmatched.length === 1 ? " does" : "s do"} not yet have a wiki map location. The downloaded file keeps them; a moderated submission lists them in maintainer notes but can only preselect existing map locations.`,
      ),
    )
  }
  const choices = create("div", "contribution-choices")
  const submit = create("button", "contribution-choice") as HTMLButtonElement
  submit.type = "button"
  appendChildren(
    submit,
    create("strong", "", "Submit a new mod page"),
    document.createTextNode(
      "Open the regular contribution form with metadata and locations filled in.",
    ),
  )
  submit.addEventListener("click", () => {
    const contribution = blankState("new-mod")
    contribution.title = parserTitle(state)
    contribution.slug = slugifyWikiFilename(contribution.title)
    contribution.url = state.downloadUrl
    contribution.description = state.nexus?.description ?? ""
    contribution.pictureUrl = state.nexus?.pictureUrl ?? ""
    contribution.authors = state.nexus?.author ? [state.nexus.author] : [""]
    contribution.category = options.categories.includes("Unknown") ? "Unknown" : ""
    contribution.mapLocations = transfer.matched
    contribution.mapEnabled = transfer.matched.length > 0
    contribution.article = contribution.description ? `${contribution.description}\n` : ""
    if (transfer.unmatched.length) {
      contribution.notes = `Selected plugin cells without existing wiki map locations: ${transfer.unmatched.join(", ")}`
    }
    renderForm(root, contribution, options)
  })
  const download = create("button", "contribution-choice") as HTMLButtonElement
  download.type = "button"
  appendChildren(
    download,
    create("strong", "", "Download Markdown file"),
    document.createTextNode("Download a draft containing every currently selected cell."),
  )
  download.addEventListener("click", () =>
    downloadTextFile(parsedPluginMarkdown(state), parserDownloadFilename(state)),
  )
  choices.append(submit, download)
  section.append(choices)
  const actions = create("div", "contribution-actions")
  actions.append(makeButton("Back to cells", () => renderPluginCells(root, options, state)))
  section.append(actions)
  root.replaceChildren(intro(), section)
}

function markdownEditor(state: ContributionState): HTMLElement {
  const wrapper = create("div", "contribution-field")
  wrapper.append(create("span", "contribution-label", "Article text"))
  const tabs = create("div", "contribution-tabs")
  const write = makeButton("Write", () => setMode(false))
  const previewButton = makeButton("Preview", () => setMode(true))
  write.setAttribute("role", "tab")
  previewButton.setAttribute("role", "tab")
  const textarea = document.createElement("textarea")
  textarea.className = "contribution-markdown"
  textarea.required = true
  textarea.value = state.article
  textarea.setAttribute("aria-label", "Article Markdown")
  textarea.addEventListener("input", () => {
    state.article = textarea.value
  })
  const preview = create("div", "contribution-preview")
  preview.hidden = true
  const setMode = (showPreview: boolean) => {
    textarea.hidden = showPreview
    preview.hidden = !showPreview
    write.setAttribute("aria-selected", String(!showPreview))
    previewButton.setAttribute("aria-selected", String(showPreview))
    if (showPreview) renderMarkdown(state.article, preview)
  }
  setMode(false)
  appendChildren(tabs, write, previewButton)
  appendChildren(wrapper, tabs, textarea, preview)
  return wrapper
}

function renderForm(
  root: HTMLElement,
  state: ContributionState,
  options: ContributionOptions,
  showErrors: string[] = [],
) {
  const rerender = () => renderForm(root, state, options)
  const form = create("form", "contribution-form") as HTMLFormElement
  form.noValidate = true
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    const errors = validateState(state, options)
    if (errors.length) {
      renderForm(root, state, options, errors)
      root.scrollIntoView({ behavior: "smooth", block: "start" })
      return
    }
    state.reviewPayload = buildPayload(state)
    renderReview(root, state, options)
  })
  if (showErrors.length) {
    const error = create("div", "contribution-error")
    error.setAttribute("role", "alert")
    error.append(create("strong", "", "Please correct the following:"))
    const list = document.createElement("ul")
    for (const message of showErrors) list.append(create("li", "", message))
    error.append(list)
    form.append(error)
  }
  if (state.kind === "edit-mod" || state.kind === "edit-location") {
    form.append(
      create(
        "p",
        "contribution-stale-notice",
        "This edit is based on the current main-branch source. It may be rejected if the page changes before a maintainer imports it.",
      ),
    )
    const locked = textInput(state.targetPath, () => {})
    locked.readOnly = true
    form.append(field("Locked repository path", locked))
  }

  const identity = fieldset("Contributor")
  identity.append(
    field(
      "Contributor name",
      textInput(
        state.contributorName,
        (value) => {
          state.contributorName = value
        },
        { required: true, maxLength: 100 },
      ),
    ),
  )
  form.append(identity)

  if (state.kind === "new-mod" || state.kind === "edit-mod") {
    const details = fieldset("Mod page")
    const title = textInput(
      state.title,
      (value) => {
        state.title = value
        if (state.kind === "new-mod" && !state.slugTouched) {
          state.slug = slugifyWikiFilename(value)
          slugInput.value = state.slug
        }
      },
      { required: true, maxLength: 200 },
    )
    const slugInput = textInput(
      state.slug,
      (value) => {
        state.slugTouched = true
        state.slug = value.toLocaleLowerCase("en-US")
        slugInput.value = state.slug
      },
      { required: true, maxLength: 120 },
    )
    details.append(field("Mod title", title))
    if (state.kind === "new-mod") {
      const filename = create("div", "contribution-filename")
      appendChildren(filename, slugInput, create("span", "", ".md"))
      details.append(
        field("Page filename", filename, "The final path will be wiki/content/mods/<filename>.md."),
      )
    }
    details.append(authorEditor(state, rerender))
    details.append(
      field(
        "Download URL",
        textInput(
          state.url,
          (value) => {
            state.url = value
          },
          { required: true, maxLength: 2_000, type: "url" },
        ),
        "Required. Nexus Mods links are enriched automatically when this flow starts from the plugin parser.",
      ),
    )
    const description = document.createElement("textarea")
    description.value = state.description
    description.maxLength = 1_000
    description.addEventListener("input", () => {
      state.description = description.value
    })
    details.append(
      field(
        "Description (optional)",
        description,
        "Nexus Mods descriptions are filled automatically by the plugin parser and remain editable.",
      ),
    )
    details.append(
      field(
        "Picture URL (optional)",
        textInput(
          state.pictureUrl,
          (value) => {
            state.pictureUrl = value
          },
          { maxLength: 2_000 },
        ),
      ),
    )
    details.append(
      field(
        "Showcase URL (optional)",
        textInput(
          state.showcaseUrl,
          (value) => {
            state.showcaseUrl = value
          },
          { maxLength: 2_000 },
        ),
      ),
    )
    const category = document.createElement("select")
    category.required = true
    category.append(new Option("Choose a category", ""))
    for (const value of options.categories)
      category.append(new Option(value, value, false, value === state.category))
    category.value = state.category
    category.addEventListener("change", () => {
      state.category = category.value
    })
    details.append(field("Category", category))
    details.append(
      field(
        "Events (optional)",
        eventSelect(state, options),
        "Hold Ctrl or Command to select multiple controlled events. Legacy values are available only for this existing page.",
      ),
    )
    const mapToggle = document.createElement("input")
    mapToggle.type = "checkbox"
    mapToggle.checked = state.mapEnabled
    mapToggle.addEventListener("change", () => {
      state.mapEnabled = mapToggle.checked
      if (!state.mapEnabled) {
        state.mapLocations = []
        state.mapPluginMessage = ""
        state.mapPluginError = false
      }
      rerender()
    })
    const mapLabel = document.createElement("label")
    mapLabel.className = "contribution-inline"
    appendChildren(
      mapLabel,
      mapToggle,
      document.createTextNode("Include this mod on the TES3 Mod Map"),
    )
    details.append(mapLabel)
    if (state.mapEnabled)
      details.append(
        field(
          "Map locations",
          mapLocationEditor(root, state, options, rerender),
          "Search and select one or more controlled locations, or prepopulate them from a plugin file.",
        ),
      )
    form.append(details)
  } else {
    const details = fieldset(
      state.kind === "new-location" ? "Map-location proposal" : "Map location",
    )
    const cell = textInput(
      state.cell,
      (value) => {
        state.cell = value
        if (state.kind === "new-location" && !state.slugTouched) {
          state.slug = slugifyWikiFilename(value)
          slugInput.value = state.slug
        }
      },
      { required: true, maxLength: 300 },
    )
    const slugInput = textInput(
      state.slug,
      (value) => {
        state.slugTouched = true
        state.slug = value.toLocaleLowerCase("en-US")
        slugInput.value = state.slug
      },
      { required: true, maxLength: 120 },
    )
    details.append(field("Cell name", cell))
    if (state.kind === "new-location") {
      const filename = create("div", "contribution-filename")
      appendChildren(filename, slugInput, create("span", "", ".md"))
      details.append(
        field(
          "Suggested filename",
          filename,
          "This is a suggestion only. A maintainer chooses the final folder and path.",
        ),
      )
    }
    details.append(
      field(
        "Region (optional)",
        textInput(
          state.region,
          (value) => {
            state.region = value
          },
          { maxLength: 200 },
        ),
      ),
    )
    const coordinates = create("div", "contribution-coordinates")
    coordinates.append(
      field(
        "X coordinate",
        textInput(
          state.x,
          (value) => {
            state.x = value
          },
          { required: true },
        ),
      ),
      field(
        "Y coordinate",
        textInput(
          state.y,
          (value) => {
            state.y = value
          },
          { required: true },
        ),
      ),
    )
    details.append(
      coordinates,
      create(
        "p",
        "contribution-help",
        "Enter the TES3 world coordinates for the location entrance.",
      ),
    )
    details.append(
      field(
        "UESP URL (optional)",
        textInput(
          state.uespUrl,
          (value) => {
            state.uespUrl = value
          },
          { maxLength: 2_000 },
        ),
      ),
    )
    details.append(entranceEditor(state, rerender))
    form.append(details)
  }

  const article = fieldset("Article")
  article.append(markdownEditor(state))
  form.append(article)
  const maintainers = fieldset("Maintainer notes")
  const notes = document.createElement("textarea")
  notes.value = state.notes
  notes.maxLength = 5_000
  notes.addEventListener("input", () => {
    state.notes = notes.value
  })
  maintainers.append(field("Notes for maintainers (optional)", notes))
  form.append(maintainers)
  const website = textInput(state.website, (value) => {
    state.website = value
  })
  website.name = "website"
  website.autocomplete = "off"
  website.tabIndex = -1
  const honeypot = field("Website", website)
  honeypot.classList.add("contribution-honeypot")
  form.append(honeypot, notice())
  const actions = create("div", "contribution-actions")
  if (state.kind === "new-mod" || state.kind === "new-location") {
    actions.append(makeButton("Back to choices", () => renderChoices(root, options)))
  }
  const review = makeButton(
    "Review submission",
    () => {},
    "contribution-button contribution-button-primary",
  )
  review.type = "submit"
  actions.append(review)
  form.append(actions)
  root.replaceChildren(intro(), create("h2", "", TYPE_LABELS[state.kind]), form)
}

function reviewDefinition(label: string, value: string): DocumentFragment {
  const fragment = document.createDocumentFragment()
  appendChildren(
    fragment as unknown as HTMLElement,
    create("dt", "", label),
    create("dd", "", value || "—"),
  )
  return fragment
}

function loadTurnstile(): Promise<void> {
  if ((window as any).turnstile) return Promise.resolve()
  if (turnstileLoader) return turnstileLoader
  turnstileLoader = new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
    script.async = true
    script.defer = true
    script.addEventListener("load", () => resolve(), { once: true })
    script.addEventListener(
      "error",
      () => reject(new Error("Human verification could not be loaded.")),
      { once: true },
    )
    document.head.append(script)
  })
  return turnstileLoader
}

function renderReview(root: HTMLElement, state: ContributionState, options: ContributionOptions) {
  const review = create("section", "contribution-review")
  review.append(create("h2", "", "Review your submission"))
  const details = document.createElement("dl")
  details.append(reviewDefinition("Submission type", TYPE_LABELS[state.kind]))
  details.append(reviewDefinition("Contributor name", state.contributorName))
  if (state.targetPath) details.append(reviewDefinition("Locked target path", state.targetPath))
  if (state.kind === "new-mod")
    details.append(reviewDefinition("Generated path", `wiki/content/mods/${state.slug}.md`))
  if (state.kind === "new-location")
    details.append(reviewDefinition("Suggested filename", `${state.slug}.md`))
  if (state.kind === "new-mod" || state.kind === "edit-mod") {
    details.append(
      reviewDefinition("Mod title", state.title),
      reviewDefinition("Authors", state.authors.join(", ")),
      reviewDefinition("Download URL", state.url),
      reviewDefinition("Description", state.description),
      reviewDefinition("Picture URL", state.pictureUrl),
      reviewDefinition("Showcase URL", state.showcaseUrl),
      reviewDefinition("Category", state.category),
      reviewDefinition("Events", state.events.join(", ")),
      reviewDefinition("TES3 Mod Map", state.mapEnabled ? "Included" : "Not included"),
      reviewDefinition("Map locations", state.mapLocations.join(", ")),
    )
  } else {
    details.append(
      reviewDefinition("Cell name", state.cell),
      reviewDefinition("Region", state.region),
      reviewDefinition("Coordinates", `${state.x}, ${state.y}`),
      reviewDefinition("UESP URL", state.uespUrl),
      reviewDefinition(
        "Additional entrances",
        state.entrances
          .map(
            (entrance) =>
              `${entrance.x}, ${entrance.y}${entrance.region ? ` (${entrance.region})` : ""}`,
          )
          .join("; "),
      ),
    )
  }
  details.append(reviewDefinition("Notes for maintainers", state.notes))
  review.append(details, create("h3", "", "Article preview"))
  const preview = create("div", "contribution-preview")
  renderMarkdown(state.article, preview)
  const source = create("pre", "contribution-source")
  source.textContent = String(state.reviewPayload?.generatedMarkdown ?? "")
  review.append(preview, create("h3", "", "Complete generated Markdown source"), source, notice())
  const reviewWebsite = textInput(state.website, (value) => {
    state.website = value
  })
  reviewWebsite.name = "website"
  reviewWebsite.autocomplete = "off"
  reviewWebsite.tabIndex = -1
  const reviewHoneypot = field("Website", reviewWebsite)
  reviewHoneypot.classList.add("contribution-honeypot")
  const turnstileHost = create("div", "contribution-turnstile")
  const submitError = create("p", "contribution-error")
  submitError.hidden = true
  submitError.setAttribute("role", "alert")
  const actions = create("div", "contribution-actions")
  const back = makeButton("Back to edit", () => {
    const turnstile = (window as any).turnstile
    if (turnstile && widgetId !== null) turnstile.remove(widgetId)
    renderForm(root, state, options)
  })
  const submit = makeButton(
    "Submit for review",
    () => submitReview(),
    "contribution-button contribution-button-primary",
  )
  submit.disabled = true
  const download = makeButton("Download Markdown File", () => downloadMarkdownFile(state))
  actions.append(back, download, submit)
  review.append(reviewHoneypot, turnstileHost, submitError, actions)
  root.replaceChildren(intro(), review)

  let token = ""
  let widgetId: string | number | null = null
  const resetTurnstile = () => {
    token = ""
    submit.disabled = true
    const turnstile = (window as any).turnstile
    if (turnstile && widgetId !== null) turnstile.reset(widgetId)
  }
  const showSubmitError = (message: string) => {
    submitError.textContent = message
    submitError.hidden = false
  }
  const submitReview = async () => {
    if (!token || submit.disabled || !state.reviewPayload) return
    submit.disabled = true
    submit.textContent = "Submitting…"
    submitError.hidden = true
    const websiteInput = root.querySelector<HTMLInputElement>('input[name="website"]')
    try {
      const response = await fetch(WORKER_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turnstileToken: token,
          startedAt: state.startedAt,
          website: websiteInput?.value ?? "",
          payload: state.reviewPayload,
        }),
      })
      let result: any = null
      try {
        result = await response.json()
      } catch {
        /* generic error below */
      }
      if (!response.ok || result?.ok !== true || !Number.isInteger(result.submissionNumber)) {
        throw new Error(
          typeof result?.error === "string"
            ? result.error
            : "Submission could not be sent. Please try again.",
        )
      }
      const message = `Submission received. Thank you! Your submission number is #${result.submissionNumber}. A wiki maintainer will review it before any changes are published.`
      Object.assign(state, blankState(state.kind))
      root.replaceChildren(intro(), create("p", "contribution-success", message))
    } catch (error) {
      showSubmitError(
        error instanceof Error ? error.message : "Submission could not be sent. Please try again.",
      )
      submit.textContent = "Submit for review"
      resetTurnstile()
    }
  }
  loadTurnstile()
    .then(() => {
      if (!document.documentElement.contains(turnstileHost)) return
      widgetId = (window as any).turnstile.render(turnstileHost, {
        sitekey: TURNSTILE_SITE_KEY,
        action: "wiki_contribution",
        callback: (value: string) => {
          token = value
          submit.disabled = false
        },
        "expired-callback": resetTurnstile,
        "error-callback": () => {
          resetTurnstile()
          showSubmitError("Human verification could not be completed. Please try again.")
        },
      })
    })
    .catch((error) =>
      showSubmitError(
        error instanceof Error ? error.message : "Human verification could not be loaded.",
      ),
    )
}

function renderChoices(root: HTMLElement, options: ContributionOptions) {
  const choices = create("div", "contribution-choices")
  const mod = create("button", "contribution-choice") as HTMLButtonElement
  mod.type = "button"
  appendChildren(
    mod,
    create("strong", "", "Add a new mod page"),
    document.createTextNode("Propose a structured mod article for maintainer review."),
  )
  mod.addEventListener("click", () => renderForm(root, blankState("new-mod"), options))
  const location = create("button", "contribution-choice") as HTMLButtonElement
  location.type = "button"
  appendChildren(
    location,
    create("strong", "", "Add a new map location"),
    document.createTextNode(
      "Propose location details and coordinates for manual maintainer placement.",
    ),
  )
  location.addEventListener("click", () => renderForm(root, blankState("new-location"), options))
  const parser = create("button", "contribution-choice") as HTMLButtonElement
  parser.type = "button"
  appendChildren(
    parser,
    create("strong", "", "Parse plugin file"),
    document.createTextNode(
      "Read an ESP or ESM locally, choose its edited cells, and pre-fill a mod page.",
    ),
  )
  parser.addEventListener("click", () => renderPluginUpload(root, options))
  choices.append(mod, location, parser)
  root.replaceChildren(intro(), choices, notice())
}

async function initializeContributionForm() {
  const root = document.querySelector<HTMLElement>("[data-wiki-contribution]")
  if (!root) return
  const editPath = new URL(window.location.href).searchParams.get("edit")
  const routeKey = editPath ?? ""
  if (root.dataset.initializedFor === routeKey) return
  root.dataset.initializedFor = routeKey
  try {
    const response = await fetch("/wiki/static/contribution-options.json", {
      cache: "no-store",
    })
    if (!response.ok) throw new Error("Contribution options could not be loaded.")
    const options = (await response.json()) as ContributionOptions
    if (
      options.schemaVersion !== 1 ||
      !Array.isArray(options.categories) ||
      !Array.isArray(options.events) ||
      !Array.isArray(options.mapLocations) ||
      !Array.isArray(options.modSlugs)
    ) {
      throw new Error("Contribution options are invalid.")
    }
    if (!editPath) {
      renderChoices(root, options)
      return
    }
    root.replaceChildren(
      intro(),
      create("p", "wiki-contribution-loading", "Loading the current wiki source…"),
    )
    const state = await loadEditState(editPath, options)
    renderForm(root, state, options)
  } catch (error) {
    root.replaceChildren(
      intro(),
      create(
        "p",
        "contribution-error",
        error instanceof Error ? error.message : "The contribution form could not be loaded.",
      ),
    )
  }
}

document.addEventListener("nav", initializeContributionForm)
