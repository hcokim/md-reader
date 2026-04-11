const THEME_KEY = 'md-reader-theme'
const WIDTH_KEY = 'md-reader-width'
const COLOR_MODE_KEY = 'md-reader-color-mode'

/** Matches inline boot snippet in index.html — removed once bundled JS restores settings. */
const THEME_BOOT_CLASS = 'mdr-boot-dark'

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
  document.documentElement.classList.remove(THEME_BOOT_CLASS)
  document.documentElement.style.removeProperty('--mdr-boot-bg')

  const theme = getTheme()
  const width = getWidth()
  const colorMode = getColorMode()
  document.body.setAttribute('data-theme', theme)
  document.body.setAttribute('data-width', width)
  applyResolvedColorMode(colorMode)

  const handleSystemColorChange = () => {
    if (getColorMode() === 'auto') {
      applyResolvedColorMode('auto')
    }
  }

  darkMq.addEventListener('change', handleSystemColorChange)

  return {
    theme,
    width,
    colorMode,
    cleanup: () => {
      darkMq.removeEventListener('change', handleSystemColorChange)
    },
  }
}
