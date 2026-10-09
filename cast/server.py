"""FastAPI app + a one-call ``serve()`` that runs uvicorn in a background thread.

Routes:
  GET    /                  the editor/presenter shell
  GET    /next              the new editor (TypeScript build in static/editor/)
  GET    /static/...        bundled static assets
  GET    /app.css /app.js   client assets
  GET    /state             assets + deck + theme
  GET    /deck              download the editable presentation document
  POST   /deck/save         save to the configured workspace file
  PUT    /deck              replace the editable presentation document
  POST   /deck/sync         {base_rev, client_id, document} -> {ok, rev} | 409
  POST   /deck/undo         undo the latest deck edit
  POST   /deck/redo         redo the latest undone edit
  GET    /render            ?figure=F[&table=T] -> {ok, plotly} | {ok:false, error}
  GET    /render_table      ?table=T[&limit=N] -> table preview data
  GET    /render_html       ?html=H -> {ok, html} | {ok:false, error}
  GET    /render_image      ?image=I -> original image bytes
  GET    /events            Server-Sent Events; pushes {version, deck_rev, deck_origin}

  POST   /slides                       add a slide -> {id}
  POST   /slides/{sid}/duplicate       duplicate a slide -> {id}
  DELETE /slides/{sid}                 remove a slide
  PATCH  /slides/order                 {order: [sid, ...]}
  POST   /slides/{sid}/blocks          add a block -> {id}
  PATCH  /blocks/{bid}                 update geometry/content/style
  DELETE /blocks/{bid}                 remove a block
  PATCH  /theme                        update theme keys
"""

from __future__ import annotations

import asyncio
import json
import threading
from dataclasses import asdict
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, Header
from fastapi.responses import HTMLResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .registry import registry
from .persistence import save as save_workspace, workspace_path
from .templates import APP_CSS, APP_JS, PAGE

app = FastAPI(title="cast")
_STATIC = Path(__file__).with_name("static")
app.mount("/static", StaticFiles(directory=_STATIC), name="static")


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


class SyncIn(BaseModel):
    base_rev: int
    client_id: Optional[str] = None
    document: dict


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


_NEXT_PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>cast</title>
<link rel="icon" href="data:," />
<link rel="stylesheet" href="./static/editor/editor.css?v={stamp}" />
</head>
<body>
<div id="root"></div>
<script type="module" src="./static/editor/editor.js?v={stamp}"></script>
</body>
</html>
"""


@app.get("/next", response_class=HTMLResponse)
def next_editor() -> HTMLResponse:
    bundle = _STATIC / "editor" / "editor.js"
    if not bundle.exists():
        return HTMLResponse(
            "The new editor has not been built. Run <code>npm run build</code> in frontend/.",
            status_code=503,
        )
    # Bundle names are stable, so the build time busts browser caches.
    stamp = int(bundle.stat().st_mtime)
    return HTMLResponse(_NEXT_PAGE.format(stamp=stamp), headers={"Cache-Control": "no-store"})


@app.get("/app.css")
def app_css() -> Response:
    return Response(APP_CSS, media_type="text/css")


@app.get("/app.js")
def app_js() -> Response:
    return Response(APP_JS, media_type="application/javascript")


@app.get("/icons.js")
def app_icons() -> Response:
    source = Path(__file__).with_name("static") / "icons.js"
    return Response(source.read_text(encoding="utf-8"), media_type="application/javascript")


@app.get("/state")
def state(deck: bool = True) -> JSONResponse:
    payload = registry.get_state()
    if not deck:
        # Asset-only refresh: the browser already owns the document.
        payload.pop("slides", None)
        payload.pop("theme", None)
    workspace = workspace_path()
    payload["workspace"] = {
        "configured": workspace is not None,
        "filename": workspace.name if workspace is not None else None,
    }
    return JSONResponse(payload)


@app.get("/deck")
def download_deck() -> JSONResponse:
    return JSONResponse(
        registry.get_deck(),
        headers={
            "Content-Disposition": 'attachment; filename="presentation.cast.json"',
            "Cache-Control": "no-store",
        },
    )


@app.post("/deck/save")
def persist_deck() -> JSONResponse:
    try:
        destination = Path(save_workspace())
    except ValueError as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=409)
    except OSError as exc:
        return JSONResponse(
            {"ok": False, "error": f"Could not save presentation: {exc}"},
            status_code=500,
        )
    return JSONResponse({"ok": True, "filename": destination.name})


@app.put("/deck")
def upload_deck(body: dict) -> JSONResponse:
    try:
        registry.load_deck(body)
    except ValueError as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=400)
    return JSONResponse({"ok": True, "slides": len(registry.get_deck()["slides"])})


@app.post("/deck/sync")
def sync_deck(body: SyncIn) -> JSONResponse:
    try:
        result = registry.sync_deck(body.document, body.base_rev, body.client_id)
    except ValueError as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=400)
    return JSONResponse(result, status_code=409 if result.get("conflict") else 200)


@app.post("/deck/undo")
def undo_deck() -> JSONResponse:
    changed = registry.undo()
    return JSONResponse({"ok": changed, "history": registry.history_state()})


@app.post("/deck/redo")
def redo_deck() -> JSONResponse:
    changed = registry.redo()
    return JSONResponse({"ok": changed, "history": registry.history_state()})


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
def add_slide(history_group: Optional[str] = Header(default=None, alias="X-Cast-History-Group")) -> JSONResponse:
    return JSONResponse({"id": registry.add_slide(history_group=history_group)})


@app.delete("/slides/{sid}")
def remove_slide(sid: str, history_group: Optional[str] = Header(default=None, alias="X-Cast-History-Group")) -> JSONResponse:
    return JSONResponse({"ok": registry.remove_slide(sid, history_group=history_group)})


@app.post("/slides/{sid}/duplicate")
def duplicate_slide(sid: str, history_group: Optional[str] = Header(default=None, alias="X-Cast-History-Group")) -> JSONResponse:
    duplicate_sid = registry.duplicate_slide(sid, history_group=history_group)
    if duplicate_sid is None:
        return JSONResponse(
            {"ok": False, "error": f"Unknown slide '{sid}'."}, status_code=404
        )
    return JSONResponse({"ok": True, "id": duplicate_sid})


@app.patch("/slides/order")
def reorder_slides(body: OrderIn, history_group: Optional[str] = Header(default=None, alias="X-Cast-History-Group")) -> JSONResponse:
    return JSONResponse({"ok": registry.reorder_slides(body.order, history_group=history_group)})


@app.post("/slides/{sid}/blocks")
def add_block(sid: str, body: BlockIn, history_group: Optional[str] = Header(default=None, alias="X-Cast-History-Group")) -> JSONResponse:
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
        history_group=history_group,
    )
    return JSONResponse({"id": bid})


@app.patch("/blocks/{bid}")
def patch_block(bid: str, body: BlockPatch, history_group: Optional[str] = Header(default=None, alias="X-Cast-History-Group")) -> JSONResponse:
    return JSONResponse({"ok": registry.update_block(bid, history_group=history_group, **body.model_dump(exclude_none=True))})


@app.delete("/blocks/{bid}")
def delete_block(bid: str, history_group: Optional[str] = Header(default=None, alias="X-Cast-History-Group")) -> JSONResponse:
    return JSONResponse({"ok": registry.remove_block(bid, history_group=history_group)})


@app.patch("/theme")
def patch_theme(body: ThemeIn, history_group: Optional[str] = Header(default=None, alias="X-Cast-History-Group")) -> JSONResponse:
    registry.set_theme(history_group=history_group, **body.model_dump(exclude_none=True))
    return JSONResponse({"ok": True})


@app.get("/events")
async def events() -> StreamingResponse:
    """Push a change marker whenever the registry changes.

    The registry notifies from worker threads, so the listener only flips an
    asyncio.Event on this loop. Bursts of changes collapse into one message.
    """
    loop = asyncio.get_running_loop()
    changed = asyncio.Event()

    def notify() -> None:
        try:
            loop.call_soon_threadsafe(changed.set)
        except RuntimeError:  # loop already closed (server shutting down)
            pass

    async def stream():
        unsubscribe = registry.subscribe(notify)
        try:
            yield f"data: {json.dumps(registry.change_marker())}\n\n"
            # Starlette cancels this generator when the client disconnects;
            # the finally block then unsubscribes.
            while True:
                try:
                    await asyncio.wait_for(changed.wait(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
                    continue
                changed.clear()
                yield f"data: {json.dumps(registry.change_marker())}\n\n"
        finally:
            unsubscribe()

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


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
