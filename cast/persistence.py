"""Save and restore editable cast presentation documents."""

from __future__ import annotations

import json
from os import PathLike
from pathlib import Path
from typing import Union

from .registry import registry


Pathish = Union[str, PathLike]


def save(path: Pathish) -> str:
    """Atomically save the current editable deck as versioned JSON."""
    destination = Path(path).expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(
        registry.get_deck(), indent=2, ensure_ascii=False, allow_nan=False
    ) + "\n"
    temporary = destination.with_name(f".{destination.name}.tmp")
    temporary.write_text(encoded, encoding="utf-8")
    temporary.replace(destination)
    return str(destination)


def load(path: Pathish) -> str:
    """Load an editable deck while leaving registered Python assets intact."""
    source = Path(path).expanduser().resolve()
    try:
        document = json.loads(source.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"Invalid presentation JSON at line {exc.lineno}, column {exc.colno}."
        ) from exc
    registry.load_deck(document)
    return str(source)
