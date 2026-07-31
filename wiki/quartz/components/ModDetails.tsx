import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

const stringList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter(isNonEmptyString) : []

const ModDetails: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  if (!fileData.slug?.startsWith("mods/")) return null

  const frontmatter = fileData.frontmatter as Record<string, unknown> | undefined
  const authors = stringList(frontmatter?.authors)
  const categories = stringList(frontmatter?.categories)
  const downloadUrl = isNonEmptyString(frontmatter?.url) ? frontmatter.url : null
  const mapEnabled = frontmatter?.map_enabled === true
  const modId = fileData.slug.slice("mods/".length)

  return (
    <aside class="mod-details" aria-label="Mod details">
      {(authors.length > 0 || categories.length > 0) && (
        <dl>
          {authors.length > 0 && (
            <>
              <dt>{authors.length === 1 ? "Author" : "Authors"}</dt>
              <dd>{authors.join(", ")}</dd>
            </>
          )}
          {categories.length > 0 && (
            <>
              <dt>{categories.length === 1 ? "Category" : "Categories"}</dt>
              <dd>{categories.join(", ")}</dd>
            </>
          )}
        </dl>
      )}
      <div class="mod-details-links">
        {mapEnabled && <a href={`/map/?mod=${encodeURIComponent(modId)}`}>View on TES3 Mod Map</a>}
        {downloadUrl && (
          <a href={downloadUrl} class="external" target="_blank" rel="noopener noreferrer">
            Mod page
          </a>
        )}
      </div>
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

.mod-details dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: .25rem .8rem;
  margin: 0 0 .65rem;
}

.mod-details dt {
  color: var(--gray);
  font-family: var(--headerFont);
  font-size: .72rem;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.mod-details dd {
  margin: 0;
}

.mod-details-links {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem 1rem;
  font-weight: 600;
}

@media (max-width: 520px) {
  .mod-details dl { grid-template-columns: 1fr; gap: .1rem; }
  .mod-details dd + dt { margin-top: .5rem; }
}
`

export default (() => ModDetails) satisfies QuartzComponentConstructor
