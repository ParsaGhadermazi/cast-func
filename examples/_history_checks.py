"""Small model/API regression checks for deck undo and redo."""

from fastapi.testclient import TestClient

from cast.registry import Registry, registry
from cast.server import app


model = Registry()
assert model.history_state() == {"can_undo": False, "can_redo": False}
slide = model.add_slide()
before_blocks = model.get_deck()
first = model.add_block(slide, "shape", history_group="pair", x=0.1)
second = model.add_block(slide, "shape", history_group="pair", x=0.5)
assert model.undo()
assert model.get_deck() == before_blocks
assert model.redo()
assert [block["id"] for block in model.get_deck()["slides"][0]["blocks"]] == [first, second]

model.update_block(first, x=0.2)
assert model.undo()
assert model.get_deck()["slides"][0]["blocks"][0]["x"] == 0.1
assert model.history_state()["can_redo"]
model.update_block(first, x=0.3)
assert not model.history_state()["can_redo"]
assert not model.redo()
before_noop = model.history_state()
model.update_block(first, x=0.3)
assert model.history_state() == before_noop

model.set_theme(bg="#000000")
assert model.undo()
assert model.get_deck()["theme"]["bg"] != "#000000"
model.load_deck(before_blocks)
assert model.history_state() == {"can_undo": False, "can_redo": False}

client = TestClient(app)
registry.load_deck({"format": "cast.presentation", "schema_version": 1,
                    "theme": {}, "slides": []})
assert not client.get("/state").json()["history"]["can_undo"]
sid = client.post("/slides").json()["id"]
headers = {"X-Cast-History-Group": "api-pair"}
client.post(f"/slides/{sid}/blocks", json={"type": "shape"}, headers=headers)
client.post(f"/slides/{sid}/blocks", json={"type": "shape"}, headers=headers)
assert client.post("/deck/undo").json()["ok"]
assert client.get("/deck").json()["slides"][0]["blocks"] == []
assert client.post("/deck/redo").json()["ok"]
assert len(client.get("/deck").json()["slides"][0]["blocks"]) == 2
print("HISTORY_OK")
