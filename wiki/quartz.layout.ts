import { PageLayout, SharedLayout } from "./quartz/cfg";
import * as Component from "./quartz/components";

export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [],
  footer: Component.Footer({
    links: {
      "Main site": "https://darkelfmodding.com/",
      "TES3 Mod Map": "https://darkelfmodding.com/map/",
      GitHub:
        "https://github.com/morrowind-modding-showcases/morrowind-modding-showcases.github.io",
    },
  }),
};

export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.ConditionalRender({
      component: Component.Breadcrumbs(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ArticleTitle(),
    Component.ModDetails(),
    Component.ContentMeta(),
    Component.TagList(),
    Component.LocationDetails(),
  ],
  left: [
    Component.PageTitle(),
    Component.SiteNav(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        { Component: Component.Search(), grow: true },
        { Component: Component.Darkmode() },
        { Component: Component.ReaderMode() },
      ],
    }),
    Component.Explorer(),
  ],
  right: [
    Component.Graph(),
    Component.DesktopOnly(Component.TableOfContents()),
    Component.Backlinks(),
  ],
};

export const defaultListPageLayout: PageLayout = {
  beforeBody: [
    Component.Breadcrumbs(),
    Component.ArticleTitle(),
    Component.ConditionalRender({
      component: Component.LocationDetails(),
      condition: (page) =>
        page.fileData.slug?.startsWith("locations/") === true &&
        page.fileData.frontmatter?.map_id !== undefined,
    }),
    Component.ContentMeta(),
  ],
  left: [
    Component.PageTitle(),
    Component.SiteNav(),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        { Component: Component.Search(), grow: true },
        { Component: Component.Darkmode() },
      ],
    }),
    Component.Explorer(),
  ],
  right: [],
};
