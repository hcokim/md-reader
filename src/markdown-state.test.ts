import { describe, it, expect, beforeEach } from 'vitest'
import {
  updateMarkdownDocument,
  setActiveMarkdownDocument,
  getActiveMarkdownDocument,
  getMarkdownDocument,
  deleteMarkdownDocument,
} from './markdown-state.ts'

describe('markdown-state', () => {
  beforeEach(() => {
    // Clean up any state from previous tests
    setActiveMarkdownDocument(null)
    deleteMarkdownDocument('test-1')
    deleteMarkdownDocument('test-2')
  })

  it('stores and retrieves a document', () => {
    updateMarkdownDocument('test-1', '# Hello')
    const doc = getMarkdownDocument('test-1')
    expect(doc).not.toBeNull()
    expect(doc!.blocks[0].kind).toBe('heading')
  })

  it('returns null for unknown document ID', () => {
    expect(getMarkdownDocument('nonexistent')).toBeNull()
  })

  it('tracks the active document', () => {
    updateMarkdownDocument('test-1', '# One')
    updateMarkdownDocument('test-2', '# Two')

    setActiveMarkdownDocument('test-1')
    expect(getActiveMarkdownDocument()!.blocks[0].text).toBe('One')

    setActiveMarkdownDocument('test-2')
    expect(getActiveMarkdownDocument()!.blocks[0].text).toBe('Two')
  })

  it('returns null when no active document is set', () => {
    expect(getActiveMarkdownDocument()).toBeNull()
  })

  it('returns null when active document ID is invalid', () => {
    setActiveMarkdownDocument('nonexistent')
    expect(getActiveMarkdownDocument()).toBeNull()
  })

  it('overwrites an existing document on re-parse', () => {
    updateMarkdownDocument('test-1', '# First')
    updateMarkdownDocument('test-1', '# Second')
    const doc = getMarkdownDocument('test-1')
    expect(doc!.blocks[0].text).toBe('Second')
  })

  it('deletes a document', () => {
    updateMarkdownDocument('test-1', '# Hello')
    deleteMarkdownDocument('test-1')
    expect(getMarkdownDocument('test-1')).toBeNull()
  })

  it('clears active document when deleting the active one', () => {
    updateMarkdownDocument('test-1', '# Hello')
    setActiveMarkdownDocument('test-1')
    deleteMarkdownDocument('test-1')
    expect(getActiveMarkdownDocument()).toBeNull()
  })

  it('does not clear active document when deleting a different one', () => {
    updateMarkdownDocument('test-1', '# One')
    updateMarkdownDocument('test-2', '# Two')
    setActiveMarkdownDocument('test-1')
    deleteMarkdownDocument('test-2')
    expect(getActiveMarkdownDocument()!.blocks[0].text).toBe('One')
  })
})
