"""Shared fixtures. The registry is a process-wide singleton, so every test
starts from a fresh one and an unbound workspace."""

import pytest
from fastapi.testclient import TestClient

from cast import persistence
from cast.registry import registry
from cast.server import app


@pytest.fixture(autouse=True)
def fresh_registry():
    registry.__init__()
    persistence._workspace_path = None
    yield
    registry.__init__()
    persistence._workspace_path = None


@pytest.fixture
def client():
    return TestClient(app)


def deck(*slides, theme=None):
    return {"format": "cast.presentation", "schema_version": 1, "theme": theme or {}, "slides": list(slides)}
