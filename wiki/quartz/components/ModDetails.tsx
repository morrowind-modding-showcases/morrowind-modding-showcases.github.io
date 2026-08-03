import modderRegistry from "../../../assets/data/modders.json"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

type Modder = {
  id: string
  name: string
  aliases?: string[]
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter(isNonEmptyString).map((value) => value.trim()) : []

const identityKey = (value: string): string =>
  value.normalize("NFKD").toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "")

const profilesByName = new Map<string, Modder>()
for (const profile of modderRegistry.modders as Modder[]) {
  for (const name of [profile.name, ...(profile.aliases ?? [])]) {
    profilesByName.set(identityKey(name), profile)
  }
}

const eventProfileUrl = (author: string, events: string[]): string | null => {
  const profile = profilesByName.get(identityKey(author))
  if (!profile) return null
  for (const event of events) {
    const normalizedEvent = event.toLocaleLowerCase("en-US")
    if (normalizedEvent.includes("modathon")) return `/modathon/modder/${encodeURIComponent(profile.id)}`
    if (normalizedEvent.includes("modjam")) return `/modjam/modder/${encodeURIComponent(profile.id)}`
    if (normalizedEvent.includes("madness")) {
      return `/madness/modder?name=${encodeURIComponent(profile.name)}`
    }
  }
  return null
}

const ModDetails: QuartzComponent = ({ fileData, allFiles }: QuartzComponentProps) => {
  if (!fileData.slug?.startsWith("mods/")) return null

  const frontmatter = fileData.frontmatter as Record<string, unknown> | undefined
  const authors = stringList(frontmatter?.authors)
  const categories = stringList(frontmatter?.categories)
  const events = stringList(frontmatter?.events)
  const locationKeys = new Set(stringList(frontmatter?.map_locations).map(identityKey))
  const locations = allFiles
    .filter((file) => {
      if (!file.slug?.startsWith("locations/")) return false
      const data = file.frontmatter as Record<string, unknown> | undefined
      return [data?.title, data?.cell].some(
        (value) => isNonEmptyString(value) && locationKeys.has(identityKey(value)),
      )
    })
    .sort((left, right) => String(left.frontmatter?.title).localeCompare(String(right.frontmatter?.title)))
  const downloadUrl = isNonEmptyString(frontmatter?.url) ? frontmatter.url : null
  const pictureUrl = isNonEmptyString(frontmatter?.picture_url) ? frontmatter.picture_url : null
  const showcaseUrl = isNonEmptyString(frontmatter?.showcase_url) ? frontmatter.showcase_url : null
  const mapEnabled = frontmatter?.map_enabled === true
  const modId = fileData.slug.slice("mods/".length)
  const hasLinks = mapEnabled || downloadUrl !== null || showcaseUrl !== null

  return (
    <aside class="mod-details" aria-label="Mod details">
      {pictureUrl && (
        <a
          class="mod-details-picture"
          href={downloadUrl ?? pictureUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src={pictureUrl}
            alt={`Nexus Mods image for ${String(frontmatter?.title ?? "this mod")}`}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        </a>
      )}
      <div class="mod-details-copy">
        {(authors.length > 0 || categories.length > 0 || events.length > 0 || locations.length > 0 || hasLinks) && (
          <dl>
            {authors.length > 0 && (
              <>
                <dt>{authors.length === 1 ? "Author" : "Authors"}</dt>
                <dd>
                  {authors.map((author, index) => {
                    const profileUrl = eventProfileUrl(author, events)
                    return (
                      <>
                        {index > 0 && ", "}
                        {profileUrl ? (
                          <a href={profileUrl} class="external" target="_blank" rel="noopener noreferrer">
                            {author}
                          </a>
                        ) : author}
                      </>
                    )
                  })}
                </dd>
              </>
            )}
            {events.length > 0 && (
              <>
                <dt>{events.length === 1 ? "Event" : "Events"}</dt>
                <dd>{events.join(", ")}</dd>
              </>
            )}
            {categories.length > 0 && (
              <>
                <dt>{categories.length === 1 ? "Category" : "Categories"}</dt>
                <dd>{categories.join(", ")}</dd>
              </>
            )}
            {locations.length > 0 && (
              <>
                <dt>{locations.length === 1 ? "Location" : "Locations"}</dt>
                <dd>
                  {locations.map((location, index) => (
                    <>
                      {index > 0 && ", "}
                      <a href={`/wiki/${location.slug}`}>{location.frontmatter?.title}</a>
                    </>
                  ))}
                </dd>
              </>
            )}
            {hasLinks && (
              <>
                <dt>Links</dt>
                <dd class="mod-details-links">
                  {mapEnabled && (
                    <a
                      href={`/map/?mod=${encodeURIComponent(modId)}`}
                      aria-label="View on TES3 Mod Map"
                      title="TES3 Mod Map"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24">
                        <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
                        <path d="M9 3v15M15 6v15" />
                      </svg>
                    </a>
                  )}
                  {downloadUrl && (
                    <a
                      href={downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="View on Nexus Mods"
                      title="Nexus Mods"
                    >
                      <img src="/assets/images/resources/nexus.webp" alt="" />
                    </a>
                  )}
                  {showcaseUrl && (
                    <a
                      href={showcaseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Watch the mod showcase on YouTube"
                      title="YouTube showcase"
                    >
                      <img src="/assets/images/resources/youtube.webp" alt="" />
                    </a>
                  )}
                </dd>
              </>
            )}
          </dl>
        )}
      </div>
    </aside>
  )
}

ModDetails.css = `
.mod-details {
  box-sizing: border-box;
  float: right;
  width: min(19rem, 42%);
  margin: .35rem 0 1.35rem 1.4rem;
  padding: .65rem;
  background: var(--highlight);
  border: 1px solid var(--lightgray);
  border-radius: 3px;
}

.mod-details dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: .35rem .7rem;
  margin: 0;
}

.mod-details dt {
  color: var(--gray);
  font-family: var(--bodyFont);
  font-size: .78rem;
  font-weight: 700;
  letter-spacing: .045em;
  text-transform: uppercase;
}

.mod-details dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.mod-details-links {
  display: flex;
  align-items: center;
  gap: .55rem;
}

.mod-details-links a {
  display: inline-flex;
  width: 1.7rem;
  height: 1.7rem;
  align-items: center;
  justify-content: center;
  color: var(--secondary);
  transition: opacity .15s ease, transform .15s ease;
}

.mod-details-links a:hover,
.mod-details-links a:focus-visible {
  opacity: .8;
  transform: translateY(-1px);
}

.mod-details-links img,
.mod-details-links svg {
  display: block;
  width: 1.5rem;
  height: 1.5rem;
  object-fit: contain;
}

.mod-details-links svg {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}

.mod-details-picture {
  display: block;
  overflow: hidden;
  margin-bottom: .75rem;
  border: 1px solid var(--lightgray);
  border-radius: 2px;
  background: var(--light);
}

.mod-details-picture img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 280px;
  object-fit: cover;
}

.center > article::after {
  display: block;
  clear: both;
  content: "";
}

@media (max-width: 800px) {
  .mod-details {
    float: none;
    width: 100%;
    margin: 1rem 0 1.5rem;
  }
}

@media (max-width: 520px) {
  .mod-details dl { grid-template-columns: 1fr; gap: .1rem; }
  .mod-details dd + dt { margin-top: .5rem; }
}
`

export default (() => ModDetails) satisfies QuartzComponentConstructor
