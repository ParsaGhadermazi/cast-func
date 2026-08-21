import base64
import json
import tempfile
from pathlib import Path

import plotly.express as px
import plotly.graph_objects as go
import polars as pl
from fastapi.testclient import TestClient

import cast
from cast.server import app


@cast.data
def monthly():
    return pl.LazyFrame({"date": ["a", "b"], "value": [1, 2]})


@cast.data(title="Wide")
def wide():
    return pl.LazyFrame({"x": [1], "y": [2]})


@cast.figure(title="Trend")
def trend(tbl: pl.LazyFrame):
    df = tbl.select(["date", "value"]).collect()
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


# @figure registers at decoration; no table call needed.
# decorated funcs still pass through their original return value
assert isinstance(monthly(), pl.LazyFrame)
wide()

client = TestClient(app)

# ----- assets ------------------------------------------------------------- #
st = client.get("/state").json()
assert {f["name"] for f in st["figures"]} == {"trend", "standalone"}, st["figures"]
assert {h["name"] for h in st["htmls"]} == {"note"}, st["htmls"]
assert {image["name"] for image in st["images"]} == {"raster_pixel", "vector_badge"}, st["images"]
assert {t["name"] for t in st["tables"]} == {"monthly", "wide"}, st["tables"]
assert st["slides"] == [], st["slides"]
assert st["theme"]["accent"], st["theme"]

# ----- render (live re-run) ----------------------------------------------- #
ok = client.get("/render", params={"figure": "trend", "table": "monthly"}).json()
assert ok["ok"] is True and "data" in json.loads(ok["plotly"])
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
missing_image = client.get("/render_image", params={"image": "missing"})
assert missing_image.status_code == 422
table_ok = client.get("/render_table", params={"table": "monthly", "limit": 1}).json()
assert table_ok["ok"] is True and table_ok["truncated"] is True, table_ok
assert [column["name"] for column in table_ok["columns"]] == ["date", "value"]
assert table_ok["rows"] == [["a", "1"]]

# ----- deck: slides ------------------------------------------------------- #
sid1 = client.post("/slides").json()["id"]
sid2 = client.post("/slides").json()["id"]
st = client.get("/state").json()
assert [s["id"] for s in st["slides"]] == [sid1, sid2], st["slides"]

# reorder
assert client.patch("/slides/order", json={"order": [sid2, sid1]}).json()["ok"] is True
st = client.get("/state").json()
assert [s["id"] for s in st["slides"]] == [sid2, sid1]

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
    json={"type": "text", "content": "<h2>Hello</h2>", "x": 0.6, "y": 0.1, "w": 0.3, "h": 0.2},
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
# blocks get an increasing z so later ones stack on top
assert next(b for b in slide1["blocks"] if b["id"] == txt_bid)["z"] > fig_block["z"]

# patch geometry + content
assert client.patch(f"/blocks/{fig_bid}", json={"table": "wide", "x": 0.2}).json()["ok"]
assert client.patch(f"/blocks/{txt_bid}",
                    json={"content": "<p><strong>Updated</strong></p>", "style": {"size": 24}}).json()["ok"]
st = client.get("/state").json()
slide1 = next(s for s in st["slides"] if s["id"] == sid1)
fig_block = next(b for b in slide1["blocks"] if b["id"] == fig_bid)
txt_block = next(b for b in slide1["blocks"] if b["id"] == txt_bid)
assert fig_block["table"] == "wide" and fig_block["x"] == 0.2
assert txt_block["content"] == "<p><strong>Updated</strong></p>" and txt_block["style"]["size"] == 24

# remove a block
assert client.delete(f"/blocks/{txt_bid}").json()["ok"] is True
st = client.get("/state").json()
slide1 = next(s for s in st["slides"] if s["id"] == sid1)
assert {b["id"] for b in slide1["blocks"]} == {fig_bid, html_bid, table_bid, image_bid}

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
    assert {b["id"] for b in restored_slide["blocks"]} == {fig_bid, html_bid, table_bid, image_bid}

    # Loading also restores id sequences, so future edits cannot collide.
    sid3 = client.post("/slides").json()["id"]
    assert sid3 == "s3"
    assert client.delete(f"/slides/{sid3}").json()["ok"] is True
    next_bid = client.post(
        f"/slides/{sid1}/blocks", json={"type": "text", "content": "<p>new</p>"}
    ).json()["id"]
    assert next_bid == "b6"
    assert client.delete(f"/blocks/{next_bid}").json()["ok"] is True

    # The browser upload endpoint accepts the same document.
    assert client.put("/deck", json=saved_document).json()["ok"] is True

# ----- remove a slide ----------------------------------------------------- #
assert client.delete(f"/slides/{sid1}").json()["ok"] is True
st = client.get("/state").json()
assert [s["id"] for s in st["slides"]] == [sid2]

assert client.get("/").status_code == 200
assert client.get("/app.js").status_code == 200
assert client.get("/app.css").status_code == 200
print("SMOKE_OK | error sample:", bad["error"].splitlines()[0])
