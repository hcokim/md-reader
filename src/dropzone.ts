import { render } from './markdown.ts'

const landing = document.getElementById('landing')!
const reader = document.getElementById('reader')!
const content = document.getElementById('content')!
const fileSidebar = document.getElementById('file-sidebar')!
const sidebarBackdrop = document.getElementById('sidebar-backdrop')!
const fileList = document.getElementById('file-list')!
const outlineList = document.getElementById('outline-list')!
const sidebarToggle = document.getElementById('sidebar-toggle') as HTMLButtonElement
const settingsToggle = document.getElementById('settings-toggle')!
const presentToggle = document.getElementById('present-toggle')!
const fileInput = document.getElementById('file-input') as HTMLInputElement
const openLink = document.getElementById('open-link')!
const urlForm = document.getElementById('url-form') as HTMLFormElement
const urlInput = document.getElementById('url-input') as HTMLInputElement

type SessionFile = {
  id: string
  name: string
  text: string
}

type OutlineItem = {
  id: string
  title: string
  level: number
}

const ACCEPTED_EXTENSIONS = ['.md', '.markdown', '.mdx', '.txt']

let markdownReady: Promise<void>
let sessionFiles: SessionFile[] = []
let activeFileId: string | null = null
let outlineItems: OutlineItem[] = []
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

  const handleUrlSubmit = (e: SubmitEvent) => {
    e.preventDefault()
    const url = urlInput.value.trim()
    if (url) {
      void loadUrl(url)
    }
  }

  const handleSidebarToggle = () => {
    toggleSidebar()
  }

  const handleShortcut = (e: KeyboardEvent) => {
    const hasSidebarContent = sessionFiles.length > 1 || outlineItems.length > 0
    if (!hasSidebarContent) return
    if (isTypingTarget(e.target)) return

    if (e.key === 'Escape' && !isSidebarCollapsed) {
      e.preventDefault()
      dismissSidebarIfNarrow()
      return
    }

    if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault()
      toggleSidebar()
    }
  }

  const narrowQuery = window.matchMedia('(max-width: 900px)')
  const handleViewportChange = () => {
    if (narrowQuery.matches && !isSidebarCollapsed) {
      isSidebarCollapsed = true
    }
    renderSidebar()
  }

  openLink.addEventListener('click', handleOpenClick)
  fileInput.addEventListener('change', handleInputChange)
  urlForm.addEventListener('submit', handleUrlSubmit)
  document.body.addEventListener('dragover', handleDragOver)
  document.body.addEventListener('dragleave', handleDragLeave)
  document.body.addEventListener('drop', handleDrop)
  sidebarToggle.addEventListener('click', handleSidebarToggle)
  sidebarBackdrop.addEventListener('click', dismissSidebarIfNarrow)
  narrowQuery.addEventListener('change', handleViewportChange)
  document.addEventListener('keydown', handleShortcut)

  return () => {
    openLink.removeEventListener('click', handleOpenClick)
    fileInput.removeEventListener('change', handleInputChange)
    urlForm.removeEventListener('submit', handleUrlSubmit)
    document.body.removeEventListener('dragover', handleDragOver)
    document.body.removeEventListener('dragleave', handleDragLeave)
    document.body.removeEventListener('drop', handleDrop)
    sidebarToggle.removeEventListener('click', handleSidebarToggle)
    sidebarBackdrop.removeEventListener('click', dismissSidebarIfNarrow)
    narrowQuery.removeEventListener('change', handleViewportChange)
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

async function loadUrl(input: string) {
  // Normalize: strip protocol for the defuddle API path
  let targetUrl = input
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = `https://${targetUrl}`
  }

  // Validate URL structure
  let parsed: URL
  try {
    parsed = new URL(targetUrl)
  } catch {
    urlInput.value = ''
    urlInput.placeholder = 'Invalid URL'
    setTimeout(() => { urlInput.placeholder = 'Paste a URL' }, 3000)
    return
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return
  if (!parsed.hostname.includes('.')) return

  const defuddlePath = targetUrl.replace(/^https?:\/\//i, '')

  urlInput.disabled = true
  urlInput.value = 'Loading\u2026'

  try {
    await markdownReady

    const response = await fetch(`https://defuddle.md/${defuddlePath}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch (${response.status})`)
    }

    const text = await response.text()
    if (!text.trim()) {
      throw new Error('No content returned')
    }

    // Parse metadata from defuddle frontmatter
    let title = defuddlePath
    const frontmatterMatch = text.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/)
    const meta: Record<string, string> = {}
    if (frontmatterMatch) {
      for (const line of frontmatterMatch[1].split('\n')) {
        const m = line.match(/^(\w+):\s*(.+)$/)
        if (m) meta[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
      }
      if (meta.title) title = meta.title
    }

    // Strip YAML frontmatter, then prepend title and metadata
    const body = text.replace(/^---\s*\n[\s\S]*?\n---\s*(?:\n|$)/, '')
    const metaParts: string[] = []
    if (meta.author) metaParts.push(meta.author)
    if (meta.site) metaParts.push(meta.site)
    if (meta.published) {
      const d = new Date(meta.published)
      if (!isNaN(d.getTime())) metaParts.push(d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))
    }
    let header = `# ${title}\n\n`
    if (metaParts.length > 0 || meta.source) {
      header += '<p class="article-meta">'
      if (metaParts.length > 0) header += metaParts.join(' · ')
      if (meta.source) {
        const domain = meta.domain || new URL(meta.source).hostname
        if (metaParts.length > 0) header += ' · '
        header += `<a href="${meta.source}">${domain}</a>`
      }
      header += '</p>\n\n'
    }
    const markdown = header + body

    const file: SessionFile = {
      id: buildFileId(),
      name: title,
      text: markdown,
    }

    sessionFiles = [...sessionFiles, file]

    if (sessionFiles.length > 1 && activeFileId !== null) {
      isSidebarCollapsed = false
    }

    renderSidebar()
    setActiveFile(file.id)
  } catch (err) {
    urlInput.value = ''
    urlInput.placeholder = err instanceof Error ? err.message : 'Failed to load URL'
    setTimeout(() => {
      urlInput.placeholder = 'Paste a URL'
    }, 3000)
  } finally {
    urlInput.disabled = false
  }
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
  outlineItems = buildOutline()
  isSidebarCollapsed = outlineItems.length <= 5 && sessionFiles.length <= 1
  showReader(file.name)
  renderSidebar()
}

function buildOutline(): OutlineItem[] {
  const headings = Array.from(content.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'))
  const usedIds = new Set<string>()

  return headings.map((heading, index) => {
    const title = heading.textContent?.trim() || `Section ${index + 1}`
    const level = Number(heading.tagName.slice(1))
    const baseId = slugify(title) || `section-${index + 1}`
    const id = getUniqueId(baseId, usedIds)
    heading.id = id
    return { id, title, level }
  })
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function getUniqueId(baseId: string, usedIds: Set<string>) {
  let candidate = baseId
  let counter = 2

  while (usedIds.has(candidate) || document.getElementById(candidate)) {
    candidate = `${baseId}-${counter}`
    counter += 1
  }

  usedIds.add(candidate)
  return candidate
}

function isNarrowViewport() {
  return window.matchMedia('(max-width: 900px)').matches
}

function dismissSidebarIfNarrow() {
  if (isNarrowViewport() && !isSidebarCollapsed) {
    isSidebarCollapsed = true
    renderSidebar()
  }
}

function toggleSidebar() {
  const hasSidebarContent = sessionFiles.length > 1 || outlineItems.length > 0
  if (!hasSidebarContent) return
  isSidebarCollapsed = !isSidebarCollapsed
  renderSidebar()
}

function renderSidebar() {
  const hasMultipleFiles = sessionFiles.length > 1
  const hasOutline = outlineItems.length > 0
  const hasSidebarContent = hasMultipleFiles || hasOutline

  reader.classList.toggle('has-sidebar', hasSidebarContent)
  reader.classList.toggle('sidebar-collapsed', hasSidebarContent && isSidebarCollapsed)
  fileSidebar.classList.toggle('hidden', !hasSidebarContent)
  sidebarToggle.classList.toggle('hidden', !hasSidebarContent)

  if (hasSidebarContent) {
    sidebarToggle.setAttribute('aria-label', isSidebarCollapsed ? 'Show navigation sidebar' : 'Hide navigation sidebar')
    sidebarToggle.setAttribute('aria-expanded', String(!isSidebarCollapsed))
  }

  const showBackdrop = isNarrowViewport() && hasSidebarContent && !isSidebarCollapsed
  sidebarBackdrop.classList.toggle('hidden', !showBackdrop)

  fileList.classList.toggle('hidden', !hasMultipleFiles)
  outlineList.classList.toggle('hidden', !hasOutline)

  renderFileList(hasMultipleFiles)
  renderOutline(hasOutline)
}

function renderFileList(hasMultipleFiles: boolean) {
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
      dismissSidebarIfNarrow()
    })

    fileList.appendChild(button)
  }
}

function renderOutline(hasOutline: boolean) {
  outlineList.innerHTML = ''
  if (!hasOutline) return

  for (const item of outlineItems) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `outline-item level-${Math.min(item.level, 6)}`
    button.textContent = item.title
    button.title = item.title
    button.addEventListener('click', () => {
      const heading = document.getElementById(item.id)
      heading?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      dismissSidebarIfNarrow()
    })
    outlineList.appendChild(button)
  }
}

function showReader(fileName: string) {
  landing.classList.add('hidden')
  reader.classList.remove('hidden')
  settingsToggle.classList.remove('hidden')
  presentToggle.classList.remove('hidden')
  document.title = fileName.length > 100 ? fileName.slice(0, 100) + '\u2026' : fileName
}
