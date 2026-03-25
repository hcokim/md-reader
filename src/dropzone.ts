import { render } from './markdown.ts'

const landing = document.getElementById('landing')!
const reader = document.getElementById('reader')!
const content = document.getElementById('content')!
const fileSidebar = document.getElementById('file-sidebar')!
const fileList = document.getElementById('file-list')!
const sidebarToggle = document.getElementById('sidebar-toggle') as HTMLButtonElement
const settingsToggle = document.getElementById('settings-toggle')!
const fileInput = document.getElementById('file-input') as HTMLInputElement
const openLink = document.getElementById('open-link')!

type SessionFile = {
  id: string
  name: string
  text: string
}

const ACCEPTED_EXTENSIONS = ['.md', '.markdown', '.mdx', '.txt']

let markdownReady: Promise<void>
let sessionFiles: SessionFile[] = []
let activeFileId: string | null = null
let isSidebarCollapsed = false
let fileCounter = 0

export function initDropzone(ready: Promise<void>) {
  markdownReady = ready

  const handleOpenClick = (e: MouseEvent) => {
    e.preventDefault()
    fileInput.click()
  }

  const handleInputChange = () => {
    const files = Array.from(fileInput.files ?? [])
    if (files.length > 0) {
      void loadFiles(files)
    }
  }

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    document.body.classList.add('drag-over')
  }

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.target === document.body || e.target === landing) {
      document.body.classList.remove('drag-over')
    }
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    document.body.classList.remove('drag-over')
    const files = Array.from(e.dataTransfer?.files ?? []).filter(isReadableMarkdownFile)
    if (files.length > 0) {
      void loadFiles(files)
    }
  }

  const handleSidebarToggle = () => {
    toggleSidebar()
  }

  const handleShortcut = (e: KeyboardEvent) => {
    if (sessionFiles.length <= 1) return
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
    if (isTypingTarget(e.target)) return

    e.preventDefault()
    toggleSidebar()
  }

  openLink.addEventListener('click', handleOpenClick)
  fileInput.addEventListener('change', handleInputChange)
  document.body.addEventListener('dragover', handleDragOver)
  document.body.addEventListener('dragleave', handleDragLeave)
  document.body.addEventListener('drop', handleDrop)
  sidebarToggle.addEventListener('click', handleSidebarToggle)
  document.addEventListener('keydown', handleShortcut)

  return () => {
    openLink.removeEventListener('click', handleOpenClick)
    fileInput.removeEventListener('change', handleInputChange)
    document.body.removeEventListener('dragover', handleDragOver)
    document.body.removeEventListener('dragleave', handleDragLeave)
    document.body.removeEventListener('drop', handleDrop)
    sidebarToggle.removeEventListener('click', handleSidebarToggle)
    document.removeEventListener('keydown', handleShortcut)
  }
}

async function loadFiles(files: File[]) {
  const readableFiles = files.filter(isReadableMarkdownFile)
  if (readableFiles.length === 0) return

  await markdownReady

  const loadedFiles = await Promise.all(readableFiles.map(async (file) => ({
    id: buildFileId(),
    name: file.name,
    text: await file.text(),
  })))

  sessionFiles = [...sessionFiles, ...loadedFiles]

  if (sessionFiles.length > 1 && activeFileId !== null) {
    isSidebarCollapsed = false
  }

  renderSidebar()
  setActiveFile(loadedFiles[0].id)
  fileInput.value = ''
}

function isReadableMarkdownFile(file: File) {
  const lowerName = file.name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
}

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null
  if (!element) return false
  const tagName = element.tagName
  return element.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT'
}

function buildFileId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  fileCounter += 1
  return `md-file-${Date.now()}-${fileCounter}`
}

function setActiveFile(fileId: string) {
  activeFileId = fileId
  const file = sessionFiles.find((entry) => entry.id === fileId)
  if (!file) return

  content.innerHTML = render(file.text)
  showReader(file.name)
  renderSidebar()
}

function toggleSidebar() {
  if (sessionFiles.length <= 1) return
  isSidebarCollapsed = !isSidebarCollapsed
  renderSidebar()
}

function renderSidebar() {
  const hasMultipleFiles = sessionFiles.length > 1
  reader.classList.toggle('has-sidebar', hasMultipleFiles)
  reader.classList.toggle('sidebar-collapsed', hasMultipleFiles && isSidebarCollapsed)
  fileSidebar.classList.toggle('hidden', !hasMultipleFiles)
  sidebarToggle.classList.toggle('hidden', !hasMultipleFiles)

  if (hasMultipleFiles) {
    sidebarToggle.textContent = isSidebarCollapsed ? 'Show files' : 'Hide files'
    sidebarToggle.setAttribute('aria-label', isSidebarCollapsed ? 'Show file sidebar' : 'Hide file sidebar')
    sidebarToggle.setAttribute('aria-expanded', String(!isSidebarCollapsed))
  }

  fileList.innerHTML = ''
  if (!hasMultipleFiles) return

  for (const file of sessionFiles) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'file-tab'
    button.textContent = file.name
    button.title = file.name

    if (file.id === activeFileId) {
      button.classList.add('active')
    }

    button.addEventListener('click', () => {
      setActiveFile(file.id)
    })

    fileList.appendChild(button)
  }
}

function showReader(fileName: string) {
  landing.classList.add('hidden')
  reader.classList.remove('hidden')
  settingsToggle.classList.remove('hidden')
  document.title = fileName
}
