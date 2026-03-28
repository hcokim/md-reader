import { getActiveFileText, updateActiveFileText } from './active-file.ts'
import {
  applyMarkdownComment,
  applyMarkdownHighlight,
  removeMarkdownComment,
  removeMarkdownHighlight,
  updateMarkdownComment,
} from './markdown-editor.ts'
import type { MarkdownComment } from './markdown-model.ts'
import { getActiveMarkdownDocument } from './markdown-state.ts'
import {
  mapRangeToSourceSelectionDetailed,
  prepareSourceMappedBlocks,
  type SourceSelectionFailureReason,
} from './selection-mapper.ts'

const content = document.getElementById('content')!
const presentSlide = document.getElementById('present-slide')!
const toolbar = document.getElementById('annotation-toolbar')!
const highlightAction = document.getElementById('annotation-highlight-action') as HTMLButtonElement
const commentAction = document.getElementById('annotation-comment-action') as HTMLButtonElement
const removeAction = document.getElementById('annotation-remove-action') as HTMLButtonElement
const commentPopover = document.getElementById('annotation-comment-popover')!
const commentInput = document.getElementById('annotation-comment-input') as HTMLTextAreaElement
const commentDelete = document.getElementById('annotation-comment-delete') as HTMLButtonElement

type PendingSelection = {
  quote: string
  blockId: string
  startInBlock: number
  endInBlock: number
  sourceStart: number
  sourceEnd: number
  rect: DOMRect
}

type AnnotationSurface = {
  root: HTMLElement
  baseStart: number
}

type CommentPopoverSession =
  | {
    mode: 'create'
    selection: PendingSelection
  }
  | {
    mode: 'edit'
    commentId: string
    initialComment: string
  }

const BLOCK_SELECTOR = 'p, li, blockquote, td, th, h1, h2, h3, h4, h5, h6, pre, figcaption'
const COMMENT_TARGET_SELECTOR = 'mark.markdown-comment-target[data-md-comment-id]'
const DEV = typeof import.meta !== 'undefined' && import.meta.env?.DEV
let activeDocumentId: string | null = null
let pendingSelection: PendingSelection | null = null
let activeMarkdownHighlight: PendingSelection | null = null
let openCommentId: string | null = null
let commentPopoverSession: CommentPopoverSession | null = null
let selectionInProgress = false
let lastRejectedSelectionSignature: string | null = null

export function initAnnotations() {
  const syncPendingSelectionFromDom = (options: { showSelectionToolbar: boolean }) => {
    const selection = document.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      pendingSelection = null
      if (!activeMarkdownHighlight) hideToolbar()
      return null
    }

    const result = resolveSelectionCandidate(selection.getRangeAt(0))
    if (!result.candidate) {
      pendingSelection = null
      if (!activeMarkdownHighlight) hideToolbar()
      logRejectedSelection(selection, result.reason)
      return null
    }

    pendingSelection = result.candidate
    activeMarkdownHighlight = null
    lastRejectedSelectionSignature = null

    if (options.showSelectionToolbar) {
      showToolbar(result.candidate.rect, 'selection')
    } else {
      hideToolbar()
    }

    return result.candidate
  }

  const handleSelectionChange = () => {
    if (isReadOnlyViewport()) {
      clearPendingState()
      hideToolbar()
      return
    }

    syncPendingSelectionFromDom({ showSelectionToolbar: !selectionInProgress })
  }

  const handleHighlightClick = () => {
    if (!pendingSelection) return

    const source = getActiveFileText()
    if (!source) return

    const nextSource = applyMarkdownHighlight(source, {
      start: pendingSelection.sourceStart,
      end: pendingSelection.sourceEnd,
    })

    clearBrowserSelection()
    clearPendingState()
    closeCommentPopover()
    updateActiveFileText(nextSource)
  }

  const handleCommentClick = () => {
    const selection = pendingSelection ?? activeMarkdownHighlight
    if (!selection) return

    clearBrowserSelection()
    pendingSelection = null
    activeMarkdownHighlight = null
    hideToolbar()
    openCommentPopoverForCreate(selection)
  }

  const handleRemoveClick = () => {
    if (!activeMarkdownHighlight) return

    const source = getActiveFileText()
    if (!source) return

    const nextSource = removeMarkdownHighlight(source, {
      start: activeMarkdownHighlight.sourceStart,
      end: activeMarkdownHighlight.sourceEnd,
    })

    clearPendingState()
    closeCommentPopover()
    updateActiveFileText(nextSource)
  }

  const handleSurfaceClick = (event: MouseEvent) => {
    if (isReadOnlyViewport()) return

    const target = event.target as HTMLElement | null
    const commentTarget = target?.closest<HTMLElement>(COMMENT_TARGET_SELECTOR)
    if (commentTarget && isAnnotationElement(commentTarget)) {
      const commentId = commentTarget.dataset.mdCommentId
      const comment = commentId ? getMarkdownCommentById(commentId) : null
      if (!comment) return

      event.preventDefault()
      event.stopPropagation()
      clearBrowserSelection()
      clearPendingState()
      hideToolbar()
      openCommentPopoverForEdit(comment, commentTarget.getBoundingClientRect(), false)
      return
    }

    const nativeHighlight = target?.closest<HTMLElement>('mark')
    if (!nativeHighlight || !isNativeHighlightElement(nativeHighlight)) return

    const highlightRange = createTextRangeForElement(nativeHighlight)
    const candidate = highlightRange
      ? resolveSelectionCandidate(highlightRange, { allowNativeHighlight: true }).candidate
      : null
    if (!candidate) return

    event.preventDefault()
    event.stopPropagation()
    clearBrowserSelection()
    pendingSelection = null
    activeMarkdownHighlight = candidate
    closeCommentPopover()
    showToolbar(nativeHighlight.getBoundingClientRect(), 'highlight')
  }

  const handleDocumentPointerDown = (event: MouseEvent) => {
    const target = event.target as Node | null
    if (!target) return
    if (toolbar.contains(target) || commentPopover.contains(target)) return

    dismissCommentPopover()

    if (event.button === 0 && isAnnotationSurfaceNode(target)) {
      selectionInProgress = true
    }

    const commentTarget = target instanceof HTMLElement ? target.closest<HTMLElement>(COMMENT_TARGET_SELECTOR) : null
    if (commentTarget && isAnnotationElement(commentTarget)) {
      return
    }

    const nativeHighlightElement = target instanceof HTMLElement ? target.closest<HTMLElement>('mark') : null
    if (nativeHighlightElement && isNativeHighlightElement(nativeHighlightElement)) {
      return
    }

    if (isAnnotationSurfaceNode(target)) {
      pendingSelection = null
      activeMarkdownHighlight = null
      hideToolbar()
      return
    }

    clearPendingState()
    hideToolbar()
  }

  const handleDocumentPointerUp = () => {
    if (!selectionInProgress) return
    selectionInProgress = false

    requestAnimationFrame(() => {
      syncPendingSelectionFromDom({ showSelectionToolbar: true })
    })
  }

  const handleToolbarPointerDown = (event: PointerEvent) => {
    event.preventDefault()
  }

  const handleCommentKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation()
  }

  const handleEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return

    if (!commentPopover.classList.contains('hidden')) {
      event.preventDefault()
      event.stopImmediatePropagation()
      dismissCommentPopover()
      return
    }

    clearPendingState()
    hideToolbar()
  }

  const handleCommentInput = () => {
    resizeCommentInput()
  }

  const handleCommentDelete = () => {
    if (!commentPopoverSession) return

    if (commentPopoverSession.mode === 'create') {
      closeCommentPopover()
      return
    }

    const source = getActiveFileText()
    const comment = getMarkdownCommentById(commentPopoverSession.commentId)
    if (!source || !comment) {
      closeCommentPopover()
      return
    }

    const nextSource = removeMarkdownComment(source, comment)
    closeCommentPopover()
    updateActiveFileText(nextSource)
  }

  const hideFloatingUi = () => {
    clearPendingState()
    hideToolbar()
    dismissCommentPopover()
  }

  document.addEventListener('selectionchange', handleSelectionChange)
  document.addEventListener('mousedown', handleDocumentPointerDown, true)
  document.addEventListener('mouseup', handleDocumentPointerUp, true)
  document.addEventListener('keydown', handleEscape, true)
  document.addEventListener('scroll', hideFloatingUi, true)
  window.addEventListener('resize', hideFloatingUi)
  toolbar.addEventListener('pointerdown', handleToolbarPointerDown)
  highlightAction.addEventListener('click', handleHighlightClick)
  commentAction.addEventListener('click', handleCommentClick)
  removeAction.addEventListener('click', handleRemoveClick)
  commentInput.addEventListener('input', handleCommentInput)
  commentInput.addEventListener('keydown', handleCommentKeyDown)
  commentDelete.addEventListener('click', handleCommentDelete)
  content.addEventListener('click', handleSurfaceClick)
  presentSlide.addEventListener('click', handleSurfaceClick)

  return () => {
    document.removeEventListener('selectionchange', handleSelectionChange)
    document.removeEventListener('mousedown', handleDocumentPointerDown, true)
    document.removeEventListener('mouseup', handleDocumentPointerUp, true)
    document.removeEventListener('keydown', handleEscape, true)
    document.removeEventListener('scroll', hideFloatingUi, true)
    window.removeEventListener('resize', hideFloatingUi)
    toolbar.removeEventListener('pointerdown', handleToolbarPointerDown)
    highlightAction.removeEventListener('click', handleHighlightClick)
    commentAction.removeEventListener('click', handleCommentClick)
    removeAction.removeEventListener('click', handleRemoveClick)
    commentInput.removeEventListener('input', handleCommentInput)
    commentInput.removeEventListener('keydown', handleCommentKeyDown)
    commentDelete.removeEventListener('click', handleCommentDelete)
    content.removeEventListener('click', handleSurfaceClick)
    presentSlide.removeEventListener('click', handleSurfaceClick)
  }
}

export function setActiveAnnotationDocument(documentId: string | null) {
  activeDocumentId = documentId
  clearPendingState()
  closeCommentPopover()
  syncCommentPopover()
}

export function refreshAnnotations() {
  const presentSource = presentSlide.querySelector<HTMLElement>('.present-source')
  if (presentSource) {
    prepareAnnotationBlocks(presentSource)
  }
  syncCommentPopover()
}

export function hideAnnotationToolbar() {
  clearPendingState()
  hideToolbar()
  closeCommentPopover()
}

export function prepareAnnotationBlocks(root: HTMLElement) {
  prepareMarkdownCommentTargets(root)
  prepareSourceMappedBlocks(root)
}

function resolveSelectionCandidate(
  range: Range,
  options: { allowNativeHighlight?: boolean } = {},
): { candidate: PendingSelection | null; reason: string | null } {
  if (!activeDocumentId || range.collapsed) {
    return { candidate: null, reason: 'inactive-document' }
  }

  const startSurface = getSelectionSurface(range.startContainer)
  const endSurface = getSelectionSurface(range.endContainer)
  if (!startSurface || !endSurface || startSurface.root !== endSurface.root) {
    return { candidate: null, reason: 'different-surfaces' }
  }

  const startBlock = getSelectionBlock(range.startContainer, startSurface.root)
  const endBlock = getSelectionBlock(range.endContainer, startSurface.root)
  if (!startBlock || startBlock !== endBlock) {
    return { candidate: null, reason: 'different-dom-blocks' }
  }

  if (
    isCommentTargetNode(range.startContainer, startSurface.root)
    || isCommentTargetNode(range.endContainer, startSurface.root)
    || (!options.allowNativeHighlight && getNativeHighlightAncestor(range.startContainer, startSurface.root))
    || (!options.allowNativeHighlight && getNativeHighlightAncestor(range.endContainer, startSurface.root))
  ) {
    return { candidate: null, reason: 'inside-existing-annotation' }
  }

  const text = range.toString()
  const quote = text.trim()
  if (!quote) {
    return { candidate: null, reason: 'empty-quote' }
  }

  const mappedSelection = mapRangeToSourceSelectionDetailed(range, startSurface.root)
  if (!mappedSelection.selection) {
    return { candidate: null, reason: mappedSelection.reason }
  }

  const blockOffsets = getRangeOffsets(range, startBlock)
  const leadingWhitespace = text.length - text.trimStart().length
  const trailingWhitespace = text.length - text.trimEnd().length
  const startInBlock = blockOffsets.start + leadingWhitespace
  const endInBlock = blockOffsets.end - trailingWhitespace
  if (endInBlock <= startInBlock) {
    return { candidate: null, reason: 'invalid-block-offsets' }
  }

  const rect = getVisibleRect(range)
  if (!rect) {
    return { candidate: null, reason: 'missing-visible-rect' }
  }

  return {
    candidate: {
      quote,
      blockId: mappedSelection.selection.block.id,
      startInBlock,
      endInBlock,
      sourceStart: mappedSelection.selection.sourceStart,
      sourceEnd: mappedSelection.selection.sourceEnd,
      rect,
    },
    reason: null,
  }
}

function logRejectedSelection(selection: Selection | null, reason: string | SourceSelectionFailureReason | null) {
  if (!DEV || !selection || !reason) return

  const text = selection.toString().trim()
  if (!text) return

  const signature = `${reason}:${text}`
  if (signature === lastRejectedSelectionSignature) return
  lastRejectedSelectionSignature = signature

  console.debug('[annotations] selection rejected', {
    reason,
    text,
  })
}

function getVisibleRect(range: Range) {
  const rect = range.getBoundingClientRect()
  if (rect.width > 0 || rect.height > 0) return rect

  const [firstRect] = Array.from(range.getClientRects())
  return firstRect ?? null
}

function getRangeOffsets(range: Range, root: HTMLElement) {
  const startRange = document.createRange()
  startRange.selectNodeContents(root)
  startRange.setEnd(range.startContainer, range.startOffset)

  const endRange = document.createRange()
  endRange.selectNodeContents(root)
  endRange.setEnd(range.endContainer, range.endOffset)

  return {
    start: startRange.toString().length,
    end: endRange.toString().length,
  }
}

function getSelectionSurface(node: Node): AnnotationSurface | null {
  if (content.contains(node)) {
    return { root: content, baseStart: 0 }
  }

  const element = node instanceof Element ? node : node.parentElement
  const source = element?.closest<HTMLElement>('.present-source')
  if (source && presentSlide.contains(source)) {
    const baseStart = Number(source.dataset.slideStart ?? '0')
    return { root: source, baseStart }
  }

  return null
}

function getSelectionBlock(node: Node, root: HTMLElement) {
  let element = node instanceof Element ? node : node.parentElement
  if (!element) return null

  const block = element.closest<HTMLElement>(BLOCK_SELECTOR)
  if (block && root.contains(block)) return block

  while (element && element.parentElement !== root) {
    element = element.parentElement
  }

  return element instanceof HTMLElement && root.contains(element) ? element : null
}

function getNativeHighlightAncestor(node: Node, root: HTMLElement) {
  const element = node instanceof Element ? node : node.parentElement
  if (!element) return null
  const highlight = element.closest<HTMLElement>('mark')
  return highlight && root.contains(highlight) ? highlight : null
}

function isCommentTargetNode(node: Node, root: HTMLElement) {
  const element = node instanceof Element ? node : node.parentElement
  if (!element) return null
  const commentTarget = element.closest<HTMLElement>(COMMENT_TARGET_SELECTOR)
  return commentTarget && root.contains(commentTarget) ? commentTarget : null
}

function showToolbar(anchorRect: DOMRect, mode: 'selection' | 'highlight') {
  toolbar.classList.remove('hidden')
  highlightAction.classList.toggle('hidden', mode !== 'selection')
  commentAction.classList.toggle('hidden', false)
  removeAction.classList.toggle('hidden', mode === 'selection')

  const toolbarRect = toolbar.getBoundingClientRect()
  const top = getFloatingTop(anchorRect, toolbarRect.height)
  let left = anchorRect.left + anchorRect.width / 2 - toolbarRect.width / 2
  left = Math.max(12, Math.min(left, window.innerWidth - toolbarRect.width - 12))

  toolbar.style.left = `${left}px`
  toolbar.style.top = `${top}px`
}

function hideToolbar() {
  toolbar.classList.add('hidden')
}

function openCommentPopoverForCreate(selection: PendingSelection) {
  openCommentId = null
  commentPopoverSession = {
    mode: 'create',
    selection,
  }
  commentPopover.classList.remove('hidden')
  commentInput.value = ''
  resizeCommentInput()
  positionCommentPopover(selection.rect)

  requestAnimationFrame(() => {
    commentInput.focus()
    commentInput.setSelectionRange(commentInput.value.length, commentInput.value.length)
  })
}

function openCommentPopoverForEdit(
  comment: MarkdownComment,
  anchorRect: DOMRect,
  focusInput: boolean,
) {
  openCommentId = comment.id
  commentPopoverSession = {
    mode: 'edit',
    commentId: comment.id,
    initialComment: comment.comment,
  }
  commentPopover.classList.remove('hidden')
  commentInput.value = comment.comment
  resizeCommentInput()
  positionCommentPopover(anchorRect)

  if (focusInput) {
    requestAnimationFrame(() => {
      commentInput.focus()
      commentInput.setSelectionRange(commentInput.value.length, commentInput.value.length)
    })
  }
}

function dismissCommentPopover() {
  const nextSource = finalizeCommentPopover()
  closeCommentPopover()
  if (nextSource) {
    updateActiveFileText(nextSource)
  }
}

function closeCommentPopover() {
  openCommentId = null
  commentPopoverSession = null
  commentPopover.classList.add('hidden')
}

function finalizeCommentPopover() {
  if (!commentPopoverSession) return null

  const source = getActiveFileText()
  if (!source) return null

  const nextComment = commentInput.value.trim()
  if (commentPopoverSession.mode === 'create') {
    if (!nextComment) return null

    return applyMarkdownComment(source, {
      start: commentPopoverSession.selection.sourceStart,
      end: commentPopoverSession.selection.sourceEnd,
    }, nextComment)
  }

  const comment = getMarkdownCommentById(commentPopoverSession.commentId)
  if (!comment) return null
  if (!nextComment) {
    return removeMarkdownComment(source, comment)
  }
  if (nextComment === commentPopoverSession.initialComment.trim()) {
    return null
  }

  return updateMarkdownComment(source, comment, nextComment)
}

function syncCommentPopover() {
  if (!commentPopoverSession || commentPopoverSession.mode !== 'edit' || !openCommentId) return

  const comment = getMarkdownCommentById(openCommentId)
  if (!comment) {
    closeCommentPopover()
    return
  }

  const anchor = getCommentTargetElement(comment.id)
  if (!anchor) {
    closeCommentPopover()
    return
  }

  if (document.activeElement !== commentInput) {
    commentInput.value = comment.comment
  }

  commentPopover.classList.remove('hidden')
  resizeCommentInput()
  positionCommentPopover(anchor.getBoundingClientRect())
}

function positionCommentPopover(anchorRect: DOMRect) {
  const margin = 12
  const popoverRect = commentPopover.getBoundingClientRect()
  const spaceAbove = anchorRect.top - margin
  const spaceBelow = window.innerHeight - anchorRect.bottom - margin
  const placeBelow = spaceBelow >= spaceAbove

  let top = placeBelow
    ? anchorRect.bottom + margin
    : anchorRect.top - popoverRect.height - margin

  if (placeBelow && top + popoverRect.height > window.innerHeight - margin) {
    top = Math.max(margin, window.innerHeight - popoverRect.height - margin)
  }

  if (!placeBelow && top < margin) {
    top = Math.min(window.innerHeight - popoverRect.height - margin, anchorRect.bottom + margin)
  }

  let left = anchorRect.left + anchorRect.width / 2 - popoverRect.width / 2
  left = Math.max(margin, Math.min(left, window.innerWidth - popoverRect.width - margin))

  commentPopover.style.left = `${left}px`
  commentPopover.style.top = `${top}px`
}

function getFloatingTop(anchorRect: DOMRect, floatingHeight: number) {
  const margin = 12
  let top = anchorRect.top - floatingHeight - margin
  if (top < margin) {
    top = anchorRect.bottom + margin
  }
  return top
}

function prepareMarkdownCommentTargets(root: HTMLElement) {
  const footnoteRefs = Array.from(root.querySelectorAll<HTMLElement>('sup.footnote-ref'))
  if (footnoteRefs.length === 0) {
    cleanupEmptyFootnoteSections(root)
    return
  }

  const document = getActiveMarkdownDocument()
  if (!document || document.comments.length === 0) {
    cleanupEmptyFootnoteSections(root)
    return
  }

  const commentPairs = Array.from(root.querySelectorAll<HTMLElement>('mark'))
    .map((mark) => {
      const ref = getAttachedFootnoteRef(mark)
      if (!ref) return null
      return { mark, ref }
    })
    .filter((pair): pair is { mark: HTMLElement; ref: HTMLElement } => pair !== null)

  for (let index = 0; index < commentPairs.length && index < document.comments.length; index += 1) {
    const pair = commentPairs[index]
    const comment = document.comments[index]
    const footnoteLink = pair.ref.querySelector<HTMLAnchorElement>('a[href^="#fn"]')
    const footnoteTarget = footnoteLink?.getAttribute('href')

    pair.mark.classList.add('markdown-comment-target')
    pair.mark.dataset.mdCommentId = comment.id
    pair.ref.remove()

    if (footnoteTarget) {
      root.querySelector<HTMLElement>(footnoteTarget)?.remove()
    }
  }

  cleanupEmptyFootnoteSections(root)
  renumberFootnotes(root)
}

function cleanupEmptyFootnoteSections(root: HTMLElement) {
  const footnoteLists = Array.from(root.querySelectorAll<HTMLOListElement>('.footnotes-list'))
  for (const list of footnoteLists) {
    if (list.children.length > 0) continue

    const section = list.closest<HTMLElement>('.footnotes')
    section?.remove()
  }

  root.querySelectorAll<HTMLElement>('.footnotes-sep').forEach((separator) => {
    const nextFootnotes = separator.nextElementSibling
    if (!nextFootnotes || !nextFootnotes.matches('.footnotes')) {
      separator.remove()
      return
    }

    const list = nextFootnotes.querySelector('.footnotes-list')
    if (!list || list.children.length === 0) {
      separator.remove()
    }
  })
}

function renumberFootnotes(root: HTMLElement) {
  const refs = Array.from(root.querySelectorAll<HTMLAnchorElement>('sup.footnote-ref > a'))
  const items = Array.from(root.querySelectorAll<HTMLElement>('.footnotes .footnote-item'))
  const total = Math.min(refs.length, items.length)

  for (let index = 0; index < total; index += 1) {
    const footnoteNumber = index + 1
    const ref = refs[index]
    const item = items[index]

    ref.href = `#fn${footnoteNumber}`
    ref.id = `fnref${footnoteNumber}`
    ref.textContent = `[${footnoteNumber}]`

    item.id = `fn${footnoteNumber}`
    item.querySelectorAll<HTMLAnchorElement>('a.footnote-backref').forEach((backref) => {
      backref.href = `#fnref${footnoteNumber}`
    })
  }
}

function getAttachedFootnoteRef(mark: HTMLElement) {
  const sibling = mark.nextElementSibling
  if (sibling instanceof HTMLElement && sibling.matches('sup.footnote-ref')) {
    return sibling
  }

  return null
}

function getCommentTargetElement(commentId: string) {
  const presentSource = presentSlide.querySelector<HTMLElement>('.present-source')
  const presentComment = presentSource?.querySelector<HTMLElement>(`${COMMENT_TARGET_SELECTOR}[data-md-comment-id="${commentId}"]`)
  if (presentComment) return presentComment

  return content.querySelector<HTMLElement>(`${COMMENT_TARGET_SELECTOR}[data-md-comment-id="${commentId}"]`)
}

function getMarkdownCommentById(commentId: string) {
  const document = getActiveMarkdownDocument()
  return document?.comments.find((comment) => comment.id === commentId) ?? null
}

function isAnnotationSurfaceNode(node: Node) {
  return content.contains(node) || presentSlide.contains(node)
}

function isAnnotationElement(element: HTMLElement) {
  return content.contains(element) || presentSlide.contains(element)
}

function isNativeHighlightElement(element: HTMLElement) {
  return element.tagName === 'MARK' && isAnnotationElement(element)
}

function createTextRangeForElement(element: HTMLElement) {
  if (!element.firstChild) return null

  const range = document.createRange()
  range.selectNodeContents(element)
  return range
}

function clearPendingState() {
  pendingSelection = null
  activeMarkdownHighlight = null
  selectionInProgress = false
}

function clearBrowserSelection() {
  document.getSelection()?.removeAllRanges()
}

function resizeCommentInput() {
  commentInput.style.height = '0px'
  commentInput.style.height = `${Math.max(commentInput.scrollHeight, 160)}px`
}

function isReadOnlyViewport() {
  return window.matchMedia('(pointer: coarse)').matches
}
