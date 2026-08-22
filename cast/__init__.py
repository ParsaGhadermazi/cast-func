"""cast — present from a notebook with lightweight decorators.

Decorate a function that returns a pandas or Polars DataFrame with
``@cast.data`` to register a named table. Internally, every table is a Polars
DataFrame. Decorate a function that takes one table and returns a Plotly figure
with ``@cast.figure`` to register a visualizer. Decorate a function that returns
an HTML string with ``@cast.html`` to register custom HTML content, or an image
source with ``@cast.image`` to register original raster or vector artwork.
Start the live page with ``cast.serve()``.
"""

from .decorators import data, figure, html, image
from .server import serve
from .export import freeze
from .persistence import load, save
from .presentation import Cast

__all__ = ["Cast", "data", "figure", "html", "image", "serve", "freeze", "save", "load"]
__version__ = "0.3.0"
