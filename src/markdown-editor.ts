import type { MarkdownComment } from './markdown-model.ts'

export type SourceRange = {
  start: number
  end: number
}

export function applyMarkdownHighlight(source: string, range: SourceRange): string {
  const normalizedRange = normalizeRange(source, range)
  if (!normalizedRange) return source

  const { start, end } = normalizedRange
  return `${source.slice(0, start)}==${source.slice(start, end)}==${source.slice(end)}`
}

export function applyMarkdownHighlightRanges(source: string, ranges: SourceRange[]): string {
  if (ranges.length === 1) return applyMarkdownHighlight(source, ranges[0])

  let result = source
  for (let i = ranges.length - 1; i >= 0; i--) {
    const trimmed = trimSourceRangeWhitespace(result, ranges[i])
    if (trimmed) {
      result = applyMarkdownHighlight(result, trimmed)
    }
  }
  return result
}

export function removeMarkdownHighlight(source: string, range: SourceRange): string {
  const normalizedRange = normalizeRange(source, range)
  if (!normalizedRange) return source

  const { start, end } = normalizedRange
  if (start < 2 || end + 2 > source.length) return source
  if (source.slice(start - 2, start) !== '==' || source.slice(end, end + 2) !== '==') {
    return source
  }

  return `${source.slice(0, start - 2)}${source.slice(start, end)}${source.slice(end + 2)}`
}

export function applyMarkdownComment(
  source: string,
  range: SourceRange,
  comment: string,
): string {
  const normalizedRange = normalizeRange(source, range)
  if (!normalizedRange) return source

  const note = sanitizeFootnoteComment(comment)
  if (!note) return source

  const commentId = buildCommentId(source)
  const selectedSource = source.slice(normalizedRange.start, normalizedRange.end)
  const alreadyHighlighted = isHighlightedRange(source, normalizedRange)
  const anchor = alreadyHighlighted
    ? `${source.slice(normalizedRange.start - 2, normalizedRange.end + 2)}[^${commentId}]`
    : `==${selectedSource}==[^${commentId}]`
  const nextSource = `${source.slice(0, alreadyHighlighted ? normalizedRange.start - 2 : normalizedRange.start)}${anchor}${source.slice(alreadyHighlighted ? normalizedRange.end + 2 : normalizedRange.end)}`

  return appendFootnoteDefinition(nextSource, commentId, note)
}

export function applyMarkdownCommentRanges(
  source: string,
  ranges: SourceRange[],
  comment: string,
): string {
  if (ranges.length === 1) return applyMarkdownComment(source, ranges[0], comment)

  const note = sanitizeFootnoteComment(comment)
  if (!note) return source

  const commentId = buildCommentId(source)
  let result = source

  for (let i = ranges.length - 1; i >= 0; i--) {
    const trimmed = trimSourceRangeWhitespace(result, ranges[i])
    if (!trimmed) continue

    if (i === ranges.length - 1) {
      const range = normalizeRange(result, trimmed)
      if (!range) continue
      const selectedSource = result.slice(range.start, range.end)
      const alreadyHighlighted = isHighlightedRange(result, range)
      const anchor = alreadyHighlighted
        ? `${result.slice(range.start - 2, range.end + 2)}[^${commentId}]`
        : `==${selectedSource}==[^${commentId}]`
      result = `${result.slice(0, alreadyHighlighted ? range.start - 2 : range.start)}${anchor}${result.slice(alreadyHighlighted ? range.end + 2 : range.end)}`
    } else {
      result = applyMarkdownHighlight(result, trimmed)
    }
  }

  return appendFootnoteDefinition(result, commentId, note)
}

export function updateMarkdownComment(
  source: string,
  comment: MarkdownComment,
  nextComment: string,
): string {
  const note = sanitizeFootnoteComment(nextComment)
  if (!note) {
    return removeMarkdownComment(source, comment)
  }

  return `${source.slice(0, comment.definitionSourceStart)}[^${comment.id}]: ${note}${source.slice(comment.definitionSourceEnd)}`
}

export function removeMarkdownComment(
  source: string,
  comment: MarkdownComment,
): string {
  const innerSource = source.slice(comment.markSourceStart + 2, comment.markSourceEnd - 2)
  const removeAnchor = (input: string) =>
    `${input.slice(0, comment.markSourceStart)}${innerSource}${input.slice(comment.referenceSourceEnd)}`

  if (comment.definitionSourceStart > comment.referenceSourceEnd) {
    const withoutDefinition = removeFootnoteDefinition(source, comment)
    return removeAnchor(withoutDefinition)
  }

  const withoutAnchor = removeAnchor(source)
  return removeFootnoteDefinition(withoutAnchor, comment)
}

export function replaceMarkdownRange(
  source: string,
  range: SourceRange,
  nextText: string,
): string {
  const normalizedRange = normalizeRange(source, range)
  if (!normalizedRange) return source

  return `${source.slice(0, normalizedRange.start)}${nextText}${source.slice(normalizedRange.end)}`
}

function trimSourceRangeWhitespace(source: string, range: SourceRange): SourceRange | null {
  let { start, end } = range
  start = Math.max(0, Math.min(start, end))
  end = Math.min(source.length, Math.max(range.start, range.end))
  while (start < end && /\s/.test(source[start])) start++
  while (end > start && /\s/.test(source[end - 1])) end--
  if (start >= end) return null
  return { start, end }
}

function normalizeRange(source: string, range: SourceRange): SourceRange | null {
  const start = Math.max(0, Math.min(range.start, range.end))
  const end = Math.min(source.length, Math.max(range.start, range.end))
  if (start === end) return null

  return { start, end }
}

function sanitizeFootnoteComment(comment: string): string {
  return comment
    .trim()
    .replace(/\\/g, '\\\\')
    .replace(/\]/g, '\\]')
    .replace(/\r?\n+/g, ' ')
}

function isHighlightedRange(source: string, range: SourceRange): boolean {
  return range.start >= 2
    && range.end + 2 <= source.length
    && source.slice(range.start - 2, range.start) === '=='
    && source.slice(range.end, range.end + 2) === '=='
}

function buildCommentId(source: string): string {
  const used = new Set<string>()
  const matches = source.matchAll(/\[\^([^\]]+)\]/g)
  for (const match of matches) {
    if (match[1]) {
      used.add(match[1])
    }
  }

  let counter = 1
  while (used.has(`comment-${counter}`)) {
    counter += 1
  }

  return `comment-${counter}`
}

function appendFootnoteDefinition(source: string, commentId: string, note: string): string {
  let next = source.replace(/\s*$/, '')
  next += `\n\n[^${commentId}]: ${note}`
  return next
}

function removeFootnoteDefinition(source: string, comment: MarkdownComment): string {
  let start = comment.definitionSourceStart
  if (start >= 2 && source.slice(start - 2, start) === '\n\n') {
    start -= 2
  } else if (start >= 1 && source[start - 1] === '\n') {
    start -= 1
  }

  let end = comment.definitionSourceEnd
  if (end < source.length && source[end] === '\n') {
    end += 1
  }

  return `${source.slice(0, start)}${source.slice(end)}`
}
