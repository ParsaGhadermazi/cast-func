import json

import pytest

import cast
from cast.registry import registry

from conftest import deck


def test_cast_creates_loads_and_saves_a_workspace(tmp_path, client):
    path = tmp_path / "talk.cast.json"
    workspace = cast.Cast(path)
    assert path.exists() and json.loads(path.read_text())["slides"] == []
    assert client.get("/state").json()["workspace"] == {"configured": True, "filename": "talk.cast.json"}

    registry.load_deck(deck({"id": "s1", "blocks": [{"id": "b1", "type": "text", "content": "<p>Hi</p>"}]}))
    assert workspace.save() == str(path.resolve())
    assert json.loads(path.read_text())["slides"][0]["blocks"][0]["content"] == "<p>Hi</p>"

    copy = tmp_path / "copy.cast.json"
    assert workspace.save(as_=copy) == str(copy.resolve())
    assert workspace.path == str(path.resolve())

    registry.load_deck(deck())
    reopened = cast.Cast(path)
    assert reopened.path == workspace.path
    assert len(registry.get_deck()["slides"]) == 1


def test_browser_save_writes_the_workspace_file(tmp_path, client):
    assert client.post("/deck/save").status_code == 409  # no workspace yet
    path = tmp_path / "deck.cast.json"
    cast.Cast(path)
    rev = client.get("/state").json()["deck_rev"]
    client.post("/deck/sync", json={"base_rev": rev, "document": deck({"id": "s9", "blocks": []}, theme={"accent": "#123456"})})
    response = client.post("/deck/save")
    assert response.json() == {"ok": True, "filename": "deck.cast.json"}
    saved = json.loads(path.read_text())
    assert saved["theme"]["accent"] == "#123456" and saved["slides"][0]["id"] == "s9"


def test_invalid_files_raise_clear_errors(tmp_path):
    broken = tmp_path / "broken.cast.json"
    broken.write_text("{not json")
    with pytest.raises(ValueError, match="Invalid presentation JSON at line 1"):
        cast.Cast(broken)
    with pytest.raises(ValueError, match="directory"):
        cast.Cast(tmp_path)
