import base64
import json

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import polars as pl
import pytest

import cast

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


@pytest.fixture
def assets():
    @cast.data
    def monthly():
        return pl.DataFrame({"date": ["a", "b"], "value": [1, 2]})

    @cast.data(title="Wide")
    def wide():
        return pl.DataFrame({"x": [1], "y": [2]})

    @cast.data(title="Pandas monthly")
    def pandas_monthly():
        return pd.DataFrame({"date": ["c", "d"], "value": [3, 4]})

    @cast.figure(title="Trend")
    def trend(tbl):
        assert isinstance(tbl, pl.DataFrame)
        return px.line(tbl.select(["date", "value"]), x="date", y="value")

    @cast.figure(title="Standalone")
    def standalone():
        return go.Figure(go.Scatter(x=[1, 2], y=[2, 1]))

    @cast.html(title="Note")
    def note():
        return "<button>click me</button>"

    @cast.image(title="Pixel", alt="A pixel")
    def pixel():
        return PNG

    @cast.image(title="Badge")
    def badge():
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120"><rect width="240" height="120"/></svg>'

    return {"monthly": monthly, "pandas_monthly": pandas_monthly, "pixel": pixel}


def test_decorators_register_at_definition_time(client, assets):
    state = client.get("/state").json()
    assert {f["name"] for f in state["figures"]} == {"trend", "standalone"}
    assert {t["name"] for t in state["tables"]} == {"monthly", "wide", "pandas_monthly"}
    assert {h["name"] for h in state["htmls"]} == {"note"}
    assert {i["name"] for i in state["images"]} == {"pixel", "badge"}
    assert state["slides"] == [] and state["workspace"] == {"configured": False, "filename": None}


def test_calling_data_function_refreshes_version_and_returns_original_type(client, assets):
    before = next(t["version"] for t in client.get("/state").json()["tables"] if t["name"] == "monthly")
    assert isinstance(assets["pandas_monthly"](), pd.DataFrame)
    assert isinstance(assets["monthly"](), pl.DataFrame)
    after = next(t["version"] for t in client.get("/state").json()["tables"] if t["name"] == "monthly")
    assert after > before


def test_lazy_frames_are_rejected():
    @cast.data
    def lazy():
        return pl.DataFrame({"v": [1]}).lazy()

    with pytest.raises(TypeError, match="pandas.DataFrame, or polars.DataFrame"):
        lazy()


def test_render_figures_with_and_without_data(client, assets):
    ok = client.get("/render", params={"figure": "trend", "table": "monthly"}).json()
    assert ok["ok"] and "data" in json.loads(ok["plotly"])
    assert client.get("/render", params={"figure": "trend", "table": "pandas_monthly"}).json()["ok"]
    assert client.get("/render", params={"figure": "standalone"}).json()["ok"]
    bad = client.get("/render", params={"figure": "trend", "table": "wide"}).json()
    assert bad["ok"] is False and "date" in bad["error"]


def test_render_table_html_and_images(client, assets):
    table = client.get("/render_table", params={"table": "monthly", "limit": 1}).json()
    assert table["ok"] and table["truncated"] and table["rows"] == [["a", "1"]]
    assert [c["name"] for c in table["columns"]] == ["date", "value"]
    assert "button" in client.get("/render_html", params={"html": "note"}).json()["html"]
    png = client.get("/render_image", params={"image": "pixel"})
    assert png.headers["content-type"].startswith("image/png") and png.content == PNG
    assert "immutable" in png.headers["cache-control"]
    svg = client.get("/render_image", params={"image": "badge"})
    assert svg.headers["content-type"].startswith("image/svg+xml")
    assert client.get("/render_image", params={"image": "missing"}).status_code == 422


def test_calling_image_function_bumps_its_version(client, assets):
    before = next(i["version"] for i in client.get("/state").json()["images"] if i["name"] == "pixel")
    assert assets["pixel"]() == PNG
    after = next(i["version"] for i in client.get("/state").json()["images"] if i["name"] == "pixel")
    assert after > before
