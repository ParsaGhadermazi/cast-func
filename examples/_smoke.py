import base64
import json
import tempfile
from pathlib import Path

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import polars as pl
from fastapi.testclient import TestClient

import cast
from cast.server import app


@cast.data
def monthly():
    return pl.DataFrame({"date": ["a", "b"], "value": [1, 2]})


@cast.data(title="Wide")
def wide():
    return pl.DataFrame({"x": [1], "y": [2]})


@cast.data(title="Pandas monthly")
def pandas_monthly():
    return pd.DataFrame({"date": ["c", "d"], "value": [3, 4]})


@cast.data(title="Eager Polars")
def eager_polars():
    return pl.DataFrame({"date": ["e", "f"], "value": [5, 6]})


@cast.figure(title="Trend")
def trend(tbl: pl.DataFrame):
    assert isinstance(tbl, pl.DataFrame)
    df = tbl.select(["date", "value"])
    return px.line(df, x="date", y="value")


@cast.figure(title="Standalone")
def standalone():
    return go.Figure(go.Scatter(x=[1, 2, 3], y=[3, 1, 2], mode="markers"))


@cast.html(title="Interactive note")
def note():
    return "<html><body><button onclick=\"this.textContent='clicked'\">click me</button></body></html>"


PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


@cast.image(title="Raster pixel", alt="A single blue pixel")
def raster_pixel():
    return PNG_BYTES


@cast.image(title="Vector badge")
def vector_badge():
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120"><rect width="240" height="120" fill="#5b8cff"/><text x="120" y="70" text-anchor="middle" fill="white" font-size="28">cast</text></svg>'


client = TestClient(app)

# ----- assets ------------------------------------------------------------- #
# Every decorator registers at decoration time; no function call is required.
st = client.get("/state").json()
assert {f["name"] for f in st["figures"]} == {"trend", "standalone"}, st["figures"]
assert {h["name"] for h in st["htmls"]} == {"note"}, st["htmls"]
assert {image["name"] for image in st["images"]} == {"raster_pixel", "vector_badge"}, st["images"]
assert {t["name"] for t in st["tables"]} == {
    "monthly", "wide", "pandas_monthly", "eager_polars"
}, st["tables"]
assert st["slides"] == [], st["slides"]
assert st["theme"]["accent"], st["theme"]
assert st["workspace"] == {"configured": False, "filename": None}
assert client.post("/deck/save").status_code == 409

# Calling a @data function still returns its value and refreshes the live table.
monthly_version = next(t["version"] for t in st["tables"] if t["name"] == "monthly")
assert isinstance(monthly(), pl.DataFrame)
st = client.get("/state").json()
assert next(t["version"] for t in st["tables"] if t["name"] == "monthly") > monthly_version

# LazyFrame is intentionally outside the @data contract.
@cast.data(name="unsupported_lazy")
def unsupported_lazy():
    return pl.DataFrame({"value": [1]}).lazy()


try:
    unsupported_lazy()
except TypeError as exc:
    assert "pandas.DataFrame, or polars.DataFrame" in str(exc)
else:
    raise AssertionError("@cast.data accepted a polars.LazyFrame")

# ----- render (live re-run) ----------------------------------------------- #
ok = client.get("/render", params={"figure": "trend", "table": "monthly"}).json()
assert ok["ok"] is True and "data" in json.loads(ok["plotly"])
pandas_ok = client.get(
    "/render", params={"figure": "trend", "table": "pandas_monthly"}
).json()
assert pandas_ok["ok"] is True and "data" in json.loads(pandas_ok["plotly"])
eager_polars_ok = client.get(
    "/render", params={"figure": "trend", "table": "eager_polars"}
).json()
assert eager_polars_ok["ok"] is True and "data" in json.loads(eager_polars_ok["plotly"])
# Deferred resolution accepts both dataframe types without an explicit call;
# direct calls still return the source's original type and refresh the cache.
assert isinstance(pandas_monthly(), pd.DataFrame)
assert isinstance(eager_polars(), pl.DataFrame)
standalone_ok = client.get("/render", params={"figure": "standalone"}).json()
assert standalone_ok["ok"] is True and "data" in json.loads(standalone_ok["plotly"])
bad = client.get("/render", params={"figure": "trend", "table": "wide"}).json()
assert bad["ok"] is False and bad["error"], bad
html_ok = client.get("/render_html", params={"html": "note"}).json()
assert html_ok["ok"] is True and "button" in html_ok["html"], html_ok
png_ok = client.get("/render_image", params={"image": "raster_pixel"})
assert png_ok.status_code == 200 and png_ok.headers["content-type"].startswith("image/png")
assert png_ok.content == PNG_BYTES
assert "immutable" in png_ok.headers["cache-control"]
svg_ok = client.get("/render_image", params={"image": "vector_badge"})
assert svg_ok.status_code == 200 and svg_ok.headers["content-type"].startswith("image/svg+xml")
assert b"<svg" in svg_ok.content

# Calling a decorated image refreshes its cached bytes and cache-busting version.
image_version = next(image["version"] for image in st["images"] if image["name"] == "raster_pixel")
assert raster_pixel() == PNG_BYTES
refreshed_state = client.get("/state").json()
assert next(
    image["version"] for image in refreshed_state["images"] if image["name"] == "raster_pixel"
) > image_version
assert client.get("/render_image", params={"image": "raster_pixel"}).content == PNG_BYTES

missing_image = client.get("/render_image", params={"image": "missing"})
assert missing_image.status_code == 422
table_ok = client.get("/render_table", params={"table": "monthly", "limit": 1}).json()
assert table_ok["ok"] is True and table_ok["truncated"] is True, table_ok
assert [column["name"] for column in table_ok["columns"]] == ["date", "value"]
assert table_ok["rows"] == [["a", "1"]]
pandas_table_ok = client.get(
    "/render_table", params={"table": "pandas_monthly", "limit": 1}
).json()
assert pandas_table_ok["ok"] is True and pandas_table_ok["truncated"] is True
assert pandas_table_ok["rows"] == [["c", "3"]]
eager_polars_table_ok = client.get(
    "/render_table", params={"table": "eager_polars", "limit": 1}
).json()
assert eager_polars_table_ok["ok"] is True and eager_polars_table_ok["truncated"] is True
assert eager_polars_table_ok["rows"] == [["e", "5"]]

# ----- deck: slides ------------------------------------------------------- #
sid1 = client.post("/slides").json()["id"]
sid2 = client.post("/slides").json()["id"]
st = client.get("/state").json()
assert [s["id"] for s in st["slides"]] == [sid1, sid2], st["slides"]

# reorder
assert client.patch("/slides/order", json={"order": [sid2, sid1]}).json()["ok"] is True
st = client.get("/state").json()
assert [s["id"] for s in st["slides"]] == [sid2, sid1]
assert client.patch("/slides/order", json={"order": [sid2, sid2]}).json()["ok"] is False
assert [s["id"] for s in client.get("/state").json()["slides"]] == [sid2, sid1]

# ----- deck: blocks ------------------------------------------------------- #
# a figure block bound to a table
fig_bid = client.post(
    f"/slides/{sid1}/blocks",
    json={"type": "figure", "figure": "trend", "table": "monthly",
          "x": 0.1, "y": 0.1, "w": 0.5, "h": 0.5},
).json()["id"]
# a text block
txt_bid = client.post(
    f"/slides/{sid1}/blocks",
    json={"type": "text", "content": "<pre>print('hello')</pre>", "x": 0.6, "y": 0.1,
          "w": 0.3, "h": 0.2, "style": {"textVariant": "code"}},
).json()["id"]
# an HTML block
html_bid = client.post(
    f"/slides/{sid1}/blocks",
    json={"type": "html", "html": "note", "x": 0.15, "y": 0.55, "w": 0.45, "h": 0.25},
).json()["id"]
# a scrollable table block
table_bid = client.post(
    f"/slides/{sid1}/blocks",
    json={"type": "table", "table": "monthly", "x": 0.1, "y": 0.1,
          "w": 0.8, "h": 0.5, "style": {"rowLimit": 100}},
).json()["id"]
# a registered image block
image_bid = client.post(
    f"/slides/{sid1}/blocks",
    json={"type": "image", "image": "raster_pixel", "x": 0.62, "y": 0.58,
          "w": 0.25, "h": 0.25, "style": {"fit": "contain"}},
).json()["id"]

st = client.get("/state").json()
slide1 = next(s for s in st["slides"] if s["id"] == sid1)
assert {b["id"] for b in slide1["blocks"]} == {fig_bid, txt_bid, html_bid, table_bid, image_bid}
fig_block = next(b for b in slide1["blocks"] if b["id"] == fig_bid)
assert fig_block["figure"] == "trend" and fig_block["table"] == "monthly"
assert next(b for b in slide1["blocks"] if b["id"] == html_bid)["html"] == "note"
assert next(b for b in slide1["blocks"] if b["id"] == table_bid)["table"] == "monthly"
assert next(b for b in slide1["blocks"] if b["id"] == image_bid)["image"] == "raster_pixel"
assert client.patch(
    f"/blocks/{image_bid}",
    json={"style": {"fit": "contain", "crop": {"left": 0.2, "right": 0, "top": 0, "bottom": 0}}},
).json()["ok"]
shape_bid = client.post(
    f"/slides/{sid1}/blocks",
    json={"type": "shape", "x": 0.3, "y": 0.3, "w": 0.2, "h": 0.2,
          "style": {"shape": "rect", "fill": "#5b8cff",
                    "points": [[1, 1], [99, 1], [88, 99], [1, 99]]}},
).json()["id"]
# blocks get an increasing z so later ones stack on top
assert next(b for b in slide1["blocks"] if b["id"] == txt_bid)["z"] > fig_block["z"]

# patch geometry + content
assert client.patch(f"/blocks/{fig_bid}", json={"table": "wide", "x": 0.2}).json()["ok"]
assert client.patch(f"/blocks/{txt_bid}",
                    json={"content": "<p><strong>Updated</strong></p>",
                          "style": {"size": 24, "textVariant": "code"}}).json()["ok"]
st = client.get("/state").json()
slide1 = next(s for s in st["slides"] if s["id"] == sid1)
fig_block = next(b for b in slide1["blocks"] if b["id"] == fig_bid)
txt_block = next(b for b in slide1["blocks"] if b["id"] == txt_bid)
assert fig_block["table"] == "wide" and fig_block["x"] == 0.2
assert txt_block["content"] == "<p><strong>Updated</strong></p>" and txt_block["style"]["size"] == 24
assert txt_block["style"]["textVariant"] == "code"

# remove a block
assert client.delete(f"/blocks/{html_bid}").json()["ok"] is True
st = client.get("/state").json()
slide1 = next(s for s in st["slides"] if s["id"] == sid1)
assert {b["id"] for b in slide1["blocks"]} == {fig_bid, txt_bid, table_bid, image_bid, shape_bid}

# ----- deck: theme -------------------------------------------------------- #
assert client.patch("/theme", json={"accent": "#ff0000", "bg": "#222222"}).json()["ok"]
st = client.get("/state").json()
assert st["theme"]["accent"] == "#ff0000" and st["theme"]["bg"] == "#222222"

# ----- editable persistence + standalone export --------------------------- #
downloaded_deck = client.get("/deck")
assert downloaded_deck.status_code == 200
assert "presentation.cast.json" in downloaded_deck.headers["content-disposition"]
deck_document = downloaded_deck.json()
assert deck_document["format"] == "cast.presentation"
assert deck_document["schema_version"] == 1
assert [slide["id"] for slide in deck_document["slides"]] == [sid2, sid1]
assert next(
    b for s in deck_document["slides"] for b in s["blocks"] if b["id"] == image_bid
)["style"]["crop"]["left"] == 0.2
assert next(
    b for s in deck_document["slides"] for b in s["blocks"] if b["id"] == shape_bid
)["style"]["points"][2] == [88, 99]

# Invalid/future documents are rejected transactionally.
before_invalid_load = client.get("/state").json()
invalid_load = client.put("/deck", json={
    "format": "cast.presentation", "schema_version": 999,
    "theme": {}, "slides": [],
})
assert invalid_load.status_code == 400 and invalid_load.json()["ok"] is False
after_invalid_load = client.get("/state").json()
assert after_invalid_load["slides"] == before_invalid_load["slides"]
assert after_invalid_load["theme"] == before_invalid_load["theme"]

with tempfile.TemporaryDirectory() as tmpdir:
    export_path = Path(tmpdir) / "deck.html"
    cast.freeze(str(export_path))
    exported = export_path.read_text(encoding="utf-8")
    assert "renderFrozenTable" in exported and '"title": "Monthly"' in exported
    assert "data:image/png;base64," in exported
    assert '"crop": {"left": 0.2' in exported
    assert '"points": [[1, 1], [99, 1], [88, 99], [1, 99]]' in exported
    assert "code-text" in exported and '"textVariant": "code"' in exported

    editable_path = Path(tmpdir) / "deck.cast.json"
    assert cast.save(editable_path) == str(editable_path.resolve())
    saved_document = json.loads(editable_path.read_text(encoding="utf-8"))
    assert saved_document == deck_document

    # Mutate the live registry, then restore it from Python.
    assert client.delete(f"/slides/{sid1}").json()["ok"] is True
    assert [s["id"] for s in client.get("/state").json()["slides"]] == [sid2]
    assert cast.load(editable_path) == str(editable_path.resolve())
    restored = client.get("/state").json()
    assert [s["id"] for s in restored["slides"]] == [sid2, sid1]
    assert restored["theme"]["accent"] == "#ff0000"
    restored_slide = next(s for s in restored["slides"] if s["id"] == sid1)
    assert {b["id"] for b in restored_slide["blocks"]} == {fig_bid, txt_bid, table_bid, image_bid, shape_bid}

    # Loading also restores id sequences, so future edits cannot collide.
    sid3 = client.post("/slides").json()["id"]
    assert sid3 == "s3"
    assert client.delete(f"/slides/{sid3}").json()["ok"] is True
    next_bid = client.post(
        f"/slides/{sid1}/blocks", json={"type": "text", "content": "<p>new</p>"}
    ).json()["id"]
    assert next_bid == "b7"
    assert client.delete(f"/blocks/{next_bid}").json()["ok"] is True

    # Slide duplication inserts a deep copy immediately after its source.
    before_duplicate = client.get("/state").json()
    source_slide = next(s for s in before_duplicate["slides"] if s["id"] == sid1)
    duplicate_response = client.post(f"/slides/{sid1}/duplicate")
    assert duplicate_response.status_code == 200
    duplicate_sid = duplicate_response.json()["id"]
    duplicated_state = client.get("/state").json()
    duplicated_ids = [slide["id"] for slide in duplicated_state["slides"]]
    assert duplicated_ids.index(duplicate_sid) == duplicated_ids.index(sid1) + 1
    duplicate_slide = next(
        slide for slide in duplicated_state["slides"] if slide["id"] == duplicate_sid
    )
    assert duplicate_slide["background"] == source_slide["background"]
    assert [
        {key: value for key, value in block.items() if key != "id"}
        for block in duplicate_slide["blocks"]
    ] == [
        {key: value for key, value in block.items() if key != "id"}
        for block in source_slide["blocks"]
    ]
    assert {block["id"] for block in duplicate_slide["blocks"]}.isdisjoint(
        {block["id"] for block in source_slide["blocks"]}
    )
    assert client.delete(f"/slides/{duplicate_sid}").json()["ok"] is True

    # The browser upload endpoint accepts the same document.
    assert client.put("/deck", json=saved_document).json()["ok"] is True

# ----- remove a slide ----------------------------------------------------- #
assert client.delete(f"/slides/{sid1}").json()["ok"] is True
st = client.get("/state").json()
assert [s["id"] for s in st["slides"]] == [sid2]

assert client.get("/").status_code == 200
assert client.get("/app.js").status_code == 200
assert client.get("/app.css").status_code == 200
icons = client.get("/icons.js")
assert icons.status_code == 200 and "castIcon" in icons.text

# Older text formats, tied z values, all block types, and per-slide backgrounds.
from examples._editor_fixture import editor_fixture

legacy = editor_fixture()
assert client.put("/deck", json=legacy).json()["ok"]
normalized = client.get("/deck").json()
assert normalized["schema_version"] == 1
assert normalized["slides"][1]["background"] == "#eaf4ef"
assert normalized["slides"][1]["blocks"][0]["markdown"].startswith("## Legacy")
assert normalized["slides"][2]["blocks"][0]["style"]["textMode"] == "rich"
assert client.put("/deck", json=normalized).json()["ok"]
assert client.get("/deck").json() == normalized
order = [s["id"] for s in normalized["slides"]]
assert client.patch("/slides/order", json={"order": order + [order[0]]}).json()["ok"] is False
assert client.patch("/slides/order", json={"order": order[::-1]}).json()["ok"]
reordered = client.get("/deck").json()
assert reordered["slides"] == normalized["slides"][::-1]
with tempfile.TemporaryDirectory() as tmpdir:
    export_path = Path(tmpdir) / "legacy.html"
    cast.freeze(str(export_path))
    assert '"background": "#eaf4ef"' in export_path.read_text(encoding="utf-8")

# ----- file-backed Cast workspace ---------------------------------------- #
with tempfile.TemporaryDirectory() as tmpdir:
    workspace_path = Path(tmpdir) / "workspace.cast.json"
    workspace = cast.Cast(workspace_path)
    assert workspace.path == str(workspace_path.resolve())
    assert workspace_path.exists()
    created_document = json.loads(workspace_path.read_text(encoding="utf-8"))
    assert created_document["format"] == "cast.presentation"
    assert created_document["slides"] == []

    @workspace.data(name="instance_data", title="Instance data")
    def instance_data():
        return pl.DataFrame({"value": [1]})

    assert "instance_data" in {
        table["name"] for table in client.get("/state").json()["tables"]
    }
    workspace_sid = client.post("/slides").json()["id"]
    client.post(
        f"/slides/{workspace_sid}/blocks",
        json={"type": "text", "content": "<p>Workspace</p>"},
    )
    assert workspace.save() == str(workspace_path.resolve())
    assert len(json.loads(workspace_path.read_text(encoding="utf-8"))["slides"]) == 1

    # The browser Save action writes the configured workspace file.
    assert client.patch("/theme", json={"accent": "#123456"}).json()["ok"] is True
    browser_save = client.post("/deck/save")
    assert browser_save.json() == {"ok": True, "filename": "workspace.cast.json"}
    assert json.loads(workspace_path.read_text(encoding="utf-8"))["theme"]["accent"] == "#123456"

    copy_path = Path(tmpdir) / "workspace-copy.cast.json"
    assert workspace.save(as_=copy_path) == str(copy_path.resolve())
    assert copy_path.exists()
    assert workspace.path == str(workspace_path.resolve())

    # Reconstructing Cast from an existing file restores its saved deck.
    assert client.patch("/theme", json={"accent": "#abcdef"}).json()["ok"] is True
    reopened = cast.Cast(workspace_path)
    reopened_state = client.get("/state").json()
    assert reopened.path == workspace.path
    assert reopened_state["theme"]["accent"] == "#123456"
    assert len(reopened_state["slides"]) == 1

print("SMOKE_OK | error sample:", bad["error"].splitlines()[0])
