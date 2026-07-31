import { pathToRoot } from "../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { classNames } from "../util/lang"
import { i18n } from "../i18n"

const PageTitle: QuartzComponent = ({ fileData, cfg, displayClass }: QuartzComponentProps) => {
  const title = cfg?.pageTitle ?? i18n(cfg.locale).propertyDefaults.title
  const baseDir = pathToRoot(fileData.slug!)
  return (
    <h2 class={classNames(displayClass, "page-title")}>
      <a href={baseDir} aria-label={title}>
        <img class="page-title-logo" src="/wiki/static/wiki-logo.webp" alt={title} />
      </a>
    </h2>
  )
}

PageTitle.css = `
.page-title {
  line-height: 0;
  margin: 0;
}

.page-title > a {
  display: inline-block;
}

.page-title-logo {
  display: block;
  width: min(100%, 14rem);
  height: auto;
}

@media (max-width: 800px) {
  .page-title-logo {
    width: 9rem;
  }
}
`

export default (() => PageTitle) satisfies QuartzComponentConstructor
