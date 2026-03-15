const THEME_KEY = 'md-reader-theme'
const WIDTH_KEY = 'md-reader-width'

export type Theme = 'github' | 'serif' | 'sans' | 'mono'
export type Width = 'narrow' | 'medium' | 'wide'

export function getTheme(): Theme {
  return (localStorage.getItem(THEME_KEY) as Theme) || 'github'
}

export function getWidth(): Width {
  return (localStorage.getItem(WIDTH_KEY) as Width) || 'medium'
}

export function setTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme)
  document.body.setAttribute('data-theme', theme)
}

export function setWidth(width: Width) {
  localStorage.setItem(WIDTH_KEY, width)
  document.body.setAttribute('data-width', width)
}

export function restoreSettings() {
  const theme = getTheme()
  const width = getWidth()
  document.body.setAttribute('data-theme', theme)
  document.body.setAttribute('data-width', width)
  return { theme, width }
}
