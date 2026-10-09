# cast editor feature inventory (`cast/templates.py`)

I read the whole file (3,464 lines), all three check scripts, and the parts of `cast/server.py` and `cast/static/icons-entry.js` it depends on.

- **Line ranges:** PAGE is L10–154, APP_CSS is L156–496, APP_JS is L498–3463. Line numbers below are file lines.
- **Shared logic elsewhere:** `cast/export.py` (the static "freeze" export) has its own copy of shapeSvg, applyTextStyle, the table renderer and image crop (around L290–410). The new editor has to keep the same style-key meanings as that file.
- **Dependencies:**
  - Icons: `cast/static/icons.js` (Lucide 0.468 bundle). It exposes `window.castIcon(name)`, which turns a kebab name into PascalCase, falls back to `Shapes`, and draws 16px icons with stroke 1.8.
  - CDN: Plotly 2.30.0, and marked 12.0.0 (used only to migrate legacy markdown).
  - Google Fonts: Inter 400/600/700, Poppins 400/600/700, Playfair Display 400/700, Roboto Mono 400/700.

---

## 1. Layout and chrome

### Topbar (`#topbar`, L25–37)
- Brand "cast".
- `#deck-filename`: shows `S.workspace.filename || S.deckName` (default `presentation.cast.json`) and repeats it as the title.
- `#status` (`role=status`, aria-live): shows "connecting…", then "live" or "reconnecting…" from SSE. `showStatus(msg, duration=1800)` resets it to "live" after the timeout; `duration=0` keeps the message.
- `#undo-btn` ↶ and `#redo-btn` ↷: disabled when `historyBusy || !S.history.can_undo/can_redo` (`renderHistoryButtons` L772).
- `#open-deck-btn` clicks the hidden `#open-deck-file` input (`accept=".json,application/json"`), which calls `openEditableDeck`.
- `#download-deck-btn` → `downloadEditableDeck`.
- `#save-deck-btn` → `saveEditableDeck`. It is disabled unless `S.workspace.configured`. Title: "Save to {filename} (Cmd/Ctrl+S)", or a hint to "Create Cast('presentation.cast.json')…".
- `#present-btn` (primary) → `enterPresent`. Disabled when there are no slides.

### Toolsbar (`#toolsbar`, role=toolbar, L38–108)
- `#rail-toggle` and `#inspector-toggle` (aria-pressed) → `togglePanel` (L590).
- **Slide menu** (`#slide-menu-btn` / `#slide-menu`):
  - `#slide-template` select: blank, title, data, split, quote.
  - `#add-slide-btn` → `addSlideFromTemplate(value)`.
- `#add-text-btn` "Text" → `addText`.
- **Shape menu** (`#shape-menu-btn` / `#shape-menu`):
  - `#shape-palette`: 5-column grid of SHAPE_OPTIONS buttons, each with `title`/`aria-label` set to the shape name. Clicking sets `S.shapeKind`.
  - `#add-shape-btn` → `addShape`.
- **Insert menu** (`#insert-menu-btn` / `#insert-menu`, class `assets`, 360px wide). Each row is label + select + add button:
  - Figure: `#add-figure` + `#add-figure-btn`.
  - Figure data: `#figure-data`, with "No data" plus the tables. It only applies to newly added figures.
  - Table: `#add-table` + `#add-table-btn`.
  - HTML: `#add-html` + `#add-html-btn`.
  - Image: `#add-image` + `#add-image-btn`. When there are no assets it offers a "Blank image" option.
  - Empty placeholders: "No figures", "No tables", "No HTML objects".
  - Disabling: buttons are disabled when the asset list is empty or there are no slides. The image add button only needs slides.
- **Theme menu** (`#theme-menu-btn` / `#theme-menu`):
  - `#theme-preset`: "" (Custom theme), studio, paper, night, mint.
  - Colour inputs `#theme-accent`, `#theme-bg`, `#theme-fg`.
  - `#theme-font` select.
- **Menu behaviour** (L3259–3274):
  - Clicking a menu button toggles it and closes any other open menu.
  - Opening positions the popover with `position:fixed`: top = button bottom + 8, left clamped to [12, innerWidth − width − 12]. It focuses the first select/button/input, adds the `.menu-open` class and sets `aria-expanded`.
  - Menus close on outside `pointerdown` or `focusin`, window resize, and Escape (which returns focus to the button via `closeMenus(true)`). `addBlock`, `addSlideFromTemplate` and `enterPresent` also close them.
- Buttons with `data-icon` get the icon prepended at startup, and their `aria-label`/title are filled from the label text (L3446).

### Viewbar (`#viewbar`, L122–138)
- `#slide-prev` / `#slide-next`.
- `#slide-number` input: navigates on change; on blur it resets to the current slide. It is not overwritten while focused.
- `#slide-total` shows "/ N".
- `#grid-btn` toggles `S.grid` (default on) and the `#canvas.show-grid` class.
- `#snap-btn` toggles `S.snap` (default off).
- `#zoom-out` / `#zoom-in`: ±0.1, clamped to 0.1–1.6, and set `fitZoom = false`.
- `#zoom-fit` "Fit" (aria-pressed = fitZoom) → `fitStage`.
- `#zoom-label` shows the zoom percentage.

### Slide rail (`#rail`, `renderRail` L919; mini blocks in `buildMiniBlock` L789)
- **Thumbnail structure:** `.thumb[data-slide-id]` with `draggable=true`, tabindex 0 on the active thumb, `aria-current`, and an aria-label of "Slide N: {first text block label}".
- **Thumbnail children:**
  - `.mini`: scaled preview using the slide background, falling back to `theme.bg`.
  - `.num`.
  - `.dup` ⧉: `duplicateSlide`.
  - `.del` ×: asks for confirmation only if the slide has blocks, then sends `DELETE`.
- **Mini blocks:**
  - Every type gets x/y/w/h as percentages, z, `opacity` and `rotate`.
  - Text renders real rich HTML at logical size (`w*1040` × `h*585`) inside a wrapper with `zoom: var(--preview-scale)`. `--preview-scale` = thumb clientWidth / 1040, and a ResizeObserver on the rail keeps it current.
  - Image uses a real `<img>` with fit, rendering and crop.
  - Shape uses `shapeSvg`.
  - Figure is a fake bar chart (heights 42/68/51/86/64/92%) plus the figure title.
  - Table is a header strip (honouring headerBg/headerColor) plus a CSS grid pattern.
  - HTML is a CSS-only "HTML" placeholder.
- A trailing `.add-slide` "+ Slide" button uses the current `#slide-template` value.
- **Rail keyboard:** ArrowUp/ArrowDown/Home/End/Enter/Space navigate between slides and keep focus in the rail.
- **Native HTML5 drag reorder** (L943–977):
  - On dragstart: `S.dragging = true` (this blocks refresh), add the `slide-dragging` class, and record `slideOrderBeforeDrag`.
  - On dragover: the DOM is reordered live (before/after based on the vertical midpoint), shown with `.slide-drop-before` / `.slide-drop-after`, and the numbers update.
  - The rail auto-scrolls by 18px when the pointer is within 40px of its edges (L3275).
  - A drop sets `slideDropAccepted`. On dragend, `finishSlideReorder` sends `PATCH /slides/order` if the order changed and the drop was accepted; otherwise it re-renders and calls refresh (cancel reverts).
  - A click right after a drag is suppressed with `suppressSlideClick` (cleared via setTimeout 0).
  - `goToSlide` waits for `slideReorderPromise`.

### Sidebar
- Tabs `#properties-tab` / `#layers-tab` (role=tab, aria-selected, roving tabindex). ArrowLeft/ArrowRight switch tabs. `setPanel` (L580) controls `#inspector` and `#layers` (hidden attribute).

### Layers panel (`renderLayers` L2198)
- **Tool row:** Bring to front, Bring forward, Send backward, Send to back.
  - These are icon buttons with aria-labels; the tests look them up by those names.
  - They are disabled while a layer save is running, when more than one object is selected, when nothing is selected, or when the object is already at that end.
- **Duplicate object button:** duplicates the multi-selection, or the single block.
- **Summary line:** "N selected · M objects", or "M object(s)".
- **List:** `.layer-item` buttons, topmost first. Each has `aria-pressed`, `data-focus-key=<block id>`, an icon (text: type; shape: shapes; figure: chart-no-axes-combined; table: table2; html: code; image: image), `.layer-name` from `blockLabel` (L900) and `.layer-type`. Shift/Cmd/Ctrl-click toggles selection.
- Focus is restored after re-render through `data-focus-key`.

### Inspector (`renderInspector` L2250)
- **Several objects selected:** a header "N objects selected", a hint, and Duplicate / Delete buttons.
- **No block selected:** "Slide N" (or "Presentation" when there are no slides), the object count, and a "Duplicate slide" button.
- **One block selected:**
  - Arrange section: 6 align icon buttons, then Duplicate and "Send back" (`moveLayer` back).
  - The type-specific section (see §2).
  - Geometry section: X, Y, Width, Height as integer percentages (min 0/0/3/3, max 100) → `patchGeom`; Rotate as a range from −180 to 180 → `patchStyle({rotate})`.
  - A "Delete block" button (`.danger`): `DELETE`, no history group, no confirmation.
- **Control helpers (L2446–2584):**
  - `styleRow`, `numInput`, `colorInput` and `rangeInput` fire on `input`.
  - `textInput` and `toggleInput` fire on `change`.
  - `selectInput(opts, val, on, labels)`.
  - `fillControl`: a checkbox plus a colour input; unchecked means "transparent"; when disabled the colour defaults to #5b8cff.
  - `fileInput`: FileReader turns the file into a data URL.
  - `cropSideControl`, `shapePicker` (4-column grid), `shapeSwatches`.
  - `preserveTextSelectionControl` (see §4).

### Responsive rules (CSS L300–317, JS L3453–3462)
- `body.rail-hidden` / `body.inspector-hidden` hide the panels.
- At ≤1100px: rail 160px, sidebar 264px. Desktop sizes are rail 196px, sidebar 296px.
- At ≤760px:
  - Rail and sidebar become absolute overlays (z 2147480500); `#status` is hidden.
  - `matchMedia` hides both panels when entering compact mode. `desktopPanels` remembers the desktop state.
  - Only one panel can be open at a time: opening one hides the other.
- At ≤440px: the filename is hidden, menu and Text buttons become icon-only (`font-size:0`), the "Save" label is hidden, and the viewbar wraps.

---

## 2. Block types and every style key

**Common block fields:**
- `id`, `type`.
- `x`, `y`, `w`, `h`: normalised 0–1. Minimum w/h is 0.03.
- `z`: integer.
- `style`: object. PATCH always sends the whole merged style object.
- Slides: `{id, background?, blocks}`. `background` is a legacy per-slide colour that overrides `theme.bg` in edit, present and thumbnails.

**Wrapper:**
- `.block.<type>#blk-<id>[data-bid]` containing `.body` (`BODY_CLASS` L1044).
- `applyGeom` (L1104) sets left/top/width/height as percentages, zIndex = z, `transform: rotate(style.rotate deg)` and origin 50% 50%.

**Keys every type uses:**
- `rotate`: integer degrees, −180..180 in the UI.
- `opacity`: 0–1. In the editor and present views it is applied only to image and shape bodies. Thumbnails apply it to every type, and no other type has a UI control.

### text (`renderTextInto` L1174, `applyTextStyle` L1131)
- **Fields:**
  - `content`: sanitised HTML.
  - `markdown`: legacy; migrated (see §4).
- **Style keys:**

| Key | Values / default | Notes |
|---|---|---|
| `textVariant` | `"plain"` \| `"code"` | `code` adds `.code-text`: dark window chrome with traffic-light dots via `::before`, padding 36/20/16, `white-space:pre-wrap`, scrolls. |
| `fontFamily` | default "" (inherits theme font); code: `'Roboto Mono',ui-monospace,SFMono-Regular,Menlo,monospace` | |
| `fontSize` | number px; default 18 (16 for code) | Inspector range 8–200. |
| `color` | default "" (inherits theme fg); code: `#e5e7eb` | Inspector default `#1a1d24`. |
| `align` | `left` \| `center` \| `right`; default left | |
| `weight` | CSS weight; UI options `normal`, `600`, `bold` | |
| `italic` | bool | |
| `lineHeight` | number; default CSS 1.45 (code 1.55) | Inspector 0.8–3, step 0.05. |
| `bg` | default transparent (code `#111827`) | Checked with `hasOwnProperty`, so an explicitly stored "transparent" still overrides the code default. |
| `textMode` | legacy | Deleted on load. |

- **Inspector:** Style (Plain/Code → `setTextVariant` L2982), the rich toolbar, the Edit text / Finish editing button, then Font, Size, Line height, Color, Background, Align, Weight, Italic.
- **Font, Size, Color, Weight and Italic apply per-character spans** through `applyCharacterStyle`. They do not change the block style. When nothing is selected they wrap the whole content. Line height, Background and Align patch the block style.
- `setTextVariant` writes a full preset:
  - code: `{textVariant:"code", fontFamily: mono, fontSize:16, lineHeight:1.55, color:"#e5e7eb", bg:"#111827", align:left, weight:normal, italic:false}`.
  - plain: `{fontFamily: theme.font || FONTS[0], fontSize:18, lineHeight:1.45, color: theme.fg || "#1a1d24", bg:"transparent", …}`.

### image (`renderImageInto` L1470)
- **Fields:** `image` holds the asset name, or "" for a manual image.
- **Source:** an asset loads `./render_image?image=<name>&v=<version>`; otherwise `style.src` is used.
- **Placeholder:** with no source it shows "No image yet — choose an asset, file, or URL."
- **Style keys:**

| Key | Values / default | Notes |
|---|---|---|
| `src` | data URL or http URL | Manual upload or URL. |
| `fit` | `contain` (default) \| `cover` \| `fill` | UI labels Contain / Cover / Stretch. |
| `crop` | `{left, top, right, bottom}` fractions | See §7. Slider 0–80%. |
| `rendering` | `auto` \| `crisp-edges` \| `pixelated` | → CSS `image-rendering`. |
| `bg` | default transparent | Applied to the body. |
| `alt` | string | Falls back to `asset.alt`, then `asset.title`. |
| `radius` | 0–200 px | Body border-radius. |
| `opacity` | 0–1, step 0.05 | |

- **Inspector:**
  - Asset select ("Uploaded / URL" plus the assets) → `bindImageAsset`: sets fit (keeps the existing value or contain) and alt from the asset.
  - Upload file → `setManualImage(dataUrl)`.
  - "Or image URL" text input. Its value is shown only for non-data-URL `src`.
  - Fit.
  - "Use source ratio" → `fitImageToSource` (L2490).
  - Crop sliders for left/right/top/bottom plus "Reset crop".
  - Rendering, Background, Alt text, Corner, Opacity.
- `setManualImage` sets `image = ""` and `style.src`, and sends `{image:"", style}`.

### shape (`renderShapeInto` L1554, `shapeSvg` L1636)

| Key | Values / default | Notes |
|---|---|---|
| `shape` | see §3; default rect | |
| `fill` | default `#5b8cff` | Line shapes use fill "none". |
| `stroke` | default none | `transparent`/`none` mean none. Line shapes fall back to the fill colour. |
| `strokeWidth` | 0–32 | Default 4 for line shapes, 0 otherwise. Uses `vector-effect="non-scaling-stroke"`. |
| `dash` | `solid` \| `dash` ("10 7") \| `dot` ("2 6") \| `long` ("18 8") | |
| `lineCap` | `round` (default) \| `butt` \| `square` | |
| `lineJoin` | default round | No UI. Line paths hard-code round. |
| `radius` | rect: `rx` = radius \|\| 0; round-rect: radius ?? 16 | UI 0–50, shown only for rect and round-rect. |
| `points` | `[[x,y],…]` in 0–100 units, or null | Valid only with ≥3 points (≥2 for lines), ≤64 points, finite numbers. Otherwise ignored. |
| `smooth` | bool | |
| `shadow` | 0–24 | → `filter: drop-shadow(0 Spx 2Spx rgba(0,0,0,.28))`. |
| `opacity` | 0–1 | |

- **SVG:** viewBox `0 0 100 100`, `preserveAspectRatio="none"`, `overflow:visible`.
- **Inspector:**
  - shapePicker grid plus a "Type" select. Both go through `normalizeShapePatch` (L2556).
  - "Edit points" toggle and the point tools (§3).
  - Swatches: #5b8cff, #111827, #fff, #ef4444, #f59e0b, #16a34a, #06b6d4, #a855f7, transparent. They set fill and leave stroke effectively unchanged.
  - Fill (hidden for line shapes), Stroke, Stroke width, Stroke style, Line cap, Corner, Shadow, Opacity.
- **`normalizeShapePatch`** (runs when the shape kind changes):
  - Always sets `points:null` and `smooth:false`, and clears the selected point.
  - Switching to a line shape:
    - stroke: the existing stroke, otherwise fill, otherwise theme accent.
    - strokeWidth: the existing value, otherwise 5.
    - fill: "transparent".
    - arrow-line also gets lineCap "round" if none is set.
  - Switching to a filled shape: fill is the existing non-transparent fill or the theme accent; strokeWidth becomes 0 if it was null.
  - round-rect gets radius 16 if it had no radius.

### table (`renderTableInto` L1930)
- **Fields:** `table`.
- **Style keys:**

| Key | Values / default | Notes |
|---|---|---|
| `rowLimit` | default 200, clamped 1–1000 | UI options 25/50/100/200/500/1000. |
| `fontSize` | default 12 | UI range 9–22. |
| `compact` | bool | `.compact`: cell padding 4px 8px. |
| `striped` | default true | `false` adds `.no-stripes`. |
| `showIndex` | default true | Sticky `#` row-index column. |
| `headerBg` | CSS default `#eef2f7` | Applied to the meta bar and the `th` cells. |
| `headerColor` | default `#374151` | |
| `bg` | default `#ffffff` | |
| `borderColor` | render default `rgba(31,41,55,.16)` | The inspector colour input shows `#d1d5db`. |

- `addTable` seeds all of these explicitly: `rowLimit 200, fontSize 12, compact false, striped true, showIndex true, headerBg #eef2f7, headerColor #374151, bg #ffffff, borderColor #d1d5db`.
- **Inspector:** Data select (sets `live.table` then `renderCanvas` and PATCH `{table}`), Rows, Font size, Compact, Striped, Row numbers, Header, Header text, Background, Border.

### html (`renderHtmlInto` L1981)
- **Fields:** `html`. No style keys apart from rotate.
- **Inspector:** Object select (PATCH `{html}`) and a "Reload iframe" button.
  - **Likely bug:** "Reload iframe" calls `renderCanvas()`. When the structure signature hasn't changed this falls through to `syncCanvas`, which skips html blocks, so the button does nothing.

### figure (`renderFigureInto` L1906)
- **Fields:** `figure`, and `table` (optional data binding; "" means none).
- **Style:** only `rotate`.
- **Inspector:** Plot select, and a Data select ("No data" plus tables, shown only when there are tables). Both PATCH and rebuild.

---

## 3. Shapes and point editing

- **SHAPE_OPTIONS (L1561):** rect Rectangle, round-rect Rounded rectangle, ellipse Ellipse, triangle Triangle, diamond Diamond, pentagon Pentagon, hexagon Hexagon, star Star, chevron Chevron, arrow-right Block arrow, line Line, arrow-line Arrow line.
- `LINE_SHAPES = {line, arrow-line}`.
- **POLY_POINTS (L1567):** fixed polygons in 0–100 units for triangle, diamond, pentagon, hexagon, star (10 points), chevron and arrow-right.
- **Rendering:**
  - Custom points on a non-line shape draw a `<polygon>`, or a `<path>` when `smooth` is set.
  - Otherwise: ellipse → `<ellipse cx=50 cy=50 rx=48 ry=48>`; rect / round-rect → `<rect x=1 y=1 w=98 h=98 rx ry>`; polygon kinds → `<polygon>`.
  - Lines draw a `<path>`, default `M4 50 L96 50`. arrow-line adds `<marker id="arrowhead">`, filled with the stroke colour, using `markerUnits=strokeWidth`.
  - `smoothShapePath` (L1620) is a Catmull-Rom spline turned into cubic Béziers (tangents /6), closed for polygons and open for lines.
- **Default sizes in `addShape` (L3154)**, centred on the slide:
  - Lines: w 0.27 × h 0.035.
  - "Wide" kinds (rect, round-rect, chevron, arrow-right): 0.19 × 0.21.
  - Everything else: 0.125 × 0.22.
- **Default style in `addShape`:** `{shape, fill: line ? "transparent" : accent, stroke: line ? accent : "transparent", strokeWidth: line ? 5 : 0, radius: round-rect ? 16 : 0, opacity: 1}`.
- **Implicit editable points** (`editableShapePoints` L1577) when `points` is not set:
  - line: `[[4,50],[96,50]]`.
  - ellipse: 12 points at r=48 starting from the top.
  - rect: `[[1,1],[99,1],[99,99],[1,99]]`.
  - round-rect: 8 points (each corner arc's two endpoints), radius clamped to 0–49; below 2 it is treated as a rect.
  - Other kinds: POLY_POINTS.
  - Stored points are clamped to 0–100.
- **State:** `S.editPointsId` and `S.editPointIndex`. Point editing is active only when the shape is the primary selection and the only selected object.
- **Overlay** (`syncShapePointEditor` L1670):
  - `.point-editor` holds vertex buttons placed at `%` positions. The active vertex is orange.
  - "Add" diamond buttons (`.add`, `data-edge`) sit at each edge midpoint, pushed 14px outward along the edge normal (`placeShapeInsertHandle`). Lines have none after the last point, and none are shown at 64 points.
  - Resize handles are hidden while editing points.
- **Dragging a vertex** (`startShapePointDrag` L1727):
  - Maps client coordinates to SVG units with `getScreenCTM().inverse()`, so it works on rotated blocks.
  - Shift locks movement to the dominant axis.
  - Re-renders live. On release it calls `queueShapeStyleSave` (no history group).
- **Add point:**
  - Clicking an edge diamond inserts the midpoint.
  - The inspector "Add point" button (`addShapePoint` L1772) inserts after the selected point's edge, or after the longest edge weighted by block w/h.
- **Remove point** (inspector, or Delete/Backspace while a point is selected): minimum 3 points, 2 for lines.
- **Flip horizontal / vertical:** x → 100−x or y → 100−y.
- **"Smooth outline" checkbox:** stores the current points and `smooth`.
- **"Reset outline":** `{points:null, smooth:false}`.
- **Inspector summary:** "N points".
- **Arrow-key nudge of a point:** ±1 unit (±5 with Shift) with a history group that resets after 450ms of inactivity (L3406).

---

## 4. Rich text

- **Editing model:**
  - `.rich` div inside `.body.text`. During editing it gets `contenteditable=true`, spellcheck, `role=textbox` and `aria-multiline` (`setRichEditingState`).
  - Double-clicking the wrapper calls `startTextEdit(bid, event)`. A text block's pointerdown with `detail>1` does not start a drag.
  - Each edit session gets a history token (`textHistoryGroups`).
  - The caret goes to the click point (`caretRangeFromPoint` / `caretPositionFromPoint`), or the saved range is restored, or it goes to the end.
- **Saving:**
  - `input` calls `syncTextContent`: stores innerHTML in `pendingTextContent`, updates the body's render signature, and triggers `pushBlockContent` (debounced 220ms) → `queueTextSave`. Saves are serialised per block through `textSaveChains` and sent as `PATCH {content}` with the session group.
  - `stopTextEdit` cancels the debounce, sanitises, saves immediately, then clears the group and saved range.
- **Ending an edit:**
  - Blur ends editing unless focus moved into a `.text-selection-control` or `suspendTextBlur` is set (checked in a microtask).
  - Escape blurs.
  - Clicking empty canvas or selecting another block also ends editing.
- **Keys and clipboard inside `.rich`:**
  - Cmd/Ctrl+C/X/V stop propagation, so the global object clipboard never intercepts them.
  - `copy` and `cut` events also stop propagation; cut re-syncs content in a microtask.
  - `paste` is intercepted: it takes text/html, or text/plain via `plainTextToHtml` (blank lines → `<p>`, single newlines → `<br>`), sanitises it, and inserts with `execCommand insertHTML`.
- **Toolbar** (`richToolbar` L2702, `.rich-tools#rich-tools-<bid>`). Buttons are `.fmt` with `data-command` / `data-value`:
  - ↶ undo and ↷ redo: native `execCommand`.
  - H1, H2, P, `<>` (pre), ❝ (blockquote): all `formatBlock`.
  - B bold, I italic, U underline.
  - • `insertUnorderedList`, 1. `insertOrderedList`.
  - Link (`addRichLink`): `prompt` for the URL, then `normalizeLinkUrl`. It accepts http(s), mailto and `#`; a bare domain gets `https://` prepended. With a collapsed selection it inserts `<a>` with the URL as text; otherwise it uses `createLink`.
  - Tx: `removeFormat`.
  - `richCommand` runs `execCommand("styleWithCSS", false, false)` before each command.
  - Active state comes from `queryCommandValue("formatBlock")` and `queryCommandState` (`updateRichToolbarState`), refreshed on `selectionchange`.
- **List indent/outdent** (Tab / Shift+Tab inside an `li`, `changeListIndent` L1264):
  - Indent moves the item into a nested list of the same tag (UL/OL) inside the previous `li`.
  - Outdent moves it after its parent `li`; any following siblings become a nested list under the moved item; the old list is removed if empty.
  - The selection is preserved by saving and restoring node-index paths.
- **Per-character styling** (`applyCharacterStyle` L2807, `wrapTextRange` L2762):
  - Uses the active selection, the saved range, or the whole content.
  - Text nodes are split and wrapped in `<span style="prop:value">`. If the parent is a single-child span covering exactly the text, that span is reused.
  - A collapsed caret inserts a span containing a zero-width space as an insertion point.
  - Properties: font-family, font-size (px), color, font-weight, font-style.
- **Mixed-state display** (`updateCharacterControlState` L2906):
  - Reads computed styles of the text nodes in the range.
  - Shows "Mixed" in the select via a transient disabled option, uses a "Mixed" placeholder for size, sets `indeterminate` on the italic checkbox, adds a `.mixed-value` label next to the colour, and sets `data-mixed`.
  - Fonts are compared by primary family name; colours are converted rgb → hex; weights bucket into ≥700 bold / ≥600 "600" / normal.
- **List markers** (`syncListMarkers` L1142): copies the computed font-family, size, weight, style and colour of the first non-blank text in each `li` into `--marker-*` custom properties. CSS `li::marker` reads them. If the element isn't connected yet, the call is deferred via microtask.
- **`sanitizeRichHtml` (L1391), exact rules:**
  - Allowed tags: P, BR, H1, H2, H3, UL, OL, LI, BLOCKQUOTE, STRONG, EM, U, S, A, CODE, PRE, HR, SUB, SUP, SPAN.
  - Dropped together with their content: SCRIPT, STYLE, IFRAME, OBJECT, EMBED, FORM, INPUT, BUTTON, SVG, MATH.
  - Renamed: DIV→P, B→STRONG, I→EM.
  - Any other element is unwrapped (its children are kept). This includes IMG, which is effectively removed.
  - Comments and non-element nodes are dropped. Zero-width spaces are stripped from text.
  - All attributes are dropped except:
    - `A`: `href` only when it matches `^(https?:|mailto:|#)`. http(s) links also get `target=_blank`. Every `A` gets `rel="noopener noreferrer"`.
    - `SPAN` style allowlist:
      - `font-weight`: normal / bold / bolder / lighter / 100–900.
      - `font-style`: normal / italic.
      - `text-decoration-line`: none, underline, line-through, or both.
      - `font-family`: ≤160 characters, none of `;{}<>`.
      - `font-size`: integer px, 6–300.
      - `color`: ≤80 characters, none of `;{}<>`.
    - Empty spans are removed.
    - `LI` style allowlist: `--marker-font-family`, `--marker-font-size`, `--marker-font-weight`, `--marker-font-style`, `--marker-color`, with the same rules as the span properties.
- **Legacy migration** (`canonicalizeTextBlocks` L1365, run on every refresh):
  - If `content` is null, it is built from `markdown`: with `style.textMode==="rich"` the raw value is used; otherwise `marked.parse`, or `plainTextToHtml` if marked isn't loaded. The result is sanitised.
  - `style.textMode` is deleted.
  - A one-time `PATCH {content, style}` per block (tracked in `legacyTextMigrations`) persists the change, with no history group.
- **Code variant:** see §2. Note that `.rich` uses `pre-wrap`, tab-size 2, and the dark scrollbar.

---

## 5. Interactions

### Selection
- **State:** `S.sel` (primary) and `S.selected` (a Set).
- **Canvas `pointerdown` in the capture phase** (L1027), so nested Plotly, SVG and text elements can't swallow the first click:
  - On a block: `selectBlock(bid, shift||meta||ctrl, preserveGroup=true)`. Clicking a member of an existing group keeps the group and makes that member primary.
  - On empty canvas: ends text editing and clears the selection and point editing.
- `selectBlock` (L2143) toggles or replaces the selection and exits point editing when the selection changes.
- **CSS:**
  - `.selected` gets an outline and is raised to `z-index: var(--selection-layer) !important` (2147480000), so a selected block renders above everything.
  - Non-primary selected blocks get a dashed outline and no handles.
  - All blocks get a dashed outline in edit mode.
- Cmd/Ctrl+A selects every block on the slide. The Layers list also supports Shift/Cmd-click.

### Drag and move (`startDrag` L2047)
- Only the left button, and only without a modifier key.
- 3px threshold unless started from the move handle (`.handle.move`, a grip 33px above-left; for tables it sits inside at 7,7 and `.table-meta` gets 38px left padding).
- Dragging a selected block moves the whole selection. The group's bounding box is clamped to the slide.
- Snapping: `snap(v, 1/96)` when `S.snap` is on or Shift is held.
- On release: one history group, `PATCH {x,y}` for each block.
- A click without movement on a multi-selection collapses it to that block.
- **Table bodies stop pointerdown** so their internal scrolling works; they move only via the handle.

### Resize (`startResize` L2083)
- 8 handles: nw, n, ne, e, se, s, sw, w.
- Minimum size 0.03, clamped to the slide.
- Shift (or snap mode) snaps to 1/96. There is no aspect-ratio lock.
- While resizing it re-applies image crop and calls Plotly resize live.
- On release: `PATCH {x,y,w,h}` with no group. It also collapses the selection to the resized block.

### Rotate (`startRotate` L2110)
- `.handle.rot` sits 34px above the block, with a connector line.
- The angle is measured from the block centre. Shift snaps to 15°. Values are rounded to integers.
- Saves `style.rotate` (shapes go through the shape save chain).
- The inspector's Rotate range does the same.

### Shared pointer handling
- `trackPointer` (L2003) uses pointer capture, filters by pointerId, and finishes on up, cancel or lostpointercapture.
- `settleInteraction` clears `S.dragging`, restores user-select, then refreshes after the save completes.

### Align to canvas (`alignBlock` L2597)
- These use margins, not the slide edges: left x=0.06; centre x=(1−w)/2; right x=0.94−w; top y=0.08; middle y=(1−h)/2; bottom y=0.92−h.
- `patchGeom` clamps the result and PATCHes `{x,y,w,h}`.

### Duplicate
- `duplicateBlock` (L2608): POSTs a copy offset by +0.035 x and +0.045 y. No group; the new block becomes the selection.
- `duplicateSelected` = `pasteBlocks(clipboardBlocks())`.
- `duplicateSlide`: `POST /slides/{id}/duplicate`, then navigates to the copy.

### Clipboard
- **Formats:**
  - MIME `application/x-cast-blocks+json`.
  - `text/plain` = `"CAST_BLOCKS:" + JSON`.
  - The in-memory `objectClipboard` string is a fallback.
- **Payload per block:** `{type, figure, table, html, image, content, x, y, w, h, style}`. `z` and `id` are not included.
- **Paths:**
  - Document `copy`/`cut`/`paste` events (L3299) cover menu-initiated clipboard actions.
  - The keydown handler (L3355) intercepts Cmd/Ctrl+C/X/V: it writes via `navigator.clipboard.writeText` and reads via `readText`, falling back to `objectClipboard`.
  - Both paths are skipped when typing in a field, editing text, or presenting.
- **`pasteBlocks`** (L2632):
  - Accepts only valid types with finite geometry.
  - Offsets each block by +0.035 on both axes and clamps w/h to at least 0.03.
  - Sends sequential POSTs under one history group, with `S.dragging=true` to hold off refresh.
  - Selects all the new blocks and shows "Pasted N objects".
  - Works across slides.
- Cut = copy + `deleteSelected` (sequential DELETEs under one group).

### Z-order (`moveLayer` L2169)
- Directions: front, up, down, back. Works on the blocks sorted by z.
- It renormalises **every** block's z to 0..n−1 with sequential `PATCH {z:i}` requests that carry **no history group**, so undo is likely per-request.
- `layerSaving` blocks refresh while it runs.
- The "Send back" button is `moveLayer(id, "back")`.

### Keyboard shortcuts (window keydown, L3330)
- **Cmd/Ctrl+S:** save, only if the workspace is configured. Always calls preventDefault and works in any mode.
- **In present mode:**
  - ArrowRight or Space: next slide.
  - ArrowLeft: previous slide.
  - Escape: exit. Nothing else applies.
- **Cmd/Ctrl+Z:** undo. **Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y:** redo. Skipped when focus is in an input/textarea/select/contenteditable or text is being edited (native undo applies instead). Alt must not be held.
- **Escape:** closes an open menu and restores focus to its button; otherwise deselects with `selectBlock(null)`.
- **The remaining shortcuts are skipped while typing or editing text:**
  - Cmd/Ctrl+C/X/V: object clipboard.
  - Cmd/Ctrl+A: select all.
  - Cmd/Ctrl+D: duplicate the multi-selection, else the block, else the slide.
  - PageDown / PageUp: next / previous slide.
  - Delete or Backspace: removes the selected shape point if one is active, otherwise `deleteSelected`.
  - Arrow keys:
    - With a point selected, they nudge the point.
    - Otherwise they nudge the whole selection by 0.01 (0.05 with Shift), clamped by the group's bounds.
    - Block nudges are collected in `pendingGeom`, debounced by `pushGeom` (200ms), and sent under one `pendingGeomGroup` token per flush.

### Slide navigation
- `goToSlide` (L601): waits for any slide reorder, stops text editing, clears selection and point editing, re-renders, and scrolls the active thumb into view.
- Can be triggered from prev/next, the slide number input, a rail click or keys, and PageUp/PageDown.

### Slide templates (`addSlideFromTemplate` L3177)
- All requests share one history group. It `POST /slides`, then adds the template blocks:
  - **title:** an accent rect bar (0.07, 0.13, 0.035 × 0.56), then text `<h1>Presentation title</h1><p>…</p>` at (0.14, 0.18, 0.7 × 0.42) with `{fontSize:40, color:fg, lineHeight:1.12, weight:"bold"}`.
  - **data:** text with h2 and a 3-item list at (0.07, 0.12, 0.34 × 0.68) with `{fontSize:25, lineHeight:1.25, color}`. Then a figure (`figures[0]` with `tables[0]`) at (0.46, 0.14, 0.47 × 0.65) if both exist, otherwise a rect with `opacity .16` and `radius 18`.
  - **split:** an empty image at (0, 0, 0.5 × 1) with `{fit:"cover"}`, then text at (0.57, 0.2, 0.34 × 0.45) with `{fontSize:30, lineHeight:1.22}`.
  - **quote:** a rect at (0.08, 0.16, 0.84 × 0.68) with `opacity .08` and `radius 24`, then blockquote text at (0.16, 0.24, 0.68 × 0.48) with `{fontSize:36, lineHeight:1.18, fontFamily: Georgia}`.
  - **blank:** nothing.

### Default inserts
- **Text:** `content: "<h2>New text</h2><p>Add your message here.</p>"` at (0.6, 0.18, 0.33 × 0.4) with `{fontSize:24}`.
- **Figure:** (0.07, 0.16, 0.52 × 0.66), table from `#figure-data`.
- **HTML:** (0.12, 0.16, 0.76 × 0.62).
- **Table:** (0.12, 0.18, 0.76 × 0.58), plus the style seed in §2.
- **Image:** (0.24, 0.2, 0.52 × 0.58) with `{fit:"contain", rendering:"auto", alt}`.
- `addBlock` (L3136): POST, refresh, select the new block, switch to the Properties tab.

### Present mode (L3089–3117)
- Entering: stops text editing, closes menus, sets `S.pcur = S.cur`, shows `#present-overlay`, then `sizePresent` and `renderPresent`.
- **Scaling:** `#present-canvas` stays at 1040×585 and uses CSS zoom = min(stage w/1040, stage h/585) with no flooring.
- **Rendering:** blocks are rebuilt with `buildBlock(b, false)`, i.e. without handles or edit listeners. Background is slide background, then `theme.bg`.
- **HUD:** `#p-prev`, `#present-count` ("i / n"), `#p-next`, `#p-exit`.
- Window resize re-sizes and re-renders. SSE refresh re-renders while presenting.
- The Plotly mode bar is shown only in present mode.
- **Quirk:** present blocks reuse the `id="blk-<id>"` values, so the DOM has duplicate ids.

---

## 6. Server API usage

**Request helpers:**
- `api(path, opts)` (L541): fetch, then `response.json()`. A non-OK status throws `Error(result.error)`. Any non-GET/HEAD request is tracked in `pendingMutations`.
- `jbody(method, body, group)` → `{method, headers: {"Content-Type": "application/json", "X-Cast-History-Group": group?}, body: JSON}`.
- `historyHeaders(group)` adds the header only when a group is given.
- `historyToken()` = `crypto.randomUUID()`, falling back to `Date.now()-Math.random()`.

| Call | Where | Body | Group | Response use |
|---|---|---|---|---|
| GET `./state` | refresh L620 | – | – | `{version, history{can_undo,can_redo}, figures[{name,title}], htmls[{name,title,version}], images[{name,title,alt,version}], tables[{name,title,version}], theme{accent,bg,fg,font}, workspace{configured,filename}, slides[{id,background?,blocks[]}]}` |
| GET `./deck` | downloadEditableDeck | – | – | Full document JSON (schema_version 1). Downloaded as a Blob named `workspace.filename \|\| deckName`. |
| POST `./deck/save` | saveEditableDeck (raw fetch) | – | – | `{ok, filename}`; status "saved X". Errors: 409 not configured / 500. Failure shows an alert. |
| PUT `./deck` | openEditableDeck (raw fetch, jbody) | parsed file JSON | – | `{ok, slides}` or `{ok:false, error}`. Confirms first if the deck is non-empty. Resets cur/sel/deckName/structure caches, then status "opened". |
| POST `./deck/undo` \| `./deck/redo` | performHistory | – | – | `{ok, history}`. Status "Undid edit" / "Redid edit". Calls `flushDeckEdits` first. Blocked while presenting, dragging, or another history call is running. |
| GET `./render?figure=&table=` | renderFigureInto | – | – | `{ok, plotly: JSON string, error}` |
| GET `./render_table?table=&limit=` | renderTableInto | – | – | `{ok, title, columns[{name,dtype,numeric}], rows[[str]], truncated, error}` |
| GET `./render_html?html=` | renderHtmlInto | – | – | `{ok, html, error}` |
| GET `./render_image?image=&v=` | `<img src>` | – | – | Image bytes. On error the client refetches with `{cache:"no-store"}` and shows the text body (422) as the placeholder message. |
| fetch(img src) | imageSourceAspect | – | – | Checks for `image/svg+xml` and parses viewBox or width/height. |
| POST `./slides` | addSlideFromTemplate | – | template group | `{id}` |
| DELETE `./slides/{id}` | rail × | – | none | – |
| POST `./slides/{id}/duplicate` | duplicateSlide | – | none | `{ok, id}` |
| PATCH `./slides/order` | finishSlideReorder | `{order:[sid…]}` | none | `{ok}` |
| POST `./slides/{sid}/blocks` | addBlock, duplicateBlock (none); pasteBlocks, template (group) | `{type, figure?, table?, html?, image?, content?, style?, x, y, w, h}` | see column | `{id}` |
| PATCH `./blocks/{bid}` | patchBlock and moveLayer | any subset of `{x,y,w,h,z,figure,table,html,image,content,style}`; style is always the **full** merged object | see below | `{ok}` |
| DELETE `./blocks/{bid}` | inspector Delete (none); deleteSelected (group) | – | – | – |
| PATCH `./theme` | theme inputs (colour inputs debounced 150ms); preset sends the whole preset | `{accent?, bg?, fg?, font?}` | none | – |
| EventSource `./events` | `connect()` | – | – | Every message → `refresh()`. onopen sets "live"; onerror sets "reconnecting…". |

**How history groups are formed:**
- Drag move: one token per drag.
- Arrow-key nudge: one token per 200ms debounce flush.
- Point nudge: one token, reset after 450ms idle.
- Text edit session: one token from `startTextEdit` until `stopTextEdit`, covering all debounced content saves.
- `pasteBlocks` and `duplicateSelected`: one token.
- `deleteSelected` and cut: one token.
- `addSlideFromTemplate`: one token for the slide and all its blocks.
- No group (each request stands alone): resize, rotate, point drag, inspector style changes (`patchStyle` without a group), geometry fields, align, duplicateBlock, addBlock, layer moves (several z PATCHes), theme, slide delete/duplicate/reorder, legacy migration PATCHes.

**`refresh()` (L614):**
- Single-flight with a `refreshQueued` loop; paused while `S.dragging` or `layerSaving` and re-queued afterwards.
- Before rendering it overlays local in-flight edits onto the fetched state:
  - `pendingTextContent` (bid → content).
  - `pendingGeom` (bid → {x,y}).
  - `pendingShapeStyles` (bid → style snapshot).
- It keeps the active and present slides by **id**, so an external reorder doesn't change which slide you're on.
- Then it runs `canonicalizeTextBlocks`, prunes the selection, drops point editing if invalid, and re-renders theme, topbar, rail, canvas, inspector and layers.
  - The inspector is skipped while text is being edited or focus is inside it.
  - Present mode is re-rendered if active.
- **Save chains:**
  - `queueShapeStyleSave` serialises shape style PATCHes per block (`shapeStyleSaveChains`) using a `structuredClone` snapshot.
  - `queueTextSave` does the same for text (`textSaveChains`).
- `flushDeckEdits` (L3000) stops text editing, flushes the content and geometry debounces, and awaits every chain plus `pendingMutations`. It runs before undo/redo, save, download and open.

**Render caching:**
- `structSig(slide)` (L998) is the slide id plus each block's identity. Figures also include figure, table and table version; html blocks include html and its version.
- Same signature → `syncCanvas` (geometry, classes, non-figure/html body re-render, point editor). Changed → full rebuild.
- `bodyRenderSig` skips re-rendering a body whose signature is unchanged (table name + version + style; text content + style; image name + version + style; otherwise style).
- `renderRequestSeq` tokens make stale async figure/table/html responses get dropped.

---

## 7. Rendering details

- **Plotly:**
  - Layout starts from `{autosize:true, margin:{l:48, r:18, t:28, b:40}, paper_bgcolor:"rgba(0,0,0,0)", plot_bgcolor:"rgba(0,0,0,0)"}`, merged under `fig.layout`. Then `width`/`height` are deleted and `autosize` is forced to true.
  - Config: `{responsive:true, displaylogo:false, displayModeBar:S.present}`.
  - `Plotly.Plots.resize` runs on each `applyTheme` (via requestAnimationFrame), on window resize, and live during a resize drag.
  - Errors show as `.err`, as does "No figure assigned."
- **Table:**
  - Preview limit = `clamp(rowLimit || 200, 1, 1000)`.
  - "Loading data..." placeholder.
  - Meta bar: `<strong>` title plus "N rows", with a "+" when truncated.
  - `th` title is `name (dtype)`; numeric columns are right-aligned; cells carry a title tooltip.
  - Sticky header and index column; cells max 320px wide with ellipsis.
  - Messages: "No data assigned." / error text.
- **HTML:** `<iframe sandbox="allow-scripts allow-forms allow-popups allow-modals" srcdoc=…>` (no allow-same-origin), titled with the html title. `pointer-events:none` in editing mode.
- **Image crop math** (`normalizedCrop` L1509, `applyImageCrop` L1520):
  - Clamping: left and top to 0–0.8; right to 0..(0.9−left); bottom to 0..(0.9−top).
  - When a crop is active: the body gets `.cropped` and `overflow:hidden`.
    - fill: full size = frame / cropFraction.
    - contain/cover: scale = min/max(frameW / (natW·cw), frameH / (natH·ch)).
    - The img is absolutely positioned at `left = (frameW − fullW·cw)/2 − fullW·crop.left` (top likewise), with `object-fit:fill`.
  - Crop is re-applied on img load, on `syncCanvas`, during resize, and in thumbnails.
  - The crop slider limits each side so it can't exceed 0.9 minus the opposite side.
- **Manual images:** `fileInput` reads the file with FileReader into a data URL stored in `style.src` (`image=""`). A URL typed in the text input is stored the same way.
- **`fitImageToSource`:**
  - aspect = source aspect × (1−l−r)/(1−t−b).
  - Keeps the width, h = w·(16/9)/aspect, capped at 0.9 in each dimension, keeps the centre, clamps to the slide.

---

## 8. Theme, fonts, canvas size, zoom

- **Theme keys:** `{accent, bg, fg, font}`.
  - `applyTheme` (L670) sets the root CSS variable `--accent`, so the editor UI's accent follows the deck accent.
  - Canvas background = slide.background || theme.bg || `#fff`; colour = theme.fg || `#1a1d24`; fontFamily = theme.font.
- **THEME_PRESETS:**
  - studio: `#5b8cff` / `#ffffff` / `#1a1d24` / Inter.
  - paper: `#0f766e` / `#fbfaf7` / `#22201c` / Georgia.
  - night: `#f59e0b` / `#111827` / `#f8fafc` / Poppins.
  - mint: `#16a34a` / `#f3fff8` / `#14342b` / Inter.
  - The preset select shows a preset only when every key matches exactly, otherwise "Custom theme".
- **FONTS (L2234):**
  - System: `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif`.
  - Inter: `'Inter',sans-serif`.
  - Poppins: `'Poppins',sans-serif`.
  - Playfair Display: `'Playfair Display',serif`.
  - Georgia: `Georgia,'Times New Roman',serif`.
  - Roboto Mono: `'Roboto Mono',ui-monospace,monospace`.
  - If the theme font isn't in the list, it is appended as an extra option.
- **Canvas:**
  - `SLIDE_WIDTH = 1040`, `SLIDE_HEIGHT = 585`; `#canvas` is fixed at that size.
  - `#canvas-viewport` is sized to 1040·zoom × 585·zoom, and the canvas uses CSS `zoom` (not a transform).
  - Grid overlay: `::after` with lines at 4.1667% × 7.4074% (24 columns × 13.5 rows).
  - Snap step is 1/96 of the slide.
- **`fitStage`** (L695): zoom = floor(min((stageW−64)/1040, (stageH−64)/585) × 100)/100, clamped 0.1–1.6, and sets `fitZoom = true`. A ResizeObserver on `#stage` refits while `fitZoom` is on. The zoom buttons set it to false.

---

## 9. Workarounds and quirks (hard-won lessons)

1. **CSS `zoom` instead of transform** for the canvas, present canvas and thumbnails, so text renders crisp at the displayed size (L678).
2. **Capture-phase selection** so Plotly, SVG and text children can't consume the first click (L1025).
3. **Never rebuild Plotly or iframes on ordinary syncs.** The structure signature carries the figure binding so a rebind still re-fetches (L1000, L1119).
4. **Remove fixed Plotly width/height** from notebook figures, because the block owns the size (L1919).
5. **Don't rebuild the inspector while a field in it has focus,** or while editing text (L657).
6. **3px drag threshold** so a click selects and a double-click edits (L2045). Text blocks skip drag when `detail>1`.
7. **Normalise tied legacy z values** when reordering layers (L2182). The tests check uniqueness.
8. **Re-render the inspector when the shape kind changes,** because the set of controls changes (L2977).
9. **Keep text selection while using inspector controls:**
   - `suspendTextBlur`.
   - `pointerdown`/`mousedown` preventDefault on toolbar buttons.
   - `.text-selection-control` excluded from the blur check.
   - `savedTextRange` saved and restored.
   - `selectionchange` updates the saved range and control state.
10. **Zero-width-space caret marker** for styling a collapsed selection. It is stripped by the sanitiser and ignored by the marker and mixed-state logic.
11. **`::marker` can't be styled through spans,** so the first character's computed style is copied into `--marker-*` variables on the `li` (deferred until the element is connected).
12. **Pending overlay maps and per-block serial save chains** stop SSE refreshes from overwriting in-flight edits and keep PATCH order.
13. **Request tokens** discard stale async renders.
14. **Image error handler refetches** the failed URL to show the server's error text.
15. **SVG aspect ratio comes from viewBox,** because `naturalWidth` is unreliable for SVG.
16. **Slide drag details:**
    - `S.dragging` blocks refresh during the drag.
    - The DOM is reordered during dragover.
    - A drag without a drop reverts via refresh.
    - The post-drag click is suppressed with setTimeout 0.
    - `goToSlide` waits for the reorder promise.
    - The rail auto-scrolls near its edges.
17. **Pointer capture plus `lostpointercapture`** as a finish condition for drags.
18. **Rich text stops propagation of Cmd/Ctrl+C/X/V,** so the object clipboard doesn't intercept text copy and paste.
19. **Fixed-position menus with computed placement** escape toolbar overflow. z-index layers: toolsbar 2147481000, selection 2147480000, compact panels 2147480500, present overlay 2147483000, present controls 2147483647.
20. **Tables:** pointerdown is stopped in the body so it can scroll; the move handle sits inside the table.
21. **iframes get `pointer-events:none`** in edit mode.
22. **WebKit rounds `clientWidth` after CSS zoom.** Comment in the test; check the computed width instead.
23. **The `#canvas.show-grid::after` rule declares z-index twice** (5, then 0; 0 wins).
24. **Possible bugs to decide on in the rewrite:**
    - "Reload iframe" is a no-op.
    - Layer moves create ungrouped history entries.
    - Legacy migration PATCHes create history entries.
    - Duplicate `blk-*` ids in the present overlay.
    - The `arrowhead` marker id is repeated in every SVG.
    - `opacity` is ignored in the editor for text, figure, table and html blocks but applied in thumbnails.
    - `pendingGeom` is declared near the end of the script (L3286) but used inside `refresh` (it works only because of call order).

---

## 10. Browser checks to port

All three scripts run against `examples/_editor_fixture.py` with `playwright-cli run-code` (README L288–293).
- **Fixture facts they rely on:** 18 slides, ids `s1`, `s2`…; blocks `b1`–`b9`; tables `monthly` and `daily`; workspace file `editor-qa.cast.json`; slide 1 background `rgb(234,244,239)`.

### `_editor_checks.js`
- **Load and legacy data:**
  - Waits for `#blk-b3 .js-plotly-plot`.
  - Checks legacy markdown → `<h2>` and that "48px" spans survive.
  - `#rail` must be scrollable.
  - Thumbnail `.mini-text` first child `zoom` must equal thumb width / 1040, and `.mini-text li span` must be 20px.
- **Layers and duplicate:**
  - Clicks the "Layers" and "Properties" tabs by role.
  - Finds `.layer-item` by text ("Rectangle", "Value over time", "From notebook to presentation").
  - Expects `#blk-b4.selected`, then a mouse drag that must not change z.
  - Clicks "Bring to front" / "Send to back" and checks the `.layer-item` `data-focus-key` order. z values must be unique.
  - In the "Insert" menu, `#figure-data` / `#add-table` selections must not rebind an existing figure. Escape must hide `#insert-menu`.
  - Ctrl/Cmd+D, then Delete, with `#canvas > .block` counts.
- **Rich text:**
  - Double-click `#blk-b2 .rich` → `[contenteditable=true]`.
  - Tab / Shift+Tab nest and un-nest an `li`.
  - Select a span, dispatch `selectionchange`, fill `[data-character-property="font-size"]`, click `#stage` to blur.
  - Click the "Save" button and wait for `#status` to start with "saved".
  - After reload: span 16px, `::marker` 16px, other `li` 26px.
- **Slide order and drag:**
  - An external PATCH to `/slides/order` must keep the active slide (`#slide-number` = 18, `#blk-b1` visible).
  - Native drag: `.slide-dragging` appears; Escape cancels; `dragTo` with `targetPosition` reorders; thumb `data-slide-id` order is checked.
  - `#slide-number` fill + Enter.
- **Present, download, open:**
  - `#canvas` background colour.
  - "Present" opens `#present-overlay:not([hidden])`; `#present-canvas` must be 1040×585 and the topmost element.
  - "Download editable copy" triggers a download event.
  - `#open-deck-file` `setInputFiles`, accept the dialog, wait for status "opened"; the workspace filename must be unchanged.
- **Responsive:** at 1280, 900, 390 and 320px wide (after clicking "Fit"), these ids must be on-screen: save-deck-btn, present-btn, viewbar, toolsbar, zoom-in, zoom-out, slide-next, theme-menu-btn, inspector-toggle, rail-toggle. `#insert-menu` must fit in the viewport, and `#canvas` computed size must be 1040×585.
- **Page error and result reporting:** no `pageerror` events; the script sets `window.__editorQA`.

### `_canvas_checks.js`
- **New shape size:** `#shape-menu-btn`, `#shape-palette button[title='Ellipse']`, `#add-shape-btn`; the new ellipse must have w < .15 and h < .25.
- **Point editing:**
  - "Edit points" shows 12 `.point-editor button:not(.add)`.
  - Dragging a vertex stores `style.points` and renders a `.body.shape polygon`.
  - Hover, then click `.point-editor button.add` nth(6) → 13 points; Delete → 12.
  - "Add point" / "Remove point" buttons.
  - Click a vertex, then ArrowRight moves the point and not the block.
  - `#inspector .row:has-text("Smooth outline") input` renders a `path`.
  - "Flip horizontal" gives 100−x.
  - Points persist across reload.
  - "Reset outline" sets `points === null` and renders an `<ellipse>`.
  - "Done editing points".
- **Resize:** dragging `.handle.e` makes w > .15.
- **Multi-select, nudge, clipboard:**
  - `.layer-item[data-focus-key=…]` plus a Shift-click gives 2 `#canvas > .block.selected`.
  - ArrowRight moves both; dragging one moves both; a plain click goes back to a single selection.
  - Ctrl+C/V adds 2 blocks and selects 2; Ctrl+X removes them.
- **Image crop:**
  - Rail `.thumb` nth(3), `#blk-b9 .body.image`.
  - `[aria-label="Crop left"]` fill 20 + input event → `crop.left === .2`.
  - `.cropped` class and absolute img positioning; crop persists after reload.
- **Cross-slide paste:** pasting on slide 2.

### `_history_canvas_checks.js`
- **Shape insert:** `button[title='Rectangle']` → `#undo-btn` enabled.
- **Undo/redo of insert:** Ctrl+Z, then `#redo-btn` enabled; Ctrl+Shift+Z restores the **same block id**.
- **Point drag:** undo leaves `points` unset and renders `.body.shape rect`; redo works.
- **Group nudge:** one ArrowRight is a single undo step; redo works.
- **Redo cleared by new edit:** `#add-text-btn` leaves `#redo-btn` disabled; clicking `#undo-btn` / `#redo-btn` works.
- **Text session:** typing "U", waiting 300ms, typing "V", waiting 300ms, then switching tab (blur) must undo in **one** step back to the original content, and redo restores it.

**Selectors and labels a port must keep:**
- **Element ids:** all PAGE ids.
- **Structure:** `#blk-<id>` with `.body` / `.rich` / `.handle.<dir>`; `.block.selected`; `.point-editor button(.add)`; `.layer-item[data-focus-key]`; `.thumb[data-slide-id]`.
- **State classes:** `.slide-dragging`; `.cropped`; `.js-plotly-plot`.
- **Attributes:** `[data-character-property]`.
- **Accessible names:** "Crop left"; Bring to front / Send to back; Edit points / Done editing points; Add point / Remove point; Flip horizontal; Reset outline; Smooth outline row; Save; Present; Fit; Insert; Download editable copy; tabs Layers / Properties.
- **Status text:** "saved…" and "opened".