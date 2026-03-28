import './style.css'
import { initMarkdown } from './markdown.ts'
import { initDropzone } from './dropzone.ts'
import { initControls } from './controls.ts'
import { initPresent } from './present.ts'
import { initAnnotations } from './annotations.ts'
import { restoreSettings } from './themes.ts'

const { theme, width, colorMode, cleanup: cleanupTheme } = restoreSettings()
const markdownReady = initMarkdown()
const cleanupAnnotations = initAnnotations()
const cleanupDropzone = initDropzone(markdownReady)
const cleanupControls = initControls(theme, width, colorMode)
const cleanupPresent = initPresent()

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cleanupAnnotations()
    cleanupDropzone()
    cleanupControls()
    cleanupPresent()
    cleanupTheme()
  })
}
