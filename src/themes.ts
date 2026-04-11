import {
  THEME_BOOT_CLASS,
  THEME_DEFAULTS,
  THEME_STORAGE_KEYS as SK,
} from './theme-boot.ts'

export type Theme = 'github' | 'serif' | 'sans' | 'mono' | 'miranda'
export type Width = 'narrow' | 'medium' | 'wide'
export type ColorMode = 'light' | 'dark' | 'auto'

const darkMq = window.matchMedia('(prefers-color-scheme: dark)')

export function getTheme(): Theme {
  return (localStorage.getItem(SK.theme) as Theme) || THEME_DEFAULTS.theme
}

export function getWidth(): Width {
  return (localStorage.getItem(SK.width) as Width) || THEME_DEFAULTS.width
}

export function getColorMode(): ColorMode {
  return (localStorage.getItem(SK.colorMode) as ColorMode) || THEME_DEFAULTS.colorMode
}

function resolveColorMode(mode: ColorMode): 'light' | 'dark' {
  if (mode === 'auto') return darkMq.matches ? 'dark' : 'light'
  return mode
}

/** Match <html> to the page background so overscroll / rubber-band does not show white. */
function syncRootSurface() {
  const root = document.documentElement
  const bg = getComputedStyle(document.body).backgroundColor
  if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
    root.style.backgroundColor = bg
  } else {
    root.style.removeProperty('background-color')
  }
  const mode = document.body.getAttribute('data-color-mode')
  root.style.colorScheme = mode === 'dark' ? 'dark' : 'light'
}

function applyResolvedColorMode(mode: ColorMode) {
  document.body.setAttribute('data-color-mode', resolveColorMode(mode))
  syncRootSurface()
}

export function setTheme(theme: Theme) {
  localStorage.setItem(SK.theme, theme)
  document.body.setAttribute('data-theme', theme)
  syncRootSurface()
}

export function setWidth(width: Width) {
  localStorage.setItem(SK.width, width)
  document.body.setAttribute('data-width', width)
}

export function setColorMode(mode: ColorMode) {
  localStorage.setItem(SK.colorMode, mode)
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
