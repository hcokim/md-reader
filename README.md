# md-reader

A web-based Markdown viewer with presentation mode, annotations, and multiple themes. Load local files or fetch content from URLs, then read, present, or annotate — all in the browser with no backend required.

## Features

### Reading
- Drag and drop `.md`, `.markdown`, `.mdx`, or `.txt` files onto the page
- Open files with the file picker (supports multiple files)
- Paste a URL to fetch and render article content via [defuddle](https://defuddle.md)
- GitHub Flavored Markdown: tables, strikethrough, autolinks, task lists
- Syntax highlighting for 25+ languages (powered by Shiki)
- LaTeX math rendering with KaTeX (`$inline$` and `$$display$$`)
- Footnotes, `==highlighted text==`, and mark syntax

### Themes and display
- **GitHub** — clean system sans-serif
- **Serif** — editorial, book-like (Source Serif 4)
- **Sans** — geometric, friendly (Google Sans Flex)
- **Mono** — code-focused (SF Mono / Menlo)
- Light, dark, and auto color modes (follows system preference)
- Adjustable content width: narrow, medium, or wide

### Presentation mode
- Automatically builds slides from your heading structure
- Keyboard and click navigation (arrows, space, click zones)
- Breadcrumb trail showing document hierarchy
- Outline sidebar with slide previews
- Timeline dots for quick navigation

### Annotations
- Select text to highlight or add comments
- Comments are stored as Markdown footnotes — portable and human-readable in the source
- Edit or remove annotations inline
- Works in both reader and presentation views

### Multi-file and session management
- Load multiple files and switch between them in the sidebar
- Table of contents outline generated from headings
- Session restore — reopen your previous files on return (uses IndexedDB to persist file handles)
- Auto-detects external file changes and offers to reload

### Saving
- Edit annotations or comments, then save directly back to the original file using the File System Access API
- Tracks unsaved changes with a visible save button

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `/` | Toggle sidebar |
| `P` | Enter presentation mode |
| `Escape` | Exit presentation / close sidebar |
| `Arrow keys` / `Space` | Navigate slides |
| `Cmd/Ctrl + Enter` | Save comment |

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- npm

### Development

```bash
npm install
npm run dev
```

This starts a local Vite dev server with hot module replacement.

### Build for production

```bash
npm run build
```

Output goes to `dist/`. This is a static site — deploy it anywhere (Netlify, Vercel, GitHub Pages, Cloudflare Pages, or any static file host).

### Preview production build

```bash
npm run preview
```

### Run tests

```bash
npm test
npm run test:watch   # watch mode
```

## Project structure

```
src/
  main.ts              # Entry point, initializes all modules
  markdown.ts          # Markdown rendering (markdown-it + Shiki + KaTeX)
  markdown-model.ts    # AST parsing, document model, source mapping
  markdown-state.ts    # Global state for loaded documents
  markdown-editor.ts   # Source text editing (highlight/comment operations)
  dropzone.ts          # File loading, drag-and-drop, URL fetching, session management
  active-file.ts       # Active file state bridge
  controls.ts          # Settings panel logic
  themes.ts            # Theme and display settings with localStorage persistence
  annotations.ts       # Text selection, highlighting, and comment system
  selection-mapper.ts  # Maps DOM selections back to source markdown offsets
  present.ts           # Presentation mode: slides, navigation, outline
  style.css            # All styles and theme variables
index.html             # Complete UI structure
```

## Deployment

The build output is a static site. A `wrangler.toml` is included for Cloudflare Workers/Pages deployment, but you can host the `dist/` folder on any platform.

## License

This project is open source. Free to use, modify, and distribute.
