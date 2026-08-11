// @ts-ignore
import contributionScript from "./scripts/contribution.inline";
import styles from "./styles/contribution.scss";
import {
  QuartzComponent,
  QuartzComponentConstructor,
  QuartzComponentProps,
} from "./types";
import { FullSlug, resolveRelative } from "../util/path";

const ContributionForm: QuartzComponent = ({
  fileData,
}: QuartzComponentProps) => {
  if (fileData.slug !== "contribute") return null;
  const howToContributeHref = resolveRelative(
    fileData.slug!,
    "resources/how-to-contribute" as FullSlug,
  );
  return (
    <section class="wiki-contribution" data-wiki-contribution>
      <p class="wiki-contribution-intro">
        Help expand the Morrowind Modding Showcases Wiki by submitting a new mod
        page or suggesting an edit to an existing mod. Submissions will be
        reviewed by wiki a maintainer prior to publication. If you are a new
        contributor, or need a refresher, check out{" "}
        <a href={howToContributeHref} class="internal">
          how to contribute
        </a>
        .
      </p>
      <p class="wiki-contribution-loading" role="status">
        Loading contribution options…
      </p>
    </section>
  );
};

ContributionForm.afterDOMLoaded = contributionScript;
ContributionForm.css = styles;

export default (() => ContributionForm) satisfies QuartzComponentConstructor;
