"""File-backed public presentation workspace."""

from __future__ import annotations

from os import PathLike
from pathlib import Path
from typing import Optional, Union

from .decorators import data, figure, html, image
from .export import freeze
from .persistence import load, open_workspace, save
from .server import serve


Pathish = Union[str, PathLike]


class Cast:
    """A live presentation bound to one editable JSON workspace file.

    Cast currently serves one active workspace per Python process. Constructing
    another instance switches the live editor to that instance's file while
    preserving registered Python assets.
    """

    data = staticmethod(data)
    figure = staticmethod(figure)
    html = staticmethod(html)
    image = staticmethod(image)

    def __init__(self, path: Pathish):
        self._path = Path(open_workspace(path))

    @property
    def path(self) -> str:
        return str(self._path)

    def save(
        self, path: Optional[Pathish] = None, *, as_: Optional[Pathish] = None
    ) -> str:
        """Save this workspace, or write a copy with ``as_``/``path``."""
        if path is not None and as_ is not None:
            raise TypeError("Pass either a positional path or as_, not both.")
        destination = as_ if as_ is not None else path
        if destination is None:
            return save(self._path)
        return save(as_=destination)

    def load(self) -> str:
        """Reload this workspace file from disk."""
        return load(self._path)

    def serve(self, port: int = 8000, host: str = "127.0.0.1", open: bool = False):
        return serve(port=port, host=host, open=open)

    def freeze(self, path: Pathish) -> str:
        return freeze(path)
