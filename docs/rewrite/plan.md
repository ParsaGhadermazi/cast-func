# Editor rewrite plan

Branch: `frontend-rewrite`. Feature parity checklist: [legacy-editor-inventory.md](legacy-editor-inventory.md).

Priorities from the user: **selection**, **shapes**, **lag and glitches**. Crop and the other ergonomics follow.

## Why the current editor feels wrong

1. **The server is the source of truth for every gesture.**
   - Each edit goes through this round trip:
     1. PATCH request.
     2. Version bump.
     3. SSE check (polled every 300 ms).
     4. Re-download of the full `/state`.
     5. Re-render.
   - Three overlay maps (`pendingGeom`, `pendingTextContent`, `pendingShapeStyles`) and the `S.dragging`/`layerSaving` flags try to hide the delay. That is where flicker, edits snapping back and lost selections come from.
2. **There is no interaction model.** Modes are separate global flags (`sel`, `selected`, `editPointsId`, `editingText`, `dragging`), and each handler checks them in its own way.
3. **Selection changes the stacking.** Selected blocks are raised to z-index 2147480000, so what you see while editing isn't the real layer order, and covered objects jump above their neighbours.
4. **Basic editing features are missing:**
   - Drag-box (marquee) selection.
   - Alignment guides and snapping to other objects.
   - Aspect-ratio lock.
   - Drawing a shape by dragging.
   - Moving line/arrow endpoints directly.
   - Rotation-aware group transforms.
   - On-canvas crop.
5. **Two renderers.** `export.py` has its own copy of the shape, table, image and text rendering.

## Architecture

| Concern | Choice |
|---|---|
| Language / build | TypeScript, Vite 6. Source lives in `frontend/` and builds to `cast/static/editor/`. The built bundle is committed, so `pip install` never needs Node. Vite 6 (not 8) because Vite 7+ needs Node ≥ 22.12. |
| UI | React 18. Imperative islands (Plotly, contenteditable, iframes) are wrapped in components that own their DOM node. |
| State | Zustand with Immer. One `doc` (the `.cast.json` document), one `ui` slice (selection, mode, zoom), one `assets` slice (from Python). |
| Undo/redo | Lives in the browser and uses Immer inverse patches. `transact()` groups edits; a gesture commits once, on pointer-up. |
| Transforms and marquee | Our own small geometry and handle layer, unit-tested. Moveable and Selecto were dropped: their coordinate math fights the CSS `zoom` the canvas needs (crisp text, and correct Plotly hover in present mode), neither has been released since 2023, and lines, points and crop need custom handles anyway. |
| Plotly, marked | Bundled from npm, so the editor and frozen exports work offline. |
| Rendering | One set of block renderers shared by the canvas, thumbnails, present mode and `freeze()` (through a small `viewer` bundle). |
| Tests | Vitest for the model, store, sanitizer and geometry. `@playwright/test` for end-to-end checks. pytest for the server. |

### Sync protocol: the browser owns the document

- **While editing:** edits apply to the local store immediately. Gestures (drag, resize, rotate, point drag) update only a local preview and commit one change on release.
- **Saving changes to the server:** one request at a time.
  - After a short pause (~150 ms), the client sends the new document: `POST /deck/sync {base_rev, client_id, document}`.
  - The server validates it with `_decode_deck`, stores it, bumps `deck_rev` and returns `{ok, rev}`.
  - Whole-document sync is simple and fast over loopback. If large embedded images make it slow, switch to sending JSON patches; Immer already produces them.
- **Typed SSE events, pushed when something changes rather than polled:**
  - `{"type":"deck","rev":N,"origin":client_id}`: other tabs refetch, and the tab that made the change ignores it.
  - `{"type":"asset","kind":"table","name":...,"version":...}`: only the affected blocks re-render.
- **Conflicts** (multi-tab only): a `base_rev` mismatch returns 409. The client refetches, keeps the server version and shows a toast.
- **Python-side `deck.save()` / `freeze()`:** the client flushes before Save, and the server always holds the latest synced document.
- **Removed once the old editor is deleted:** the per-block REST endpoints and server-side undo (`/deck/undo`, `/deck/redo`, history groups).

### Interaction model

- A single explicit mode replaces the separate flags:

  ```ts
  type Mode =
    | { kind: "idle" }
    | { kind: "marquee" }
    | { kind: "transform"; op: "move" | "resize" | "rotate" }
    | { kind: "draw"; shape: ShapeKind }
    | { kind: "editText"; id: string }
    | { kind: "editPoints"; id: string; point: number | null }
    | { kind: "crop"; id: string }
    | { kind: "present"; index: number }
  ```

  Keyboard handling, the inspector and pointer handling all read `mode`. Each mode has an explicit enter and exit; Escape always goes back one level.
- **Selection chrome** (outlines, handles, guides) is drawn in an overlay above the slide. Blocks keep their real z-order, and handles are always reachable.
- **Hit targets:** in edit mode each block has a transparent hit layer over its content, so Plotly, iframes, tables and SVG can't swallow clicks. This replaces capture-phase hacks such as stopping pointerdown on table bodies. Content becomes interactive in present mode, and in edit mode on double-click where that makes sense (scrolling a table, editing text).
- **Selection rules:**
  - Click selects the topmost object. Shift or Cmd click toggles it.
  - Dragging from empty canvas draws a marquee.
  - Alt+click cycles through overlapping objects under the pointer.
  - Clicking a member of the current group keeps the group so it can be dragged.
- **Transforms:**
  - Moving snaps to the slide edges and centre and to other objects' edges and centres, with visible guides. Holding Cmd temporarily disables snapping.
  - Shift locks the aspect ratio when resizing and snaps rotation to 15°.
  - Groups resize and rotate together.
- **Shapes:**
  - Pick a shape tool, then drag on the slide to draw it (Shift for a square, circle or 45° line). A plain click drops the default size.
  - Lines and arrows show endpoint handles instead of a bounding box.
  - Double-click a shape to edit its points. This keeps the current features (add on an edge, delete, Shift-constrain, nudge, flip, smooth, reset) and adds proper hit areas.
- **Crop:** double-click an image to enter crop mode. Drag the crop edges on the image with the cropped-away area dimmed; Enter or Esc confirms. The sliders stay in the inspector.

### Bugs fixed by design

- Text content is sanitised on load and in frozen output, not only on paste.
- "Reload iframe" works.
- A z-order change is one undo step, not one per block.
- Legacy markdown migration doesn't create history entries.
- Present mode doesn't produce duplicate element ids.
- Each SVG gets its own arrowhead marker id.
- Opacity is shown the same way in the canvas, thumbnails and present mode.
- Frozen HTML no longer needs internet. Plotly is inlined; `freeze(path, offline=False)` keeps the small CDN version.

### Document format

`.cast.json` schema version 1 is unchanged: same block fields and the same style keys and meanings as the inventory (§2–3). Legacy markdown migration is kept. Existing decks open without conversion.

## Milestones

The new editor runs at `/next` next to the old one until it reaches parity. Then it replaces `/`.

| # | Milestone | Done when |
|---|---|---|
| M0 | **Scaffold.** `frontend/` with Vite, TS, React, ESLint and Vitest. Build into `cast/static/editor/`. Server route `/next`. Plotly bundled. | `/next` shows a slide from `/state`. |
| M1 | **Model, sync, history.** Types for every block and style key, defaults, legacy migration, sanitizer port (with tests from the inventory's allowlist). Store with `transact` and undo/redo. `/deck/sync` and typed, pushed SSE. | Vitest covers the model, sanitizer and undo grouping. Two tabs stay in sync, with no overlay maps. |
| M2 | **Rendering.** Shared renderers for the six block types. Canvas with zoom/fit (CSS `zoom`, as today). Thumbnails. Present mode. | `/next` shows the fixture deck exactly like the old editor, read-only. |
| M3 | **Selection and transforms** *(priority)*. Overlay chrome, hit layers, click/toggle/marquee/Alt-cycle selection. Moveable move/resize/rotate, group transforms, snapping and guides. Nudge, clipboard, duplicate, delete, z-order, align, Layers panel. | Playwright: select, marquee, group drag/resize/rotate, guides, undo as one step each. |
| M4 | **Shapes** *(priority)*. Draw-to-create, line endpoints, point-edit mode, shape inspector. | Ported `_canvas_checks` shape cases, plus drawing and endpoint tests. |
| M5 | **Text.** Rich text editing, toolbar, per-character styles and mixed state, list indent, code variant, markers. | Ported `_editor_checks` rich-text cases. A text session is one undo step. |
| M6 | **Everything else.** Image (including on-canvas crop), table, figure and HTML inspectors. Theme menu. Slide rail with drag reorder and templates. Insert menu. Open, Save, Download. Responsive layout. | Every item in the inventory is checked off. |
| M7 | **Swap and clean up.** `freeze()` via the viewer bundle. `/` serves the new editor. Delete `templates.py`, the old endpoints and server-side undo. pytest suite. GitHub Actions running pytest, Vitest, Playwright and a check that the committed bundle matches the source. | CI is green and the README is updated. |

M3 and M4 come right after the foundation because they are the priorities. M1 removes the lag and glitches structurally.

## Progress

- **M0 done.**
  - `frontend/` is scaffolded with React 19, Vite 6, Vitest 4 and TypeScript 6.
  - `npm run build` typechecks and writes `cast/static/editor/editor.{js,css}`.
  - `/next` serves the build, with a cache-busting stamp. `/static` serves `cast/static/`.
- **M1 done.**
  - Model:
    - `model/types.ts` has the document types and every style key.
    - `model/normalize.ts` mirrors `_decode_deck` clamps and errors, migrates legacy markdown and sanitises stored content.
    - `model/sanitize.ts` is the exact port of the legacy allowlist.
  - Store and sync:
    - `store/docStore.ts` has transactions, gestures and patch-based undo with merge keys.
    - `store/sync.ts` debounces whole-document sync, serialises requests and resolves conflicts as server-wins.
    - `store/session.ts` wires the event stream, assets and the before-unload flush.
  - Server:
    - `registry.sync_deck`.
    - `deck_rev`, `deck_origin` and `assets_version` change markers.
    - `/deck/sync`.
    - `/state?deck=false`.
    - `/events` pushes changes instead of polling every 300 ms. The legacy editor still works on it.
  - Tests:
    - 36 Vitest tests (`npm test`).
    - Checked in the browser: migration save-back, local → server, server → tab within 400 ms, and undo sync.

- **M2 done.**
  - Rendering:
    - `render/SlideView.tsx` is the one slide renderer, used by the canvas, the thumbnails and present mode, with modes `edit`, `present` and `thumb`.
    - There are renderers for all six block types.
    - Shape geometry, crop math and text style are pure modules with tests.
    - `render/assets.ts` caches loads by asset version, so a Python data refresh re-renders only the affected blocks. Checked live: the table and Plotly chart updated each time the data function re-ran, without refetching the deck.
  - Editor chrome:
    - Slide rail with real thumbnails.
    - Stage with CSS-zoom Fit and manual zoom.
    - Viewbar.
    - Present mode with fullscreen and keyboard controls. Exiting lands the editor on the last presented slide.
  - Fixed by design:
    - Each SVG gets its own arrowhead marker id.
    - Opacity looks the same everywhere.
    - "Reload" works (the iframe is keyed by a reload counter).
  - Found and fixed: a cache-busting `?v=` on the entry script made the lazily loaded Plotly chunk import a second copy of the app. Static files are now served with `Cache-Control: no-cache` and plain URLs.
  - Tests: 51 Vitest tests.

- **M3 done.**
  - The selection model lives in `editor/uiStore.ts`; pointer gestures in `editor/interaction.ts`; the screen-space overlay in `editor/SelectionLayer.tsx`.
  - Transform maths is pure and tested in `editor/transform.ts`:
    - Resize in a rotated frame, with an aspect lock that follows the dominant axis and resize-from-centre.
    - Group scaling, which goes uniform when a member is rotated obliquely.
    - Rigid group rotation and 15° snapping.
    - Clamping so stored rectangles stay on the slide.
    - Snapping to slide and object edges and centres, with guides. On by default; hold Cmd/Ctrl to bypass; toggle in the viewbar.
  - Commands are pure Immer recipes in `editor/operations.ts`, each one undo step:
    - Delete, duplicate, insert/paste (offset only when landing exactly on existing blocks).
    - Layer moves (z renormalised to 0..n-1).
    - Align to the slide or to the selection, distribute, nudge.
    - Clipboard parsing, compatible with the legacy format and sanitised.
  - Interactions:
    - Click, Shift/Cmd toggle, marquee.
    - Alt+click cycles through stacked objects; Alt+drag duplicates.
    - Shift-drag locks the axis.
    - Escape cancels a gesture.
    - Tab steps through objects.
    - Arrow nudges (1 px, 10 px with Shift; a burst is one undo step).
    - Cmd+A/D/C/X/V. Pasted plain text becomes a text box and pasted images become image blocks.
  - Sidebar:
    - Properties: Arrange, align, distribute, layer order, duplicate, delete, and X/Y/W/H/rotation in slide pixels.
    - Layers: a top-first list with selection and drag-to-restack.
  - Verified in the browser with scripted pointer events:
    - Selection on charts.
    - Single-step drag with undo.
    - Escape cancel.
    - Snap guides.
    - Shift aspect lock and rotation.
    - Marquee.
    - Alt cycle and Alt-duplicate.
    - Group resize.
    - Layer and align buttons.
    - Copy/paste across slides.
  - Tests: 79 Vitest tests. A Playwright suite waits for M7 (it needs a Chromium download).

## Decisions (confirmed)

1. **The built bundle is committed**, so installing from git works without Node.
2. **Frozen HTML is offline by default.** Plotly is inlined (about 3.5 MB per export); `offline=False` opts out.
3. **Undo is per tab and in memory**, up to 200 steps. It doesn't survive a reload.
