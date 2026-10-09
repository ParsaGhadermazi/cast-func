# cast

Build live, notebook-backed presentations from Python functions.

![PyPI](https://img.shields.io/pypi/v/cast-func)
![Python](https://img.shields.io/badge/python-3.9%2B-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-experimental-orange)
![Built with](https://img.shields.io/badge/built%20with-FastAPI%20%C2%B7%20Polars%20%C2%B7%20Plotly-5b8cff)

![The cast editor with a live figure selected, rich text, slide thumbnails, and the inspector.](https://raw.githubusercontent.com/ParsaGhadermazi/cast-func/main/docs/editor.png)

*The cast editor: slide thumbnails, a live Plotly figure selected with its inspector, and a compact toolbar. Decorated notebook functions supply the live assets.*

**Project note:** This project is experimental. The browser editor was rewritten
in TypeScript (`frontend/`) around a single document model, so editing happens
instantly in the browser and syncs to Python in the background. Expect the
occasional rough edge, and please report it.

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

Once assets are registered, the browser is a free-form 16:9 canvas. Edits apply
instantly and sync to Python in the background; the status next to the file
name says whether everything is synced.

**Adding things.** The toolbar has the Select (V), Text (T) and Shape tools and
an **Insert** menu with every decorated figure, table, HTML object and image.
With the Text or Shape tool, click to place an object or drag to size it
(Shift keeps proportions or 45° lines). Image files can also be uploaded, dropped
onto the slide, or pasted; they keep their own aspect ratio. Pasted plain text
becomes a text box.

**Selecting.** Click picks the topmost object; charts, tables and HTML widgets
never swallow the click. Shift- or Cmd/Ctrl-click adds or removes objects, a
drag on empty space selects with a box, Alt-click cycles through objects
stacked under the pointer, and Tab steps through objects. Lines and shapes are
hit on their actual outline, so the empty corners of a diagonal arrow never
cover what is underneath. Selecting never changes the stacking order.

**Moving and sizing.** Drag to move, the handles to resize, the round handle to
rotate. While dragging, objects snap to the slide's edges and centre and to
other objects, with guides (hold Cmd/Ctrl to place freely, or turn snapping off
with the magnet button). Shift locks the axis, keeps proportions, or snaps
rotation to 15°; Alt resizes from the centre or drags out a copy. Arrow keys
nudge by 1 px (10 px with Shift). Groups move, resize and rotate together.
Every drag is a single undo step, and Escape during a drag puts things back.

**Editing in place.** Double-click (or press Enter):

- a text box to type into it, with a floating format bar (bold, italic,
  underline, strikethrough, size, colour, headings, lists, quote, code, link).
  Styling applies to the selected characters, or to the whole box when nothing
  is selected. Boxes grow to fit, Tab indents list items, and an editing
  session is one undo step;
- a shape to edit its points: drag a point (even outside the box), drag a ◇ to
  add one, Delete removes the selected point. Lines and arrows always show
  their two ends as handles;
- an image to crop it like a mask: drag an edge and the picture stays put.

**Inspector and layers.** Properties shows controls for the selection (shape
fill, stroke, dash, arrowheads, corners, shadow and opacity; text font, size,
colour, alignment and spacing; image fit, crop, rendering and alt text; table
rows and colours; figure and data bindings), plus align, distribute, layer order
and exact position and size. With nothing selected it shows the slide
background and the presentation theme (presets, accent, colours, font). Layers
lists every object, top first; drag to restack.

**Slides.** The rail on the left shows live thumbnails. Drag to reorder, use
the buttons to duplicate or delete, or **New slide** with an optional template
(title, text + figure, split, quote). Alt+↑/↓ moves the current slide and
Cmd/Ctrl+D with nothing selected duplicates it.

**Undo, keyboard, menus.** Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z undo and redo
everything, including opening a file and deleting slides. Right-click for a
context menu, and press `?` for every shortcut.

**Present.** Present goes full screen with keyboard navigation; figures and
HTML widgets are interactive. Leaving lands the editor on the last slide shown.

When a decorated data function runs again in the notebook, every slide that
uses it updates in place, without reloading the page. Several browser tabs stay
in sync; if two tabs edit at once, the later change wins and the other tab is
told.

## Save, reopen, and export

```python
deck = cast.Cast("talk.cast.json")      # load it, or create an empty workspace
deck.save()                             # atomically update talk.cast.json
deck.save(as_="talk-copy.cast.json")    # write a copy; talk.cast.json stays active
deck.load()                             # reload the active workspace from disk
deck.freeze("talk.html")                # self-contained HTML that works offline
deck.freeze("talk.html", offline=False) # smaller file; loads Plotly from a CDN
```

`Cast(path)` makes that JSON file the workspace source of truth. If the path
exists it is validated and loaded; otherwise cast creates an empty
presentation there. The editor's **Save** button (Cmd/Ctrl+S) performs the same
atomic write as `deck.save()`. Python reserves the word `as`, so Save As is
spelled `as_`.

The `.cast.json` document is human-readable JSON with the slide order, text,
geometry, styles, theme, uploaded images, and references to decorated assets.
It does not contain Python functions or data; rerun the notebook cells that
define the assets before reopening a deck. In the editor, **Open** loads
another document (undoably) and **Download** saves an editable copy. Documents
from older versions open unchanged, including old Markdown text.

`freeze` renders every figure, table, HTML object and image in Python, embeds
them with the document, and inlines the same slide renderer the editor uses. The
result is one HTML file that needs no server: arrow keys, Space, swipe, `#3`
links to slide 3, and F for full screen. By default Plotly is inlined (about
5 MB) so the file also works offline. Text is sanitised when a deck is opened,
in the editor and in exported files alike.

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

## Development

The Python package lives in `cast/`; the browser editor and the export viewer
live in `frontend/` (TypeScript, React, Vite). The built editor is committed in
`cast/static/`, so installing the package never needs Node.

```bash
pip install -e ".[dev]"
pytest
```

```bash
cd frontend
npm install
npm test
npm run build
```

`npm run test:e2e` drives the built editor in Chromium against the fixture
deck (install the browser once with `npx playwright install chromium`).
`npm run build` type-checks and writes `cast/static/editor/` and
`cast/static/viewer/`; commit those files with your change (CI checks that they
match the source). For live reloading while working on the editor, start a
Python server (for example `python examples/demo.py`) and run `npm run dev`,
which proxies API calls to it. `python examples/_editor_fixture.py 8071` serves
an isolated deck with every block type for manual testing. The design notes are
in [`docs/rewrite/`](docs/rewrite/).

## API reference

| Call | Description |
| --- | --- |
| `cast.Cast(path)` | Open an existing `.cast.json` workspace or create a new one. |
| `deck.serve(port=8000, host="127.0.0.1", open=False)` | Start the editor in a background thread and return the URL; `open=True` embeds an IFrame in a notebook. Idempotent; raises `OSError` if the port is taken. |
| `@deck.data` / `@deck.data(name=, title=)` | Register a pandas or Polars dataframe-returning function as a data source. |
| `@deck.figure` / `@deck.figure(name=, title=)` | Register a `table -> Plotly figure` factory. |
| `@deck.html` / `@deck.html(name=, title=)` | Register an HTML-returning factory for iframe blocks. |
| `@deck.image` / `@deck.image(name=, title=, alt=)` | Register an original-quality image asset. |
| `deck.save()` / `deck.save(as_=path)` | Update the active workspace or atomically write a separate copy. |
| `deck.load()` | Reload the active workspace (registered assets remain available). |
| `deck.freeze(path, offline=True)` | Export a self-contained HTML file; `offline=False` loads Plotly from a CDN. |

## Notes and limitations

- One workspace is active per Python process; constructing another `Cast`
  switches the editor to that file while keeping the registered assets.
- `save` and `load` store references to decorated assets, not the Python behind
  them. Rerun the notebook cells that define the assets before calling `load`.
- Web fonts (Inter, Poppins, Playfair Display, Roboto Mono) load from Google
  Fonts; without internet the system font is used.
- Undo history lives in the browser tab and is cleared when the page reloads or
  another tab replaces the deck.

## License

The editor bundles icons from [Lucide](https://lucide.dev) (ISC); the notice is
in `cast/static/LUCIDE-LICENSE`. The editor and exported files bundle
[Plotly.js](https://github.com/plotly/plotly.js) (MIT).

MIT. See [LICENSE](LICENSE).
