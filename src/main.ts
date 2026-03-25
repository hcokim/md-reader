import './style.css'
import { initMarkdown } from './markdown.ts'
import { initDropzone } from './dropzone.ts'
import { initControls } from './controls.ts'
import { restoreSettings } from './themes.ts'

const { theme, width, colorMode, cleanup: cleanupTheme } = restoreSettings()
const markdownReady = initMarkdown()
const cleanupDropzone = initDropzone(markdownReady)
const cleanupControls = initControls(theme, width, colorMode)

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cleanupDropzone()
    cleanupControls()
    cleanupTheme()
  })
}
