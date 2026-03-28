import { buildMarkdownDocument, type MarkdownDocumentModel } from './markdown-model.ts'

const markdownDocuments = new Map<string, MarkdownDocumentModel>()
let activeDocumentId: string | null = null

export function updateMarkdownDocument(
  documentId: string,
  source: string,
): MarkdownDocumentModel {
  const document = buildMarkdownDocument(source)
  markdownDocuments.set(documentId, document)
  return document
}

export function setActiveMarkdownDocument(documentId: string | null) {
  activeDocumentId = documentId
}

export function getActiveMarkdownDocument(): MarkdownDocumentModel | null {
  if (!activeDocumentId) return null
  return markdownDocuments.get(activeDocumentId) ?? null
}

export function getMarkdownDocument(documentId: string): MarkdownDocumentModel | null {
  return markdownDocuments.get(documentId) ?? null
}

export function deleteMarkdownDocument(documentId: string) {
  markdownDocuments.delete(documentId)
  if (activeDocumentId === documentId) {
    activeDocumentId = null
  }
}
