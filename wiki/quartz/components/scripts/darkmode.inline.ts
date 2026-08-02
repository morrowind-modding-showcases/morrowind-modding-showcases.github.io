const userPref = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
const savedTheme = (() => {
  try {
    const value = localStorage.getItem("theme")
    return value === "light" || value === "dark" ? value : null
  } catch {
    return null
  }
})()
const currentTheme = savedTheme ?? userPref

const persistTheme = (theme: "light" | "dark") => {
  try {
    localStorage.setItem("theme", theme)
    localStorage.setItem("mmr-theme", theme === "dark" ? "night" : "day")
  } catch {
    // Theme persistence is optional when storage is blocked.
  }
}

document.documentElement.setAttribute("saved-theme", currentTheme)
persistTheme(currentTheme)

const emitThemeChangeEvent = (theme: "light" | "dark") => {
  const event: CustomEventMap["themechange"] = new CustomEvent("themechange", {
    detail: { theme },
  })
  document.dispatchEvent(event)
}

document.addEventListener("nav", () => {
  const switchTheme = () => {
    const newTheme =
      document.documentElement.getAttribute("saved-theme") === "dark" ? "light" : "dark"
    document.documentElement.setAttribute("saved-theme", newTheme)
    persistTheme(newTheme)
    emitThemeChangeEvent(newTheme)
  }

  const themeChange = (e: MediaQueryListEvent) => {
    const newTheme = e.matches ? "dark" : "light"
    document.documentElement.setAttribute("saved-theme", newTheme)
    persistTheme(newTheme)
    emitThemeChangeEvent(newTheme)
  }

  for (const darkmodeButton of document.getElementsByClassName("darkmode")) {
    darkmodeButton.addEventListener("click", switchTheme)
    window.addCleanup(() => darkmodeButton.removeEventListener("click", switchTheme))
  }

  // Listen for changes in prefers-color-scheme
  const colorSchemeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
  colorSchemeMediaQuery.addEventListener("change", themeChange)
  window.addCleanup(() => colorSchemeMediaQuery.removeEventListener("change", themeChange))
})
