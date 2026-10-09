"""In-memory application state: the asset library plus the presentation deck.

Two concerns share one lock and one monotonic ``version`` (so a single SSE
stream covers both):

* **Assets** registered from the notebook — ``tables`` (data sources),
  ``figures`` (plotting factories), ``htmls`` (HTML factories), and
  ``images`` (original raster or vector image factories).
* **Deck** built in the browser — an ordered list of ``slides``, each holding
  free-form ``blocks`` (a positioned figure or a rich-text body), plus a
  ``theme``.

Block geometry (``x, y, w, h``) is normalized to the slide canvas (0..1) so it
scales responsively between the editor and full-screen present mode.
"""

from __future__ import annotations

import base64
import binascii
import copy
import io
import json
import math
import mimetypes
import re
import threading
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional
from urllib.parse import unquote_to_bytes

import pandas as pd
import polars as pl


# --------------------------------------------------------------------------- #
# Assets (registered from the notebook)
# --------------------------------------------------------------------------- #
@dataclass
class Table:
    name: str
    title: str
    fn: Callable[..., object]
    dataframe: Optional[pl.DataFrame]
    version: int
    resolve_lock: threading.Lock = field(default_factory=threading.Lock, repr=False)


@dataclass
class Figure:
    name: str
    title: str
    fn: Callable[[pl.DataFrame], object]


@dataclass
class Html:
    name: str
    title: str
    fn: Callable[[], object]
    version: int


@dataclass
class ImageAsset:
    name: str
    title: str
    alt: str
    fn: Callable[[], object]
    version: int
    cached: Optional["ImageResult"] = field(default=None, repr=False)


@dataclass
class ApplyResult:
    ok: bool
    plotly: Optional[str] = None
    error: Optional[str] = None


@dataclass
class HtmlResult:
    ok: bool
    html: Optional[str] = None
    error: Optional[str] = None


@dataclass
class ImageResult:
    ok: bool
    content: Optional[bytes] = None
    media_type: Optional[str] = None
    filename: Optional[str] = None
    error: Optional[str] = None


@dataclass
class TableRenderResult:
    ok: bool
    title: Optional[str] = None
    columns: Optional[List[dict]] = None
    rows: Optional[List[List[str]]] = None
    truncated: bool = False
    error: Optional[str] = None


# --------------------------------------------------------------------------- #
# Deck (built in the browser)
# --------------------------------------------------------------------------- #
@dataclass
class Block:
    id: str
    type: str  # "figure" | "table" | "html" | "text" | "image" | "shape"
    x: float = 0.1
    y: float = 0.1
    w: float = 0.5
    h: float = 0.5
    z: int = 0
    # figure blocks
    figure: Optional[str] = None
    table: Optional[str] = None
    # html blocks
    html: Optional[str] = None
    # registered image blocks; manual uploads/URLs remain in style["src"]
    image: Optional[str] = None
    # text blocks
    content: Optional[str] = None
    # Legacy input retained so older decks can be migrated in the browser.
    markdown: Optional[str] = None
    style: dict = field(default_factory=dict)


@dataclass
class Slide:
    id: str
    background: Optional[str] = None
    blocks: List[Block] = field(default_factory=list)


DEFAULT_THEME = {
    "accent": "#5b8cff",
    "font": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "bg": "#ffffff",
    "fg": "#1a1d24",
}

DECK_FORMAT = "cast.presentation"
DECK_SCHEMA_VERSION = 1
_BLOCK_TYPES = {"figure", "table", "html", "text", "image", "shape"}

_BLOCK_FIELDS = {
    "x", "y", "w", "h", "z", "figure", "table", "html", "image",
    "content", "markdown", "style",
}


class Registry:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._version = 0
        self._tables: Dict[str, Table] = {}
        self._figures: Dict[str, Figure] = {}
        self._htmls: Dict[str, Html] = {}
        self._images: Dict[str, ImageAsset] = {}
        self._slides: List[Slide] = []
        self._theme: dict = dict(DEFAULT_THEME)
        self._slide_seq = 0
        self._block_seq = 0
        self._undo: List[tuple] = []
        self._redo: List[tuple] = []
        self._last_history_group: Optional[str] = None

    def _deck_snapshot(self) -> tuple:
        return (copy.deepcopy(self._theme), copy.deepcopy(self._slides),
                self._slide_seq, self._block_seq)

    def _record_deck_change(self, history_group: Optional[str] = None) -> None:
        if not history_group or history_group != self._last_history_group or not self._undo:
            self._undo.append(self._deck_snapshot())
            if len(self._undo) > 50:
                self._undo.pop(0)
        self._last_history_group = history_group
        self._redo.clear()

    def history_state(self) -> dict:
        with self._lock:
            return {"can_undo": bool(self._undo), "can_redo": bool(self._redo)}

    def undo(self) -> bool:
        with self._lock:
            if not self._undo:
                return False
            self._redo.append(self._deck_snapshot())
            self._theme, self._slides, self._slide_seq, self._block_seq = self._undo.pop()
            self._last_history_group = None
            self._bump()
            return True

    def redo(self) -> bool:
        with self._lock:
            if not self._redo:
                return False
            self._undo.append(self._deck_snapshot())
            if len(self._undo) > 50:
                self._undo.pop(0)
            self._theme, self._slides, self._slide_seq, self._block_seq = self._redo.pop()
            self._last_history_group = None
            self._bump()
            return True

    @property
    def version(self) -> int:
        with self._lock:
            return self._version

    def _bump(self) -> int:
        self._version += 1
        return self._version

    # ----- assets ------------------------------------------------------- #
    def register_table_factory(self, name: str, title: str, fn: Callable) -> None:
        with self._lock:
            v = self._bump()
            self._tables[name] = Table(
                name=name, title=title, fn=fn, dataframe=None, version=v
            )

    def update_table(
        self, name: str, title: str, fn: Callable, value: object
    ) -> None:
        frame = _coerce_dataframe(name, value)
        with self._lock:
            v = self._bump()
            current = self._tables.get(name)
            if current is None:
                self._tables[name] = Table(
                    name=name, title=title, fn=fn, dataframe=frame, version=v
                )
            else:
                current.title = title
                current.fn = fn
                current.dataframe = frame
                current.version = v

    def _resolve_table(self, table: Table) -> pl.DataFrame:
        if table.dataframe is not None:
            return table.dataframe
        with table.resolve_lock:
            if table.dataframe is not None:
                return table.dataframe
            frame = _coerce_dataframe(table.name, table.fn())
            with self._lock:
                if self._tables.get(table.name) is table:
                    table.dataframe = frame
            return frame

    def register_figure(self, name: str, title: str, fn: Callable) -> None:
        with self._lock:
            self._bump()
            self._figures[name] = Figure(name=name, title=title, fn=fn)

    def register_html(self, name: str, title: str, fn: Callable) -> None:
        with self._lock:
            v = self._bump()
            self._htmls[name] = Html(name=name, title=title, fn=fn, version=v)

    def register_image(self, name: str, title: str, alt: str, fn: Callable) -> None:
        with self._lock:
            v = self._bump()
            self._images[name] = ImageAsset(
                name=name, title=title, alt=alt, fn=fn, version=v
            )

    def update_image(
        self, name: str, title: str, alt: str, fn: Callable, value: object
    ) -> None:
        """Refresh an image after its decorated notebook function is called."""
        result = _coerce_image(value, name)
        with self._lock:
            v = self._bump()
            current = self._images.get(name)
            if current is None:
                self._images[name] = ImageAsset(
                    name=name, title=title, alt=alt, fn=fn, version=v, cached=result
                )
            else:
                current.title = title
                current.alt = alt
                current.fn = fn
                current.version = v
                current.cached = result

    def apply(self, figure_name: str, table_name: Optional[str] = None) -> ApplyResult:
        with self._lock:
            fig = self._figures.get(figure_name)
            tbl = self._tables.get(table_name) if table_name else None
        if fig is None:
            return ApplyResult(ok=False, error=f"Unknown figure '{figure_name}'.")
        if table_name and tbl is None:
            return ApplyResult(ok=False, error=f"Unknown table '{table_name}'.")
        try:
            if tbl is not None:
                result = fig.fn(self._resolve_table(tbl))
            else:
                try:
                    result = fig.fn(None)
                except TypeError:
                    result = fig.fn()
            if not hasattr(result, "to_json"):
                return ApplyResult(
                    ok=False,
                    error=(
                        f"Figure '{figure_name}' returned {type(result).__name__}, "
                        "expected a Plotly figure."
                    ),
                )
            return ApplyResult(ok=True, plotly=result.to_json())
        except Exception as exc:  # surfaced inline in the page, never crashes
            return ApplyResult(ok=False, error=f"{type(exc).__name__}: {exc}")

    def render_html(self, html_name: str) -> HtmlResult:
        with self._lock:
            html_obj = self._htmls.get(html_name)
        if html_obj is None:
            return HtmlResult(ok=False, error=f"Unknown HTML object '{html_name}'.")
        try:
            result = html_obj.fn()
            if hasattr(result, "_repr_html_"):
                result = result._repr_html_()
            if not isinstance(result, str):
                return HtmlResult(
                    ok=False,
                    error=(
                        f"HTML object '{html_name}' returned {type(result).__name__}, "
                        "expected a string or an object with _repr_html_()."
                    ),
                )
            return HtmlResult(ok=True, html=result)
        except Exception as exc:  # surfaced inline in the page, never crashes
            return HtmlResult(ok=False, error=f"{type(exc).__name__}: {exc}")

    def render_image(self, image_name: str) -> ImageResult:
        """Resolve a registered image without resampling or recompressing it."""
        with self._lock:
            image = self._images.get(image_name)
            cached = image.cached if image is not None else None
        if image is None:
            return ImageResult(ok=False, error=f"Unknown image '{image_name}'.")
        if cached is not None:
            return cached

        try:
            result = _coerce_image(image.fn(), image_name)
        except Exception as exc:  # surfaced inline in the page, never crashes
            result = ImageResult(ok=False, error=f"{type(exc).__name__}: {exc}")

        with self._lock:
            current = self._images.get(image_name)
            if current is image:
                current.cached = result
        return result

    def render_table(self, table_name: str, limit: int = 200) -> TableRenderResult:
        with self._lock:
            table = self._tables.get(table_name)
        if table is None:
            return TableRenderResult(ok=False, error=f"Unknown table '{table_name}'.")

        limit = max(1, min(int(limit), 1000))
        try:
            frame = self._resolve_table(table).head(limit + 1)
            truncated = frame.height > limit
            if truncated:
                frame = frame.head(limit)
            columns = []
            for name, dtype in frame.schema.items():
                dtype_name = str(dtype)
                columns.append(
                    {
                        "name": name,
                        "dtype": dtype_name,
                        "numeric": dtype_name.startswith(("Int", "UInt", "Float", "Decimal")),
                    }
                )
            rows = [
                [_display_cell(value) for value in row]
                for row in frame.iter_rows()
            ]
            return TableRenderResult(
                ok=True,
                title=table.title,
                columns=columns,
                rows=rows,
                truncated=truncated,
            )
        except Exception as exc:  # surfaced inline in the page, never crashes
            return TableRenderResult(ok=False, error=f"{type(exc).__name__}: {exc}")

    # ----- deck: slides ------------------------------------------------- #
    def add_slide(self, index: Optional[int] = None, history_group: Optional[str] = None) -> str:
        with self._lock:
            self._record_deck_change(history_group)
            self._slide_seq += 1
            sid = f"s{self._slide_seq}"
            slide = Slide(id=sid)
            if index is None or index >= len(self._slides):
                self._slides.append(slide)
            else:
                self._slides.insert(max(0, index), slide)
            self._bump()
            return sid

    def remove_slide(self, sid: str, history_group: Optional[str] = None) -> bool:
        with self._lock:
            before = len(self._slides)
            if not any(slide.id == sid for slide in self._slides):
                return False
            self._record_deck_change(history_group)
            self._slides = [s for s in self._slides if s.id != sid]
            removed = len(self._slides) != before
            if removed:
                self._bump()
            return removed

    def duplicate_slide(self, sid: str, history_group: Optional[str] = None) -> Optional[str]:
        with self._lock:
            source_index = next(
                (index for index, slide in enumerate(self._slides) if slide.id == sid),
                None,
            )
            if source_index is None:
                return None

            self._record_deck_change(history_group)
            self._slide_seq += 1
            duplicate_sid = f"s{self._slide_seq}"
            duplicate_blocks = []
            for source_block in self._slides[source_index].blocks:
                self._block_seq += 1
                block_data = asdict(source_block)
                block_data["id"] = f"b{self._block_seq}"
                duplicate_blocks.append(Block(**block_data))

            source = self._slides[source_index]
            duplicate = Slide(
                id=duplicate_sid,
                background=source.background,
                blocks=duplicate_blocks,
            )
            self._slides.insert(source_index + 1, duplicate)
            self._bump()
            return duplicate_sid

    def reorder_slides(self, order: List[str], history_group: Optional[str] = None) -> bool:
        with self._lock:
            by_id = {s.id: s for s in self._slides}
            if len(order) != len(by_id) or len(set(order)) != len(order):
                return False
            if set(order) != set(by_id):
                return False
            if order == [slide.id for slide in self._slides]:
                return True
            self._record_deck_change(history_group)
            self._slides = [by_id[sid] for sid in order]
            self._bump()
            return True

    # ----- deck: blocks ------------------------------------------------- #
    def _find_block(self, bid: str):
        for slide in self._slides:
            for block in slide.blocks:
                if block.id == bid:
                    return block
        return None

    def add_block(self, sid: str, type: str, history_group: Optional[str] = None, **kwargs) -> Optional[str]:
        with self._lock:
            slide = next((s for s in self._slides if s.id == sid), None)
            if slide is None:
                return None
            self._record_deck_change(history_group)
            self._block_seq += 1
            bid = f"b{self._block_seq}"
            top_z = max((b.z for s in self._slides for b in s.blocks), default=0)
            fields = {k: v for k, v in kwargs.items()
                      if k in _BLOCK_FIELDS and v is not None}
            block = Block(id=bid, type=type, z=top_z + 1, **fields)
            slide.blocks.append(block)
            self._bump()
            return bid

    def update_block(self, bid: str, history_group: Optional[str] = None, **kwargs) -> bool:
        with self._lock:
            block = self._find_block(bid)
            if block is None:
                return False
            changed = {k: v for k, v in kwargs.items()
                       if k in _BLOCK_FIELDS and v is not None and getattr(block, k) != v}
            if not changed:
                return True
            self._record_deck_change(history_group)
            for k, v in changed.items():
                setattr(block, k, v)
            self._bump()
            return True

    def remove_block(self, bid: str, history_group: Optional[str] = None) -> bool:
        with self._lock:
            for slide in self._slides:
                if any(block.id == bid for block in slide.blocks):
                    self._record_deck_change(history_group)
                    slide.blocks = [b for b in slide.blocks if b.id != bid]
                    self._bump()
                    return True
            return False

    # ----- deck: theme -------------------------------------------------- #
    def set_theme(self, history_group: Optional[str] = None, **kwargs) -> None:
        with self._lock:
            changed = {k: v for k, v in kwargs.items()
                       if k in DEFAULT_THEME and v is not None and self._theme[k] != v}
            if not changed:
                return
            self._record_deck_change(history_group)
            self._theme.update(changed)
            self._bump()

    # ----- state -------------------------------------------------------- #
    def get_deck(self) -> dict:
        """Return the editable, asset-reference-only presentation document."""
        with self._lock:
            return {
                "format": DECK_FORMAT,
                "schema_version": DECK_SCHEMA_VERSION,
                "theme": dict(self._theme),
                "slides": [
                    {
                        "id": slide.id,
                        "background": slide.background,
                        "blocks": [asdict(block) for block in slide.blocks],
                    }
                    for slide in self._slides
                ],
            }

    def load_deck(self, document: dict) -> None:
        """Replace the editable deck after validating the complete document."""
        theme, slides = _decode_deck(document)
        slide_seq = _max_sequence("s", [slide.id for slide in slides])
        block_seq = _max_sequence(
            "b", [block.id for slide in slides for block in slide.blocks]
        )
        with self._lock:
            self._theme = theme
            self._slides = slides
            self._slide_seq = slide_seq
            self._block_seq = block_seq
            self._undo.clear()
            self._redo.clear()
            self._last_history_group = None
            self._bump()

    def get_state(self) -> dict:
        with self._lock:
            return {
                "version": self._version,
                "history": {"can_undo": bool(self._undo), "can_redo": bool(self._redo)},
                "figures": [
                    {"name": f.name, "title": f.title}
                    for f in self._figures.values()
                ],
                "htmls": [
                    {"name": h.name, "title": h.title, "version": h.version}
                    for h in self._htmls.values()
                ],
                "images": [
                    {
                        "name": image.name,
                        "title": image.title,
                        "alt": image.alt,
                        "version": image.version,
                    }
                    for image in self._images.values()
                ],
                "tables": [
                    {"name": t.name, "title": t.title, "version": t.version}
                    for t in self._tables.values()
                ],
                "theme": dict(self._theme),
                "slides": [
                    {
                        "id": s.id,
                        "background": s.background,
                        "blocks": [asdict(b) for b in s.blocks],
                    }
                    for s in self._slides
                ],
            }


def _coerce_dataframe(name: str, value: object) -> pl.DataFrame:
    if isinstance(value, pl.DataFrame):
        return value
    if isinstance(value, pd.DataFrame):
        return pl.from_pandas(value)
    raise TypeError(
        f"@cast.data function '{name}' must return a pandas.DataFrame, "
        f"or polars.DataFrame; got {type(value).__name__}."
    )


def _decode_deck(document: dict) -> tuple[dict, List[Slide]]:
    if not isinstance(document, dict):
        raise ValueError("Presentation file must contain a JSON object.")
    if document.get("format") != DECK_FORMAT:
        raise ValueError(f"Not a {DECK_FORMAT} file.")
    schema_version = document.get("schema_version")
    if schema_version != DECK_SCHEMA_VERSION:
        raise ValueError(
            f"Unsupported presentation schema {schema_version!r}; "
            f"this version supports schema {DECK_SCHEMA_VERSION}."
        )

    raw_theme = document.get("theme", {})
    if not isinstance(raw_theme, dict):
        raise ValueError("Presentation theme must be an object.")
    theme = dict(DEFAULT_THEME)
    for key in DEFAULT_THEME:
        if key in raw_theme:
            if not isinstance(raw_theme[key], str):
                raise ValueError(f"Theme value '{key}' must be a string.")
            theme[key] = raw_theme[key]

    raw_slides = document.get("slides")
    if not isinstance(raw_slides, list):
        raise ValueError("Presentation slides must be an array.")

    slides: List[Slide] = []
    slide_ids = set()
    block_ids = set()
    for slide_index, raw_slide in enumerate(raw_slides):
        location = f"slides[{slide_index}]"
        if not isinstance(raw_slide, dict):
            raise ValueError(f"{location} must be an object.")
        sid = _document_id(raw_slide.get("id"), f"{location}.id", slide_ids)
        background = _optional_string(raw_slide.get("background"), f"{location}.background")
        raw_blocks = raw_slide.get("blocks", [])
        if not isinstance(raw_blocks, list):
            raise ValueError(f"{location}.blocks must be an array.")

        blocks: List[Block] = []
        for block_index, raw_block in enumerate(raw_blocks):
            block_location = f"{location}.blocks[{block_index}]"
            if not isinstance(raw_block, dict):
                raise ValueError(f"{block_location} must be an object.")
            bid = _document_id(raw_block.get("id"), f"{block_location}.id", block_ids)
            block_type = raw_block.get("type")
            if block_type not in _BLOCK_TYPES:
                raise ValueError(
                    f"{block_location}.type must be one of {sorted(_BLOCK_TYPES)}."
                )

            w = _deck_number(raw_block.get("w", .5), f"{block_location}.w", .03, 1)
            h = _deck_number(raw_block.get("h", .5), f"{block_location}.h", .03, 1)
            x = _deck_number(raw_block.get("x", .1), f"{block_location}.x", 0, 1 - w)
            y = _deck_number(raw_block.get("y", .1), f"{block_location}.y", 0, 1 - h)
            z_value = raw_block.get("z", 0)
            if isinstance(z_value, bool) or not isinstance(z_value, (int, float)):
                raise ValueError(f"{block_location}.z must be a number.")
            z = int(z_value)

            style = raw_block.get("style", {})
            if not isinstance(style, dict):
                raise ValueError(f"{block_location}.style must be an object.")
            try:
                json.dumps(style, allow_nan=False)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"{block_location}.style must contain valid JSON values.") from exc

            fields = {
                key: _optional_string(raw_block.get(key), f"{block_location}.{key}")
                for key in ("figure", "table", "html", "image", "content", "markdown")
            }
            blocks.append(Block(
                id=bid, type=block_type, x=x, y=y, w=w, h=h, z=z,
                style=style, **fields,
            ))
        slides.append(Slide(id=sid, background=background, blocks=blocks))
    return theme, slides


def _document_id(value: object, location: str, seen: set) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{location} must be a non-empty string.")
    if value in seen:
        raise ValueError(f"Duplicate id '{value}' at {location}.")
    seen.add(value)
    return value


def _optional_string(value: object, location: str) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{location} must be a string or null.")
    return value


def _deck_number(value: object, location: str, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{location} must be a number.")
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"{location} must be finite.")
    return max(minimum, min(maximum, number))


def _max_sequence(prefix: str, ids: List[str]) -> int:
    pattern = re.compile(rf"^{re.escape(prefix)}(\d+)$")
    values = [int(match.group(1)) for value in ids if (match := pattern.match(value))]
    return max(values, default=0)


registry = Registry()


def _display_cell(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        if math.isnan(value):
            return "NaN"
        if math.isinf(value):
            return "Infinity" if value > 0 else "-Infinity"
    if isinstance(value, (dict, list, tuple)):
        return json.dumps(value, default=str, ensure_ascii=False)
    return str(value)


_DATA_URI_RE = re.compile(r"^data:([^;,]+)?((?:;[^,]*)*),(.*)$", re.I | re.S)
_SUPPORTED_IMAGE_TYPES = {
    "image/png", "image/jpeg", "image/svg+xml", "image/webp", "image/gif", "image/avif"
}


def _coerce_image(value: object, name: str, media_hint: Optional[str] = None,
                  filename: Optional[str] = None) -> ImageResult:
    """Turn common notebook image values into original browser-ready bytes."""
    if isinstance(value, tuple) and value:
        value = value[0]

    if isinstance(value, Path):
        return _image_from_path(value, name)

    if isinstance(value, (bytes, bytearray, memoryview)):
        return _image_from_bytes(bytes(value), name, media_hint, filename)

    if isinstance(value, str):
        stripped = value.lstrip()
        if stripped.startswith("<svg") or (
            stripped.startswith("<?xml") and "<svg" in stripped[:2048]
        ):
            return _image_from_bytes(
                value.encode("utf-8"), name, "image/svg+xml", filename or f"{name}.svg"
            )

        data_match = _DATA_URI_RE.match(value)
        if data_match:
            media_type = _normalise_image_type(data_match.group(1) or "")
            flags = data_match.group(2).lower()
            payload = data_match.group(3)
            try:
                content = (
                    base64.b64decode(payload, validate=True)
                    if ";base64" in flags
                    else unquote_to_bytes(payload)
                )
            except (ValueError, binascii.Error) as exc:
                raise ValueError(f"Image '{name}' returned an invalid data URI.") from exc
            return _image_from_bytes(content, name, media_type, filename)

        if media_hint:
            # IPython's rich repr hooks may return base64 text instead of bytes.
            try:
                decoded = base64.b64decode(value, validate=True)
            except (ValueError, binascii.Error):
                decoded = value.encode("utf-8")
            return _image_from_bytes(decoded, name, media_hint, filename)

        if len(value) < 4096 and "\n" not in value and "\r" not in value:
            path = Path(value).expanduser()
            try:
                if path.is_file():
                    return _image_from_path(path, name)
            except OSError:
                pass
        raise TypeError(
            f"Image '{name}' returned a string that is not SVG markup, a data URI, "
            "or an existing image path."
        )

    for attr, media_type, extension in (
        ("_repr_svg_", "image/svg+xml", "svg"),
        ("_repr_png_", "image/png", "png"),
        ("_repr_jpeg_", "image/jpeg", "jpg"),
    ):
        render = getattr(value, attr, None)
        if callable(render):
            rendered = render()
            if rendered is not None:
                return _coerce_image(rendered, name, media_type, f"{name}.{extension}")

    savefig = getattr(value, "savefig", None)
    if callable(savefig):
        buffer = io.BytesIO()
        savefig(buffer, format="svg", bbox_inches="tight")
        return _image_from_bytes(
            buffer.getvalue(), name, "image/svg+xml", f"{name}.svg"
        )

    # Matplotlib and seaborn commonly return an Axes while the serializable
    # canvas lives on its figure.
    figure = getattr(value, "figure", None)
    figure_savefig = getattr(figure, "savefig", None)
    if figure is not value and callable(figure_savefig):
        buffer = io.BytesIO()
        figure_savefig(buffer, format="svg", bbox_inches="tight")
        return _image_from_bytes(
            buffer.getvalue(), name, "image/svg+xml", f"{name}.svg"
        )

    save = getattr(value, "save", None)
    if callable(save):
        image_format = str(getattr(value, "format", None) or "PNG").upper()
        if image_format not in {"PNG", "JPEG", "WEBP", "GIF"}:
            image_format = "PNG"
        buffer = io.BytesIO()
        options = {"quality": 95, "subsampling": 0} if image_format == "JPEG" else {}
        save(buffer, format=image_format, **options)
        media_type = "image/jpeg" if image_format == "JPEG" else f"image/{image_format.lower()}"
        extension = "jpg" if image_format == "JPEG" else image_format.lower()
        return _image_from_bytes(buffer.getvalue(), name, media_type, f"{name}.{extension}")

    raise TypeError(
        f"Image '{name}' returned {type(value).__name__}. Return an image path, "
        "PNG/JPEG bytes, SVG markup, a data URI, or an object with an image rich repr."
    )


def _image_from_path(path: Path, name: str) -> ImageResult:
    path = path.expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"Image '{name}' path does not exist: {path}")
    guessed, _ = mimetypes.guess_type(path.name)
    return _image_from_bytes(path.read_bytes(), name, guessed, path.name)


def _image_from_bytes(content: bytes, name: str, media_hint: Optional[str],
                      filename: Optional[str]) -> ImageResult:
    if not content:
        raise ValueError(f"Image '{name}' returned no data.")
    media_type = _detect_image_type(content) or _normalise_image_type(media_hint or "")
    if media_type not in _SUPPORTED_IMAGE_TYPES:
        raise TypeError(
            f"Image '{name}' is not a supported browser image "
            "(PNG, JPEG, SVG, WebP, GIF, or AVIF)."
        )
    return ImageResult(
        ok=True,
        content=content,
        media_type=media_type,
        filename=filename or f"{name}.{_extension_for(media_type)}",
    )


def _detect_image_type(content: bytes) -> Optional[str]:
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    if len(content) >= 12 and content[4:8] == b"ftyp" and content[8:12] in {b"avif", b"avis"}:
        return "image/avif"
    head = content[:4096].lstrip().lower()
    if head.startswith(b"<svg") or (head.startswith(b"<?xml") and b"<svg" in head):
        return "image/svg+xml"
    return None


def _normalise_image_type(media_type: str) -> str:
    media_type = media_type.split(";", 1)[0].strip().lower()
    return "image/jpeg" if media_type in {"image/jpg", "image/pjpeg"} else media_type


def _extension_for(media_type: str) -> str:
    return {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/svg+xml": "svg",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/avif": "avif",
    }.get(media_type, "img")
