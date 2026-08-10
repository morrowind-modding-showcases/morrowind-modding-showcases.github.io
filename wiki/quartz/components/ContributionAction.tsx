import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { FullSlug, resolveRelative } from "../util/path"

const validModSlug = /^mods\/[a-z0-9]+(?:-[a-z0-9]+)*$/
const validLocationSlug = /^locations\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/)*[a-z0-9]+(?:-[a-z0-9]+)*$/

const ContributionAction: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const slug = fileData.slug ?? ""
  const isModArticle = validModSlug.test(slug)
  const isLocationArticle =
    validLocationSlug.test(slug) && fileData.frontmatter?.map_id !== undefined
  if (!isModArticle && !isLocationArticle) return null
  const repositoryPath = `wiki/content/${slug}.md`
  const contributeHref = resolveRelative(fileData.slug!, "contribute" as FullSlug)
  return (
    <div class="wiki-edit-action">
      <a href={`${contributeHref}?edit=${encodeURIComponent(repositoryPath)}`}>Suggest an edit</a>
    </div>
  )
}

ContributionAction.css = `
.wiki-edit-action {
  margin: .45rem 0 1rem;
}
.wiki-edit-action a {
  display: inline-flex;
  min-height: 2.15rem;
  align-items: center;
  padding: 0 .8rem;
  border: 1px solid var(--lightgray);
  border-radius: 3px;
  background: var(--highlight);
  color: var(--secondary);
  font-family: var(--headerFont);
  font-size: .8rem;
  font-weight: 700;
  letter-spacing: .035em;
  text-decoration: none;
}
.wiki-edit-action a:hover,
.wiki-edit-action a:focus-visible {
  border-color: var(--secondary);
}
`

export default (() => ContributionAction) satisfies QuartzComponentConstructor
