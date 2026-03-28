# Highlighting And Comments Plan

## Goal

Add lightweight annotations to the markdown reader so a user can:

- highlight selected text while reading
- attach a short comment to a selected range
- use the feature during presentation without cluttering the default UI

The interaction target is Notion-like:

- the user selects text
- a small contextual action bar appears near the selection
- actions stay mostly hidden when the user is not actively annotating

## What The Current App Already Gives Us

The current app is simple enough that this feature can fit without a large refactor:

- markdown is rendered once into `#content`
- the active file lives in memory as raw markdown text
- local files can already be opened with `FileSystemFileHandle`
- session restore already keeps file handles in IndexedDB
- presentation mode builds slides from the rendered DOM, not from a separate data model

That last point matters: if highlights/comments should appear in presentation mode, annotations need to survive both normal reader rendering and the presentation slide cloning path.

## Recommendation

Build this in two steps.

### V1 recommendation

Ship annotations as a separate app-owned layer first.

- keep annotations in memory for the current app session only
- anchor them to selected text ranges in the rendered document
- show highlights in reader and presentation mode
- show comments in reader mode, but keep them optional or hidden by default in presentation mode

This avoids the hardest problems up front:

- no destructive file editing
- no save button in the first version
- no persistence model to get right yet
- no need to invent markdown comment syntax
- works for both local files and URL-loaded content

### V2 option

If you later want durable, portable annotations, add an explicit export/save flow:

- export annotations to a sidecar JSON file, or
- write them back to disk using the File System Access API for local files only
- offer a user-invoked `Save annotations into file` action rather than doing this automatically

I do not recommend writing comments/highlights directly into the markdown source in the first implementation. Plain Markdown has no standard inline comment/highlight syntax, and modifying source text will create ugly content, merge churn, and difficult range maintenance.

## Persistence Options

### Option A: Memory only

Pros:

- simplest implementation
- zero save UX
- good for ephemeral presentations

Cons:

- annotations disappear on refresh
- not useful for real reading workflows

### Option B: Browser-local persistence keyed to the document

Pros:

- best V1 tradeoff
- no file mutation
- supports local files and fetched URLs
- no extra buttons needed

Cons:

- annotations stay on the current browser/device only
- users may assume they are saved "into the file" when they are not

### Option C: Sidecar file such as `document.md-reader.json`

Pros:

- portable
- explicit
- avoids modifying markdown source

Cons:

- requires save/export/import UX
- awkward for URLs and files without write permission

### Option D: Write directly into the markdown file

Pros:

- annotations travel with the file

Cons:

- source pollution
- no standard markdown semantics for comments/highlights
- fragile selection mapping after edits
- requires permission upgrades and explicit save handling

Recommended decision: `Option A` for the first implementation, with a later path to `Option B` or `Option C` once the interaction model feels right.
Longer-term direction: keep an explicit save-to-file option on the roadmap, but defer both persistence and save UI until after the annotation UX is proven.

## Proposed Product Shape

### Reader view

- text selection reveals a floating action bar near the selection
- actions: `Highlight`, `Comment`, `Remove`
- highlights render inline with a subtle background color
- commented ranges also get a small comment marker
- clicking a commented range opens a compact popover with the note
- if we need a persistent summary, use a collapsible right-side comments panel only after the core interaction works

### Presentation view

- highlights should render by default
- comments should be hidden by default
- comments should not open automatically on slides
- comment capture during presentation is a real use case, but the input/display model is still open
- comments can appear on click/tap, or be hidden behind a presenter-only toggle later

This keeps slides clean while preserving presenter context when needed.

### Mobile

- mobile can be view-only in V1
- annotation creation and editing can wait for a later phase
- if we later support comment viewing on mobile, use a bottom sheet or centered popover, not tiny inline affordances

## Data Model

Use annotations that are independent from markdown syntax.

```ts
type Annotation = {
  id: string
  kind: 'highlight' | 'comment'
  comment?: string
  color: 'yellow'
  anchor: {
    quote: string
    contextBefore: string
    contextAfter: string
    pathHint?: string[]
    startOffset?: number
    endOffset?: number
  }
  createdAt: string
  updatedAt: string
}
```

### Why anchor by quote instead of raw DOM index only

The rendered DOM changes when:

- headings get ids rebuilt
- markdown is re-rendered after file reload
- presentation mode clones the rendered HTML

Quote-based anchoring with some surrounding context is more resilient than storing only DOM node indexes. We can still keep path or offset hints as a faster first attempt before falling back to quote matching.

## Document Identity

For V1 we only need enough document identity to keep annotation state attached while the app is open.

For local files and plain uploads:

- key state by the app's in-memory file id

For URL-loaded content:

- key state by the app's in-memory file id for the fetched article

If we later add persistence, we can upgrade this to use file metadata, hashes, or canonical URLs.

## Rendering Strategy

Do not inject annotation markup into the source markdown string.

Instead:

1. render markdown as usual
2. resolve stored annotations against the rendered DOM
3. wrap matching text ranges in span markers such as:

```html
<span class="annotation annotation-highlight" data-annotation-id="...">...</span>
```

4. attach event handlers for comment popovers and selection actions

This should happen every time the active file is rendered or refreshed.

## Suggested Technical Shape

Add a small annotation subsystem instead of mixing everything into `dropzone.ts`.

- `src/annotations/store.ts`
  in-memory annotation state and document identity
- `src/annotations/selection.ts`
  selection reading, range validation, contextual toolbar placement
- `src/annotations/anchors.ts`
  create and resolve quote-based anchors
- `src/annotations/render.ts`
  apply annotation spans to `#content`
- `src/annotations/comments.ts`
  popover or sheet behavior for comment display
- `src/annotations/types.ts`
  shared types

Then wire it into the existing flow:

- after `content.innerHTML = render(file.text)` in the reader path
- after file polling re-renders the current file
- when presentation mode copies slide HTML into the slide container

## Implementation Phases

### Phase 1: Annotation foundation

- add annotation types and document identity logic
- add an in-memory store scoped to the current app session
- implement selection parsing from the rendered content area
- reject selections that cross unsupported blocks if needed

Deliverable:

- selection can be turned into an annotation object and restored while navigating within the current session

### Phase 2: Highlight rendering

- resolve annotation anchors against rendered DOM
- wrap matched ranges with highlight spans
- add contextual toolbar with `Highlight` and `Remove`
- re-apply annotations after every render and file refresh

Deliverable:

- highlights working in reader view for the current session

### Phase 3: Comments

- add `Comment` action to the toolbar
- open an input popover or compact composer
- render commented ranges with a distinct treatment
- open note popover on click/tap

Deliverable:

- comments working in reader view for the current session without adding permanent chrome

### Phase 4: Presentation integration

- ensure slide HTML includes annotation spans
- decide whether comments are hidden, tappable, or presenter-only
- tune highlight colors for slide readability across themes

Deliverable:

- highlights work during presentation without degrading slide clarity

### Phase 5: Mobile polish

- dock annotation actions to the bottom on narrow screens
- increase hit areas for comment markers
- verify selection and dismissal behavior on iOS Safari and Android Chrome

Deliverable:

- annotation flows are usable on touch devices

### Phase 6: Optional save/export work

- add browser-local persistence if we want annotations to survive refreshes
- add sidecar export or file-write support if you want portability
- request `readwrite` permission only when the user explicitly saves
- handle file reload conflicts when the markdown source changes underneath stored annotations

Deliverable:

- explicit persistence outside the browser, if needed

## Questions To Resolve Before Building

These are the decisions that change the implementation enough that we should settle them first.

### 1. What is the persistence contract?

Choose one:

- browser-local only for V1
- exportable sidecar files
- direct markdown file writes

Current direction:

- in-memory or single-session state for V1
- focus first on getting highlighting and comments right
- no save UI in V1
- explicit save-to-file option later
- no automatic writes into the markdown file

### 2. Should highlights and comments appear in presentation mode?

This is really two decisions:

- should highlights be visible on slides
- should comments be visible on slides

Current direction:

- highlights: yes
- comments: hidden by default
- open question: how comment authoring should work while actively presenting

### 3. Are comments reader-facing or presenter-facing?

If comments are mainly presenter notes, they should probably stay subdued in reader mode and mostly hidden in presentation mode.

If comments are collaborative reading notes, we may want a comment list or sidebar later.

### 4. Do you want annotations to survive markdown edits?

If yes, we should invest more in resilient anchoring and conflict handling.

If no, we can treat annotations as valid only for the current content version.

My recommendation: aim for best-effort survival across small edits, but do not block V1 on perfect rebasing.

### 5. Should URL-loaded articles support annotations?

The app already supports URLs, so excluding them would feel inconsistent.

My recommendation: yes for session-only annotations in V1, no for save/export in V1.

### 6. What is the mobile expectation?

Choose one:

- fully supported in V1
- read-only on mobile in V1
- create and view comments/highlights on mobile in V2

Current direction: read-only on mobile in V1.

### 7. Do we need multiple highlight colors?

Single-color highlighting keeps the data model and UI much simpler.

My recommendation: one highlight color in V1.

### 8. Do we need a visible list of comments?

If comments are sparse, inline popovers are enough.

If comments are frequent, a panel becomes useful.

Current direction:

- comments should generally live off to the side
- a centralized comments sidebar is deferred for now
- do not block V1 on a full comment index

## Decisions Locked So Far

- V1 annotation state should be in memory for the current session only.
- We should focus on getting the annotation UX right before adding persistence.
- We should keep an eventual explicit option to save annotations back into the file.
- Highlights should appear in presentation mode.
- Comments should be hidden by default in presentation mode.
- Mobile can be view-only in V1.
- Comments should generally appear off to the side rather than as heavy inline UI.
- A centralized comment sidebar can be deferred.

## Still Open

- What exact save-to-file format should we support later: direct markdown mutation, sidecar export, or both?
- How should comment authoring work during presentation without cluttering slides?
- Should reader comments open as anchored side popovers, a slim side rail, or something else?
- How much should annotations survive underlying markdown edits?

## Risks

- DOM-range annotation logic can get tricky across nested markdown markup like links, emphasis, inline code, and footnotes.
- Reapplying annotations after file polling may fail if the file content changes significantly.
- Presentation mode may need extra styling so highlight colors remain readable across themes.
- Mobile browser selection APIs are inconsistent enough that this needs real device testing.

## Minimal Decision Set Needed To Start

We can begin implementation with the current decisions.

The remaining questions do not block a V1 foundation if we scope the first build to:

1. in-memory annotation state for the current session
2. highlight creation in reader view
3. highlight visibility in presentation mode
4. comment data model plus basic reader-side display hooks

If you want the fastest path, I would lock the following:

- in-memory annotation state only for V1
- persistence and save UI deferred until later
- highlights visible in presentation mode
- comments visible in reader mode, hidden by default in presentation mode
- single highlight color
- comments shown off to the side in a lightweight way
- no markdown file writes in V1
