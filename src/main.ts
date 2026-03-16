import './style.css'
import { initMarkdown } from './markdown.ts'
import { initDropzone } from './dropzone.ts'
import { initControls } from './controls.ts'
import { restoreSettings } from './themes.ts'

const { theme, width, colorMode } = restoreSettings()
const markdownReady = initMarkdown()
initDropzone(markdownReady)
initControls(theme, width, colorMode)
