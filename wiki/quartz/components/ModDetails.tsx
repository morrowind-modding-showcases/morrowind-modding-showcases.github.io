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
  const mapEnabled = frontmatter?.map_enabled === true
  const modId = fileData.slug.slice("mods/".length)

  return (
    <aside class={`mod-details${pictureUrl ? " has-picture" : ""}`} aria-label="Mod details">
      <div class="mod-details-copy">
        {(authors.length > 0 || categories.length > 0 || events.length > 0 || locations.length > 0) && (
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
                        {profileUrl ? <a href={profileUrl}>{author}</a> : author}
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
          </dl>
        )}
        <div class="mod-details-links">
          {mapEnabled && <a href={`/map/?mod=${encodeURIComponent(modId)}`}>View on TES3 Mod Map</a>}
          {downloadUrl && (
            <a href={downloadUrl} class="external" target="_blank" rel="noopener noreferrer">
              Nexus
            </a>
          )}
        </div>
      </div>
      {pictureUrl && (
        <a class="mod-details-picture" href={downloadUrl ?? pictureUrl} target="_blank" rel="noopener noreferrer">
          <img src={pictureUrl} alt={`Nexus Mods image for ${String(frontmatter?.title ?? "this mod")}`} loading="lazy" decoding="async" />
        </a>
      )}
    </aside>
  )
}

ModDetails.css = `
.mod-details {
  margin: 1rem 0 1.7rem;
  padding: .9rem 1rem;
  background: var(--highlight);
  border: 1px solid var(--lightgray);
  border-left: 3px solid var(--secondary);
  border-radius: 6px;
}

.mod-details.has-picture {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(150px, 34%);
  gap: 1rem;
  align-items: start;
}

.mod-details dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: .25rem .8rem;
  margin: 0 0 .65rem;
}

.mod-details dt {
  color: var(--gray);
  font-family: var(--bodyFont);
  font-size: .78rem;
  font-weight: 700;
  letter-spacing: .045em;
  text-transform: uppercase;
}

.mod-details dd { margin: 0; }

.mod-details-links {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem 1rem;
  font-weight: 600;
}

.mod-details-picture {
  display: block;
  overflow: hidden;
  border: 1px solid var(--lightgray);
  border-radius: 4px;
  background: var(--light);
}

.mod-details-picture img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 240px;
  object-fit: cover;
}

@media (max-width: 640px) {
  .mod-details.has-picture { grid-template-columns: 1fr; }
  .mod-details-picture { grid-row: 1; }
}

@media (max-width: 520px) {
  .mod-details dl { grid-template-columns: 1fr; gap: .1rem; }
  .mod-details dd + dt { margin-top: .5rem; }
}
`

export default (() => ModDetails) satisfies QuartzComponentConstructor
