import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

const config: QuartzConfig = {
  configuration: {
    pageTitle: "Morrowind Modding Showcases Wiki",
    pageTitleSuffix: "",
    enableSPA: true,
    enablePopovers: true,
    analytics: {
      provider: "google",
      tagId: "G-ZXQRFGBRVH",
    },
    locale: "en-US",
    baseUrl: "darkelfmodding.com/wiki",
    ignorePatterns: ["_meta", "**/_meta/**", ".obsidian", "**/.obsidian/**"],
    defaultDateType: "modified",
    theme: {
      fontOrigin: "googleFonts",
      cdnCaching: true,
      typography: {
        title: "Cinzel",
        header: "Cinzel",
        body: "EB Garamond",
        code: "IBM Plex Mono",
      },
      colors: {
        lightMode: {
          light: "#f5efe2",
          lightgray: "#ded2ba",
          gray: "#a59678",
          darkgray: "#51483a",
          dark: "#211c15",
          secondary: "#76551f",
          tertiary: "#9b6c31",
          highlight: "rgba(164, 117, 50, 0.16)",
          textHighlight: "rgba(217, 188, 122, 0.42)",
        },
        darkMode: {
          light: "#0d0b08",
          lightgray: "#2d2921",
          gray: "#786f5c",
          darkgray: "#d5c9ad",
          dark: "#f0e3c0",
          secondary: "#d9bc7a",
          tertiary: "#f0dca4",
          highlight: "rgba(217, 188, 122, 0.14)",
          textHighlight: "rgba(217, 188, 122, 0.34)",
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate({ priority: ["frontmatter", "git", "filesystem"] }),
      Plugin.SyntaxHighlighting({
        theme: { light: "github-light", dark: "github-dark" },
        keepBackground: false,
      }),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false }),
      Plugin.GitHubFlavoredMarkdown(),
      Plugin.TableOfContents(),
      Plugin.WikiLinkResolver(),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest" }),
      Plugin.ModLocationLinks(),
      Plugin.Description(),
      Plugin.Latex({ renderEngine: "katex" }),
    ],
    filters: [Plugin.RemoveDrafts()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.FolderPage(),
      Plugin.TagPage(),
      Plugin.ContentIndex({ enableSiteMap: true, enableRSS: true }),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.Favicon(),
      Plugin.NotFoundPage(),
    ],
  },
}

export default config
