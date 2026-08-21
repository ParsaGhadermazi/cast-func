# cast

Present from a notebook with lightweight decorators.

**Project note:** This repo is vibe coded: it is an experimental, fast-moving
tool built around an idea I wanted to try, so expect rough edges and rapid
iteration.

```python
from pathlib import Path

import cast, polars as pl, plotly.express as px

cast.serve(port=8000)            # live page in a background thread

@cast.data                        # function returns a polars LazyFrame
def sales():
    return pl.scan_parquet("sales.parquet")

@cast.figure                      # a factory: takes one table, returns a Plotly figure
def trend(tbl: pl.LazyFrame):
    df = tbl.select(["date", "value"]).collect()
    return px.line(df, x="date", y="value")

@cast.html                        # a factory: returns custom HTML for an iframe block
def callout():
    return "<h2>Custom HTML</h2><button onclick=\"this.textContent='clicked'\">Click</button>"

@cast.image(title="Study design", alt="Diagram of the study workflow")
def study_design():
    return Path("figures/study-design.svg")  # PNG and JPEG work too

sales()                           # register the table (data is injected from the browser)

cast.load("talk.cast.json")       # restore an editable deck after assets register
```

`@cast.figure` registers a **factory** at decoration time — you don't pass a
table in the notebook. Open the printed URL and use the controls to **add** the
figure to the inventory, optionally with a chosen table. The same factory can be
added many times with different data, and each instance has its own table
dropdown; picking a table re-runs your figure function on the server against it.
If the figure already exists, the function can also ignore data or take no
arguments and return that Plotly object directly. Calling a `@cast.data`
function again updates its data and the page refreshes live.

Registered `@cast.data` objects can also be added directly as table blocks.
Tables have sticky column headers, horizontal and vertical scrolling, optional
row numbers and stripes, compact spacing, configurable colors, and a preview
limit of up to 1,000 rows. The same scrollable table is preserved in present
mode and standalone HTML exports.

Text boxes use slide-native rich text rather than Markdown. The editor toggles
editing on the same text element used for presentation, so typography, wrapping,
and spacing do not change between design and present modes. Older Markdown text
blocks are converted to rich text when opened.

`@cast.html` registers a custom HTML object at decoration time. Add it from the
HTML dropdown to insert the returned HTML into a sandboxed iframe block. This is
useful for small widgets, controls, styled notes, or external visualization
snippets that are not Plotly figures.

`@cast.image` registers publication-quality image assets at decoration time.
The function can return a PNG/JPEG/SVG file path, raw image bytes, SVG markup,
a data URI, or a notebook object with a PNG, JPEG, or SVG rich representation.
The live app serves the original bytes without resizing or recompression, so
SVG remains vector and raster images retain their full resolution. Registered
images are selected beside the **+ Image** button and default to showing the
whole source. The inspector provides contain/cover/stretch behavior, a source
aspect-ratio action, smooth/crisp/pixel rendering, transparency, alt text,
corner radius, and opacity. Frozen HTML exports embed the same original asset
so the deck remains portable.

## Save and reopen an editable presentation

Use **Save** in the editor to download `presentation.cast.json`, and **Open**
to replace the current deck from one of those files. The editable document
preserves slide order, text, geometry, styles, rotations, theme, manually
uploaded images, and references to decorated assets. It deliberately does not
serialize Python functions or live data frames; rerun the notebook cells that
define those assets before reopening the deck.

The same workflow is available from Python:

```python
cast.save("talk.cast.json")

# In a later session, after @cast.data/@cast.figure/@cast.html/@cast.image cells:
cast.load("talk.cast.json")
```

`cast.save()` is the editable source file. `cast.freeze("talk.html")` remains
the self-contained presentation output intended for viewing and sharing.

See [`examples/demo.py`](examples/demo.py) for a runnable showcase.
