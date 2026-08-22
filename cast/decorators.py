"""The public decorators: ``@data``, ``@figure``, ``@html``, and ``@image``.

All decorators support bare and parameterized forms and register their asset at
decoration time. Calling a decorated function still returns its original value;
calling a ``@data`` or ``@image`` function also refreshes its cached live asset.
"""

from __future__ import annotations

import functools
from typing import Callable, Optional

from .registry import registry


def _humanize(name: str) -> str:
    return name.replace("_", " ").strip().title()


def data(fn: Optional[Callable] = None, *, name: Optional[str] = None,
         title: Optional[str] = None):
    """Register a pandas or Polars dataframe factory as a named table.

    The table appears in the editor at decoration time and resolves on first
    use. Pandas frames are converted to a Polars DataFrame internally. Calling
    the decorated function explicitly refreshes its cached value and still
    returns the original dataframe type.
    """

    def decorate(func: Callable) -> Callable:
        reg_name = name or func.__name__
        reg_title = title or _humanize(reg_name)
        registry.register_table_factory(reg_name, reg_title, func)

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            frame = func(*args, **kwargs)
            registry.update_table(reg_name, reg_title, func, frame)
            return frame

        return wrapper

    return decorate(fn) if callable(fn) else decorate


def figure(fn: Optional[Callable] = None, *, name: Optional[str] = None,
           title: Optional[str] = None):
    """Register a figure *factory*: ``fn(table: DataFrame) -> plotly figure``.

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
        reg_alt = alt or reg_title
        registry.register_image(reg_name, reg_title, reg_alt, func)

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            result = func(*args, **kwargs)
            registry.update_image(reg_name, reg_title, reg_alt, func, result)
            return result

        return wrapper

    return decorate(fn) if callable(fn) else decorate
