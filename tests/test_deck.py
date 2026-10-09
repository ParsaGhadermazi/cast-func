from cast.registry import registry

from conftest import deck

SHAPE = {"id": "b1", "type": "shape", "x": 0.1, "y": 0.1, "w": 0.2, "h": 0.2, "style": {"shape": "rect"}}


def test_sync_accepts_a_document_based_on_the_current_revision(client):
    rev = client.get("/state").json()["deck_rev"]
    response = client.post("/deck/sync", json={"base_rev": rev, "client_id": "tab", "document": deck({"id": "s1", "blocks": [SHAPE]})})
    assert response.status_code == 200 and response.json() == {"ok": True, "rev": rev + 1}
    state = client.get("/state").json()
    assert state["deck_origin"] == "tab"
    assert state["slides"][0]["blocks"][0]["id"] == "b1"


def test_sync_rejects_stale_revisions_without_changing_the_deck(client):
    rev = client.get("/state").json()["deck_rev"]
    client.post("/deck/sync", json={"base_rev": rev, "document": deck({"id": "s1", "blocks": []})})
    stale = client.post("/deck/sync", json={"base_rev": rev, "document": deck()})
    assert stale.status_code == 409 and stale.json()["conflict"] is True
    assert len(client.get("/state").json()["slides"]) == 1


def test_sync_validates_documents(client):
    rev = client.get("/state").json()["deck_rev"]
    bad = client.post("/deck/sync", json={"base_rev": rev, "document": deck({"id": "s1", "blocks": [{"id": "b1", "type": "video"}]})})
    assert bad.status_code == 400 and "type must be one of" in bad.json()["error"]
    future = client.post("/deck/sync", json={"base_rev": rev, "document": {**deck(), "schema_version": 2}})
    assert future.status_code == 400


def test_geometry_is_clamped_like_the_editor(client):
    rev = client.get("/state").json()["deck_rev"]
    block = {**SHAPE, "x": 0.95, "w": 2}
    client.post("/deck/sync", json={"base_rev": rev, "document": deck({"id": "s1", "blocks": [block]})})
    saved = registry.get_deck()["slides"][0]["blocks"][0]
    assert saved["w"] == 1 and saved["x"] == 0


def test_asset_only_state_and_change_markers(client):
    import cast

    marker = registry.change_marker()
    @cast.html
    def widget():
        return "<p>hi</p>"

    after_asset = registry.change_marker()
    assert after_asset["assets_version"] > marker["assets_version"]
    assert after_asset["deck_rev"] == marker["deck_rev"]
    registry.load_deck(deck({"id": "s1", "blocks": []}))
    after_deck = registry.change_marker()
    assert after_deck["deck_rev"] == after_asset["deck_rev"] + 1
    assert after_deck["assets_version"] == after_asset["assets_version"]
    assert after_deck["deck_origin"] is None
    state = client.get("/state", params={"deck": "false"}).json()
    assert "slides" not in state and "theme" not in state and state["htmls"]


def test_listeners_are_notified_and_never_break_edits():
    calls = []
    unsubscribe = registry.subscribe(lambda: calls.append(1))
    registry.subscribe(lambda: 1 / 0)  # a broken listener must not break anything
    registry.load_deck(deck())
    assert calls == [1]
    unsubscribe()
    registry.load_deck(deck())
    assert calls == [1]
