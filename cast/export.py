"""Static export: turn the live deck into one self-contained HTML file.

``freeze(path)`` renders every notebook-backed block in Python (figures to
Plotly JSON, tables to rows, HTML objects to markup, images to data URIs),
embeds the editable document plus those results, and inlines the viewer
bundle built from ``frontend/src/viewer``. The viewer draws slides with the
same renderer as the editor's present mode, sanitises text on load, and
offers keyboard, swipe and ``#slide`` navigation.

By default Plotly is inlined so the file works offline (about 5 MB).
``offline=False`` loads Plotly from a CDN instead and keeps the file small.
Figures are snapshots of the data at freeze time.
"""

from __future__ import annotations

import base64
import html
import json
import re
from os import PathLike
from pathlib import Path
from typing import Union

from .registry import registry

Pathish = Union[str, PathLike]

_VIEWER = Path(__file__).with_name("static") / "viewer"
_PLOTLY_CDN = "https://cdn.jsdelivr.net/npm/plotly.js-dist-min@3.7.0/plotly.min.js"
_FONTS = (
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Poppins:wght@400;600;700"
    "&family=Playfair+Display:wght@400;700&family=Roboto+Mono:wght@400;700&display=swap"
)


def freeze(path: Pathish, *, offline: bool = True) -> str:
    """Write the current deck to a self-contained HTML file at ``path``.

    Returns the absolute path written. Raises ``ValueError`` if the deck has
    no slides yet.
    """
    deck = registry.get_deck()
    if not deck["slides"]:
        raise ValueError(
            "Nothing to export: the deck has no slides yet. Build a deck in "
            "the browser (deck.serve()) first, then call freeze(...)."
        )
    document = _render_document(deck, _collect_assets(deck), offline=offline)
    out = Path(path).expanduser().resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(document, encoding="utf-8")
    return str(out)


def _table_limit(block: dict) -> int:
    try:
        return max(1, min(int((block.get("style") or {}).get("rowLimit", 200)), 1000))
    except (TypeError, ValueError):
        return 200


def _collect_assets(deck: dict) -> dict:
    """Render every asset the deck references, keyed the way the viewer looks them up."""
    state = registry.get_state()
    assets: dict = {
        "titles": {
            "figure": {item["name"]: item["title"] for item in state["figures"]},
            "table": {item["name"]: item["title"] for item in state["tables"]},
            "html": {item["name"]: item["title"] for item in state["htmls"]},
            "image": {item["name"]: item["title"] for item in state["images"]},
        },
        "alts": {item["name"]: item["alt"] for item in state["images"]},
        "figures": {},
        "tables": {},
        "htmls": {},
        "images": {},
    }
    for slide in deck["slides"]:
        for block in slide["blocks"]:
            kind = block["type"]
            if kind == "figure" and block.get("figure"):
                key = f"{block['figure']}\u0000{block.get('table') or ''}"
                if key not in assets["figures"]:
                    result = registry.apply(block["figure"], block.get("table") or None)
                    if result.ok:
                        figure = json.loads(result.plotly)
                        assets["figures"][key] = {
                            "ok": True,
                            "value": {"data": figure.get("data", []), "layout": figure.get("layout", {})},
                        }
                    else:
                        assets["figures"][key] = {"ok": False, "error": result.error}
            elif kind == "table" and block.get("table"):
                limit = _table_limit(block)
                key = f"{block['table']}\u0000{limit}"
                if key not in assets["tables"]:
                    result = registry.render_table(block["table"], limit)
                    assets["tables"][key] = (
                        {"ok": True, "value": {
                            "title": result.title, "columns": result.columns,
                            "rows": result.rows, "truncated": result.truncated,
                        }}
                        if result.ok else {"ok": False, "error": result.error}
                    )
            elif kind == "html" and block.get("html") and block["html"] not in assets["htmls"]:
                result = registry.render_html(block["html"])
                assets["htmls"][block["html"]] = (
                    {"ok": True, "value": result.html} if result.ok else {"ok": False, "error": result.error}
                )
            elif kind == "image" and block.get("image") and block["image"] not in assets["images"]:
                result = registry.render_image(block["image"])
                if result.ok and result.content is not None and result.media_type:
                    encoded = base64.b64encode(result.content).decode("ascii")
                    assets["images"][block["image"]] = f"data:{result.media_type};base64,{encoded}"
    return assets


def _script_safe(source: str) -> str:
    """Make text safe inside an inline <script>: no early end tag, no comment opener."""
    return re.sub(r"</(script)", r"<\\/\1", source, flags=re.IGNORECASE).replace("<!--", "<\\!--")


def _title(deck: dict) -> str:
    """The first heading or line of text on the first slide, if any."""
    for block in deck["slides"][0]["blocks"]:
        if block["type"] == "text":
            text = re.sub(r"<[^>]+>", " ", block.get("content") or block.get("markdown") or "")
            text = re.sub(r"\s+", " ", html.unescape(text)).strip(" #")
            if text:
                return text[:120]
    return "cast presentation"


def _render_document(deck: dict, assets: dict, *, offline: bool) -> str:
    script = (_VIEWER / ("viewer.js" if offline else "viewer-lite.js")).read_text(encoding="utf-8")
    style = (_VIEWER / "viewer.css").read_text(encoding="utf-8")
    payload = json.dumps({"deck": deck, "assets": assets}, ensure_ascii=False)
    plotly = "" if offline else f'<script src="{_PLOTLY_CDN}"></script>\n'
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="cast">
<title>{html.escape(_title(deck))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{_FONTS}">
<style>{style.replace("</style", "<\\/style")}</style>
{plotly}</head>
<body>
<div id="root"></div>
<script type="application/json" id="cast-deck">{_script_safe(payload)}</script>
<script>{_script_safe(script)}</script>
</body>
</html>
"""

