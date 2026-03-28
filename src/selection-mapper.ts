import {
  mapRenderedRangeToSourceRange,
  type MarkdownBlock,
} from './markdown-model.ts'
import { getActiveMarkdownDocument } from './markdown-state.ts'

export type SourceMappedSelection = {
  block: MarkdownBlock
  blockElement: HTMLElement
  quote: string
  renderedStartInBlock: number
  renderedEndInBlock: number
  sourceStart: number
  sourceEnd: number
}

export type SourceSelectionFailureReason =
  | 'no-document'
  | 'collapsed'
  | 'different-blocks'
  | 'unmapped-block'
  | 'unknown-block'
  | 'empty-quote'
  | 'invalid-rendered-range'
  | 'unsupported-source-range'

export type SourceSelectionResult = {
  selection: SourceMappedSelection | null
  reason: SourceSelectionFailureReason | null
}

const SOURCE_BLOCK_SELECTOR = 'h1, h2, h3, h4, h5, h6, p, pre, hr, li'

export function prepareSourceMappedBlocks(root: HTMLElement) {
  const document = getActiveMarkdownDocument()
  const elements = collectSourceBlockElements(root)
  const unresolved: HTMLElement[] = []
  const assignedBlockIds = new Set<string>()

  for (const element of elements) {
    delete element.dataset.annotationBlockId

    const explicitBlockId = getExplicitBlockId(element)
    if (explicitBlockId) {
      element.dataset.annotationBlockId = explicitBlockId
      assignedBlockIds.add(explicitBlockId)
    } else {
      unresolved.push(element)
    }
  }

  if (!document || unresolved.length === 0) return

  const blocks = document.blocks.filter((block) =>
    block.kind !== 'html'
    && block.kind !== 'table'
    && !block.context.insideFootnote
    && !assignedBlockIds.has(block.id))
  let sourceIndex = 0

  for (const element of unresolved) {
    while (sourceIndex < blocks.length) {
      const block = blocks[sourceIndex]
      sourceIndex += 1

      if (!isCompatibleBlock(element, block)) continue
      if (!doesElementMatchBlock(element, block)) continue

      element.dataset.annotationBlockId = block.id
      break
    }
  }
}

export function mapRangeToSourceSelection(
  range: Range,
  root: HTMLElement,
): SourceMappedSelection | null {
  return mapRangeToSourceSelectionDetailed(range, root).selection
}

export function mapRangeToSourceSelectionDetailed(
  range: Range,
  root: HTMLElement,
): SourceSelectionResult {
  const document = getActiveMarkdownDocument()
  if (!document) {
    return { selection: null, reason: 'no-document' }
  }
  if (range.collapsed) {
    return { selection: null, reason: 'collapsed' }
  }

  const startBlock = getSourceMappedBlock(range.startContainer, root)
  const endBlock = getSourceMappedBlock(range.endContainer, root)
  if (!startBlock || !endBlock || startBlock !== endBlock) {
    return { selection: null, reason: 'different-blocks' }
  }

  const blockId = startBlock.dataset.annotationBlockId
  if (!blockId) {
    return { selection: null, reason: 'unmapped-block' }
  }

  const block = document.blocks.find((entry) => entry.id === blockId)
  if (!block) {
    return { selection: null, reason: 'unknown-block' }
  }

  const selectedText = range.toString()
  const quote = selectedText.trim()
  if (!quote) {
    return { selection: null, reason: 'empty-quote' }
  }

  const blockOffsets = getRangeOffsets(range, startBlock)
  const leadingWhitespace = selectedText.length - selectedText.trimStart().length
  const trailingWhitespace = selectedText.length - selectedText.trimEnd().length
  const renderedStartInBlock = blockOffsets.start + leadingWhitespace
  const renderedEndInBlock = blockOffsets.end - trailingWhitespace
  if (renderedEndInBlock <= renderedStartInBlock) {
    return { selection: null, reason: 'invalid-rendered-range' }
  }

  const sourceRange = mapRenderedRangeToSourceRange(block, renderedStartInBlock, renderedEndInBlock)
  if (!sourceRange) {
    return { selection: null, reason: 'unsupported-source-range' }
  }

  return {
    selection: {
      block,
      blockElement: startBlock,
      quote,
      renderedStartInBlock,
      renderedEndInBlock,
      sourceStart: sourceRange.start,
      sourceEnd: sourceRange.end,
    },
    reason: null,
  }
}

function collectSourceBlockElements(root: HTMLElement): HTMLElement[] {
  const elements = Array.from(root.querySelectorAll<HTMLElement>(SOURCE_BLOCK_SELECTOR))
  return elements.filter((element) => {
    if (element.tagName !== 'LI') return true
    return isSimpleListItem(element)
  })
}

function getExplicitBlockId(element: HTMLElement) {
  if (element.dataset.mdBlockId) {
    return element.dataset.mdBlockId
  }

  if (element.tagName === 'PRE') {
    return element.querySelector<HTMLElement>('code[data-md-block-id]')?.dataset.mdBlockId ?? null
  }

  return null
}

function isSimpleListItem(element: HTMLElement): boolean {
  return !element.querySelector(':scope > p, :scope > pre, :scope > blockquote, :scope > ul, :scope > ol, :scope > table')
}

function isCompatibleBlock(element: HTMLElement, block: MarkdownBlock): boolean {
  const tagName = element.tagName

  if (tagName === 'LI') {
    return block.kind === 'paragraph' && block.context.listDepth > 0
  }

  switch (block.kind) {
    case 'heading':
      return /^H[1-6]$/.test(tagName)
    case 'paragraph':
      return tagName === 'P'
    case 'code':
      return tagName === 'PRE'
    case 'thematic-break':
      return tagName === 'HR'
    default:
      return false
  }
}

function doesElementMatchBlock(element: HTMLElement, block: MarkdownBlock): boolean {
  if (block.kind === 'thematic-break') return true

  const elementText = getBlockRenderText(element)
  if (elementText === block.renderText) return true
  return normalizeBlockText(elementText) === normalizeBlockText(block.renderText)
}

function normalizeBlockText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function getBlockRenderText(element: HTMLElement) {
  const clone = element.cloneNode(true) as HTMLElement
  clone.querySelectorAll('sup.footnote-ref').forEach((ref) => ref.remove())
  return clone.textContent ?? ''
}

function getSourceMappedBlock(node: Node, root: HTMLElement): HTMLElement | null {
  let element = node instanceof Element ? node : node.parentElement
  if (!element) return null

  const block = element.closest<HTMLElement>(SOURCE_BLOCK_SELECTOR)
  if (!block || !root.contains(block)) return null
  if (!block.dataset.annotationBlockId) return null
  return block
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
