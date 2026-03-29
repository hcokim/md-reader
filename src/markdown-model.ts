import remarkGfm from 'remark-gfm'
import { remarkMark } from 'remark-mark-highlight'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

export type MarkdownPoint = {
  line: number
  column: number
  offset: number
}

export type MarkdownRange = {
  start: MarkdownPoint
  end: MarkdownPoint
}

export type MarkdownBlockKind =
  | 'heading'
  | 'paragraph'
  | 'code'
  | 'table'
  | 'html'
  | 'thematic-break'

export type MarkdownBlock = {
  id: string
  path: string
  kind: MarkdownBlockKind
  range: MarkdownRange
  source: string
  renderText: string
  text: string
  segments: MarkdownTextSegment[]
  isSourceMappable: boolean
  headingLevel?: number
  context: {
    listDepth: number
    quoteDepth: number
    insideFootnote: boolean
  }
}

export type MarkdownTextSegment = {
  text: string
  sourceStart: number
  sourceEnd: number
  renderedStart: number
  renderedEnd: number
}

export type MarkdownHeading = {
  id: string
  path: string
  depth: number
  text: string
  range: MarkdownRange
}

export type MarkdownComment = {
  id: string
  blockId: string
  anchorText: string
  markSourceStart: number
  markSourceEnd: number
  anchorSourceStart: number
  anchorSourceEnd: number
  referenceSourceStart: number
  referenceSourceEnd: number
  definitionSourceStart: number
  definitionSourceEnd: number
  comment: string
}

export type MarkdownDocumentModel = {
  source: string
  tree: MarkdownAstNode
  blocks: MarkdownBlock[]
  headings: MarkdownHeading[]
  comments: MarkdownComment[]
}

type MarkdownAstNode = {
  type: string
  alt?: string | null
  checked?: boolean | null
  children?: MarkdownAstNode[]
  depth?: number
  identifier?: string
  label?: string | null
  title?: string | null
  url?: string
  value?: string
  position?: MarkdownPosition | null
}

type MarkdownPosition = {
  start?: MarkdownPointLike | null
  end?: MarkdownPointLike | null
}

type MarkdownPointLike = {
  line?: number | null
  column?: number | null
  offset?: number | null
}

type TraversalContext = {
  listDepth: number
  quoteDepth: number
  insideFootnote: boolean
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMark)

export function buildMarkdownDocument(source: string): MarkdownDocumentModel {
  const tree = processor.runSync(processor.parse(source)) as MarkdownAstNode
  const blocks: MarkdownBlock[] = []
  const headings: MarkdownHeading[] = []
  const blocksByPath = new Map<string, MarkdownBlock>()

  visitNode(tree, [], { listDepth: 0, quoteDepth: 0, insideFootnote: false }, (node, path, context) => {
    const block = createBlock(source, node, path, context)
    if (block) {
      blocks.push(block)
      blocksByPath.set(block.path, block)
      if (block.kind === 'heading') {
        headings.push({
          id: block.id,
          path: block.path,
          depth: block.headingLevel ?? 1,
          text: block.text,
          range: block.range,
        })
      }
    }
  })

  const comments = collectMarkdownComments(source, tree, blocksByPath)

  return {
    source,
    tree,
    blocks,
    headings,
    comments,
  }
}

export function findMarkdownBlockAtOffset(
  document: MarkdownDocumentModel,
  offset: number,
): MarkdownBlock | null {
  for (const block of document.blocks) {
    if (block.range.start.offset <= offset && offset <= block.range.end.offset) {
      return block
    }
  }

  return null
}

export function mapRenderedRangeToSourceRange(
  block: MarkdownBlock,
  start: number,
  end: number,
): { start: number; end: number } | null {
  if (!block.isSourceMappable) return null
  if (start < 0 || end > block.renderText.length || end <= start) return null

  const startSegmentIndex = findSegmentIndexForRangeBoundary(block.segments, start, 'start')
  const endSegmentIndex = findSegmentIndexForRangeBoundary(block.segments, end, 'end')
  if (startSegmentIndex === -1 || endSegmentIndex === -1) return null

  for (let index = startSegmentIndex + 1; index <= endSegmentIndex; index += 1) {
    if (block.segments[index - 1].sourceEnd !== block.segments[index].sourceStart) {
      return null
    }
  }

  const startSegment = block.segments[startSegmentIndex]
  const endSegment = block.segments[endSegmentIndex]

  const sourceStart = startSegment.sourceStart + (start - startSegment.renderedStart)
  const sourceEnd = endSegment.sourceStart + (end - endSegment.renderedStart)
  if (sourceEnd <= sourceStart) return null

  return { start: sourceStart, end: sourceEnd }
}

export function mapRenderedRangeToSourceRanges(
  block: MarkdownBlock,
  start: number,
  end: number,
): { start: number; end: number }[] | null {
  if (!block.isSourceMappable) return null
  if (start < 0 || end > block.renderText.length || end <= start) return null

  const startSegmentIndex = findSegmentIndexForRangeBoundary(block.segments, start, 'start')
  const endSegmentIndex = findSegmentIndexForRangeBoundary(block.segments, end, 'end')
  if (startSegmentIndex === -1 || endSegmentIndex === -1) return null

  const ranges: { start: number; end: number }[] = []
  let currentRangeStart = block.segments[startSegmentIndex].sourceStart
    + (start - block.segments[startSegmentIndex].renderedStart)

  for (let index = startSegmentIndex + 1; index <= endSegmentIndex; index += 1) {
    if (block.segments[index - 1].sourceEnd !== block.segments[index].sourceStart) {
      ranges.push({ start: currentRangeStart, end: block.segments[index - 1].sourceEnd })
      currentRangeStart = block.segments[index].sourceStart
    }
  }

  const endSegment = block.segments[endSegmentIndex]
  const sourceEnd = endSegment.sourceStart + (end - endSegment.renderedStart)
  ranges.push({ start: currentRangeStart, end: sourceEnd })

  for (const range of ranges) {
    if (range.end <= range.start) return null
  }

  return ranges
}

function visitNode(
  node: MarkdownAstNode,
  path: number[],
  context: TraversalContext,
  visitor: (node: MarkdownAstNode, path: number[], context: TraversalContext) => void,
) {
  visitor(node, path, context)

  const nextContext = getChildContext(node, context)
  const children = node.children ?? []
  for (let index = 0; index < children.length; index += 1) {
    visitNode(children[index], [...path, index], nextContext, visitor)
  }
}

function getChildContext(node: MarkdownAstNode, context: TraversalContext): TraversalContext {
  return {
    listDepth: context.listDepth + (node.type === 'list' ? 1 : 0),
    quoteDepth: context.quoteDepth + (node.type === 'blockquote' ? 1 : 0),
    insideFootnote: context.insideFootnote || node.type === 'footnoteDefinition',
  }
}

function createBlock(
  source: string,
  node: MarkdownAstNode,
  path: number[],
  context: TraversalContext,
): MarkdownBlock | null {
  const kind = getBlockKind(node.type)
  if (!kind) return null

  const range = toRange(node.position)
  if (!range) return null

  const pathId = path.length > 0 ? path.join('.') : 'root'
  const renderText = extractVisibleText(node)
  const text = kind === 'code' || kind === 'html'
    ? renderText.trim()
    : collapseWhitespace(renderText)
  const segments = collectSourceSegments(source, node)

  return {
    id: `md-block-${pathId}`,
    path: pathId,
    kind,
    range,
    source: source.slice(range.start.offset, range.end.offset),
    renderText,
    text,
    segments,
    isSourceMappable: segmentsToText(segments) === renderText,
    headingLevel: kind === 'heading' ? node.depth ?? 1 : undefined,
    context,
  }
}

function getBlockKind(type: string): MarkdownBlockKind | null {
  switch (type) {
    case 'heading':
      return 'heading'
    case 'paragraph':
      return 'paragraph'
    case 'code':
      return 'code'
    case 'table':
      return 'table'
    case 'html':
      return 'html'
    case 'thematicBreak':
      return 'thematic-break'
    default:
      return null
  }
}

function toRange(position: MarkdownPosition | null | undefined): MarkdownRange | null {
  const start = toPoint(position?.start)
  const end = toPoint(position?.end)
  if (!start || !end) return null

  return { start, end }
}

function toPoint(point: MarkdownPointLike | null | undefined): MarkdownPoint | null {
  if (!point) return null
  if (typeof point.line !== 'number' || typeof point.column !== 'number' || typeof point.offset !== 'number') {
    return null
  }

  return {
    line: point.line,
    column: point.column,
    offset: point.offset,
  }
}

function extractVisibleText(node: MarkdownAstNode): string {
  switch (node.type) {
    case 'text':
    case 'inlineCode':
    case 'code':
    case 'html':
      return node.value ?? ''
    case 'image':
      return node.alt ?? ''
    case 'break':
      return '\n'
    case 'thematicBreak':
      return '---'
    case 'footnoteReference':
      return ''
    case 'table':
      return joinChildren(node, '\n')
    case 'tableRow':
      return joinChildren(node, ' | ')
    case 'tableCell':
      return joinChildren(node, ' ')
    case 'list':
    case 'listItem':
    case 'blockquote':
    case 'footnoteDefinition':
      return joinChildren(node, '\n')
    default:
      return joinChildren(node, '')
  }
}

function joinChildren(node: MarkdownAstNode, separator: string): string {
  const children = node.children ?? []
  const parts: string[] = []

  for (const child of children) {
    const text = extractVisibleText(child)
    if (text.length > 0) {
      parts.push(text)
    }
  }

  return parts.join(separator)
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function collectSourceSegments(source: string, node: MarkdownAstNode): MarkdownTextSegment[] {
  const collected: Array<{ text: string; sourceStart: number; sourceEnd: number }> = []
  visitSegmentNode(source, node, collected)

  let renderedOffset = 0
  return collected.map((segment) => {
    const nextSegment: MarkdownTextSegment = {
      ...segment,
      renderedStart: renderedOffset,
      renderedEnd: renderedOffset + segment.text.length,
    }
    renderedOffset = nextSegment.renderedEnd
    return nextSegment
  })
}

function visitSegmentNode(
  source: string,
  node: MarkdownAstNode,
  segments: Array<{ text: string; sourceStart: number; sourceEnd: number }>,
) {
  switch (node.type) {
    case 'text': {
      const segment = buildValueSegment(source, node.position, node.value ?? '')
      if (segment) segments.push(segment)
      return
    }
    case 'inlineCode':
    case 'code': {
      const segment = buildValueSegment(source, node.position, node.value ?? '')
      if (segment) segments.push(segment)
      return
    }
    default: {
      for (const child of node.children ?? []) {
        visitSegmentNode(source, child, segments)
      }
    }
  }
}

function buildValueSegment(
  source: string,
  position: MarkdownPosition | null | undefined,
  text: string,
): { text: string; sourceStart: number; sourceEnd: number } | null {
  if (!text) return null

  const range = toRange(position)
  if (!range) return null

  const rawSlice = source.slice(range.start.offset, range.end.offset)
  const relativeOffset = rawSlice.indexOf(text)

  if (relativeOffset >= 0) {
    return {
      text,
      sourceStart: range.start.offset + relativeOffset,
      sourceEnd: range.start.offset + relativeOffset + text.length,
    }
  }

  if (rawSlice.length === text.length) {
    return {
      text,
      sourceStart: range.start.offset,
      sourceEnd: range.end.offset,
    }
  }

  return null
}

function segmentsToText(segments: MarkdownTextSegment[]): string {
  let text = ''
  for (const segment of segments) {
    text += segment.text
  }
  return text
}

function findSegmentIndexForRangeBoundary(
  segments: MarkdownTextSegment[],
  targetOffset: number,
  edge: 'start' | 'end',
): number {
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    if (edge === 'start') {
      const isExactEnd = targetOffset === segment.renderedEnd
      if (targetOffset >= segment.renderedStart && targetOffset < segment.renderedEnd) {
        return index
      }
      if (isExactEnd) {
        continue
      }
    } else if (targetOffset > segment.renderedStart && targetOffset <= segment.renderedEnd) {
      return index
    }
  }

  if (segments.length > 0 && targetOffset === segments[segments.length - 1].renderedEnd) {
    return segments.length - 1
  }

  return -1
}

function collectMarkdownComments(
  source: string,
  tree: MarkdownAstNode,
  blocksByPath: Map<string, MarkdownBlock>,
): MarkdownComment[] {
  const definitions = new Map<string, MarkdownAstNode>()
  visitNode(tree, [], { listDepth: 0, quoteDepth: 0, insideFootnote: false }, (node) => {
    if (node.type === 'footnoteDefinition' && node.identifier) {
      definitions.set(node.identifier, node)
    }
  })

  const comments: MarkdownComment[] = []
  visitNode(tree, [], { listDepth: 0, quoteDepth: 0, insideFootnote: false }, (node, path) => {
    const block = blocksByPath.get(path.length > 0 ? path.join('.') : 'root')
    if (!block || !node.children?.length) return

    for (let index = 0; index < node.children.length - 1; index += 1) {
      const child = node.children[index]
      const next = node.children[index + 1]
      if (child.type !== 'mark' || next.type !== 'footnoteReference' || !next.identifier) continue

      const markRange = toRange(child.position)
      const referenceRange = toRange(next.position)
      const definitionNode = definitions.get(next.identifier)
      const definitionRange = toRange(definitionNode?.position)
      if (!markRange || !referenceRange || !definitionNode || !definitionRange) continue

      const markSegments = collectSourceSegments(source, child)
      const firstSegment = markSegments[0]
      const lastSegment = markSegments[markSegments.length - 1]
      if (!firstSegment || !lastSegment) continue

      comments.push({
        id: next.identifier,
        blockId: block.id,
        anchorText: extractVisibleText(child).trim(),
        markSourceStart: markRange.start.offset,
        markSourceEnd: markRange.end.offset,
        anchorSourceStart: firstSegment.sourceStart,
        anchorSourceEnd: lastSegment.sourceEnd,
        referenceSourceStart: referenceRange.start.offset,
        referenceSourceEnd: referenceRange.end.offset,
        definitionSourceStart: definitionRange.start.offset,
        definitionSourceEnd: definitionRange.end.offset,
        comment: collapseWhitespace(extractVisibleText(definitionNode)),
      })
    }
  })

  return comments
}
