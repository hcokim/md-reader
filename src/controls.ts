import { setTheme, setWidth, type Theme, type Width } from './themes.ts'
import { openFilePicker } from './dropzone.ts'

export function initControls(initialTheme: Theme, initialWidth: Width) {
  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement
  const widthSelect = document.getElementById('width-select') as HTMLSelectElement
  const openBtn = document.getElementById('open-btn')!

  themeSelect.value = initialTheme
  widthSelect.value = initialWidth

  themeSelect.addEventListener('change', () => {
    setTheme(themeSelect.value as Theme)
  })

  widthSelect.addEventListener('change', () => {
    setWidth(widthSelect.value as Width)
  })

  openBtn.addEventListener('click', () => {
    openFilePicker()
  })
}
