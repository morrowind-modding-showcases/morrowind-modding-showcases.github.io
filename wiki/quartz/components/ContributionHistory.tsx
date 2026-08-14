// @ts-ignore
import contributionHistoryScript from "./scripts/contribution-history.inline";
import styles from "./styles/contribution-history.scss";
import {
  QuartzComponent,
  QuartzComponentConstructor,
  QuartzComponentProps,
} from "./types";

const ContributionHistory: QuartzComponent = ({
  fileData,
}: QuartzComponentProps) => {
  const slug = fileData.slug ?? "";
  if (slug !== "contributors" && slug !== "recent-changes") return null;
  return (
    <section
      class="wiki-contribution-history"
      data-contribution-view={
        slug === "contributors" ? "leaderboard" : "recent"
      }
    >
      <p class="contribution-history-loading" role="status">
        Loading contribution history…
      </p>
    </section>
  );
};

ContributionHistory.afterDOMLoaded = contributionHistoryScript;
ContributionHistory.css = styles;

export default (() => ContributionHistory) satisfies QuartzComponentConstructor;
