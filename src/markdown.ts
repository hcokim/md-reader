import MarkdownIt from 'markdown-it'
import { fromHighlighter } from '@shikijs/markdown-it/core'
import { createHighlighterCore } from 'shiki/core'
import type { HighlighterGeneric } from 'shiki'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'
import texmath from 'markdown-it-texmath'
import footnote from 'markdown-it-footnote'
import taskLists from 'markdown-it-task-lists'
import katex from 'katex'

let md: MarkdownIt

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
    ],
    engine: createOnigurumaEngine(import('shiki/wasm')),
  })

  md = MarkdownIt({ html: true, linkify: true, typographer: true })

  md.use(fromHighlighter(highlighter as unknown as HighlighterGeneric<string, string>, {
    themes: {
      light: 'github-light',
      dark: 'github-dark',
    },
    defaultColor: 'light',
  }))

  md.use(texmath, {
    engine: katex,
    delimiters: 'dollars',
  })

  md.use(footnote)
  md.use(taskLists, { enabled: false, label: true })
}

export function render(text: string): string {
  return md.render(text)
}
