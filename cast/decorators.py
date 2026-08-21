"""The public decorators: ``@data``, ``@figure``, ``@html``, and ``@image``.

Both support the bare form (``@cast.data``) and the parameterized form
(``@cast.data(name=..., title=...)``). Registration is a side effect of
*calling* the decorated function; the original return value is passed through
so notebook usage and inline previews are unaffected.
"""

from __future__ import annotations

import functools
from typing import Callable, Optional

import polars as pl

from .registry import registry


def _humanize(name: str) -> str:
    return name.replace("_", " ").strip().title()


def data(fn: Optional[Callable] = None, *, name: Optional[str] = None,
         title: Optional[str] = None):
    """Register a Polars ``LazyFrame``-returning function as a named table."""

    def decorate(func: Callable) -> Callable:
        reg_name = name or func.__name__
        reg_title = title or _humanize(reg_name)

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            lf = func(*args, **kwargs)
            if not isinstance(lf, pl.LazyFrame):
                raise TypeError(
                    f"@cast.data function '{func.__name__}' must return a "
                    f"polars.LazyFrame, got {type(lf).__name__}. "
                    "Use .lazy() if you have a DataFrame."
                )
            registry.register_table(reg_name, reg_title, lf)
            return lf

        return wrapper

    return decorate(fn) if callable(fn) else decorate


def figure(fn: Optional[Callable] = None, *, name: Optional[str] = None,
           title: Optional[str] = None):
    """Register a figure *factory*: ``fn(table: LazyFrame) -> plotly figure``.

    Registration happens at decoration time, so no table is needed in the
    notebook. In the browser the factory can be added to the inventory any
    number of times, each fed by a different table. Calling the decorated
    function still works (e.g. for an inline preview) but is not required.
    """

    def decorate(func: Callable) -> Callable:
        reg_name = name or func.__name__
        reg_title = title or _humanize(reg_name)
        registry.register_figure(reg_name, reg_title, func)

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            # Factory is already registered at decoration time. The table is
            # injected in the browser, so calling with no data is a no-op
            # rather than an error; pass a table to get an inline preview.
            if not args and not kwargs:
                return None
            return func(*args, **kwargs)

        return wrapper

    return decorate(fn) if callable(fn) else decorate


def html(fn: Optional[Callable] = None, *, name: Optional[str] = None,
         title: Optional[str] = None):
    """Register an HTML factory: ``fn() -> str``.

    The returned HTML is rendered in a sandboxed iframe block in the editor and
    in frozen exports. Objects with ``_repr_html_()`` are also accepted.
    """

    def decorate(func: Callable) -> Callable:
        reg_name = name or func.__name__
        reg_title = title or _humanize(reg_name)
        registry.register_html(reg_name, reg_title, func)

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            return func(*args, **kwargs)

        return wrapper

    return decorate(fn) if callable(fn) else decorate


def image(fn: Optional[Callable] = None, *, name: Optional[str] = None,
          title: Optional[str] = None, alt: Optional[str] = None):
    """Register an image factory without changing its original image data.

    The function may return a PNG/JPEG/SVG path, raw image bytes, SVG markup,
    a data URI, or a notebook object exposing ``_repr_png_()``,
    ``_repr_jpeg_()``, or ``_repr_svg_()``. Matplotlib and Pillow objects are
    also accepted through their standard save methods.
    """

    def decorate(func: Callable) -> Callable:
        reg_name = name or func.__name__
        reg_title = title or _humanize(reg_name)
        registry.register_image(reg_name, reg_title, alt or reg_title, func)

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            return func(*args, **kwargs)

        return wrapper

    return decorate(fn) if callable(fn) else decorate
