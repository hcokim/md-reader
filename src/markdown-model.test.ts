import { describe, it, expect } from 'vitest'
import {
  buildMarkdownDocument,
  findMarkdownBlockAtOffset,
  mapRenderedRangeToSourceRange,
} from './markdown-model.ts'

describe('buildMarkdownDocument', () => {
  it('parses a heading', () => {
    const doc = buildMarkdownDocument('# Hello')
    expect(doc.blocks).toHaveLength(1)
    expect(doc.blocks[0].kind).toBe('heading')
    expect(doc.blocks[0].text).toBe('Hello')
    expect(doc.blocks[0].headingLevel).toBe(1)
  })

  it('parses multiple heading levels', () => {
    const doc = buildMarkdownDocument('# H1\n\n## H2\n\n### H3')
    expect(doc.headings).toHaveLength(3)
    expect(doc.headings[0].depth).toBe(1)
    expect(doc.headings[1].depth).toBe(2)
    expect(doc.headings[2].depth).toBe(3)
  })

  it('parses paragraphs', () => {
    const doc = buildMarkdownDocument('Hello world\n\nSecond paragraph')
    const paragraphs = doc.blocks.filter((b) => b.kind === 'paragraph')
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0].text).toBe('Hello world')
    expect(paragraphs[1].text).toBe('Second paragraph')
  })

  it('parses a fenced code block', () => {
    const doc = buildMarkdownDocument('```js\nconsole.log("hi")\n```')
    const code = doc.blocks.find((b) => b.kind === 'code')
    expect(code).toBeDefined()
    expect(code!.text).toBe('console.log("hi")')
  })

  it('parses a thematic break', () => {
    const doc = buildMarkdownDocument('above\n\n---\n\nbelow')
    const hr = doc.blocks.find((b) => b.kind === 'thematic-break')
    expect(hr).toBeDefined()
  })

  it('parses inline formatting and collapses whitespace', () => {
    const doc = buildMarkdownDocument('Some **bold** and *italic* text')
    expect(doc.blocks[0].text).toBe('Some bold and italic text')
  })

  it('tracks list depth context', () => {
    const doc = buildMarkdownDocument('- item one\n- item two')
    const listItems = doc.blocks.filter((b) => b.context.listDepth > 0)
    expect(listItems.length).toBeGreaterThan(0)
    expect(listItems[0].context.listDepth).toBe(1)
  })

  it('tracks blockquote depth context', () => {
    const doc = buildMarkdownDocument('> quoted text')
    const quoted = doc.blocks.filter((b) => b.context.quoteDepth > 0)
    expect(quoted.length).toBeGreaterThan(0)
    expect(quoted[0].context.quoteDepth).toBe(1)
  })

  it('tracks nested list depth', () => {
    const doc = buildMarkdownDocument('- outer\n  - inner')
    const innerItems = doc.blocks.filter((b) => b.context.listDepth === 2)
    expect(innerItems.length).toBeGreaterThan(0)
  })

  it('marks footnote definitions with insideFootnote', () => {
    const doc = buildMarkdownDocument('text[^1]\n\n[^1]: footnote content')
    const footnoteBlocks = doc.blocks.filter((b) => b.context.insideFootnote)
    expect(footnoteBlocks.length).toBeGreaterThan(0)
  })

  it('assigns unique block IDs', () => {
    const doc = buildMarkdownDocument('# Heading\n\nParagraph\n\n## Another')
    const ids = doc.blocks.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('sets correct source ranges', () => {
    const source = '# Title\n\nBody text'
    const doc = buildMarkdownDocument(source)

    for (const block of doc.blocks) {
      expect(block.source).toBe(source.slice(block.range.start.offset, block.range.end.offset))
    }
  })

  it('handles empty input', () => {
    const doc = buildMarkdownDocument('')
    expect(doc.blocks).toHaveLength(0)
    expect(doc.headings).toHaveLength(0)
    expect(doc.comments).toHaveLength(0)
  })

  it('builds source segments for plain text', () => {
    const source = 'Hello world'
    const doc = buildMarkdownDocument(source)
    const block = doc.blocks[0]
    expect(block.isSourceMappable).toBe(true)
    expect(block.segments.length).toBeGreaterThan(0)
    expect(block.segments[0].text).toBe('Hello world')
  })

  it('builds source segments for bold text', () => {
    const source = 'Say **hello** world'
    const doc = buildMarkdownDocument(source)
    const block = doc.blocks[0]
    expect(block.isSourceMappable).toBe(true)

    const texts = block.segments.map((s) => s.text)
    expect(texts.join('')).toBe(block.renderText)
  })

  it('parses a table as a single block', () => {
    const source = '| A | B |\n| - | - |\n| 1 | 2 |'
    const doc = buildMarkdownDocument(source)
    const table = doc.blocks.find((b) => b.kind === 'table')
    expect(table).toBeDefined()
  })
})

describe('buildMarkdownDocument comments', () => {
  it('parses a comment annotation', () => {
    const source = '==highlighted==[^comment-1]\n\n[^comment-1]: This is a note'
    const doc = buildMarkdownDocument(source)
    expect(doc.comments).toHaveLength(1)
    expect(doc.comments[0].id).toBe('comment-1')
    expect(doc.comments[0].comment).toBe('This is a note')
    expect(doc.comments[0].anchorText).toBe('highlighted')
  })

  it('parses multiple comments', () => {
    const source = '==first==[^comment-1] and ==second==[^comment-2]\n\n[^comment-1]: Note one\n\n[^comment-2]: Note two'
    const doc = buildMarkdownDocument(source)
    expect(doc.comments).toHaveLength(2)
    expect(doc.comments[0].id).toBe('comment-1')
    expect(doc.comments[1].id).toBe('comment-2')
  })

  it('returns no comments when none exist', () => {
    const doc = buildMarkdownDocument('Just a plain paragraph')
    expect(doc.comments).toHaveLength(0)
  })

  it('stores correct source offsets for comment parts', () => {
    const source = '==word==[^comment-1]\n\n[^comment-1]: my note'
    const doc = buildMarkdownDocument(source)
    const comment = doc.comments[0]

    expect(source.slice(comment.markSourceStart, comment.markSourceEnd)).toBe('==word==')
    expect(source.slice(comment.definitionSourceStart, comment.definitionSourceEnd)).toBe('[^comment-1]: my note')
  })
})

describe('findMarkdownBlockAtOffset', () => {
  it('finds the block containing an offset', () => {
    const doc = buildMarkdownDocument('# Title\n\nBody text')
    const block = findMarkdownBlockAtOffset(doc, 10)
    expect(block).not.toBeNull()
    expect(block!.kind).toBe('paragraph')
  })

  it('returns null for offset outside any block', () => {
    const doc = buildMarkdownDocument('# Title\n\nBody text')
    const block = findMarkdownBlockAtOffset(doc, 8)
    expect(block).toBeNull()
  })

  it('finds heading at offset 0', () => {
    const doc = buildMarkdownDocument('# Title\n\nBody')
    const block = findMarkdownBlockAtOffset(doc, 0)
    expect(block).not.toBeNull()
    expect(block!.kind).toBe('heading')
  })
})

describe('mapRenderedRangeToSourceRange', () => {
  it('maps a plain text selection to source range', () => {
    const doc = buildMarkdownDocument('Hello world')
    const block = doc.blocks[0]
    const result = mapRenderedRangeToSourceRange(block, 0, 5)
    expect(result).toEqual({ start: 0, end: 5 })
  })

  it('maps a selection inside bold text', () => {
    const source = 'Say **hello** world'
    const doc = buildMarkdownDocument(source)
    const block = doc.blocks[0]

    // renderText is "Say hello world", "hello" starts at rendered offset 4
    const result = mapRenderedRangeToSourceRange(block, 4, 9)
    expect(result).not.toBeNull()
    // Should point to "hello" inside the ** markers in source
    expect(source.slice(result!.start, result!.end)).toBe('hello')
  })

  it('maps a selection spanning plain into bold', () => {
    const source = 'Say **hello** world'
    const doc = buildMarkdownDocument(source)
    const block = doc.blocks[0]

    // "Say hello" = rendered 0..9, but "Say " is in one segment and "hello" in another
    // The segments must be contiguous in source for this to succeed
    const result = mapRenderedRangeToSourceRange(block, 0, 9)
    // This crosses a formatting boundary — segments are not contiguous in source
    expect(result).toBeNull()
  })

  it('returns null for non-source-mappable block', () => {
    const doc = buildMarkdownDocument('| A | B |\n| - | - |\n| 1 | 2 |')
    const table = doc.blocks.find((b) => b.kind === 'table')
    expect(table).toBeDefined()
    const result = mapRenderedRangeToSourceRange(table!, 0, 1)
    expect(result).toBeNull()
  })

  it('returns null for invalid range', () => {
    const doc = buildMarkdownDocument('Hello')
    const block = doc.blocks[0]
    expect(mapRenderedRangeToSourceRange(block, 5, 3)).toBeNull()
    expect(mapRenderedRangeToSourceRange(block, -1, 3)).toBeNull()
    expect(mapRenderedRangeToSourceRange(block, 0, 100)).toBeNull()
  })

  it('handles full block selection', () => {
    const doc = buildMarkdownDocument('Hello world')
    const block = doc.blocks[0]
    const result = mapRenderedRangeToSourceRange(block, 0, block.renderText.length)
    expect(result).not.toBeNull()
    expect(result!.start).toBe(0)
    expect(result!.end).toBe(11)
  })
})
