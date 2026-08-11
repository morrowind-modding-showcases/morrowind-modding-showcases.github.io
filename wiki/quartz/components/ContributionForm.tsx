// @ts-ignore
import contributionScript from "./scripts/contribution.inline"
import styles from "./styles/contribution.scss"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

const ContributionForm: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  if (fileData.slug !== "contribute") return null
  return (
    <section class="wiki-contribution" data-wiki-contribution>
      <p class="wiki-contribution-intro">
        Help expand the Morrowind Modding Showcases Wiki by submitting a new mod page or suggesting
        an edit to an existing mod. Submissions open public pull requests for
        maintainer review.
      </p>
      <p class="wiki-contribution-loading" role="status">
        Loading contribution options…
      </p>
    </section>
  )
}

ContributionForm.afterDOMLoaded = contributionScript
ContributionForm.css = styles

export default (() => ContributionForm) satisfies QuartzComponentConstructor
