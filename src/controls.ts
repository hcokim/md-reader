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

  // Toggle panel
  toggle.addEventListener('click', (e) => {
    e.stopPropagation()
    const open = !panel.classList.contains('hidden')
    if (open) {
      panel.classList.add('hidden')
      toggle.classList.remove('active')
    } else {
      panel.classList.remove('hidden')
      toggle.classList.add('active')
    }
  })

  // Close panel when clicking outside
  document.addEventListener('click', (e) => {
    if (!panel.classList.contains('hidden') && !panel.contains(e.target as Node) && e.target !== toggle) {
      panel.classList.add('hidden')
      toggle.classList.remove('active')
    }
  })

  themeSelect.addEventListener('change', () => {
    setTheme(themeSelect.value as Theme)
  })

  widthSelect.addEventListener('change', () => {
    setWidth(widthSelect.value as Width)
  })

  colorModeSelect.addEventListener('change', () => {
    setColorMode(colorModeSelect.value as ColorMode)
  })
}
