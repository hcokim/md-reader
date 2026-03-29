import { describe, it, expect } from 'vitest'
import {
  applyMarkdownHighlight,
  applyMarkdownHighlightRanges,
  removeMarkdownHighlight,
  applyMarkdownComment,
  applyMarkdownCommentRanges,
  updateMarkdownComment,
  removeMarkdownComment,
  replaceMarkdownRange,
} from './markdown-editor.ts'
import { buildMarkdownDocument } from './markdown-model.ts'

describe('applyMarkdownHighlight', () => {
  it('wraps the selected range with == markers', () => {
    expect(applyMarkdownHighlight('Hello world', { start: 6, end: 11 }))
      .toBe('Hello ==world==')
  })

  it('wraps at the beginning of text', () => {
    expect(applyMarkdownHighlight('Hello world', { start: 0, end: 5 }))
      .toBe('==Hello== world')
  })

  it('wraps entire text', () => {
    expect(applyMarkdownHighlight('Hello', { start: 0, end: 5 }))
      .toBe('==Hello==')
  })

  it('returns source unchanged for empty range', () => {
    expect(applyMarkdownHighlight('Hello', { start: 3, end: 3 }))
      .toBe('Hello')
  })

  it('normalizes swapped start/end', () => {
    expect(applyMarkdownHighlight('Hello world', { start: 11, end: 6 }))
      .toBe('Hello ==world==')
  })

  it('clamps range to source bounds', () => {
    expect(applyMarkdownHighlight('Hello', { start: -5, end: 100 }))
      .toBe('==Hello==')
  })
})

describe('removeMarkdownHighlight', () => {
  it('removes == markers around the range', () => {
    expect(removeMarkdownHighlight('Hello ==world==', { start: 8, end: 13 }))
      .toBe('Hello world')
  })

  it('returns source unchanged when markers are missing', () => {
    expect(removeMarkdownHighlight('Hello world', { start: 6, end: 11 }))
      .toBe('Hello world')
  })

  it('returns source unchanged for range too close to start', () => {
    expect(removeMarkdownHighlight('==Hi==', { start: 2, end: 4 }))
      .toBe('Hi')
  })

  it('round-trips with applyMarkdownHighlight', () => {
    const original = 'Hello beautiful world'
    const highlighted = applyMarkdownHighlight(original, { start: 6, end: 15 })
    expect(highlighted).toBe('Hello ==beautiful== world')

    const restored = removeMarkdownHighlight(highlighted, { start: 8, end: 17 })
    expect(restored).toBe(original)
  })
})

describe('applyMarkdownHighlightRanges', () => {
  it('delegates to applyMarkdownHighlight for single range', () => {
    expect(applyMarkdownHighlightRanges('Hello world', [{ start: 6, end: 11 }]))
      .toBe('Hello ==world==')
  })

  it('wraps multiple ranges across bold boundary', () => {
    // Source: "**Title:** Copy" — select "Title:" (2-8) and " Cop" (10-14)
    // Whitespace trimmed from range boundaries so == markers are flanking-valid
    const result = applyMarkdownHighlightRanges('**Title:** Copy', [
      { start: 2, end: 8 },
      { start: 10, end: 14 },
    ])
    expect(result).toBe('**==Title:==** ==Cop==y')
  })

  it('wraps multiple ranges across italic boundary', () => {
    // Source: "Say *hello* world" — select "y " (2-4), "hello" (5-10), " w" (11-13)
    // Whitespace trimmed from each range boundary
    const result = applyMarkdownHighlightRanges('Say *hello* world', [
      { start: 2, end: 4 },
      { start: 5, end: 10 },
      { start: 11, end: 13 },
    ])
    expect(result).toBe('Sa==y== *==hello==* ==w==orld')
  })

  it('handles the GitHub example from README', () => {
    // Source: "**GitHub** — clean system sans-serif"
    //          01234567890123456...
    // "tHub" = source 4-8, " — clean system s" = source 10-27
    const result = applyMarkdownHighlightRanges(
      '**GitHub** — clean system sans-serif',
      [{ start: 4, end: 8 }, { start: 10, end: 27 }],
    )
    // Leading space trimmed from second range so == isn't adjacent to **
    expect(result).toBe('**Gi==tHub==** ==— clean system s==ans-serif')
  })
})

describe('applyMarkdownCommentRanges', () => {
  it('delegates to applyMarkdownComment for single range', () => {
    const result = applyMarkdownCommentRanges('Hello world', [{ start: 6, end: 11 }], 'A note')
    expect(result).toBe('Hello ==world==[^comment-1]\n\n[^comment-1]: A note')
  })

  it('applies multi-range comment with footnote on last range', () => {
    const result = applyMarkdownCommentRanges('**Title:** Copy', [
      { start: 2, end: 8 },
      { start: 10, end: 14 },
    ], 'My comment')
    expect(result).toBe('**==Title:==** ==Cop==[^comment-1]y\n\n[^comment-1]: My comment')
  })
})

describe('applyMarkdownComment', () => {
  it('wraps selection with highlight and footnote reference', () => {
    const result = applyMarkdownComment('Hello world', { start: 6, end: 11 }, 'A note')
    expect(result).toContain('==world==')
    expect(result).toContain('[^comment-1]')
    expect(result).toContain('[^comment-1]: A note')
  })

  it('reuses existing highlight markers when present', () => {
    const source = 'Hello ==world=='
    const result = applyMarkdownComment(source, { start: 8, end: 13 }, 'A note')
    // Should not double-wrap with ==
    const markCount = (result.match(/==/g) || []).length
    expect(markCount).toBe(2) // one pair of ==
  })

  it('returns source unchanged for empty comment', () => {
    expect(applyMarkdownComment('Hello', { start: 0, end: 5 }, '   '))
      .toBe('Hello')
  })

  it('escapes brackets in comment text', () => {
    const result = applyMarkdownComment('Hello', { start: 0, end: 5 }, 'a [note] here')
    expect(result).toContain('a [note\\] here')
  })

  it('escapes backslashes in comment text', () => {
    const result = applyMarkdownComment('Hello', { start: 0, end: 5 }, 'path\\to\\file')
    expect(result).toContain('path\\\\to\\\\file')
  })

  it('collapses newlines in comment text', () => {
    const result = applyMarkdownComment('Hello', { start: 0, end: 5 }, 'line one\nline two')
    expect(result).toContain('line one line two')
  })

  it('increments comment ID when existing comments are present', () => {
    const source = '==first==[^comment-1]\n\n[^comment-1]: note one'
    const result = applyMarkdownComment(source, { start: 0, end: 0 + 5 }, 'note two')
    expect(result).toContain('[^comment-2]')
  })
})

describe('updateMarkdownComment', () => {
  it('updates the footnote definition text', () => {
    const source = '==word==[^comment-1]\n\n[^comment-1]: old note'
    const doc = buildMarkdownDocument(source)
    const comment = doc.comments[0]

    const result = updateMarkdownComment(source, comment, 'new note')
    expect(result).toContain('[^comment-1]: new note')
    expect(result).not.toContain('old note')
  })

  it('removes comment when updated with empty text', () => {
    const source = '==word==[^comment-1]\n\n[^comment-1]: old note'
    const doc = buildMarkdownDocument(source)
    const comment = doc.comments[0]

    const result = updateMarkdownComment(source, comment, '   ')
    expect(result).not.toContain('[^comment-1]')
    expect(result).toContain('word')
  })
})

describe('removeMarkdownComment', () => {
  it('removes highlight markers, footnote ref, and definition', () => {
    const source = '==word==[^comment-1]\n\n[^comment-1]: a note'
    const doc = buildMarkdownDocument(source)
    const comment = doc.comments[0]

    const result = removeMarkdownComment(source, comment)
    expect(result).not.toContain('==')
    expect(result).not.toContain('[^comment-1]')
    expect(result).not.toContain('a note')
    expect(result.trim()).toBe('word')
  })

  it('preserves surrounding text', () => {
    const source = 'before ==word==[^comment-1] after\n\n[^comment-1]: note'
    const doc = buildMarkdownDocument(source)
    const comment = doc.comments[0]

    const result = removeMarkdownComment(source, comment)
    expect(result).toContain('before word after')
  })
})

describe('replaceMarkdownRange', () => {
  it('replaces text in the given range', () => {
    expect(replaceMarkdownRange('Hello world', { start: 6, end: 11 }, 'earth'))
      .toBe('Hello earth')
  })

  it('inserts text at a point (empty range returns unchanged)', () => {
    expect(replaceMarkdownRange('Hello', { start: 3, end: 3 }, 'X'))
      .toBe('Hello')
  })

  it('normalizes swapped range', () => {
    expect(replaceMarkdownRange('Hello world', { start: 11, end: 6 }, 'earth'))
      .toBe('Hello earth')
  })

  it('replaces entire source', () => {
    expect(replaceMarkdownRange('Hello', { start: 0, end: 5 }, 'Bye'))
      .toBe('Bye')
  })
})
