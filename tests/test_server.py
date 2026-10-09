import socket

import pytest

from cast import server


def test_index_serves_the_editor(client):
    page = client.get("/")
    assert page.status_code == 200 and "static/editor/editor.js" in page.text
    asset = client.get("/static/editor/editor.js")
    assert asset.status_code == 200 and asset.headers["cache-control"] == "no-cache"


def test_legacy_routes_are_gone(client):
    assert client.post("/slides").status_code in (404, 405)
    assert client.get("/app.js").status_code == 404


def test_serve_reports_a_busy_port_instead_of_failing_silently():
    with socket.socket() as blocker:
        blocker.bind(("127.0.0.1", 0))
        blocker.listen()
        port = blocker.getsockname()[1]
        with pytest.raises(OSError, match=f"Port {port} on 127.0.0.1 is already in use"):
            server.serve(port=port)
