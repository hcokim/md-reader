import { render } from './markdown.ts'

const landing = document.getElementById('landing')!
const reader = document.getElementById('reader')!
const content = document.getElementById('content')!
const controls = document.getElementById('controls')!
const fileInput = document.getElementById('file-input') as HTMLInputElement
const openLink = document.getElementById('open-link')!

let markdownReady: Promise<void>

export function initDropzone(ready: Promise<void>) {
  markdownReady = ready

  // Click to open
  openLink.addEventListener('click', (e) => {
    e.preventDefault()
    fileInput.click()
  })

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (file) loadFile(file)
  })

  // Drag & drop on entire body
  document.body.addEventListener('dragover', (e) => {
    e.preventDefault()
    e.stopPropagation()
    document.body.classList.add('drag-over')
  })

  document.body.addEventListener('dragleave', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.target === document.body || e.target === landing) {
      document.body.classList.remove('drag-over')
    }
  })

  document.body.addEventListener('drop', (e) => {
    e.preventDefault()
    e.stopPropagation()
    document.body.classList.remove('drag-over')
    const file = e.dataTransfer?.files[0]
    if (file) loadFile(file)
  })
}

async function loadFile(file: File) {
  const text = await file.text()
  await markdownReady
  content.innerHTML = render(text)
  showReader(file.name)
}

function showReader(fileName: string) {
  landing.classList.add('hidden')
  reader.classList.remove('hidden')
  controls.classList.remove('hidden')
  document.title = fileName
}

export function openFilePicker() {
  fileInput.click()
}
