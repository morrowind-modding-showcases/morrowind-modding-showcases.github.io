import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

const identityKey = (value: string): string =>
  value.normalize("NFKD").toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "")

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter(isNonEmptyString).map((item) => item.trim()) : []

const LocationDetails: QuartzComponent = ({ fileData, allFiles }: QuartzComponentProps) => {
  if (!fileData.slug?.startsWith("locations/")) return null
  const frontmatter = fileData.frontmatter as Record<string, unknown> | undefined
  const keys = new Set(
    [frontmatter?.title, frontmatter?.cell]
      .filter(isNonEmptyString)
      .map(identityKey),
  )
  const mods = allFiles
    .filter((file) => file.slug?.startsWith("mods/") && stringList(file.frontmatter?.map_locations)
      .some((location) => keys.has(identityKey(location))))
    .sort((left, right) => String(left.frontmatter?.title).localeCompare(String(right.frontmatter?.title)))
  const mapId = frontmatter?.map_id
  const cell = isNonEmptyString(frontmatter?.cell) ? frontmatter.cell : null
  const region = isNonEmptyString(frontmatter?.region) ? frontmatter.region : null
  const uespWiki = isNonEmptyString(frontmatter?.uesp_wiki) ? frontmatter.uesp_wiki : null
  const uespUrl = uespWiki
    ? `https://en.uesp.net/wiki/Morrowind:${encodeURI(uespWiki.replace(/ /g, "_"))}`
    : null

  return (
    <aside class="location-details" aria-label="Location details">
      <dl>
        {cell && <><dt>Cell</dt><dd>{cell}</dd></>}
        {region && <><dt>Region</dt><dd>{region}</dd></>}
        <dt>Coordinates</dt>
        <dd>{String(frontmatter?.x)}, {String(frontmatter?.y)}</dd>
        <dt>{mods.length === 1 ? "Mod" : "Mods"}</dt>
        <dd>
          {mods.length > 0
            ? mods.map((mod, index) => <>{index > 0 && ", "}<a href={`/wiki/${mod.slug}`}>{mod.frontmatter?.title}</a></>)
            : "No wiki mods currently affect this location."}
        </dd>
      </dl>
      <div class="location-details-links">
        {mapId !== undefined && <a href={`/map/?location=${encodeURIComponent(String(mapId))}`}>View on TES3 Mod Map</a>}
        {uespUrl && <a href={uespUrl} class="external" target="_blank" rel="noopener noreferrer">UESP</a>}
      </div>
    </aside>
  )
}

LocationDetails.css = `
.location-details {
  margin: 1rem 0 1.7rem;
  padding: .9rem 1rem;
  background: var(--highlight);
  border: 1px solid var(--lightgray);
  border-left: 3px solid var(--secondary);
  border-radius: 6px;
}
.location-details dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: .25rem .8rem;
  margin: 0 0 .65rem;
}
.location-details dt {
  color: var(--gray);
  font-family: var(--bodyFont);
  font-size: .78rem;
  font-weight: 700;
  letter-spacing: .045em;
  text-transform: uppercase;
}
.location-details dd { margin: 0; }
.location-details-links { display: flex; flex-wrap: wrap; gap: .5rem 1rem; font-weight: 600; }
@media (max-width: 520px) {
  .location-details dl { grid-template-columns: 1fr; gap: .1rem; }
  .location-details dd + dt { margin-top: .5rem; }
}
`

export default (() => LocationDetails) satisfies QuartzComponentConstructor
