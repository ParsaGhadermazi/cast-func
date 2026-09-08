"""Isolated browser QA deck: PYTHONPATH=. python examples/_editor_fixture.py 8071."""

import os
import sys
import tempfile
from pathlib import Path


def editor_fixture():
    def text(bid, content, x, y, w, h, **style):
        return dict(id=bid, type="text", content=content, x=x, y=y, w=w, h=h,
                    z=0, style=style)

    slides = [
        {"id": "s1", "blocks": [
            {"id": "b4", "type": "shape", "x": .05, "y": .24, "w": .32, "h": .52,
             "z": 0, "style": {"shape": "rect", "fill": "#e2f4ed"}},
            text("b1", "<p><strong>From notebook to presentation</strong></p>", .05, .05, .9, .15, fontSize=38),
            text("b2", '<p><strong>One live story</strong></p><ul><li><span style="font-size:20px">Live data, clear decisions</span></li><li>Reusable figures</li><li>Interactive delivery</li></ul>',
                 .06, .26, .30, .48, fontSize=26),
            {"id": "b3", "type": "figure", "figure": "trend", "table": "monthly",
             "x": .40, "y": .23, "w": .55, "h": .57, "z": 0},
            text("b5", "<p>Research update / September 2026</p>", .05, .86, .8, .08, fontSize=15, color="#5a6562"),
        ]},
        {"id": "s2", "background": "#eaf4ef", "blocks": [
            {"id": "b6", "type": "text", "markdown": "## Legacy markdown\n\n- First finding\n- Second finding",
             "x": .1, "y": .1, "w": .8, "h": .7, "style": {"fontSize": 32}},
        ]},
        {"id": "s3", "blocks": [
            {"id": "b7", "type": "text", "markdown": '<p>Legacy <span style="font-size:48px;color:#168267">rich text</span></p>',
             "style": {"textMode": "rich", "fontSize": 30}, "x": .1, "y": .1, "w": .8, "h": .5},
        ]},
        {"id": "s4", "blocks": [
            text("b8", "<pre>@deck.figure\ndef trend(data):\n    return px.line(data, x='date', y='value')</pre>",
                 .08, .08, .84, .38, textVariant="code", fontSize=24),
            {"id": "b9", "type": "image", "image": "workflow_image", "x": .08, "y": .52, "w": .84, "h": .38,
             "style": {"fit": "contain"}},
        ]},
        {"id": "s5", "blocks": [
            {"id": "b10", "type": "table", "table": "monthly", "x": .05, "y": .1, "w": .4, "h": .6},
            {"id": "b11", "type": "html", "html": "callout", "x": .50, "y": .1, "w": .45, "h": .6},
        ]},
    ]
    for i in range(6, 19):
        slides.append({"id": f"s{i}", "blocks": [
            text(f"b{i+6}", f"<p><strong>Finding {i}</strong></p><p>Supporting evidence and next steps.</p>",
                 .08, .14, .84, .6, fontSize=36),
        ]})
    return {"format": "cast.presentation", "schema_version": 1,
            "theme": {"accent": "#168267", "bg": "#ffffff", "fg": "#202823",
                      "font": "'Inter',sans-serif"}, "slides": slides}


if __name__ == "__main__":
    import uvicorn

    with tempfile.TemporaryDirectory(prefix="cast-editor-qa-") as tmp:
        os.environ["CAST_FILE"] = str(Path(tmp) / "editor-qa.cast.json")
        from examples import demo
        from cast.registry import registry
        from cast.server import app

        registry.load_deck(editor_fixture())
        demo.deck.save()
        uvicorn.run(app, host="127.0.0.1", port=int(sys.argv[1]) if len(sys.argv) > 1 else 8071,
                    timeout_graceful_shutdown=1)
