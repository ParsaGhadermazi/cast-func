"""Save and restore editable cast presentation documents."""

from __future__ import annotations

import json
import threading
from os import PathLike
from pathlib import Path
from typing import Optional, Union

from .registry import DECK_FORMAT, DECK_SCHEMA_VERSION, DEFAULT_THEME, registry


Pathish = Union[str, PathLike]
_workspace_path: Optional[Path] = None
_write_lock = threading.Lock()


def _resolve(path: Pathish) -> Path:
    if isinstance(path, str) and not path.strip():
        raise ValueError("Presentation path cannot be empty.")
    resolved = Path(path).expanduser().resolve()
    if resolved.is_dir():
        raise ValueError(f"Presentation path is a directory: {resolved}")
    return resolved


def _write(destination: Path) -> str:
    with _write_lock:
        destination.parent.mkdir(parents=True, exist_ok=True)
        encoded = json.dumps(
            registry.get_deck(), indent=2, ensure_ascii=False, allow_nan=False
        ) + "\n"
        temporary = destination.with_name(f".{destination.name}.tmp")
        temporary.write_text(encoded, encoding="utf-8")
        temporary.replace(destination)
    return str(destination)


def open_workspace(path: Pathish) -> str:
    """Bind the process to a deck file, loading or creating it atomically."""
    global _workspace_path
    source = _resolve(path)
    if source.exists():
        _load(source)
    else:
        registry.load_deck(
            {
                "format": DECK_FORMAT,
                "schema_version": DECK_SCHEMA_VERSION,
                "theme": dict(DEFAULT_THEME),
                "slides": [],
            }
        )
        _write(source)
    _workspace_path = source
    return str(source)


def workspace_path() -> Optional[Path]:
    return _workspace_path


def save(path: Optional[Pathish] = None, *, as_: Optional[Pathish] = None) -> str:
    """Atomically save to the workspace file or write an explicit copy."""
    if path is not None and as_ is not None:
        raise TypeError("Pass either a positional path or as_, not both.")
    explicit = as_ if as_ is not None else path
    destination = _resolve(explicit) if explicit is not None else _workspace_path
    if destination is None:
        raise ValueError(
            "No presentation file is configured. Create Cast('talk.cast.json') "
            "or pass a path to save()."
        )
    return _write(destination)


def _load(source: Path) -> None:
    try:
        document = json.loads(source.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"Invalid presentation JSON at line {exc.lineno}, column {exc.colno}."
        ) from exc
    registry.load_deck(document)


def load(path: Pathish) -> str:
    """Load and bind an editable deck, leaving Python assets intact."""
    global _workspace_path
    source = _resolve(path)
    _load(source)
    _workspace_path = source
    return str(source)
