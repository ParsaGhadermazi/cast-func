"""FastAPI app + a one-call ``serve()`` that runs uvicorn in a background thread.

Routes:
  GET    /                  the editor/presenter shell
  GET    /app.css /app.js   client assets
  GET    /state             assets + deck + theme
  GET    /deck              download the editable presentation document
  PUT    /deck              replace the editable presentation document
  GET    /render            ?figure=F[&table=T] -> {ok, plotly} | {ok:false, error}
  GET    /render_table      ?table=T[&limit=N] -> table preview data
  GET    /render_html       ?html=H -> {ok, html} | {ok:false, error}
  GET    /render_image      ?image=I -> original image bytes
  GET    /events            Server-Sent Events; emits on version change

  POST   /slides                       add a slide -> {id}
  DELETE /slides/{sid}                 remove a slide
  PATCH  /slides/order                 {order: [sid, ...]}
  POST   /slides/{sid}/blocks          add a block -> {id}
  PATCH  /blocks/{bid}                 update geometry/content/style
  DELETE /blocks/{bid}                 remove a block
  PATCH  /theme                        update theme keys
"""

from __future__ import annotations

import asyncio
import threading
from dataclasses import asdict
from typing import List, Optional

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse, Response, StreamingResponse
from pydantic import BaseModel

from .registry import registry
from .templates import APP_CSS, APP_JS, PAGE

app = FastAPI(title="cast")


class BlockIn(BaseModel):
    type: str
    figure: Optional[str] = None
    table: Optional[str] = None
    html: Optional[str] = None
    image: Optional[str] = None
    content: Optional[str] = None
    markdown: Optional[str] = None
    style: Optional[dict] = None
    x: Optional[float] = None
    y: Optional[float] = None
    w: Optional[float] = None
    h: Optional[float] = None


class BlockPatch(BaseModel):
    x: Optional[float] = None
    y: Optional[float] = None
    w: Optional[float] = None
    h: Optional[float] = None
    z: Optional[int] = None
    figure: Optional[str] = None
    table: Optional[str] = None
    html: Optional[str] = None
    image: Optional[str] = None
    content: Optional[str] = None
    markdown: Optional[str] = None
    style: Optional[dict] = None


class OrderIn(BaseModel):
    order: List[str]


class ThemeIn(BaseModel):
    accent: Optional[str] = None
    font: Optional[str] = None
    bg: Optional[str] = None
    fg: Optional[str] = None


@app.get("/", response_class=HTMLResponse)
def index() -> HTMLResponse:
    return HTMLResponse(PAGE)


@app.get("/app.css")
def app_css() -> Response:
    return Response(APP_CSS, media_type="text/css")


@app.get("/app.js")
def app_js() -> Response:
    return Response(APP_JS, media_type="application/javascript")


@app.get("/state")
def state() -> JSONResponse:
    return JSONResponse(registry.get_state())


@app.get("/deck")
def download_deck() -> JSONResponse:
    return JSONResponse(
        registry.get_deck(),
        headers={
            "Content-Disposition": 'attachment; filename="presentation.cast.json"',
            "Cache-Control": "no-store",
        },
    )


@app.put("/deck")
def upload_deck(body: dict) -> JSONResponse:
    try:
        registry.load_deck(body)
    except ValueError as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=400)
    return JSONResponse({"ok": True, "slides": len(registry.get_deck()["slides"])})


@app.get("/render")
def render(figure: str, table: Optional[str] = None) -> JSONResponse:
    return JSONResponse(asdict(registry.apply(figure, table)))


@app.get("/render_html")
def render_html(html: str) -> JSONResponse:
    return JSONResponse(asdict(registry.render_html(html)))


@app.get("/render_image")
def render_image(image: str) -> Response:
    result = registry.render_image(image)
    if not result.ok or result.content is None or result.media_type is None:
        return Response(
            result.error or "Unable to render image.",
            media_type="text/plain",
            status_code=422,
        )
    filename = (result.filename or "image").replace('"', "").replace("\r", "").replace("\n", "")
    return Response(
        result.content,
        media_type=result.media_type,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "Content-Disposition": f'inline; filename="{filename}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/render_table")
def render_table(table: str, limit: int = 200) -> JSONResponse:
    return JSONResponse(asdict(registry.render_table(table, limit)))


@app.post("/slides")
def add_slide() -> JSONResponse:
    return JSONResponse({"id": registry.add_slide()})


@app.delete("/slides/{sid}")
def remove_slide(sid: str) -> JSONResponse:
    return JSONResponse({"ok": registry.remove_slide(sid)})


@app.patch("/slides/order")
def reorder_slides(body: OrderIn) -> JSONResponse:
    return JSONResponse({"ok": registry.reorder_slides(body.order)})


@app.post("/slides/{sid}/blocks")
def add_block(sid: str, body: BlockIn) -> JSONResponse:
    bid = registry.add_block(
        sid,
        body.type,
        figure=body.figure,
        table=body.table,
        html=body.html,
        image=body.image,
        content=body.content,
        markdown=body.markdown,
        style=body.style,
        x=body.x,
        y=body.y,
        w=body.w,
        h=body.h,
    )
    return JSONResponse({"id": bid})


@app.patch("/blocks/{bid}")
def patch_block(bid: str, body: BlockPatch) -> JSONResponse:
    return JSONResponse({"ok": registry.update_block(bid, **body.model_dump(exclude_none=True))})


@app.delete("/blocks/{bid}")
def delete_block(bid: str) -> JSONResponse:
    return JSONResponse({"ok": registry.remove_block(bid)})


@app.patch("/theme")
def patch_theme(body: ThemeIn) -> JSONResponse:
    registry.set_theme(**body.model_dump(exclude_none=True))
    return JSONResponse({"ok": True})


@app.get("/events")
async def events() -> StreamingResponse:
    async def stream():
        last = -1
        while True:
            current = registry.version
            if current != last:
                last = current
                yield f"data: {current}\n\n"
            await asyncio.sleep(0.3)

    return StreamingResponse(stream(), media_type="text/event-stream")


_server_thread: "threading.Thread | None" = None
_server_port: "int | None" = None


def serve(port: int = 8000, host: str = "127.0.0.1", open: bool = False):
    """Start the editor/presenter in a background thread (idempotent).

    Returns the URL. In a notebook, set ``open=True`` to embed an IFrame.
    """
    global _server_thread, _server_port
    url = f"http://{host}:{port}"

    if _server_thread is not None and _server_thread.is_alive():
        print(f"cast already serving at http://{host}:{_server_port}")
        return _maybe_iframe(f"http://{host}:{_server_port}", open)

    import uvicorn

    config = uvicorn.Config(app, host=host, port=port, log_level="warning")
    server = uvicorn.Server(config)

    def run():
        asyncio.set_event_loop(asyncio.new_event_loop())
        server.run()

    _server_thread = threading.Thread(target=run, daemon=True, name="cast-server")
    _server_thread.start()
    _server_port = port
    print(f"cast serving at {url}")
    return _maybe_iframe(url, open)


def _maybe_iframe(url: str, open: bool):
    if not open:
        return url
    try:
        from IPython.display import IFrame  # type: ignore

        return IFrame(src=url, width="100%", height=720)
    except Exception:
        return url
