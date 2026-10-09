# cast

Build live, notebook-backed presentations from Python functions.

![PyPI](https://img.shields.io/pypi/v/cast-func)
![Python](https://img.shields.io/badge/python-3.9%2B-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-experimental-orange)
![Built with](https://img.shields.io/badge/built%20with-FastAPI%20%C2%B7%20Polars%20%C2%B7%20Plotly-5b8cff)

![The cast editor with a live figure, rich text, slide thumbnails, and the Layers panel.](https://raw.githubusercontent.com/ParsaGhadermazi/cast-func/main/docs/editor.png)

*The cast editor: a compact toolbar, live Plotly figure, rich text, scrollable slide previews, and selectable object layers. Decorated notebook functions supply the live assets.*

**Project note:** This repo is vibe coded, and the frontend in particular — the
in-browser canvas editor and everything it renders — was built by iteration
rather than by a dedicated frontend engineer. It is experimental and
fast-moving, so expect rough edges alongside the parts that work well.

## What it does

The usual path from analysis to slides means exporting a chart, pasting it into
a deck, and repeating the whole process whenever the data changes. cast removes
that step. You decorate the functions you have already written, and they become
building blocks on a live web canvas. You arrange those blocks, add text,
images, and shapes, and present — and when the underlying data changes, the
slides update without a reload.

```python
import cast, polars as pl, plotly.express as px

deck = cast.Cast("sales.cast.json")  # opens this workspace, or creates it
deck.serve()                          # live editor in a background thread

@deck.data                         # pandas or Polars dataframe -> a data source
def sales():
    return pl.read_parquet("sales.parquet")

@deck.figure                       # a factory: takes one table, returns a Plotly figure
def trend(tbl):
    df = tbl.select(["month", "revenue"])
    return px.line(df, x="month", y="revenue", markers=True)

# Build the deck in the browser; no registration call is needed.
```

That is the entire program. Open the printed URL, add the `trend` figure with
the `sales` table, and it appears on a slide.

## Install

```bash
pip install cast-func
```

cast requires Python 3.9 or newer. The runtime dependencies — `fastapi`,
`uvicorn`, `polars`, `plotly`, `numpy`, `pandas`, `pyarrow`, and `notebook` —
are installed automatically. The package is imported as `cast`:

```python
import cast
```

## The decorators

Everything on a slide begins as a decorated function in the notebook. Create a
workspace with `deck = cast.Cast("talk.cast.json")`, then use its decorators.
Registration happens when the function is defined, and each decorated function
still returns its original value, so existing notebook code is unaffected. Every
decorator supports both the bare form (`@deck.data`) and the parameterized form
(`@deck.data(name=..., title=...)`). The same decorators are importable at module
level (`cast.data`, `cast.figure`, `cast.html`, `cast.image`); `deck.data` and
`cast.data` are interchangeable.

| Decorator | The function returns | Registered as |
| --- | --- | --- |
| `@deck.data` | a pandas or Polars `DataFrame` | a data source that feeds figures and table blocks |
| `@deck.figure` | *(factory)* a Plotly figure from a table | a chart that can be rebound to any table |
| `@deck.html` | an HTML string (or an object with `_repr_html_`) | a sandboxed iframe block |
| `@deck.image` | a path, bytes, SVG, or data URI | an original-quality image asset |

### `@deck.data`

```python
import pandas as pd
import polars as pl

@deck.data
def sales():
    return pl.read_parquet("sales.parquet")

@deck.data(title="Q2 Forecast")
def forecast():
    return pl.read_parquet("forecast.parquet")

@deck.data(title="Customer segments")
def segments():
    return pd.read_csv("segments.csv")
```

`@deck.data` accepts `pandas.DataFrame` and `polars.DataFrame`. Pandas frames
are converted once to a `polars.DataFrame`, so figure factories always receive
the same eager Polars dataframe interface regardless of how the source was
created. The decorated function still returns its original dataframe type when
called directly.

The decorator registers the table immediately and resolves it when a figure or
table block first needs it. Calling the function remains optional;
calling it again refreshes every slide that uses it, live, with no reload or
re-export. Data sources feed
both figures and table blocks. Table blocks render with sticky column headers,
horizontal and vertical scrolling, optional row numbers and stripes, and a
preview limit of up to 1,000 rows; the same scrollable table is preserved in
present mode and in exports.

### `@deck.figure`

```python
@deck.figure(title="Value over time")
def trend(tbl):
    df = tbl.select(["date", "value"])
    return px.line(df, x="date", y="value", markers=True)
```

`@deck.figure` registers a *factory* at decoration time, not a rendered chart —
you do not pass a table in the notebook. In the browser you add the figure to
the inventory and choose which table feeds it, and you can add the same factory
again with a different table. Each instance has its own table dropdown; picking a
table re-runs the figure function on the server against that data. If the chosen
table is incompatible, the block shows the error inline and invites another
choice rather than crashing.

### `@deck.html`

```python
@deck.html(title="Callout")
def callout():
    return "<h2>Custom HTML</h2><button onclick=\"this.textContent='clicked'\">Click</button>"
```

`@deck.html` registers a custom HTML object at decoration time. Add it from the
HTML dropdown to insert the returned markup into a sandboxed iframe block. This
is useful for small widgets, controls, styled notes, or visualization snippets
that are not Plotly figures. Objects exposing `_repr_html_()` are also accepted.

### `@deck.image`

```python
from pathlib import Path

@deck.image(title="Study design", alt="Diagram of the study workflow")
def study_design():
    return Path("figures/study-design.svg")  # PNG, JPEG, bytes, SVG, and data URIs also work
```

`@deck.image` registers publication-quality image assets at decoration time. The
function may return a PNG/JPEG/SVG file path, raw image bytes, SVG markup, a data
URI, or a notebook object with a PNG, JPEG, or SVG rich representation;
Matplotlib figures and Pillow images are accepted through their standard save
methods. The live app serves the original bytes without resizing or
recompression, so SVG remains vector and raster images keep their full
resolution. The inspector provides contain/cover/stretch behavior, a source
aspect-ratio action, smooth/crisp/pixel rendering, transparency, alt text,
corner radius, and opacity.

## Composing the deck

Once assets are registered, the browser is a free-form canvas:

- A compact toolbar keeps **Open**, **Save**, **Download editable copy**, and
  **Present** visible. **Insert** groups registered figures, tables, HTML, and
  images with their add buttons. Choosing an insertion source does not change
  the selected object; existing bindings are edited in **Properties**.
- The **Layers** tab lists every object, including covered ones, with controls
  to bring forward, send backward, move to either end of the stack, or duplicate.
  Moving an object preserves its stacking order.
- Figures, tables, HTML, images, text, and shapes (rectangle, ellipse, triangle,
  line) can be placed anywhere on a 16:9 canvas.
- Blocks can be dragged, resized from any corner, rotated, and stacked in z-order;
  edge handles resize from the sides. New shapes start at sizes suited to their
  type. Shift-click or Cmd/Ctrl-click selects multiple objects, which can then be
  moved together; arrow keys nudge the selection and Delete removes it.
- Select a shape and choose **Edit points** in Properties to reshape its outline.
  Drag the round points to move vertices, click a small diamond between them to
  add a point, or select a vertex and remove it with Delete. Arrow keys nudge the
  selected point; Shift constrains a point drag to one axis. The point toolkit
  can add or remove points, flip the outline horizontally or vertically, and
  switch between smooth curves and straight edges. **Reset outline** restores
  the original shape. Edited outlines remain editable in saved decks and frozen
  HTML; older decks need no conversion.
- The inspector's Arrange controls align a block to the canvas (left/center/right,
  top/middle/bottom), duplicate it, or send it back in the stack.
- Slides are managed from the rail on the left: drag thumbnails to reorder them,
  or use the controls to add, delete, and duplicate slides. Reordering only
  changes the existing `slides` array order, so older `.cast.json` files remain
  compatible. Escape cancels a drag without changing the saved order. The slide
  number field jumps directly to a slide; Page Up/Down navigates the deck.
- Cmd/Ctrl+D duplicates the selected object, or the current slide when nothing
  is selected. Cmd/Ctrl+A selects every object on the slide; Cmd/Ctrl+C, X, and V
  copy, cut, and paste selected objects. Native text editing and its clipboard
  shortcuts remain separate.
- Cmd/Ctrl+Z undoes deck edits; Cmd/Ctrl+Shift+Z (or Ctrl+Y) redoes them. The
  toolbar buttons show whether either action is available. Multi-object moves,
  pastes, deletions, and slide templates each undo as one step. While typing in
  a text box, the browser keeps its native text undo; after finishing, the text
  edit session is one deck-history step. The last 50 deck steps are held in
  memory for the current session, not stored in the presentation JSON.
- The slide rail and properties panel can be collapsed for more canvas space.
  **Fit** follows available space; manual zoom stays fixed until Fit is selected
  again. Both use the same logical canvas dimensions as presentation mode.
- Text boxes use slide-native rich text rather than Markdown. Editing happens on
  the same element used for presentation, so typography, wrapping, and spacing do
  not change between design and present modes; font, size, color, weight,
  alignment, and line height are set in the inspector, and double-clicking a text
  block edits it in place. In a list, Tab indents the current bullet and
  Shift+Tab moves it back out. The text style menu also includes a polished code
  treatment with monospace defaults, code-safe whitespace, and an editor-like
  frame that is preserved in present mode and frozen exports.
- Image blocks have non-destructive crop controls for each side. Crop values
  persist in editable JSON and render in slide previews and frozen HTML.
- A theme sets accent, background, foreground, and font once for the whole deck.
- Edits stream over Server-Sent Events, so multiple tabs and changing data stay
  in sync.
- Present mode is full-screen with arrow-key navigation, and figures remain
  interactive.

The editor is served by the small FastAPI application that `deck.serve()` starts
in a background thread. `serve()` is idempotent, so calling it more than once
does not start a second server.

## Save, reopen, and export

```python
deck = cast.Cast("talk.cast.json")    # load it, or create an empty workspace
deck.save()                           # atomically update talk.cast.json
deck.save(as_="talk-copy.cast.json") # write a copy; talk.cast.json stays active
deck.load()                           # reload the active workspace from disk
deck.freeze("talk.html")              # self-contained HTML, no server required
```

`Cast(path)` makes that JSON file the workspace source of truth. If the path
already exists it is validated and loaded; if it does not exist, cast creates a
new empty presentation there immediately. The editor's **Save** button performs
the same atomic update as `deck.save()`, so saving does not depend on a browser
download. Python reserves the word `as`, so Save As is spelled `as_`.

`save` and `load` round-trip an editable deck as human-readable JSON. The
document preserves slide order, text, geometry, styles, rotations, theme,
manually uploaded images, and references to decorated assets. It deliberately
does not serialize Python functions or data frames; rerun the notebook cells that
define those assets before reopening the deck. The editor's **Open** action can
load another JSON document into the current workspace; press **Save** to commit
it to the file originally passed to `Cast`.

**Download editable copy** writes a browser download without changing the active
workspace. This also works without a configured workspace file. All editor
improvements use the existing version-1 document format: old Markdown text is
still converted on opening, and rich text, asset references, IDs, and geometry
remain supported. No manual file migration is required.

`freeze` produces the shareable output: figures are pre-rendered to Plotly JSON,
images are embedded, and tables, text, and shapes are inlined into a single HTML
file with client-side slide navigation and still-interactive charts. It needs no
running server.

## How it fits together

```
   NOTEBOOK  ->  decorate functions  ->  ASSET LIBRARY  ->  compose on the CANVAS  ->  present / freeze
  (your data)    @data @figure           (tables, figures,   (arrange, style, theme)    (live or portable)
                 @html @image             html, images)
```

The notebook is the source of truth for data and logic; the bound `.cast.json`
workspace is the source of truth for layout. cast keeps the two in sync.

## Run the example

```bash
python examples/demo.py
```

Then open <http://127.0.0.1:8000>. Add the `trend` figure with the `monthly`
table, add it again with `daily`, try the deliberately incompatible `wide` table
to see the inline error, and add the HTML callout and the vector workflow image.
The full source is in [`examples/demo.py`](examples/demo.py).

For regression checks, run `PYTHONPATH=. python examples/_smoke.py`. The isolated
browser fixture is `PYTHONPATH=. python examples/_editor_fixture.py 8071`; it uses
a temporary workspace and never opens your presentation files. With Playwright
CLI installed, open that URL and run
`playwright-cli run-code --filename=examples/_editor_checks.js`. Recreate the
fixture before each run. The checks cover legacy files, text formatting, layer
ordering, native slide dragging, file round-trips, and narrow-screen layouts.

## API reference

| Call | Description |
| --- | --- |
| `cast.Cast(path)` | Open an existing `.cast.json` workspace or create a new one. |
| `deck.serve(port=8000, host="127.0.0.1", open=False)` | Start the editor in a background thread and return the URL; `open=True` embeds an IFrame in a notebook. Idempotent. |
| `@deck.data` / `@deck.data(name=, title=)` | Register a pandas or Polars dataframe-returning function as a data source. |
| `@deck.figure` / `@deck.figure(name=, title=)` | Register a `table -> Plotly figure` factory. |
| `@deck.html` / `@deck.html(name=, title=)` | Register an HTML-returning factory for iframe blocks. |
| `@deck.image` / `@deck.image(name=, title=, alt=)` | Register an original-quality image asset. |
| `deck.save()` / `deck.save(as_=path)` | Update the active workspace or atomically write a separate copy. |
| `deck.load()` | Reload the active workspace (registered assets remain available). |
| `deck.freeze(path)` | Export a self-contained, portable HTML file. |

## Notes and limitations

- The frontend is vibe coded and still settling; some interactions are rough.
- Controls inside HTML iframes can miss clicks in Chromium when the slide is
  zoomed away from 100%, including fitted presentation mode. The same widget
  interaction passed in WebKit. This remains an interaction issue; HTML asset
  references and saved presentation files are unchanged.
- The page is built at import time. If you edit `cast/templates.py`, restart the
  kernel or process to see the change — a browser refresh alone will not reload it.
- `save` and `load` store references to decorated assets, not the Python behind
  them. Rerun the notebook cells that define the assets before calling `load`.

## License

The editor includes a small, locally bundled subset of Lucide 0.468.0 icons;
its upstream notice is in `cast/static/LUCIDE-LICENSE`. No icon CDN is required.
To rebuild after changing `cast/static/icons-entry.js`, install `lucide@0.468.0`
and `esbuild@0.24.2` in a temporary directory, set `NODE_PATH` to that directory's
`node_modules`, and run this from the repository:

```sh
esbuild cast/static/icons-entry.js --bundle --minify --outfile=cast/static/icons.js --legal-comments=inline
```

MIT. See [LICENSE](LICENSE).
