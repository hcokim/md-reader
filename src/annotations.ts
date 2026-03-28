const content = document.getElementById('content')!
const toolbar = document.getElementById('annotation-toolbar')!
const highlightAction = document.getElementById('annotation-highlight-action') as HTMLButtonElement
const removeAction = document.getElementById('annotation-remove-action') as HTMLButtonElement

type HighlightAnnotation = {
  id: string
  kind: 'highlight'
  quote: string
  occurrence: number
}

type PendingSelection = {
  quote: string
  occurrence: number
  rect: DOMRect
}

type TextPoint = {
  node: Text
  offset: number
}

const BLOCK_SELECTOR = 'p, li, blockquote, td, th, h1, h2, h3, h4, h5, h6, pre, figcaption'
const annotationsByDocument = new Map<string, HighlightAnnotation[]>()
let activeDocumentId: string | null = null
let pendingSelection: PendingSelection | null = null
let activeHighlightId: string | null = null
let selectionInProgress = false

export function initAnnotations() {
  const handleSelectionChange = () => {
    if (isReadOnlyViewport()) {
      clearPendingState()
      hideToolbar()
      return
    }

    const selection = document.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      pendingSelection = null
      if (!activeHighlightId) hideToolbar()
      return
    }

    const candidate = getSelectionCandidate(selection.getRangeAt(0))
    if (!candidate) {
      pendingSelection = null
      if (!activeHighlightId) hideToolbar()
      return
    }

    pendingSelection = candidate
    activeHighlightId = null
    if (!selectionInProgress) {
      showToolbar(candidate.rect, 'highlight')
    } else {
      hideToolbar()
    }
  }

  const handleHighlightClick = () => {
    if (!activeDocumentId || !pendingSelection) return

    const highlights = getAnnotations(activeDocumentId)
    const exists = highlights.some((annotation) =>
      annotation.quote === pendingSelection!.quote && annotation.occurrence === pendingSelection!.occurrence)

    if (!exists) {
      highlights.push({
        id: buildAnnotationId(),
        kind: 'highlight',
        quote: pendingSelection.quote,
        occurrence: pendingSelection.occurrence,
      })
    }

    clearBrowserSelection()
    clearPendingState()
    renderActiveAnnotations()
  }

  const handleRemoveClick = () => {
    if (!activeDocumentId || !activeHighlightId) return

    const remaining = getAnnotations(activeDocumentId).filter((annotation) => annotation.id !== activeHighlightId)
    annotationsByDocument.set(activeDocumentId, remaining)
    clearPendingState()
    renderActiveAnnotations()
  }

  const handleContentClick = (event: MouseEvent) => {
    if (isReadOnlyViewport()) return

    const target = event.target as HTMLElement | null
    const highlight = target?.closest<HTMLElement>('.annotation-highlight')
    if (!highlight || !content.contains(highlight)) return

    const annotationId = highlight.dataset.annotationId
    if (!annotationId) return

    event.preventDefault()
    event.stopPropagation()
    clearBrowserSelection()
    pendingSelection = null
    activeHighlightId = annotationId
    showToolbar(highlight.getBoundingClientRect(), 'remove')
  }

  const handleDocumentPointerDown = (event: MouseEvent) => {
    const target = event.target as Node | null
    if (!target) return
    if (toolbar.contains(target)) return

    if (event.button === 0 && content.contains(target)) {
      selectionInProgress = true
    }

    const highlight = target instanceof HTMLElement ? target.closest('.annotation-highlight') : null
    if (highlight) return

    if (content.contains(target)) {
      activeHighlightId = null
      return
    }

    clearPendingState()
    hideToolbar()
  }

  const handleDocumentPointerUp = () => {
    if (!selectionInProgress) return
    selectionInProgress = false

    if (!pendingSelection || activeHighlightId) return

    requestAnimationFrame(() => {
      if (pendingSelection && !activeHighlightId) {
        showToolbar(pendingSelection.rect, 'highlight')
      }
    })
  }

  const handleToolbarPointerDown = (event: PointerEvent) => {
    event.preventDefault()
  }

  const handleEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    clearPendingState()
    hideToolbar()
  }

  const hideFloatingUi = () => {
    clearPendingState()
    hideToolbar()
  }

  document.addEventListener('selectionchange', handleSelectionChange)
  document.addEventListener('mousedown', handleDocumentPointerDown, true)
  document.addEventListener('mouseup', handleDocumentPointerUp, true)
  document.addEventListener('keydown', handleEscape, true)
  document.addEventListener('scroll', hideFloatingUi, true)
  window.addEventListener('resize', hideFloatingUi)
  toolbar.addEventListener('pointerdown', handleToolbarPointerDown)
  highlightAction.addEventListener('click', handleHighlightClick)
  removeAction.addEventListener('click', handleRemoveClick)
  content.addEventListener('click', handleContentClick)

  return () => {
    document.removeEventListener('selectionchange', handleSelectionChange)
    document.removeEventListener('mousedown', handleDocumentPointerDown, true)
    document.removeEventListener('mouseup', handleDocumentPointerUp, true)
    document.removeEventListener('keydown', handleEscape, true)
    document.removeEventListener('scroll', hideFloatingUi, true)
    window.removeEventListener('resize', hideFloatingUi)
    toolbar.removeEventListener('pointerdown', handleToolbarPointerDown)
    highlightAction.removeEventListener('click', handleHighlightClick)
    removeAction.removeEventListener('click', handleRemoveClick)
    content.removeEventListener('click', handleContentClick)
  }
}

export function setActiveAnnotationDocument(documentId: string | null) {
  activeDocumentId = documentId
  clearPendingState()
  renderActiveAnnotations()
}

export function refreshAnnotations() {
  renderActiveAnnotations()
}

export function hideAnnotationToolbar() {
  clearPendingState()
  hideToolbar()
}

function renderActiveAnnotations() {
  hideToolbar()
  unwrapHighlights()

  if (!activeDocumentId) return

  const highlights = getAnnotations(activeDocumentId)
  if (highlights.length === 0) return

  const text = content.textContent ?? ''
  const resolved = highlights
    .map((annotation) => {
      const offsets = findOccurrenceOffsets(text, annotation.quote, annotation.occurrence)
      if (!offsets) return null
      return { annotation, ...offsets }
    })
    .filter((entry): entry is { annotation: HighlightAnnotation; start: number; end: number } => entry !== null)
    .sort((a, b) => b.start - a.start)

  let lastWrappedStart = Number.POSITIVE_INFINITY

  for (const entry of resolved) {
    if (entry.end > lastWrappedStart) continue

    const range = createRangeFromOffsets(entry.start, entry.end)
    if (!range || range.collapsed) continue

    wrapHighlightRange(range, entry.annotation.id)
    lastWrappedStart = entry.start
  }
}

function getSelectionCandidate(range: Range): PendingSelection | null {
  if (!activeDocumentId || range.collapsed) return null
  if (!content.contains(range.commonAncestorContainer)) return null

  const startBlock = getSelectionBlock(range.startContainer)
  const endBlock = getSelectionBlock(range.endContainer)
  if (!startBlock || startBlock !== endBlock) return null

  if (getHighlightAncestor(range.startContainer) || getHighlightAncestor(range.endContainer)) {
    return null
  }

  const fragment = range.cloneContents()
  if (fragment.querySelector('.annotation-highlight')) {
    return null
  }

  const text = range.toString()
  const quote = text.trim()
  if (!quote) return null

  const offsets = getRangeOffsets(range)
  const leadingWhitespace = text.length - text.trimStart().length
  const trailingWhitespace = text.length - text.trimEnd().length
  const start = offsets.start + leadingWhitespace
  const end = offsets.end - trailingWhitespace
  if (end <= start) return null

  const occurrence = countOccurrencesBefore(content.textContent ?? '', quote, start)
  const rect = getVisibleRect(range)
  if (!rect) return null

  return { quote, occurrence, rect }
}

function getVisibleRect(range: Range) {
  const rect = range.getBoundingClientRect()
  if (rect.width > 0 || rect.height > 0) return rect

  const [firstRect] = Array.from(range.getClientRects())
  return firstRect ?? null
}

function getRangeOffsets(range: Range) {
  const startRange = document.createRange()
  startRange.selectNodeContents(content)
  startRange.setEnd(range.startContainer, range.startOffset)

  const endRange = document.createRange()
  endRange.selectNodeContents(content)
  endRange.setEnd(range.endContainer, range.endOffset)

  return {
    start: startRange.toString().length,
    end: endRange.toString().length,
  }
}

function getSelectionBlock(node: Node) {
  let element = node instanceof Element ? node : node.parentElement
  if (!element) return null

  const block = element.closest<HTMLElement>(BLOCK_SELECTOR)
  if (block && content.contains(block)) return block

  while (element && element.parentElement !== content) {
    element = element.parentElement
  }

  return element && content.contains(element) ? element : null
}

function getHighlightAncestor(node: Node) {
  const element = node instanceof Element ? node : node.parentElement
  if (!element) return null
  const highlight = element.closest<HTMLElement>('.annotation-highlight')
  return highlight && content.contains(highlight) ? highlight : null
}

function countOccurrencesBefore(text: string, quote: string, limit: number) {
  if (!quote) return 0

  let count = 0
  let from = 0

  while (from < limit) {
    const index = text.indexOf(quote, from)
    if (index === -1 || index >= limit) break
    count += 1
    from = index + Math.max(quote.length, 1)
  }

  return count
}

function findOccurrenceOffsets(text: string, quote: string, occurrence: number) {
  if (!quote) return null

  let count = 0
  let from = 0

  while (from <= text.length) {
    const index = text.indexOf(quote, from)
    if (index === -1) return null

    if (count === occurrence) {
      return {
        start: index,
        end: index + quote.length,
      }
    }

    count += 1
    from = index + Math.max(quote.length, 1)
  }

  return null
}

function createRangeFromOffsets(start: number, end: number) {
  const startPoint = findTextPoint(start)
  const endPoint = findTextPoint(end)
  if (!startPoint || !endPoint) return null

  const range = document.createRange()
  range.setStart(startPoint.node, startPoint.offset)
  range.setEnd(endPoint.node, endPoint.offset)
  return range
}

function findTextPoint(targetOffset: number): TextPoint | null {
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT)
  let offset = 0
  let lastText: Text | null = null

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text
    const length = textNode.data.length
    const nextOffset = offset + length

    if (targetOffset <= nextOffset) {
      return {
        node: textNode,
        offset: targetOffset - offset,
      }
    }

    offset = nextOffset
    lastText = textNode
  }

  if (!lastText) return null

  return {
    node: lastText,
    offset: lastText.data.length,
  }
}

function wrapHighlightRange(range: Range, annotationId: string) {
  const fragment = range.extractContents()
  const highlight = document.createElement('span')
  highlight.className = 'annotation-highlight'
  highlight.dataset.annotationId = annotationId
  highlight.appendChild(fragment)
  range.insertNode(highlight)
}

function unwrapHighlights() {
  const highlights = Array.from(content.querySelectorAll<HTMLElement>('.annotation-highlight'))

  for (const highlight of highlights) {
    const parent = highlight.parentNode
    if (!parent) continue

    while (highlight.firstChild) {
      parent.insertBefore(highlight.firstChild, highlight)
    }

    parent.removeChild(highlight)
    parent.normalize()
  }
}

function getAnnotations(documentId: string) {
  const existing = annotationsByDocument.get(documentId)
  if (existing) return existing

  const next: HighlightAnnotation[] = []
  annotationsByDocument.set(documentId, next)
  return next
}

function showToolbar(anchorRect: DOMRect, mode: 'highlight' | 'remove') {
  toolbar.classList.remove('hidden')
  highlightAction.classList.toggle('hidden', mode !== 'highlight')
  removeAction.classList.toggle('hidden', mode !== 'remove')

  const toolbarRect = toolbar.getBoundingClientRect()
  let top = anchorRect.top - toolbarRect.height - 12
  if (top < 12) {
    top = anchorRect.bottom + 12
  }

  let left = anchorRect.left + anchorRect.width / 2 - toolbarRect.width / 2
  left = Math.max(12, Math.min(left, window.innerWidth - toolbarRect.width - 12))

  toolbar.style.left = `${left}px`
  toolbar.style.top = `${top}px`
}

function hideToolbar() {
  toolbar.classList.add('hidden')
}

function clearPendingState() {
  pendingSelection = null
  activeHighlightId = null
  selectionInProgress = false
}

function clearBrowserSelection() {
  document.getSelection()?.removeAllRanges()
}

function isReadOnlyViewport() {
  return window.matchMedia('(pointer: coarse)').matches
}

function buildAnnotationId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `annotation-${Date.now()}`
}
