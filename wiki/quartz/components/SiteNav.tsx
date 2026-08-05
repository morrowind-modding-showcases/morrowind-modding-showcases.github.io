import { h } from "preact"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

const SiteNav: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const slug = fileData.slug ?? ""

  return (
    <div class="dem-wiki-nav-row">
      <nav class="dem-wiki-nav" aria-label="Wiki navigation">
        <a href="/wiki/mods/" aria-current={slug.startsWith("mods") ? "page" : undefined}>
          Mods
        </a>
        <a
          href="/wiki/locations/"
          aria-current={slug.startsWith("locations") ? "page" : undefined}
        >
          Locations
        </a>
        <a href="/wiki/contribute/" aria-current={slug === "contribute" ? "page" : undefined}>
          Contribute
        </a>
      </nav>
      {h("mms-site-switcher", { current: "wiki" })}
    </div>
  )
}

SiteNav.css = `
.dem-wiki-nav-row {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: .75rem 1.25rem;
  padding-bottom: .85rem;
  border-bottom: 1px solid var(--lightgray);
}

.dem-wiki-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: .25rem 1.4rem;
}

.dem-wiki-nav a {
  display: inline-flex;
  min-height: 2.25rem;
  align-items: center;
  border-bottom: 2px solid transparent;
  color: var(--darkgray);
  font-family: var(--headerFont);
  font-size: .92rem;
  font-weight: 700;
  letter-spacing: .045em;
  text-decoration: none;
  transition: border-color .15s ease, color .15s ease;
}

.dem-wiki-nav a:hover,
.dem-wiki-nav a:focus-visible {
  border-bottom-color: var(--gray);
  color: var(--secondary);
}

.dem-wiki-nav a[aria-current="page"] {
  border-bottom-color: var(--secondary);
  color: var(--secondary);
}

@media (max-width: 520px) {
  .dem-wiki-nav-row {
    align-items: stretch;
    gap: .65rem;
  }

  .dem-wiki-nav {
    gap: .9rem;
  }

  .dem-wiki-nav a {
    font-size: .82rem;
  }
}
`

export default (() => SiteNav) satisfies QuartzComponentConstructor
