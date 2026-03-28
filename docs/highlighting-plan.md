# Markdown-First Highlighting And Comments Plan

## Goal

Move highlighting and comments to a markdown-native model so the raw markdown string is the single source of truth for:

- reader view
- presentation view
- eventual save/export back to disk

That means annotations should no longer live as a separate DOM overlay system. Instead, user actions should become markdown edits, and both views should rerender from the updated markdown.

## Product Direction

### Canonical syntax

- highlights use `==highlighted text==`
- comments use markdown footnotes

The first implementation should use referenced footnotes so the source-position parser can model them reliably:

```md
==Selected text==[^comment-1]

[^comment-1]: Short presenter note
```

## Why The Current Approach Keeps Breaking

The current implementation tries to anchor annotations against rendered DOM in two different surfaces:

- the normal reader DOM
- the presentation DOM, which is built from cloned rendered HTML

That creates the recurring bugs we have already seen:

- selection drift
- list corruption
- presentation-only regressions
- comment and highlight ranges attaching to the wrong characters

The root issue is architectural: the app has multiple runtime document models, but no single canonical source model for annotations.

## New Architecture

### Source of truth

The canonical document state should be:

- raw markdown text
- a parsed markdown model with source positions

Everything else is derived from that:

- rendered reader HTML
- rendered presentation HTML
- outline/headings
- annotation display

### Rendering flow

1. load markdown text
2. parse markdown into a source-position-aware model
3. render HTML from the markdown text
4. build reader view from that render
5. build presentation view from the same markdown text, not from annotation overlays

### Annotation flow

1. user selects rendered text
2. app maps that selection back to source offsets in the markdown model
3. app rewrites the markdown string
4. app reparses and rerenders
5. both reader and presentation update from the same markdown state

This replaces “apply highlight spans into the DOM” with “edit markdown, then rerender”.

## Data Model

Use markdown itself for persistence, plus a parsed model for editing operations.

```ts
type MarkdownDocumentModel = {
  source: string
  blocks: MarkdownBlock[]
  headings: MarkdownHeading[]
}

type MarkdownBlock = {
  id: string
  kind: 'heading' | 'paragraph' | 'code' | 'table' | 'html' | 'thematic-break'
  range: {
    start: { line: number; column: number; offset: number }
    end: { line: number; column: number; offset: number }
  }
  source: string
  text: string
  context: {
    listDepth: number
    quoteDepth: number
    insideFootnote: boolean
  }
}
```

The important shift is that highlights/comments are no longer stored as a separate annotation object with fuzzy DOM anchors. They exist because the markdown contains `==...==` and footnotes.

## UI Implications

### Reader view

- text selection still opens a contextual toolbar
- `Highlight` wraps the selected source range in `==`
- `Comment` inserts footnote syntax anchored to that selected range
- clicking highlighted/commented text can still open a lightweight popover for editing or removal

### Presentation view

- presentation is no longer a special annotation surface
- it just renders the same markdown-derived content
- highlights show automatically because `<mark>` is part of the render
- comments can stay visually hidden by default, but they should come from the same markdown source

This is the main fix for presentation-specific drift.

### Mobile

- still view-only for creation in V1
- since markdown is canonical, view behavior stays consistent with desktop

## Editing Strategy

### Highlights

Preferred first implementation:

- only allow highlight insertion when the selection maps cleanly to one source block
- wrap that source slice with `==` delimiters

Example:

```md
before selected text after
```

becomes:

```md
before ==selected text== after
```

### Comments

Preferred first implementation:

- select text
- choose `Comment`
- open the existing popover editor
- when the user confirms, wrap the span in `==...==` and append a referenced footnote

Example:

```md
selected text
```

becomes:

```md
==selected text==[^comment-1]

[^comment-1]: Presenter reminder
```

This keeps the saved format markdown-native while still giving the renderer a visible anchor for the comment target.

## What Changes In The Codebase

### Keep

- `src/dropzone.ts` session/file loading
- `src/present.ts` general slideshow shell
- `src/markdown.ts` renderer

### Add

- `src/markdown-model.ts`
  parse markdown with source positions and expose block metadata
- `src/markdown-editor.ts`
  pure functions that apply markdown edits such as highlight insertion and comment insertion
- `src/selection-mapper.ts`
  map DOM selections back to source blocks and source offsets

### Replace

The current DOM-overlay annotation subsystem in `src/annotations.ts` should be retired in phases:

- stop treating DOM spans as persisted annotation state
- keep only the contextual selection UI pieces that are still useful
- route actions into markdown edits instead of DOM mutation

## Implementation Phases

### Phase 1: Foundation

- render `==...==` as `<mark>`
- add a markdown model with source positions and block extraction
- keep markdown as active file state, not DOM annotations

Deliverable:

- a reliable source-aware document model exists for every loaded file

### Phase 2: Reader highlight rewrite

- map desktop selections in reader view back to a source block
- insert `==` into markdown
- rerender from markdown
- remove DOM highlight persistence for reader mode

Deliverable:

- reader highlights are created by editing markdown, not by wrapping DOM nodes

### Phase 3: Comment rewrite

- convert `Comment` into markdown footnote insertion
- keep the current popover as the text-entry UI
- rerender from markdown after insertion or deletion

Deliverable:

- comments are markdown-native and survive rerender without special anchoring logic

### Phase 4: Presentation alignment

- stop using presentation as a separate annotation target
- reuse the same markdown-derived source mapping or make presentation creation read-only until the source-mapped path is stable
- ensure presentation rerenders from the same markdown state after edits

Deliverable:

- presentation reflects the same canonical content without separate annotation bugs

### Phase 5: Save/export

- once the markdown edit pipeline feels right, add explicit save/write support for local files
- use the existing `FileSystemFileHandle` flow for user-invoked writes only

Deliverable:

- annotations can be written back into the markdown file intentionally

## Immediate Open Questions

These are the only product questions that still matter before full implementation:

- If a user highlights text that already contains markdown formatting, do we allow wrapping it immediately or only support plain-text spans first?
- In presentation mode, do we allow new annotations immediately once source-mapped editing is stable, or make presentation view-only until then?

None of those block the foundation work.

## Recommendation

Proceed with a markdown-first refactor now.

Do not keep investing in DOM-anchored annotations as the persistence model. They are already fighting the app structure, and they will make eventual save/export harder rather than easier.
