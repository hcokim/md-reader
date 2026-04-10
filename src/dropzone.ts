import { render } from './markdown.ts'
import { prepareAnnotationBlocks, setActiveAnnotationDocument } from './annotations.ts'
import { registerActiveFileBridge } from './active-file.ts'
import { deleteMarkdownDocument, setActiveMarkdownDocument, updateMarkdownDocument } from './markdown-state.ts'
import { rerenderPresentation } from './present.ts'
import { clearHistory, pushUndoState, redo, undo } from './undo-history.ts'

const landing = document.getElementById('landing')!
const reader = document.getElementById('reader')!
const content = document.getElementById('content')!
const fileSidebar = document.getElementById('file-sidebar')!
const sidebarBackdrop = document.getElementById('sidebar-backdrop')!
const fileList = document.getElementById('file-list')!
const outlineList = document.getElementById('outline-list')!
const sidebarToggle = document.getElementById('sidebar-toggle') as HTMLButtonElement
const addFileToggle = document.getElementById('add-file-toggle') as HTMLButtonElement
const saveFileButton = document.getElementById('save-file-button') as HTMLButtonElement
const settingsToggle = document.getElementById('settings-toggle')!
const presentToggle = document.getElementById('present-toggle')!
const fileInput = document.getElementById('file-input') as HTMLInputElement
const openLink = document.getElementById('open-link')!
const urlForm = document.getElementById('url-form') as HTMLFormElement
const urlInput = document.getElementById('url-input') as HTMLInputElement
const restoreBtn = document.getElementById('restore-session') as HTMLButtonElement

type SessionFile = {
  id: string
  name: string
  text: string
  savedText: string
  isDirty: boolean
  handle?: FileSystemFileHandle
  lastModified?: number
}

type OutlineItem = {
  id: string
  title: string
  level: number
}

const ACCEPTED_EXTENSIONS = ['.md', '.markdown', '.mdx', '.txt']

const DB_NAME = 'md-reader'
const DB_STORE = 'session'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function saveSession(handles: FileSystemFileHandle[]) {
  try {
    const db = await openDb()
    const tx = db.transaction(DB_STORE, 'readwrite')
    const store = tx.objectStore(DB_STORE)
    store.put(handles, 'handles')

    // Persist scroll positions keyed by file name
    if (activeFileId) {
      scrollPositions.set(activeFileId, window.scrollY)
    }
    const scrollData: Record<string, number> = {}
    for (const file of sessionFiles) {
      const pos = scrollPositions.get(file.id)
      if (pos !== undefined && pos > 0) {
        scrollData[file.name] = pos
      }
    }
    store.put(scrollData, 'scrollPositions')

    db.close()
  } catch {
    // IndexedDB unavailable — ignore
  }
}

async function loadSession(): Promise<{ handles: FileSystemFileHandle[], scrollData: Record<string, number> }> {
  try {
    const db = await openDb()
    return new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, 'readonly')
      const store = tx.objectStore(DB_STORE)
      const handlesReq = store.get('handles')
      const scrollReq = store.get('scrollPositions')
      let handles: FileSystemFileHandle[] = []
      let scrollData: Record<string, number> = {}
      handlesReq.onsuccess = () => { handles = handlesReq.result ?? [] }
      scrollReq.onsuccess = () => { scrollData = scrollReq.result ?? {} }
      tx.oncomplete = () => { resolve({ handles, scrollData }) }
      tx.onerror = () => resolve({ handles: [], scrollData: {} })
      db.close()
    })
  } catch {
    return { handles: [], scrollData: {} }
  }
}

async function clearSession() {
  try {
    const db = await openDb()
    const tx = db.transaction(DB_STORE, 'readwrite')
    const store = tx.objectStore(DB_STORE)
    store.delete('handles')
    store.delete('scrollPositions')
    db.close()
  } catch {
    // ignore
  }
}

let markdownReady: Promise<void>
let sessionFiles: SessionFile[] = []
let activeFileId: string | null = null
const scrollPositions = new Map<string, number>()
let outlineItems: OutlineItem[] = []
let isSidebarCollapsed = false
let fileCounter = 0
let saveButtonMode: 'idle' | 'saved' = 'idle'
let saveButtonFileId: string | null = null
let saveButtonHideTimeout: ReturnType<typeof setTimeout> | null = null
let isSaveInFlight = false

async function openFilePicker(e: MouseEvent) {
  e.preventDefault()
  if ('showOpenFilePicker' in window) {
    try {
      const handles = await window.showOpenFilePicker!({
        multiple: true,
        types: [{
          description: 'Markdown files',
          accept: { 'text/markdown': ['.md', '.markdown', '.mdx', '.txt'] },
        }],
      })
      if (handles.length > 0) {
        void loadFileHandles(handles)
      }
    } catch {
      // User cancelled the picker
    }
  } else {
    fileInput.click()
  }
}

export function initDropzone(ready: Promise<void>) {
  markdownReady = ready
  registerActiveFileBridge({
    getText: getActiveFileText,
    updateText: updateActiveFileText,
  })

  // Check for a restorable session and show the button if available
  void loadSession().then(({ handles }) => {
    if (handles.length > 0) {
      restoreBtn.classList.remove('hidden')
      restoreBtn.querySelector('span')!.textContent = 'Restore previous session'
    }
  })

  const handleOpenClick = openFilePicker

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

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    document.body.classList.remove('drag-over')

    // Try to get file handles for live reload support
    // Must call getAsFileSystemHandle synchronously for all items —
    // DataTransferItem references are invalidated after the event
    const items = Array.from(e.dataTransfer?.items ?? [])
    if (items.length > 0 && 'getAsFileSystemHandle' in DataTransferItem.prototype) {
      const handlePromises = items.map((item) => item.getAsFileSystemHandle!())
      const results = await Promise.all(handlePromises)
      const handles: FileSystemFileHandle[] = []
      for (const h of results) {
        if (h?.kind === 'file' && isReadableName(h.name)) {
          handles.push(h as FileSystemFileHandle)
        } else if (h?.kind === 'directory') {
          for await (const entry of (h as FileSystemDirectoryHandle).values()) {
            if (entry.kind === 'file' && isReadableName(entry.name)) {
              handles.push(entry)
            }
          }
        }
      }
      if (handles.length > 0) {
        void loadFileHandles(handles)
        return
      }
    }

    // Fallback: no handles available
    const files = Array.from(e.dataTransfer?.files ?? []).filter(isReadableMarkdownFile)
    if (files.length > 0) {
      void loadFiles(files)
    }
  }

  const handleRestore = async () => {
    const { handles, scrollData } = await loadSession()
    if (handles.length === 0) return

    // Request permission — needs user gesture (this click counts)
    const permitted: FileSystemFileHandle[] = []
    for (const handle of handles) {
      try {
        const perm = await handle.requestPermission({ mode: 'read' })
        if (perm === 'granted') permitted.push(handle)
      } catch {
        // Permission denied or handle invalid
      }
    }

    if (permitted.length > 0) {
      void loadFileHandles(permitted, scrollData)
    } else {
      restoreBtn.querySelector('span')!.textContent = 'Permission denied'
      setTimeout(() => { restoreBtn.classList.add('hidden') }, 2000)
      void clearSession()
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

  const handleSaveClick = () => {
    void saveActiveFile()
  }

  const handleUndoRedo = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return
    if (e.key !== 'z' && e.key !== 'Z') return
    if (isTypingTarget(e.target)) return
    if (!activeFileId) return

    const file = sessionFiles.find((entry) => entry.id === activeFileId)
    if (!file) return

    const isRedo = e.shiftKey
    const nextText = isRedo
      ? redo(file.id, file.text)
      : undo(file.id, file.text)

    if (nextText === null) return

    e.preventDefault()
    applyUndoRedoText(file, nextText)
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
  const wideQuery = window.matchMedia('(min-width: 1800px)')
  const handleViewportChange = () => {
    if (narrowQuery.matches && !isSidebarCollapsed) {
      isSidebarCollapsed = true
    } else if (wideQuery.matches && isSidebarCollapsed) {
      isSidebarCollapsed = false
    }
    renderSidebar()
  }

  openLink.addEventListener('click', handleOpenClick)
  fileInput.addEventListener('change', handleInputChange)
  restoreBtn.addEventListener('click', handleRestore)
  urlForm.addEventListener('submit', handleUrlSubmit)
  document.body.addEventListener('dragover', handleDragOver)
  document.body.addEventListener('dragleave', handleDragLeave)
  document.body.addEventListener('drop', handleDrop)
  sidebarToggle.addEventListener('click', handleSidebarToggle)
  addFileToggle.addEventListener('click', openFilePicker)
  saveFileButton.addEventListener('click', handleSaveClick)
  sidebarBackdrop.addEventListener('click', dismissSidebarIfNarrow)
  narrowQuery.addEventListener('change', handleViewportChange)
  wideQuery.addEventListener('change', handleViewportChange)
  document.addEventListener('keydown', handleUndoRedo)
  document.addEventListener('keydown', handleShortcut)

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      const hasHandles = sessionFiles.some((f) => f.handle)
      if (hasHandles) {
        const allHandles = sessionFiles.filter((f) => f.handle).map((f) => f.handle!)
        void saveSession(allHandles)
      }
    }
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)

  return () => {
    openLink.removeEventListener('click', handleOpenClick)
    fileInput.removeEventListener('change', handleInputChange)
    restoreBtn.removeEventListener('click', handleRestore)
    urlForm.removeEventListener('submit', handleUrlSubmit)
    document.body.removeEventListener('dragover', handleDragOver)
    document.body.removeEventListener('dragleave', handleDragLeave)
    document.body.removeEventListener('drop', handleDrop)
    sidebarToggle.removeEventListener('click', handleSidebarToggle)
    addFileToggle.removeEventListener('click', openFilePicker)
    saveFileButton.removeEventListener('click', handleSaveClick)
    sidebarBackdrop.removeEventListener('click', dismissSidebarIfNarrow)
    narrowQuery.removeEventListener('change', handleViewportChange)
    document.removeEventListener('keydown', handleUndoRedo)
    document.removeEventListener('keydown', handleShortcut)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    if (watchInterval) {
      clearInterval(watchInterval)
      watchInterval = null
    }
    for (const file of sessionFiles) {
      deleteMarkdownDocument(file.id)
      clearHistory(file.id)
    }
    sessionFiles = []
    activeFileId = null
    scrollPositions.clear()
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
    savedText: '',
    isDirty: false,
  })))

  for (const file of loadedFiles) {
    file.savedText = file.text
  }

  sessionFiles = [...sessionFiles, ...loadedFiles]

  if (sessionFiles.length > 1 && activeFileId !== null) {
    isSidebarCollapsed = false
  }

  renderSidebar()
  setActiveFile(loadedFiles[0].id)
  fileInput.value = ''
  void clearSession()
}

async function loadFileHandles(handles: FileSystemFileHandle[], restoredScrollData?: Record<string, number>) {
  const readable = handles.filter((h) => isReadableName(h.name))
  if (readable.length === 0) return

  await markdownReady

  const loadedFiles: SessionFile[] = await Promise.all(readable.map(async (handle) => {
    const file = await handle.getFile()
    return {
      id: buildFileId(),
      name: handle.name,
      text: await file.text(),
      savedText: '',
      isDirty: false,
      handle,
      lastModified: file.lastModified,
    }
  }))

  for (const file of loadedFiles) {
    file.savedText = file.text
  }

  sessionFiles = [...sessionFiles, ...loadedFiles]

  // Restore saved scroll positions from session data (keyed by file name)
  if (restoredScrollData) {
    for (const file of loadedFiles) {
      const pos = restoredScrollData[file.name]
      if (pos !== undefined && pos > 0) {
        scrollPositions.set(file.id, pos)
      }
    }
  }

  if (sessionFiles.length > 1 && activeFileId !== null) {
    isSidebarCollapsed = false
  }

  renderSidebar()
  setActiveFile(loadedFiles[0].id)
  fileInput.value = ''
  startWatchingFiles()

  // Persist handles for session restore
  const allHandles = sessionFiles.filter((f) => f.handle).map((f) => f.handle!)
  void saveSession(allHandles)
}

let watchInterval: ReturnType<typeof setInterval> | null = null

function startWatchingFiles() {
  if (watchInterval) return
  watchInterval = setInterval(pollFiles, 2000)
}

async function pollFiles() {
  const watchedFiles = sessionFiles.filter((f) => f.handle)
  if (watchedFiles.length === 0) {
    if (watchInterval) {
      clearInterval(watchInterval)
      watchInterval = null
    }
    return
  }

  for (const entry of watchedFiles) {
    if (entry.isDirty) {
      continue
    }

    try {
      const file = await entry.handle!.getFile()
      if (file.lastModified !== entry.lastModified) {
        entry.lastModified = file.lastModified
        entry.text = await file.text()
        entry.savedText = entry.text
        entry.isDirty = false
        if (entry.id === activeFileId) {
          const scrollParent = content.parentElement
          const scrollPos = scrollParent?.scrollTop ?? 0
          renderSessionFile(entry)
          renderSidebar()
          renderSaveButton()
          if (scrollParent) scrollParent.scrollTop = scrollPos
        }
      }
    } catch {
      // File may have been deleted or moved — skip
    }
  }
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
    if (meta.author) metaParts.push(escapeHtml(normalizeMetadataText(meta.author)))
    if (meta.site) metaParts.push(escapeHtml(normalizeMetadataText(meta.site)))
    if (meta.published) {
      const d = new Date(meta.published)
      if (!isNaN(d.getTime())) metaParts.push(d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))
    }
    let header = `# ${escapeMarkdownText(title)}\n\n`
    if (metaParts.length > 0 || meta.source) {
      header += '<p class="article-meta">'
      if (metaParts.length > 0) header += metaParts.join(' · ')
      if (meta.source && /^https?:\/\//i.test(meta.source)) {
        const domain = escapeHtml(normalizeMetadataText(meta.domain || new URL(meta.source).hostname))
        if (metaParts.length > 0) header += ' · '
        header += `<a href="${escapeAttr(meta.source)}" rel="noopener noreferrer">${domain}</a>`
      }
      header += '</p>\n\n'
    }
    const markdown = header + body

    const file: SessionFile = {
      id: buildFileId(),
      name: title,
      text: markdown,
      savedText: markdown,
      isDirty: false,
    }

    sessionFiles = [...sessionFiles, file]

    if (sessionFiles.length > 1 && activeFileId !== null) {
      isSidebarCollapsed = false
    }

    renderSidebar()
    setActiveFile(file.id)
    void clearSession()
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

function isReadableName(name: string) {
  const lower = name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function isReadableMarkdownFile(file: File) {
  return isReadableName(file.name)
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

function getActiveSessionFile() {
  if (!activeFileId) return null
  return sessionFiles.find((entry) => entry.id === activeFileId) ?? null
}

function clearSaveButtonHideTimeout() {
  if (!saveButtonHideTimeout) return
  clearTimeout(saveButtonHideTimeout)
  saveButtonHideTimeout = null
}

function resetSaveButtonTransientState() {
  clearSaveButtonHideTimeout()
  saveButtonMode = 'idle'
  saveButtonFileId = null
  isSaveInFlight = false
  saveFileButton.disabled = false
}

function setSaveButtonVisible(isVisible: boolean) {
  document.body.classList.toggle('has-save-button', isVisible)
}

function renderSaveButton() {
  const file = getActiveSessionFile()
  if (!file || !file.handle) {
    setSaveButtonVisible(false)
    saveFileButton.classList.add('hidden')
    saveFileButton.removeAttribute('data-state')
    saveFileButton.textContent = 'Save'
    return
  }

  const isSaving = isSaveInFlight && saveButtonFileId === file.id
  const isSaved = saveButtonMode === 'saved' && saveButtonFileId === file.id && !file.isDirty

  if (isSaved) {
    setSaveButtonVisible(true)
    saveFileButton.classList.remove('hidden')
    saveFileButton.dataset.state = 'saved'
    saveFileButton.disabled = true
    saveFileButton.textContent = 'Saved'
    return
  }

  if (!file.isDirty) {
    if (!isSaving && !isSaved) {
      resetSaveButtonTransientState()
    }
    setSaveButtonVisible(false)
    saveFileButton.classList.add('hidden')
    saveFileButton.removeAttribute('data-state')
    saveFileButton.textContent = 'Save'
    return
  }

  setSaveButtonVisible(true)
  saveFileButton.classList.remove('hidden')
  saveFileButton.dataset.state = 'dirty'
  saveFileButton.disabled = isSaving
  saveFileButton.textContent = 'Save'
}

async function saveActiveFile() {
  const file = getActiveSessionFile()
  if (!file?.handle || !file.isDirty || isSaveInFlight) return

  clearSaveButtonHideTimeout()
  isSaveInFlight = true
  saveButtonFileId = file.id
  saveFileButton.disabled = true

  const textToSave = file.text

  try {
    const permission = await file.handle.requestPermission({ mode: 'readwrite' })
    if (permission !== 'granted') {
      resetSaveButtonTransientState()
      renderSaveButton()
      return
    }

    const writable = await file.handle.createWritable()
    await writable.write(textToSave)
    await writable.close()

    const savedFile = await file.handle.getFile()
    file.lastModified = savedFile.lastModified
    file.savedText = textToSave
    file.isDirty = file.text !== file.savedText
    isSaveInFlight = false

    if (file.isDirty) {
      resetSaveButtonTransientState()
      renderSaveButton()
      return
    }

    saveButtonMode = 'saved'
    saveButtonFileId = file.id
    renderSaveButton()

    saveButtonHideTimeout = setTimeout(() => {
      if (activeFileId === file.id && !file.isDirty) {
        resetSaveButtonTransientState()
        renderSaveButton()
      }
    }, 1000)
  } catch {
    resetSaveButtonTransientState()
    renderSaveButton()
  }
}

function setActiveFile(fileId: string) {
  // Save current scroll position before switching
  if (activeFileId) {
    scrollPositions.set(activeFileId, window.scrollY)
  }

  activeFileId = fileId
  const file = sessionFiles.find((entry) => entry.id === fileId)
  if (!file) return

  renderSessionFile(file)
  const isWideViewport = window.matchMedia('(min-width: 1800px)').matches
  isSidebarCollapsed = !isWideViewport && outlineItems.length <= 5 && sessionFiles.length <= 1
  showReader(file.name)
  renderSidebar()
  renderSaveButton()

  // Restore saved scroll position, or stay at top for new files
  window.scrollTo(0, scrollPositions.get(fileId) ?? 0)
}

export function getActiveFileText(): string | null {
  if (!activeFileId) return null
  return sessionFiles.find((entry) => entry.id === activeFileId)?.text ?? null
}

export function updateActiveFileText(nextText: string): boolean {
  if (!activeFileId) return false

  const file = sessionFiles.find((entry) => entry.id === activeFileId)
  if (!file || file.text === nextText) return false

  pushUndoState(file.id, file.text)
  file.text = nextText
  file.isDirty = file.text !== file.savedText
  if (saveButtonFileId === file.id && file.isDirty) {
    resetSaveButtonTransientState()
  }

  const scrollParent = content.parentElement
  const scrollPos = scrollParent?.scrollTop ?? 0

  renderSessionFile(file)
  renderSidebar()
  rerenderPresentation()
  renderSaveButton()

  if (scrollParent) {
    scrollParent.scrollTop = scrollPos
  }

  return true
}

function applyUndoRedoText(file: SessionFile, nextText: string) {
  if (file.text === nextText) return

  file.text = nextText
  file.isDirty = file.text !== file.savedText
  if (saveButtonFileId === file.id && file.isDirty) {
    resetSaveButtonTransientState()
  }

  const scrollParent = content.parentElement
  const scrollPos = scrollParent?.scrollTop ?? 0

  renderSessionFile(file)
  renderSidebar()
  rerenderPresentation()
  renderSaveButton()

  if (scrollParent) {
    scrollParent.scrollTop = scrollPos
  }
}

function renderSessionFile(file: SessionFile) {
  const markdownDocument = updateMarkdownDocument(file.id, file.text)
  setActiveMarkdownDocument(file.id)
  content.innerHTML = render(file.text, markdownDocument)
  prepareAnnotationBlocks(content)
  outlineItems = buildOutline()
  setActiveAnnotationDocument(file.id)
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
  addFileToggle.classList.toggle('hidden', !hasSidebarContent)

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

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function normalizeMetadataText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function escapeMarkdownText(text: string): string {
  return normalizeMetadataText(text)
    .replace(/\\/g, '\\\\')
    .replace(/([`*_{}[\]()#+\-!|>])/g, '\\$1')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
