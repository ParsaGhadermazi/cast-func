"""FastAPI app + a one-call ``serve()`` that runs uvicorn in a background thread.

The browser owns the editable document: it edits locally and syncs the whole
document back, while Python owns the notebook assets.

Routes:
  GET    /                  the editor (built from frontend/ into static/editor/)
  GET    /static/...        bundled static assets
  GET    /state             assets + deck (?deck=false for assets only)
  POST   /deck/sync         {base_rev, client_id, document} -> {ok, rev} | 409 | 400
  POST   /deck/save         save to the configured workspace file
  GET    /render            ?figure=F[&table=T] -> {ok, plotly} | {ok:false, error}
  GET    /render_table      ?table=T[&limit=N] -> table preview data
  GET    /render_html       ?html=H -> {ok, html} | {ok:false, error}
  GET    /render_image      ?image=I -> original image bytes
  GET    /events            Server-Sent Events; pushes change markers
"""

from __future__ import annotations

import asyncio
import json
import socket
import threading
from dataclasses import asdict
from pathlib import Path
from typing import Optional

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .persistence import save as save_workspace, workspace_path
from .registry import registry

app = FastAPI(title="cast")
_STATIC = Path(__file__).with_name("static")


class _RevalidatedStaticFiles(StaticFiles):
    """Static files the browser must revalidate (cheap 304s via ETag).

    Bundle names are stable and chunks import each other by plain URL, so a
    cache-busting query string on the entry would load the app twice.
    """

    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "no-cache"
        return response


app.mount("/static", _RevalidatedStaticFiles(directory=_STATIC), name="static")


class SyncIn(BaseModel):
    base_rev: int
    client_id: Optional[str] = None
    document: dict


_PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>cast</title>
<link rel="icon" href="data:," />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Poppins:wght@400;600;700&family=Playfair+Display:wght@400;700&family=Roboto+Mono:wght@400;700&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="./static/editor/editor.css" />
</head>
<body>
<div id="root"></div>
<script type="module" src="./static/editor/editor.js"></script>
</body>
</html>
"""


@app.get("/", response_class=HTMLResponse)
def index() -> HTMLResponse:
    if not (_STATIC / "editor" / "editor.js").exists():
        return HTMLResponse(
            "The editor has not been built. Run <code>npm install && npm run build</code> in frontend/.",
            status_code=503,
        )
    return HTMLResponse(_PAGE, headers={"Cache-Control": "no-store"})


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


@app.post("/deck/sync")
def sync_deck(body: SyncIn) -> JSONResponse:
    try:
        result = registry.sync_deck(body.document, body.base_rev, body.client_id)
    except ValueError as exc:
        return JSONResponse({"ok": False, "error": str(exc)}, status_code=400)
    return JSONResponse(result, status_code=409 if result.get("conflict") else 200)


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
_server_url: "str | None" = None


def _port_available(host: str, port: int) -> bool:
    family = socket.AF_INET6 if ":" in host else socket.AF_INET
    with socket.socket(family, socket.SOCK_STREAM) as probe:
        try:
            probe.bind((host, port))
        except OSError:
            return False
    return True


def serve(port: int = 8000, host: str = "127.0.0.1", open: bool = False):
    """Start the editor in a background thread (idempotent).

    Returns the URL. In a notebook, set ``open=True`` to embed an IFrame.
    Raises ``OSError`` if another program already uses the port.
    """
    global _server_thread, _server_url

    if _server_thread is not None and _server_thread.is_alive():
        print(f"cast already serving at {_server_url}")
        return _maybe_iframe(_server_url, open)

    if not _port_available(host, port):
        raise OSError(
            f"Port {port} on {host} is already in use. "
            f"Pass another port, e.g. deck.serve(port={port + 1})."
        )

    import uvicorn

    config = uvicorn.Config(app, host=host, port=port, log_level="warning")
    server = uvicorn.Server(config)

    def run():
        asyncio.set_event_loop(asyncio.new_event_loop())
        server.run()

    _server_thread = threading.Thread(target=run, daemon=True, name="cast-server")
    _server_thread.start()
    url = f"http://{host}:{port}"
    _server_url = url
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
