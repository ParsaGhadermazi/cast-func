"""Static export: turn the live deck into one self-contained HTML file.

``freeze(path)`` snapshots the current deck and theme, pre-renders every figure
block to Plotly JSON (by re-running its factory on its bound table, exactly like
the ``/render`` endpoint), and inlines everything into a single ``.html`` file
that reproduces *present mode* with client-side slide navigation. The result
needs no running server and can be shared as a plain file.

Figures are baked as static snapshots of the data at freeze time — they are no
longer swappable, which is the whole point of a portable artifact.
"""

from __future__ import annotations

import base64
import json
from dataclasses import asdict
from pathlib import Path

from .registry import registry


def freeze(path: str) -> str:
    """Write the current deck to a self-contained HTML file at ``path``.

    Returns the absolute path written. Raises ``ValueError`` if the deck is
    empty (nothing to export yet).
    """
    state = registry.get_state()
    slides = state.get("slides", [])
    if not slides:
        raise ValueError(
            "Nothing to export: the deck has no slides yet. Build a deck in "
            "the browser (cast.serve()) first, then call cast.freeze(...)."
        )

    theme = state.get("theme", {})

    # Bake each live block type to portable content; keep static blocks as-is.
    baked_slides = []
    for s in slides:
        blocks = []
        for b in s.get("blocks", []):
            nb = dict(b)
            if b.get("type") == "figure":
                fig, tbl = b.get("figure"), b.get("table")
                if fig:
                    res = registry.apply(fig, tbl)
                    nb["plotly"] = res.plotly if res.ok else None
                    nb["error"] = None if res.ok else res.error
                else:
                    nb["plotly"] = None
                    nb["error"] = "No figure assigned."
            elif b.get("type") == "html":
                html_name = b.get("html")
                if html_name:
                    res = registry.render_html(html_name)
                    nb["htmlContent"] = res.html if res.ok else None
                    nb["error"] = None if res.ok else res.error
                else:
                    nb["htmlContent"] = None
                    nb["error"] = "No HTML object assigned."
            elif b.get("type") == "table":
                table_name = b.get("table")
                if table_name:
                    row_limit = int((b.get("style") or {}).get("rowLimit", 200))
                    res = registry.render_table(table_name, row_limit)
                    nb["tableData"] = asdict(res) if res.ok else None
                    nb["error"] = None if res.ok else res.error
                else:
                    nb["tableData"] = None
                    nb["error"] = "No data assigned."
            elif b.get("type") == "image" and b.get("image"):
                res = registry.render_image(b["image"])
                if res.ok and res.content is not None and res.media_type:
                    encoded = base64.b64encode(res.content).decode("ascii")
                    nb["imageData"] = f"data:{res.media_type};base64,{encoded}"
                    nb["error"] = None
                else:
                    nb["imageData"] = None
                    nb["error"] = res.error or "Unable to render image."
            blocks.append(nb)
        baked_slides.append({"id": s.get("id"), "blocks": blocks})

    deck = {"theme": theme, "slides": baked_slides}
    html = _render_html(deck)

    out = Path(path).expanduser().resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    return str(out)


def _render_html(deck: dict) -> str:
    # Embed deck JSON safely inside a <script> tag.
    deck_json = json.dumps(deck).replace("</", "<\\/")
    theme = deck.get("theme", {})
    bg = theme.get("bg", "#ffffff")
    fg = theme.get("fg", "#1a1d24")
    font = theme.get("font", "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif")
    accent = theme.get("accent", "#5b8cff")
    return _TEMPLATE.format(
        deck_json=deck_json,
        bg=bg,
        fg=fg,
        font=font,
        accent=accent,
    )


_TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>cast presentation</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Poppins:wght@400;600;700&family=Playfair+Display:wght@400;700&family=Roboto+Mono:wght@400;700&display=swap" rel="stylesheet">
<script src="https://cdn.plot.ly/plotly-2.30.0.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.0/marked.min.js"></script>
<style>
  :root {{ --accent:{accent}; }}
  * {{ box-sizing:border-box; }}
  html, body {{ margin:0; height:100%; background:#000; overflow:hidden; }}
  #stage {{ position:fixed; inset:0; display:flex; align-items:center; justify-content:center; }}
  #canvas {{ position:relative; background:{bg}; color:{fg}; font-family:{font};
             aspect-ratio:16/9; overflow:hidden; }}
  .block {{ position:absolute; }}
  .block .body {{ width:100%; height:100%; overflow:hidden; }}
  .block .body.text {{ padding:10px 14px; }}
  .block .body.text.code-text {{ position:relative; padding:36px 20px 16px; border:1px solid rgba(148,163,184,.24);
    border-radius:6px; box-shadow:inset 0 1px rgba(255,255,255,.06), 0 10px 26px rgba(15,23,42,.2); }}
  .block .body.text.code-text::before {{ content:""; position:absolute; top:14px; left:16px; width:7px; height:7px;
    border-radius:50%; background:#fb7185; box-shadow:11px 0 #fbbf24, 22px 0 #34d399; pointer-events:none; }}
  .block .body.text.code-text .rich {{ height:100%; min-height:0; overflow:auto; overflow-wrap:normal;
    white-space:pre-wrap; tab-size:2; scrollbar-gutter:stable; scrollbar-width:thin; scrollbar-color:#56627a #111827; }}
  .block .body.text.code-text .rich::-webkit-scrollbar {{ width:8px; height:8px; }}
  .block .body.text.code-text .rich::-webkit-scrollbar-track {{ background:#111827; }}
  .block .body.text.code-text .rich::-webkit-scrollbar-thumb {{ background:#56627a; border:2px solid #111827; border-radius:8px; }}
  .block .body.image {{ display:flex; align-items:center; justify-content:center; }}
  .block .body.image img {{ width:100%; height:100%; display:block; }}
  .block .body.html iframe {{ width:100%; height:100%; border:0; display:block; background:white; }}
  .block .body.table {{ display:flex; flex-direction:column; overflow:hidden; color:#20242c; background:#fff;
    border:1px solid rgba(31,41,55,.16); border-radius:6px; font-variant-numeric:tabular-nums; }}
  .table-meta {{ flex:0 0 auto; min-height:30px; display:flex; align-items:center; justify-content:space-between; gap:12px;
    padding:6px 10px; border-bottom:1px solid rgba(31,41,55,.12); background:#f8fafc; color:#4b5563; font-size:11px; }}
  .table-meta strong {{ min-width:0; color:#20242c; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }}
  .table-meta span {{ flex:0 0 auto; }}
  .table-scroll {{ flex:1 1 auto; min-height:0; overflow:auto; overscroll-behavior:contain; scrollbar-gutter:stable;
    scrollbar-width:thin; scrollbar-color:#9aa5b5 #eef2f7; }}
  .table-scroll::-webkit-scrollbar {{ width:9px; height:9px; }}
  .table-scroll::-webkit-scrollbar-track {{ background:#eef2f7; }}
  .table-scroll::-webkit-scrollbar-thumb {{ background:#9aa5b5; border:2px solid #eef2f7; border-radius:8px; }}
  .data-table {{ width:max-content; min-width:100%; border-collapse:separate; border-spacing:0; font-size:12px; line-height:1.25; }}
  .data-table th, .data-table td {{ padding:7px 10px; max-width:320px; border-right:1px solid rgba(31,41,55,.1);
    border-bottom:1px solid rgba(31,41,55,.1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }}
  .data-table th:last-child, .data-table td:last-child {{ border-right:0; }}
  .data-table thead th {{ position:sticky; top:0; z-index:2; background:#eef2f7; color:#374151; text-align:left;
    font-weight:700; box-shadow:0 1px 0 rgba(31,41,55,.12); }}
  .data-table th.numeric, .data-table td.numeric {{ text-align:right; }}
  .data-table tbody tr:nth-child(even) td {{ background:rgba(148,163,184,.08); }}
  .data-table.compact th, .data-table.compact td {{ padding:4px 8px; }}
  .data-table.no-stripes tbody tr:nth-child(even) td {{ background:transparent; }}
  .data-table .row-index {{ position:sticky; left:0; z-index:1; min-width:42px; color:#6b7280; text-align:right; background:#f8fafc !important; }}
  .data-table thead .row-index {{ z-index:3; background:#e8edf4 !important; }}
  .err {{ color:#c0392b; font:13px/1.5 ui-monospace, Menlo, monospace; padding:10px 14px; white-space:pre-wrap; }}
  .md, .rich {{ line-height:1.5; min-height:100%; }}
  .md :first-child, .rich :first-child {{ margin-top:0; }}
  .md :last-child, .rich :last-child {{ margin-bottom:0; }}
  .md h1, .rich h1 {{ font-size:1.9em; margin:.3em 0; }}
  .md h2, .rich h2 {{ font-size:1.5em; margin:.3em 0; }}
  .md h3, .rich h3 {{ font-size:1.2em; margin:.3em 0; }}
  .md p, .rich p, .rich div {{ margin:.4em 0; }}
  .md ul, .rich ul {{ list-style:disc; margin:.4em 0; padding-left:1.4em; }}
  .md ul ul, .rich ul ul {{ list-style:circle; }}
  .md ul ul ul, .rich ul ul ul {{ list-style:square; }}
  .md ol, .rich ol {{ margin:.4em 0; padding-left:1.5em; }}
  .md li, .rich li {{ margin:.15em 0; }}
  .md a, .rich a {{ color:var(--accent); }}
  .md strong, .rich b, .rich strong {{ font-weight:700; }}
  .md em, .rich i, .rich em {{ font-style:italic; }}
  .md blockquote, .rich blockquote {{ margin:.5em 0; padding:.15em .9em; border-left:3px solid var(--accent); opacity:.85; }}
  .md code, .rich code {{ font-family:ui-monospace, Menlo, monospace; font-size:.9em; background:rgba(127,127,127,.18); padding:.1em .35em; border-radius:4px; }}
  .md pre, .rich pre {{ background:rgba(127,127,127,.14); padding:.7em .9em; border-radius:8px; overflow:auto; }}
  .md pre code, .rich pre code {{ background:none; padding:0; }}
  .md hr, .rich hr {{ border:0; border-top:1px solid rgba(127,127,127,.35); margin:.7em 0; }}
  .md img, .rich img {{ max-width:100%; }}
  #hud {{ position:fixed; bottom:16px; left:50%; transform:translateX(-50%);
          display:flex; gap:12px; align-items:center; padding:8px 14px;
          background:rgba(20,22,28,.82); border-radius:999px; opacity:.25;
          transition:opacity .2s; z-index:10; }}
  #hud:hover {{ opacity:1; }}
  #hud button {{ background:none; border:0; color:#e6e9ef; font-size:18px; cursor:pointer; padding:0 6px; }}
  #count {{ font-size:13px; color:#e6e9ef; min-width:60px; text-align:center; }}
  #empty {{ color:#888; font:15px/1.5 sans-serif; }}
</style>
</head>
<body>
<div id="stage"><div id="canvas"></div></div>
<div id="hud">
  <button id="prev" title="Previous (←)">◀</button>
  <span id="count">1 / 1</span>
  <button id="next" title="Next (→ / space)">▶</button>
</div>
<script>
const DECK = {deck_json};
let cur = 0;
const $ = (id) => document.getElementById(id);

function sizeCanvas() {{
  const stage = $("stage"), cv = $("canvas");
  const W = stage.clientWidth, H = stage.clientHeight;
  let w = W, h = w * 9 / 16;
  if (h > H) {{ h = H; w = h * 16 / 9; }}
  cv.style.width = w + "px"; cv.style.height = h + "px";
}}

const LINE_SHAPES = new Set(["line", "arrow-line"]);
const POLY_POINTS = {{
  triangle:"50,3 97,97 3,97",
  diamond:"50,2 98,50 50,98 2,50",
  pentagon:"50,3 97,38 79,97 21,97 3,38",
  hexagon:"25,4 75,4 98,50 75,96 25,96 2,50",
  star:"50,4 61,36 96,36 68,56 79,91 50,70 21,91 32,56 4,36 39,36",
  chevron:"12,6 62,6 92,50 62,94 12,94 42,50",
  "arrow-right":"4,20 66,20 66,4 98,50 66,96 66,80 4,80",
}};
function escAttr(v) {{
  return String(v ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}}
function strokeDash(st) {{
  const dash = st.dash || "solid";
  if (dash === "dash") return "10 7";
  if (dash === "dot") return "2 6";
  if (dash === "long") return "18 8";
  return "";
}}
function shapeCommonAttrs(st, fillDefault=true) {{
  const fill = fillDefault ? (st.fill || "#5b8cff") : "none";
  const stroke = (st.stroke && st.stroke !== "transparent" && st.stroke !== "none") ? st.stroke : "none";
  const sw = Number(st.strokeWidth || 0);
  const dash = strokeDash(st);
  return 'fill="'+escAttr(fill)+'" stroke="'+escAttr(stroke)+'" stroke-width="'+sw+'" '+(dash ? 'stroke-dasharray="'+dash+'"' : '')+' stroke-linecap="'+escAttr(st.lineCap || "round")+'" stroke-linejoin="'+escAttr(st.lineJoin || "round")+'" vector-effect="non-scaling-stroke"';
}}
function shapeSvg(st) {{
  const shape = st.shape || "rect";
  const fill = st.fill || "#5b8cff";
  const stroke = (st.stroke && st.stroke !== "transparent" && st.stroke !== "none") ? st.stroke : fill;
  const sw = Number(st.strokeWidth || (LINE_SHAPES.has(shape) ? 4 : 0));
  const dash = strokeDash(st);
  const common = shapeCommonAttrs(st, !LINE_SHAPES.has(shape));
  let inner = "";
  if (shape === "ellipse") inner = '<ellipse cx="50" cy="50" rx="48" ry="48" '+common+'/>';
  else if (shape === "round-rect") inner = '<rect x="1" y="1" width="98" height="98" rx="'+Number(st.radius ?? 16)+'" ry="'+Number(st.radius ?? 16)+'" '+common+'/>';
  else if (shape === "rect") inner = '<rect x="1" y="1" width="98" height="98" rx="'+Number(st.radius || 0)+'" ry="'+Number(st.radius || 0)+'" '+common+'/>';
  else if (shape === "line" || shape === "arrow-line") {{
    const marker = shape === "arrow-line" ? '<defs><marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L10,5 L0,10 Z" fill="'+escAttr(stroke)+'"/></marker></defs>' : "";
    inner = marker + '<line x1="4" y1="50" x2="96" y2="50" stroke="'+escAttr(stroke)+'" stroke-width="'+sw+'" '+(dash ? 'stroke-dasharray="'+dash+'"' : '')+' stroke-linecap="'+escAttr(st.lineCap || "round")+'" vector-effect="non-scaling-stroke" '+(shape === "arrow-line" ? 'marker-end="url(#arrowhead)"' : '')+'/>';
  }} else inner = '<polygon points="'+(POLY_POINTS[shape] || POLY_POINTS.triangle)+'" '+common+'/>';
  return '<svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style="display:block;overflow:visible">'+inner+'</svg>';
}}

function textStyle(node, st) {{
  st = st || {{}};
  const code = st.textVariant === "code";
  node.style.fontFamily = st.fontFamily || (code ? "'Roboto Mono',ui-monospace,SFMono-Regular,Menlo,monospace" : "");
  node.style.fontSize = (st.fontSize || (code ? 16 : 18)) + "px";
  node.style.color = st.color || (code ? "#e5e7eb" : "");
  node.style.textAlign = st.align || "left";
  if (st.weight) node.style.fontWeight = st.weight;
  if (st.italic) node.style.fontStyle = "italic";
  node.style.lineHeight = st.lineHeight || (code ? 1.55 : "");
}}

function renderFrozenTable(body, b, st) {{
  const res = b.tableData;
  body.classList.add("table");
  if (!res) {{
    const e = document.createElement("div"); e.className = "err"; e.textContent = b.error || "No data."; body.append(e); return;
  }}
  body.style.background = st.bg || "#ffffff";
  body.style.borderColor = st.borderColor || "rgba(31,41,55,.16)";
  const meta = document.createElement("div"); meta.className = "table-meta";
  const title = document.createElement("strong"); title.textContent = res.title || b.table || "Table";
  const count = document.createElement("span"); count.textContent = (res.rows || []).length + (res.truncated ? "+" : "") + " rows";
  meta.append(title, count); if (st.headerBg) meta.style.background = st.headerBg;
  const scroll = document.createElement("div"); scroll.className = "table-scroll";
  const table = document.createElement("table");
  table.className = "data-table" + (st.compact ? " compact" : "") + (st.striped === false ? " no-stripes" : "");
  table.style.fontSize = (st.fontSize || 12) + "px";
  const thead = document.createElement("thead"), hr = document.createElement("tr");
  if (st.showIndex !== false) {{ const th = document.createElement("th"); th.className = "row-index"; th.textContent = "#"; hr.append(th); }}
  for (const col of (res.columns || [])) {{
    const th = document.createElement("th"); th.textContent = col.name; th.title = col.name + " (" + col.dtype + ")";
    if (col.numeric) th.className = "numeric"; if (st.headerBg) th.style.background = st.headerBg; if (st.headerColor) th.style.color = st.headerColor;
    hr.append(th);
  }}
  thead.append(hr); table.append(thead);
  const tbody = document.createElement("tbody");
  (res.rows || []).forEach((row, rowIndex)=>{{
    const tr = document.createElement("tr");
    if (st.showIndex !== false) {{ const td = document.createElement("td"); td.className = "row-index"; td.textContent = rowIndex + 1; tr.append(td); }}
    row.forEach((value, index)=>{{ const td = document.createElement("td"); td.textContent = value; td.title = value;
      if ((res.columns[index] || {{}}).numeric) td.className = "numeric"; tr.append(td); }});
    tbody.append(tr);
  }});
  table.append(tbody); scroll.append(table); body.append(meta, scroll);
}}

function render() {{
  const cv = $("canvas"); cv.innerHTML = "";
  const slides = DECK.slides || [];
  $("count").textContent = (slides.length ? (cur + 1) : 0) + " / " + slides.length;
  const slide = slides[cur];
  if (!slide) {{ cv.append(Object.assign(document.createElement("div"), {{id:"empty", textContent:"Empty presentation."}})); return; }}
  for (const b of slide.blocks) {{
    const wrap = document.createElement("div");
    wrap.className = "block";
    wrap.style.left = (b.x * 100) + "%"; wrap.style.top = (b.y * 100) + "%";
    wrap.style.width = (b.w * 100) + "%"; wrap.style.height = (b.h * 100) + "%";
    wrap.style.zIndex = b.z || 0;
    wrap.style.transform = "rotate("+((b.style || {{}}).rotate || 0)+"deg)";
    wrap.style.transformOrigin = "50% 50%";
    const body = document.createElement("div");
    body.className = "body" + (b.type === "text" ? " text" : "");
    wrap.append(body); cv.append(wrap);

    const st = b.style || {{}};
    if (b.type === "text" && st.textVariant === "code") body.classList.add("code-text");
    if (b.type === "figure") {{
      if (b.plotly) {{
        const fig = JSON.parse(b.plotly);
        const layout = Object.assign({{autosize:true, margin:{{l:48,r:18,t:28,b:40}},
          paper_bgcolor:"rgba(0,0,0,0)", plot_bgcolor:"rgba(0,0,0,0)"}}, fig.layout || {{}});
        delete layout.width;
        delete layout.height;
        layout.autosize = true;
        Plotly.newPlot(body, fig.data, layout, {{responsive:true, displaylogo:false, displayModeBar:"hover"}});
      }} else {{
        const e = document.createElement("div"); e.className = "err";
        e.textContent = b.error || "No data."; body.append(e);
      }}
    }} else if (b.type === "table") {{
      renderFrozenTable(body, b, st);
    }} else if (b.type === "html") {{
      if (b.htmlContent) {{
        const iframe = document.createElement("iframe");
        iframe.setAttribute("sandbox", "allow-scripts allow-forms allow-popups allow-modals");
        iframe.srcdoc = b.htmlContent;
        body.classList.add("html");
        body.append(iframe);
      }} else {{
        const e = document.createElement("div"); e.className = "err";
        e.textContent = b.error || "No HTML object."; body.append(e);
      }}
    }} else if (b.type === "image") {{
      body.style.opacity = (st.opacity == null ? 1 : st.opacity);
      body.style.background = st.bg || "transparent";
      const source = b.imageData || st.src;
      if (source) {{
        const img = document.createElement("img");
        img.src = source;
        img.alt = st.alt || "";
        img.decoding = "async";
        img.draggable = false;
        img.style.width = "100%"; img.style.height = "100%";
        img.style.objectFit = st.fit || "contain";
        img.style.borderRadius = (st.radius || 0) + "px";
        img.style.imageRendering = st.rendering || "auto";
        body.append(img);
        body.classList.add("image");
      }} else if (b.error) {{
        const e = document.createElement("div"); e.className = "err";
        e.textContent = b.error; body.append(e);
      }}
    }} else if (b.type === "shape") {{
      body.style.opacity = (st.opacity == null ? 1 : st.opacity);
      body.style.overflow = "visible";
      body.style.filter = st.shadow ? "drop-shadow(0 "+st.shadow+"px "+(st.shadow * 2)+"px rgba(0,0,0,.28))" : "";
      body.innerHTML = shapeSvg(st);
    }} else {{
      body.style.background = Object.prototype.hasOwnProperty.call(st, "bg") ? st.bg : (st.textVariant === "code" ? "#111827" : "transparent");
      const text = document.createElement("div");
      text.className = "rich";
      text.innerHTML = b.content != null
        ? b.content
        : ((st.textMode === "rich") ? (b.markdown || "") : (window.marked ? window.marked.parse(b.markdown || "") : (b.markdown || "")));
      textStyle(text, st);
      body.append(text);
    }}
  }}
}}

function go(d) {{
  const n = (DECK.slides || []).length;
  cur = Math.max(0, Math.min(n - 1, cur + d));
  render();
}}

$("prev").addEventListener("click", () => go(-1));
$("next").addEventListener("click", () => go(1));
window.addEventListener("resize", () => {{ sizeCanvas(); render(); }});
window.addEventListener("keydown", (e) => {{
  if (e.key === "ArrowRight" || e.key === " ") {{ e.preventDefault(); go(1); }}
  else if (e.key === "ArrowLeft") go(-1);
}});

sizeCanvas();
render();
</script>
</body>
</html>
"""
