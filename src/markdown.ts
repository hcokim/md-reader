import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import { fromHighlighter } from '@shikijs/markdown-it/core'
import { createHighlighterCore } from 'shiki/core'
import type { HighlighterGeneric } from 'shiki'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'
import texmath from 'markdown-it-texmath'
import footnote from 'markdown-it-footnote'
import mark from 'markdown-it-mark'
import taskLists from 'markdown-it-task-lists'
import katex from 'katex'
import type { MarkdownBlock, MarkdownDocumentModel } from './markdown-model.ts'

let md: MarkdownIt
type MarkdownToken = ReturnType<MarkdownIt['parse']>[number]

export async function initMarkdown(): Promise<void> {
  const highlighter = await createHighlighterCore({
    themes: [
      import('shiki/themes/github-light.mjs'),
      import('shiki/themes/github-dark.mjs'),
    ],
    langs: [
      import('shiki/langs/javascript.mjs'),
      import('shiki/langs/typescript.mjs'),
      import('shiki/langs/python.mjs'),
      import('shiki/langs/rust.mjs'),
      import('shiki/langs/go.mjs'),
      import('shiki/langs/bash.mjs'),
      import('shiki/langs/json.mjs'),
      import('shiki/langs/yaml.mjs'),
      import('shiki/langs/html.mjs'),
      import('shiki/langs/css.mjs'),
      import('shiki/langs/markdown.mjs'),
      import('shiki/langs/sql.mjs'),
      import('shiki/langs/java.mjs'),
      import('shiki/langs/c.mjs'),
      import('shiki/langs/cpp.mjs'),
      import('shiki/langs/ruby.mjs'),
      import('shiki/langs/php.mjs'),
      import('shiki/langs/swift.mjs'),
      import('shiki/langs/kotlin.mjs'),
      import('shiki/langs/shell.mjs'),
      import('shiki/langs/powershell.mjs'),
      import('shiki/langs/toml.mjs'),
      import('shiki/langs/xml.mjs'),
      import('shiki/langs/diff.mjs'),
      import('shiki/langs/docker.mjs'),
      import('shiki/langs/lua.mjs'),
      import('shiki/langs/dotenv.mjs'),
    ],
    engine: createOnigurumaEngine(import('shiki/wasm')),
  })

  md = MarkdownIt({ html: true, linkify: true, typographer: true, breaks: true })

  md.use(fromHighlighter(highlighter as unknown as HighlighterGeneric<string, string>, {
    themes: {
      light: 'github-light',
      dark: 'github-dark',
    },
    defaultColor: 'light',
  }))

  const fenceLangAliases: Record<string, string> = {
    env: 'dotenv',
    '.env': 'dotenv',
  }
  const previousHighlight = md.options.highlight
  md.options.highlight = (code, lang, attrs) => {
    const mapped = lang ? fenceLangAliases[lang] : undefined
    return previousHighlight!(code, mapped ?? lang, attrs)
  }

  md.use(texmath, {
    engine: katex,
    delimiters: 'dollars',
  })

  md.use(mark)
  md.use(footnote)
  md.use(taskLists, { enabled: false, label: true })
}

export function render(text: string, document: MarkdownDocumentModel | null = null): string {
  const tokens = md.parse(text, {})
  if (document) {
    annotateBlockTokens(tokens, document)
  }

  const dirty = md.renderer.render(tokens, md.options, {})

  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName !== 'style') return

    if (!shouldKeepStyleAttribute(node)) {
      data.keepAttr = false
    }
  })

  try {
    return DOMPurify.sanitize(dirty, {
      ADD_TAGS: ['section'],
      ADD_ATTR: ['class', 'style', 'data-md-block-id', 'data-md-block-kind'],
    })
  } finally {
    DOMPurify.removeHook('uponSanitizeAttribute')
  }
}

function shouldKeepStyleAttribute(node: Element) {
  if (node.closest('.katex') !== null) {
    return true
  }

  return node.tagName === 'SPAN' && node.closest('pre') !== null
}

function annotateBlockTokens(tokens: MarkdownToken[], document: MarkdownDocumentModel) {
  const blocks = document.blocks.filter((block) =>
    block.kind !== 'html'
    && block.kind !== 'table'
    && !block.context.insideFootnote)

  let blockIndex = 0
  for (let tokenIndex = 0; tokenIndex < tokens.length && blockIndex < blocks.length; tokenIndex += 1) {
    const token = tokens[tokenIndex]
    const block = blocks[blockIndex]
    if (!doesTokenRenderBlock(token, block, tokens, tokenIndex)) continue

    token.attrSet('data-md-block-id', block.id)
    token.attrSet('data-md-block-kind', block.kind)
    blockIndex += 1
  }
}

function doesTokenRenderBlock(
  token: MarkdownToken,
  block: MarkdownBlock,
  tokens: MarkdownToken[],
  tokenIndex: number,
) {
  switch (block.kind) {
    case 'heading':
      return token.type === 'heading_open'
    case 'paragraph':
      if (block.context.listDepth > 0 && token.type === 'list_item_open') {
        return isTightListItemToken(tokens, tokenIndex)
      }
      return token.type === 'paragraph_open' && token.hidden !== true
    case 'code':
      return token.type === 'fence' || token.type === 'code_block'
    case 'table-cell':
      return token.type === 'td_open' || token.type === 'th_open'
    case 'thematic-break':
      return token.type === 'hr'
    default:
      return false
  }
}

function isTightListItemToken(tokens: MarkdownToken[], tokenIndex: number) {
  const nextToken = tokens[tokenIndex + 1]
  return nextToken?.type === 'paragraph_open' && nextToken.hidden === true
}
