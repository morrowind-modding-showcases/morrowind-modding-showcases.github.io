import { QuartzComponent, QuartzComponentConstructor } from "./types"

const SiteNav: QuartzComponent = () => (
  <nav class="dem-wiki-nav" aria-label="Wiki navigation">
    <a href="/wiki/">Home</a>
    <a href="/wiki/mods/">Mods</a>
    <a href="/wiki/locations/">Locations</a>
    <a href="/wiki/categories/">Categories</a>
    <a href="/wiki/tags/">Tags</a>
    <a href="https://darkelfmodding.com/map/">TES3 Mod Map</a>
  </nav>
)

SiteNav.css = `
.dem-wiki-nav {
  display: flex;
  flex-wrap: wrap;
  gap: .4rem .75rem;
  margin: .75rem 0 1.1rem;
  padding-bottom: .8rem;
  border-bottom: 1px solid var(--lightgray);
  font-family: var(--bodyFont);
  font-size: .9rem;
  font-weight: 600;
  letter-spacing: .02em;
}

.dem-wiki-nav a {
  color: var(--darkgray);
  text-decoration: none;
}

.dem-wiki-nav a:hover,
.dem-wiki-nav a:focus-visible {
  color: var(--secondary);
}
`

export default (() => SiteNav) satisfies QuartzComponentConstructor
