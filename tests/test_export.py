import json
import re

import plotly.express as px
import polars as pl
import pytest

import cast
from cast.registry import registry

from conftest import deck


@pytest.fixture
def frozen_deck():
    @cast.data
    def monthly():
        return pl.DataFrame({"date": ["a", "b"], "value": [1, 2]})

    @cast.figure
    def trend(tbl):
        return px.line(tbl, x="date", y="value")

    @cast.image(alt="Badge")
    def badge():
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 1"><rect width="2" height="1"/></svg>'

    @cast.html
    def note():
        return "<p>note</p>"

    registry.load_deck(deck({"id": "s1", "blocks": [
        {"id": "b1", "type": "text", "content": "<h1>Quarterly review</h1><p>bye</script><img src=x onerror=alert(1)></p>"},
        {"id": "b2", "type": "figure", "figure": "trend", "table": "monthly"},
        {"id": "b3", "type": "table", "table": "monthly", "style": {"rowLimit": 1}},
        {"id": "b4", "type": "image", "image": "badge"},
        {"id": "b5", "type": "html", "html": "note"},
    ]}))


def payload(document: str) -> dict:
    raw = re.search(r'<script type="application/json" id="cast-deck">(.*?)</script>', document, re.S).group(1)
    return json.loads(raw.replace("<\\/", "</"))


def test_freeze_embeds_rendered_assets_and_inlines_plotly(tmp_path, frozen_deck):
    out = cast.freeze(tmp_path / "talk.html")
    document = open(out, encoding="utf-8").read()
    assert "<title>Quarterly review bye</title>" in document
    assert "cdn.jsdelivr.net/npm/plotly" not in document  # offline by default
    data = payload(document)
    assets = data["assets"]
    assert assets["figures"]["trend\u0000monthly"]["ok"]
    assert assets["figures"]["trend\u0000monthly"]["value"]["data"][0]["type"] == "scatter"
    assert assets["tables"]["monthly\u00001"]["value"]["rows"] == [["a", "1"]]
    assert assets["images"]["badge"].startswith("data:image/svg+xml;base64,")
    assert assets["htmls"]["note"]["value"] == "<p>note</p>"
    assert assets["alts"]["badge"] == "Badge"


def test_freeze_never_lets_content_close_the_script_early(tmp_path, frozen_deck):
    document = open(cast.freeze(tmp_path / "talk.html"), encoding="utf-8").read()
    body = document.split('<script type="application/json" id="cast-deck">', 1)[1]
    # Exactly two closing tags: the data block and the viewer script.
    assert body.count("</script>") == 2
    assert "<!--" not in body.split("</script>")[0]


def test_freeze_can_use_a_cdn_for_plotly(tmp_path, frozen_deck):
    offline = (tmp_path / "offline.html")
    lite = (tmp_path / "lite.html")
    cast.freeze(offline)
    cast.freeze(lite, offline=False)
    assert "cdn.jsdelivr.net/npm/plotly.js-dist-min" in lite.read_text(encoding="utf-8")
    assert lite.stat().st_size < offline.stat().st_size / 5


def test_freeze_requires_slides(tmp_path):
    with pytest.raises(ValueError, match="no slides"):
        cast.freeze(tmp_path / "empty.html")
