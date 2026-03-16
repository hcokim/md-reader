const THEME_KEY = 'md-reader-theme'
const WIDTH_KEY = 'md-reader-width'
const COLOR_MODE_KEY = 'md-reader-color-mode'

export type Theme = 'github' | 'serif' | 'sans' | 'mono'
export type Width = 'narrow' | 'medium' | 'wide'
export type ColorMode = 'light' | 'dark' | 'auto'

const darkMq = window.matchMedia('(prefers-color-scheme: dark)')

export function getTheme(): Theme {
  return (localStorage.getItem(THEME_KEY) as Theme) || 'github'
}

export function getWidth(): Width {
  return (localStorage.getItem(WIDTH_KEY) as Width) || 'medium'
}

export function getColorMode(): ColorMode {
  return (localStorage.getItem(COLOR_MODE_KEY) as ColorMode) || 'auto'
}

function resolveColorMode(mode: ColorMode): 'light' | 'dark' {
  if (mode === 'auto') return darkMq.matches ? 'dark' : 'light'
  return mode
}

function applyResolvedColorMode(mode: ColorMode) {
  document.body.setAttribute('data-color-mode', resolveColorMode(mode))
}

export function setTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme)
  document.body.setAttribute('data-theme', theme)
}

export function setWidth(width: Width) {
  localStorage.setItem(WIDTH_KEY, width)
  document.body.setAttribute('data-width', width)
}

export function setColorMode(mode: ColorMode) {
  localStorage.setItem(COLOR_MODE_KEY, mode)
  applyResolvedColorMode(mode)
}

export function restoreSettings() {
  const theme = getTheme()
  const width = getWidth()
  const colorMode = getColorMode()
  document.body.setAttribute('data-theme', theme)
  document.body.setAttribute('data-width', width)
  applyResolvedColorMode(colorMode)

  // Listen for system preference changes when in auto mode
  darkMq.addEventListener('change', () => {
    if (getColorMode() === 'auto') {
      applyResolvedColorMode('auto')
    }
  })

  return { theme, width, colorMode }
}
