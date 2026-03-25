import { setTheme, setWidth, setColorMode, type Theme, type Width, type ColorMode } from './themes.ts'

export function initControls(initialTheme: Theme, initialWidth: Width, initialColorMode: ColorMode) {
  const toggle = document.getElementById('settings-toggle')!
  const panel = document.getElementById('settings-panel')!
  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement
  const widthSelect = document.getElementById('width-select') as HTMLSelectElement
  const colorModeSelect = document.getElementById('color-mode-select') as HTMLSelectElement

  themeSelect.value = initialTheme
  widthSelect.value = initialWidth
  colorModeSelect.value = initialColorMode

  const handleToggleClick = (e: MouseEvent) => {
    e.stopPropagation()
    const open = !panel.classList.contains('hidden')
    if (open) {
      panel.classList.add('hidden')
      toggle.classList.remove('active')
    } else {
      panel.classList.remove('hidden')
      toggle.classList.add('active')
    }
  }

  const handleDocumentClick = (e: MouseEvent) => {
    if (!panel.classList.contains('hidden') && !panel.contains(e.target as Node) && e.target !== toggle) {
      panel.classList.add('hidden')
      toggle.classList.remove('active')
    }
  }

  const handleThemeChange = () => {
    setTheme(themeSelect.value as Theme)
  }

  const handleWidthChange = () => {
    setWidth(widthSelect.value as Width)
  }

  const handleColorModeChange = () => {
    setColorMode(colorModeSelect.value as ColorMode)
  }

  toggle.addEventListener('click', handleToggleClick)
  document.addEventListener('click', handleDocumentClick)
  themeSelect.addEventListener('change', handleThemeChange)
  widthSelect.addEventListener('change', handleWidthChange)
  colorModeSelect.addEventListener('change', handleColorModeChange)

  return () => {
    toggle.removeEventListener('click', handleToggleClick)
    document.removeEventListener('click', handleDocumentClick)
    themeSelect.removeEventListener('change', handleThemeChange)
    widthSelect.removeEventListener('change', handleWidthChange)
    colorModeSelect.removeEventListener('change', handleColorModeChange)
  }
}
