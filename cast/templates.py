"""The served editor/presenter: an HTML shell plus CSS and JS assets.

The notebook registers figure factories and data tables; this page is where you
build the deck. Slides hold free-form blocks (a positioned figure or a rich-text
text body). Blocks are dragged/resized on a 16:9 canvas; geometry is normalized
(0..1) so it scales into full-screen present mode. All deck state lives on the
server, so edits persist and multiple tabs stay in sync over SSE.
"""

PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>cast</title>
<link rel="icon" href="data:," />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Poppins:wght@400;600;700&family=Playfair+Display:wght@400;700&family=Roboto+Mono:wght@400;700&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="./app.css" />
<script src="https://cdn.plot.ly/plotly-2.30.0.min.js" charset="utf-8"></script>
<script src="https://cdn.jsdelivr.net/npm/marked@12.0.0/marked.min.js"></script>
</head>
<body>
<div id="topbar">
  <span class="brand">cast</span>
  <span id="deck-filename">Untitled presentation</span>
  <span id="status" role="status" aria-live="polite">connecting…</span>
  <span class="spacer"></span>
  <input id="open-deck-file" type="file" accept=".json,application/json" hidden />
  <button id="open-deck-btn" data-icon="folder-open" title="Open presentation" aria-label="Open presentation"></button>
  <button id="download-deck-btn" data-icon="download" title="Download editable copy" aria-label="Download editable copy"></button>
  <button id="save-deck-btn" data-icon="save" title="Save workspace"><span>Save</span></button>
  <button id="present-btn" data-icon="play" class="primary"><span>Present</span></button>
</div>
<div id="toolsbar" role="toolbar" aria-label="Slide tools">
  <button id="rail-toggle" data-icon="panel-left" title="Toggle slides" aria-label="Toggle slides" aria-pressed="true"></button>
  <div class="tool-menu">
    <button id="slide-menu-btn" data-icon="plus" aria-expanded="false" aria-controls="slide-menu">Slide</button>
    <div id="slide-menu" class="tool-popover" hidden>
    <label for="slide-template">Layout</label>
    <select id="slide-template" title="New slide layout">
      <option value="blank">Blank slide</option>
      <option value="title">Title slide</option>
      <option value="data">Data story</option>
      <option value="split">Split visual</option>
      <option value="quote">Quote slide</option>
    </select>
    <button id="add-slide-btn" data-icon="plus">Add slide</button>
    </div>
  </div>
  <button id="add-text-btn" data-icon="type">Text</button>
  <div class="tool-menu">
    <button id="shape-menu-btn" data-icon="shapes" aria-expanded="false" aria-controls="shape-menu">Shape</button>
    <div id="shape-menu" class="tool-popover" hidden>
      <div id="shape-palette" aria-label="Shape"></div>
      <button id="add-shape-btn" data-icon="plus">Add shape</button>
    </div>
  </div>
  <div class="tool-menu">
    <button id="insert-menu-btn" data-icon="chart-no-axes-combined" aria-expanded="false" aria-controls="insert-menu">Insert</button>
    <div id="insert-menu" class="tool-popover assets" hidden>
    <div class="asset-row">
    <label for="add-figure">Figure</label>
    <select id="add-figure" title="Figure"></select>
    <button id="add-figure-btn" data-icon="plus" title="Add figure" aria-label="Add figure"></button>
    </div>
    <div class="asset-row figure-data"><label for="figure-data">Figure data</label><select id="figure-data" title="Figure data"></select></div>
    <div class="asset-row">
    <label for="add-table">Table</label>
    <select id="add-table" title="Table data"></select>
    <button id="add-table-btn" data-icon="plus" title="Add table" aria-label="Add table"></button>
    </div>
    <div class="asset-row">
    <label for="add-html">HTML</label>
    <select id="add-html" title="HTML object"></select>
    <button id="add-html-btn" data-icon="plus" title="Add HTML" aria-label="Add HTML"></button>
    </div>
    <div class="asset-row">
    <label for="add-image">Image</label>
    <select id="add-image" title="Image"></select>
    <button id="add-image-btn" data-icon="plus" title="Add image" aria-label="Add image"></button>
    </div>
    </div>
  </div>
  <div class="tool-menu">
    <button id="theme-menu-btn" data-icon="palette" aria-expanded="false" aria-controls="theme-menu">Theme</button>
    <div id="theme-menu" class="tool-popover" hidden>
    <label for="theme-preset">Preset</label>
    <select id="theme-preset" title="Theme preset">
      <option value="">Custom theme</option>
      <option value="studio">Studio</option>
      <option value="paper">Paper</option>
      <option value="night">Night</option>
      <option value="mint">Mint</option>
    </select>
    <label>Accent <input type="color" id="theme-accent" /></label>
    <label>Background <input type="color" id="theme-bg" /></label>
    <label>Text <input type="color" id="theme-fg" /></label>
    <label for="theme-font">Font</label>
    <select id="theme-font" title="Deck font"></select>
    </div>
  </div>
  <span class="spacer"></span>
  <button id="inspector-toggle" data-icon="panel-right" title="Toggle properties" aria-label="Toggle properties" aria-pressed="true"></button>
</div>

<div id="workspace">
  <aside id="rail" aria-label="Slides"></aside>
  <div id="stage"><div id="canvas-viewport"><div id="canvas"></div></div></div>
  <aside id="sidebar">
    <div id="sidebar-tabs" role="tablist" aria-label="Object panel">
      <button id="properties-tab" role="tab" aria-selected="true" aria-controls="inspector">Properties</button>
      <button id="layers-tab" role="tab" aria-selected="false" aria-controls="layers">Layers</button>
    </div>
    <div id="inspector" role="tabpanel" aria-labelledby="properties-tab"></div>
    <div id="layers" role="tabpanel" aria-labelledby="layers-tab" hidden></div>
  </aside>
</div>
<div id="viewbar">
  <div class="view-group">
  <button id="slide-prev" data-icon="chevron-left" title="Previous slide" aria-label="Previous slide"></button>
  <label for="slide-number">Slide</label><input id="slide-number" type="number" min="1" value="1" aria-label="Slide number" />
  <span id="slide-total">/ 0</span>
  <button id="slide-next" data-icon="chevron-right" title="Next slide" aria-label="Next slide"></button>
  </div>
  <span class="spacer"></span>
  <div class="view-group">
  <button id="grid-btn" data-icon="grid-2x2" class="toggle on" title="Show grid" aria-label="Show grid" aria-pressed="true"></button>
  <button id="snap-btn" data-icon="magnet" class="toggle" title="Snap while dragging" aria-label="Snap while dragging" aria-pressed="false"></button>
  <button id="zoom-out" data-icon="minus" title="Zoom out" aria-label="Zoom out"></button>
  <button id="zoom-fit" title="Fit slide to screen" aria-pressed="true">Fit</button>
  <span id="zoom-label">100%</span>
  <button id="zoom-in" data-icon="plus" title="Zoom in" aria-label="Zoom in"></button>
  </div>
</div>

<div id="present-overlay" hidden>
  <div id="present-stage"><div id="present-viewport"><div id="present-canvas"></div></div></div>
  <div id="present-hud">
    <button id="p-prev">←</button>
    <span id="present-count">1 / 1</span>
    <button id="p-next">→</button>
    <button id="p-exit">Esc</button>
  </div>
</div>

<script src="./icons.js"></script>
<script src="./app.js"></script>
</body>
</html>
"""

APP_CSS = """
:root { --bg:#0d0f13; --panel:#15181f; --panel2:#101319; --card:#1d222b; --line:#2a303b; --fg:#edf0f6; --muted:#98a1b3; --accent:#5b8cff; --err:#ff6b6b; --scroll-track:#101319; --scroll-thumb:#3d4657; --scroll-hover:#56627a;
        --selection-layer:2147480000; --present-layer:2147483000; --present-controls-layer:2147483647; }
* { box-sizing: border-box; }
html, body { height:100%; color-scheme:dark; }
body { margin:0; background:#0b0d11; color:var(--fg);
       font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
       display:flex; flex-direction:column; overflow:hidden; }

#topbar { display:flex; align-items:center; gap:10px; padding:10px 14px;
          border-bottom:1px solid rgba(255,255,255,.08); background:rgba(18,21,28,.96);
          flex:0 0 auto; min-height:56px; }
#topbar, #rail, #stage, #inspector { color-scheme:dark; scrollbar-width:thin; scrollbar-color:var(--scroll-thumb) var(--scroll-track); }
#topbar::-webkit-scrollbar, #rail::-webkit-scrollbar, #stage::-webkit-scrollbar, #inspector::-webkit-scrollbar {
  width:9px; height:9px; -webkit-appearance:none; background-color:var(--scroll-track); }
#topbar::-webkit-scrollbar-track, #rail::-webkit-scrollbar-track, #stage::-webkit-scrollbar-track, #inspector::-webkit-scrollbar-track,
#topbar::-webkit-scrollbar-track-piece, #rail::-webkit-scrollbar-track-piece, #stage::-webkit-scrollbar-track-piece, #inspector::-webkit-scrollbar-track-piece {
  background-color:var(--scroll-track); }
#topbar::-webkit-scrollbar-thumb, #rail::-webkit-scrollbar-thumb, #stage::-webkit-scrollbar-thumb, #inspector::-webkit-scrollbar-thumb {
  background-color:var(--scroll-thumb); background-clip:padding-box; border:2px solid var(--scroll-track); border-radius:8px; }
#topbar::-webkit-scrollbar-thumb:hover, #rail::-webkit-scrollbar-thumb:hover, #stage::-webkit-scrollbar-thumb:hover, #inspector::-webkit-scrollbar-thumb:hover { background-color:var(--scroll-hover); }
#topbar::-webkit-scrollbar-button, #rail::-webkit-scrollbar-button, #stage::-webkit-scrollbar-button, #inspector::-webkit-scrollbar-button { display:none; width:0; height:0; }
#topbar::-webkit-scrollbar-corner, #rail::-webkit-scrollbar-corner, #stage::-webkit-scrollbar-corner, #inspector::-webkit-scrollbar-corner { background-color:var(--scroll-track); }
#topbar .brand { font-weight:800; font-size:22px; line-height:1; margin-right:12px; }
#deck-filename { min-width:0; max-width:360px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; font-size:13px; }
#status { font-size:11px; color:var(--muted); max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.spacer { flex:1; }
#toolsbar, #viewbar { display:flex; align-items:center; gap:6px; flex:0 0 auto; padding:7px 12px; background:var(--panel); }
#toolsbar { border-bottom:1px solid var(--line); position:relative; z-index:2147481000; }
#viewbar { border-top:1px solid var(--line); font-size:12px; color:var(--muted); }
.view-group { display:flex; align-items:center; gap:4px; }
#viewbar button { height:28px; padding:4px 7px; }
#slide-number { width:48px; height:27px; border:1px solid var(--line); border-radius:4px; background:var(--bg); color:var(--fg); text-align:center; }
button[data-icon], .icon-button { display:inline-flex; align-items:center; justify-content:center; gap:6px; min-width:30px; min-height:30px; }
button svg { flex:0 0 auto; pointer-events:none; }
button:focus-visible, .thumb:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.tool-menu { position:relative; }
.tool-popover { position:fixed; top:104px; left:12px; width:264px; max-width:calc(100vw - 24px); max-height:calc(100dvh - 160px); overflow:auto;
  padding:14px; display:grid; gap:12px; border:1px solid var(--line); border-radius:8px; background:var(--panel); box-shadow:0 12px 40px #0008; }
.tool-popover label { display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:12px; color:var(--muted); }
.tool-popover select { max-width:100%; width:100%; }
.tool-popover.assets { width:360px; }
.asset-row { display:grid; grid-template-columns:64px minmax(0,1fr) 32px; gap:8px; align-items:center; }
.asset-row button { padding:6px; }
.figure-data { grid-template-columns:64px minmax(0,1fr); padding-bottom:12px; border-bottom:1px solid var(--line); }
[hidden] { display:none !important; }
#zoom-label { min-width:42px; text-align:center; font-size:12px; color:var(--muted); }

select, input[type=text], textarea { background:var(--bg); color:var(--fg);
  border:1px solid var(--line); border-radius:7px; padding:6px 9px; font-size:13px; font-family:inherit; outline:none; }
select {
  max-width:165px;
  appearance:none;
  background-color:#0d1016;
  background-image:none;
  padding-right:12px;
}
select:focus, input:focus, textarea:focus { border-color:color-mix(in srgb, var(--accent) 70%, #fff 0%); box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }
input[type=color] { width:28px; height:24px; border:1px solid var(--line); border-radius:6px; background:var(--bg); padding:0; cursor:pointer; }
button { background:#252b36; color:var(--fg); border:1px solid rgba(255,255,255,.06); border-radius:7px; padding:7px 11px;
         font-size:13px; font-weight:650; cursor:pointer; transition:background .14s, border-color .14s, transform .14s; white-space:nowrap; }
button:hover { background:#303746; border-color:rgba(255,255,255,.12); }
button:active { transform:translateY(1px); }
button.primary { background:var(--accent); color:#fff; border-color:transparent; }
button.toggle { padding:5px 9px; color:var(--muted); background:transparent; border-color:transparent; }
button.toggle.on { color:#fff; background:color-mix(in srgb, var(--accent) 80%, #20242e); }
button:disabled { opacity:.45; cursor:not-allowed; }
#shape-palette { display:grid; grid-template-columns:repeat(5,1fr); gap:5px; }
#shape-palette button { width:100%; height:34px; padding:0; border:0; background:transparent; display:flex; align-items:center; justify-content:center; color:var(--muted); }
#shape-palette button:hover { background:#252b36; }
#shape-palette button.on { background:var(--accent); color:#fff; }
#shape-palette svg { width:18px; height:18px; overflow:hidden !important; }

#workspace { flex:1; display:flex; min-height:0; position:relative; }
#rail { width:196px; flex:0 0 auto; border-right:1px solid rgba(255,255,255,.08); background:var(--panel);
        min-height:0; overflow-x:hidden; overflow-y:scroll; scrollbar-gutter:stable; overscroll-behavior:contain;
        padding:12px; display:flex; flex-direction:column; gap:10px; }
#rail .thumb { position:relative; border:2px solid transparent; border-radius:7px; background:#fff;
               flex:0 0 auto; width:100%; aspect-ratio:16/9; cursor:grab; overflow:visible; margin-bottom:20px; box-shadow:0 8px 22px rgba(0,0,0,.22);
               transition:opacity .14s, border-color .14s, box-shadow .14s, transform .14s; }
#rail .thumb:active { cursor:grabbing; }
#rail .thumb.slide-dragging { opacity:.48; transform:scale(.98); border-color:var(--accent); box-shadow:0 4px 12px rgba(0,0,0,.2); }
#rail .thumb.slide-drop-before { box-shadow:0 -5px 0 -2px var(--accent), 0 8px 22px rgba(0,0,0,.22); }
#rail .thumb.slide-drop-after { box-shadow:0 5px 0 -2px var(--accent), 0 8px 22px rgba(0,0,0,.22); }
#rail .thumb.active { border-color:var(--accent); box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent), 0 10px 24px rgba(0,0,0,.3); }
#rail .thumb .mini { position:absolute; inset:0; overflow:hidden; pointer-events:none; isolation:isolate; border-radius:5px; }
#rail .thumb .mini-block { position:absolute; border-radius:1px; color:#1a1d24; overflow:hidden; transform-origin:50% 50%; }
#rail .thumb .mini-text { padding:0; background:transparent; }
#rail .thumb .mini-text .body { width:100%; height:100%; padding:10px 14px; overflow:hidden; }
#rail .thumb .mini-text .body.code-text { padding:36px 20px 16px; }
#rail .thumb .mini-text .rich { min-height:0; overflow:hidden; }
#rail .thumb .mini-image img { width:100%; height:100%; display:block; }
#rail .thumb .mini-shape { overflow:visible; }
#rail .thumb .mini-figure { display:flex; flex-direction:column; justify-content:flex-end; padding:4px 4px 3px;
                            background:rgba(255,255,255,.88); border:1px solid rgba(91,140,255,.28); }
#rail .thumb .mini-chart { flex:1; min-height:0; display:flex; align-items:flex-end; gap:3px; padding:4px 3px 2px;
                           border-left:1px solid #aeb7c5; border-bottom:1px solid #aeb7c5; }
#rail .thumb .mini-chart i { flex:1; min-width:2px; background:var(--accent); opacity:.82; border-radius:1px 1px 0 0; }
#rail .thumb .mini-label { flex:0 0 auto; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; color:#596275; font-size:4px; line-height:1.2; }
#rail .thumb .mini-table { display:grid; grid-template-rows:24% 1fr; background:#fff; border:1px solid rgba(31,41,55,.2); }
#rail .thumb .mini-table-head { display:flex; align-items:center; padding:0 3px; overflow:hidden; color:#374151; background:#e8edf4;
                               border-bottom:1px solid #cbd3df; font-size:4px; font-weight:700; white-space:nowrap; }
#rail .thumb .mini-table-grid { background:repeating-linear-gradient(0deg, transparent 0 7px, rgba(31,41,55,.13) 7px 8px),
                                          repeating-linear-gradient(90deg, transparent 0 18px, rgba(31,41,55,.11) 18px 19px); }
#rail .thumb .mini-html { display:flex; flex-direction:column; gap:3px; padding:4px; background:#fff; border:1px solid #d7dde7; }
#rail .thumb .mini-html::before { content:"HTML"; color:#64748b; font-size:4px; font-weight:700; }
#rail .thumb .mini-html::after { content:""; flex:1; background:repeating-linear-gradient(0deg, #dfe5ee 0 2px, transparent 2px 5px); opacity:.9; }
#rail .thumb .num { position:absolute; bottom:-19px; left:0; font-size:11px; color:var(--muted); }
#rail .thumb .del { position:absolute; bottom:-21px; right:27px; height:18px; color:var(--muted); font-size:14px; background:transparent; border:0; padding:0 5px; }
#rail .thumb .del:hover { color:var(--err); }
#rail .thumb .dup { position:absolute; right:0; bottom:-21px; width:25px; height:18px; color:var(--muted); font-size:16px; line-height:1;
                     background:transparent; border:0; padding:0; border-radius:4px; }
#rail .thumb .dup:hover { color:var(--accent); }
#rail .add-slide { flex:0 0 auto; background:transparent; border:1px dashed var(--line); color:var(--muted); padding:10px; }

#stage { flex:1; min-width:0; display:grid; align-items:start; justify-items:center; padding:32px; overflow:auto;
         background:
           linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),
           linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
         background-size:28px 28px; }
#canvas-viewport { position:relative; flex:0 0 auto; }
#canvas { position:absolute; inset:0 auto auto 0; width:1040px; height:585px; background:#fff;
          border-radius:8px; box-shadow:0 24px 70px rgba(0,0,0,.56), 0 0 0 1px rgba(255,255,255,.08); overflow:hidden; }
#canvas.show-grid::after { content:""; position:absolute; inset:0; pointer-events:none; z-index:5;
  background:
    linear-gradient(rgba(91,140,255,.12) 1px, transparent 1px),
    linear-gradient(90deg, rgba(91,140,255,.12) 1px, transparent 1px);
  background-size:4.1667% 7.4074%; z-index:0; }

#sidebar { width:296px; flex:0 0 auto; display:flex; flex-direction:column; min-height:0; border-left:1px solid var(--line); background:var(--panel); }
#sidebar-tabs { display:flex; flex:0 0 auto; border-bottom:1px solid var(--line); padding:0 12px; }
#sidebar-tabs button { flex:1; border:0; border-bottom:2px solid transparent; border-radius:0; background:transparent; padding:12px 4px; color:var(--muted); }
#sidebar-tabs button[aria-selected=true] { color:var(--fg); border-bottom-color:var(--accent); }
#inspector, #layers { min-height:0; overflow-y:auto; padding:16px; }
#layers { scrollbar-width:thin; scrollbar-color:var(--scroll-thumb) var(--scroll-track); }
#layers .layer-tools { display:flex; gap:5px; padding-bottom:12px; border-bottom:1px solid var(--line); margin-bottom:10px; }
#layers .layer-tools button { padding:6px; }
.layer-item { width:100%; display:flex; align-items:center; gap:9px; text-align:left; background:transparent; border:1px solid transparent; padding:10px 7px; margin:2px 0; font-weight:400; }
.layer-item[aria-pressed=true] { background:color-mix(in srgb,var(--accent) 15%,var(--panel)); border-color:var(--accent); }
.layer-name { min-width:0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.layer-type { color:var(--muted); font-size:10px; }
.panel-summary { margin:0 0 14px; color:var(--muted); font-size:12px; }
body.rail-hidden #rail, body.inspector-hidden #sidebar { display:none; }
@media (max-width:1100px) { #rail { width:160px; } #sidebar { width:264px; } }
@media (max-width:760px) {
  #rail, #sidebar { position:absolute; top:0; bottom:0; z-index:2147480500; box-shadow:0 8px 30px #0008; }
  #rail { left:0; width:184px; } #sidebar { right:0; width:280px; }
  #topbar { gap:6px; padding:10px; } #topbar .brand { margin-right:4px; }
  #status { display:none; } #toolsbar { gap:2px; padding:7px 8px; }
  #toolsbar button { padding:7px 8px; }
  #viewbar { gap:2px; padding:7px 8px; }
}
@media (max-width:440px) {
  #deck-filename { display:none; }
  #toolsbar button { gap:4px; padding:7px 5px; font-size:12px; }
  #toolsbar .tool-menu > button, #toolsbar #add-text-btn { font-size:0; gap:0; padding:7px 10px; }
  #save-deck-btn span { display:none; }
  #viewbar { flex-wrap:wrap; justify-content:center; }
  #viewbar .spacer { display:none; }
}
#inspector .muted { color:var(--muted); font-size:13px; }
#inspector h3 { margin:2px 0 12px; font-size:12px; text-transform:uppercase; letter-spacing:0; color:var(--muted); }
#inspector .row { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:12px; font-size:13px; }
#inspector .row label { color:var(--muted); }
#inspector textarea { width:100%; min-height:140px; resize:vertical; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
#inspector .danger { width:100%; background:#3a1f24; color:var(--err); margin-top:8px; }
#inspector .section { border-top:1px solid var(--line); padding-top:14px; margin-top:14px; }
#inspector .quick { display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; margin-bottom:10px; }
#inspector .quick button { padding:7px 5px; font-size:12px; }
#inspector .split { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
#inspector .shape-grid { display:grid; grid-template-columns:repeat(4, 1fr); gap:6px; margin-bottom:12px; }
#inspector .shape-grid button { height:34px; padding:0; display:flex; align-items:center; justify-content:center; }
#inspector .shape-grid button.on { border-color:var(--accent); background:color-mix(in srgb, var(--accent) 26%, var(--card)); }
#inspector .shape-grid svg { width:21px; height:21px; overflow:visible; }
#inspector .swatches { display:flex; gap:6px; flex-wrap:wrap; }
#inspector .swatch { width:23px; height:23px; padding:0; border-radius:999px; border:1px solid rgba(255,255,255,.18); }
#inspector .swatch.none { background:linear-gradient(135deg, transparent 45%, #ff6b6b 46%, #ff6b6b 54%, transparent 55%), #fff; }

/* blocks on the canvas */
.block { position:absolute; overflow:visible; }
.block .body { width:100%; height:100%; overflow:hidden; }
.block .body.text { padding:10px 14px; }
.block .body.text.code-text { position:relative; padding:36px 20px 16px; border:1px solid rgba(148,163,184,.24);
  border-radius:6px; box-shadow:inset 0 1px rgba(255,255,255,.06), 0 10px 26px rgba(15,23,42,.2); }
.block .body.text.code-text::before { content:""; position:absolute; top:14px; left:16px; width:7px; height:7px;
  border-radius:50%; background:#fb7185; box-shadow:11px 0 #fbbf24, 22px 0 #34d399; pointer-events:none; }
.block .body.text.code-text .rich { height:100%; min-height:0; overflow:auto; overflow-wrap:normal;
  white-space:pre-wrap; tab-size:2; color-scheme:dark; scrollbar-gutter:stable; scrollbar-width:thin; scrollbar-color:#56627a #111827; }
.block .body.text.code-text .rich::-webkit-scrollbar { width:8px; height:8px; }
.block .body.text.code-text .rich::-webkit-scrollbar-track { background:#111827; }
.block .body.text.code-text .rich::-webkit-scrollbar-thumb { background:#56627a; border:2px solid #111827; border-radius:8px; }
.block .body.html iframe { width:100%; height:100%; border:0; display:block; background:white; }
.editing .block.html iframe { pointer-events:none; }
.editing .block { outline:1px dashed rgba(120,130,150,.4); }
.editing .block:hover { outline:1px solid rgba(91,140,255,.6); }
.editing .block.selected { z-index:var(--selection-layer) !important; outline:2px solid var(--accent);
                           box-shadow:0 0 0 5px color-mix(in srgb, var(--accent) 16%, transparent); }
.editing .block { cursor:move; }
.block .handle { position:absolute; width:13px; height:13px; background:#fff; border:2px solid var(--accent); touch-action:none;
                 border-radius:50%; display:none; z-index:6; box-shadow:0 1px 3px rgba(0,0,0,.3); }
.editing .block.selected .handle { display:block; }
.block .handle.nw { left:-6px; top:-6px; cursor:nwse-resize; }
.block .handle.ne { right:-6px; top:-6px; cursor:nesw-resize; }
.block .handle.sw { left:-6px; bottom:-6px; cursor:nesw-resize; }
.block .handle.se { right:-6px; bottom:-6px; cursor:nwse-resize; }
.block .handle.rot { left:50%; top:-34px; transform:translateX(-50%); cursor:grab; width:16px; height:16px; }
.block .handle.rot::after { content:""; position:absolute; left:50%; top:14px; width:1px; height:18px; background:var(--accent); transform:translateX(-50%); }
.block .handle.move { left:0; top:-33px; width:22px; height:22px; border:0; border-radius:6px; cursor:grab;
  background-color:var(--accent); box-shadow:0 3px 10px rgba(0,0,0,.3); }
.block .handle.move::before { content:""; position:absolute; left:6px; top:6px; width:3px; height:3px;
  border-radius:50%; background:#fff; box-shadow:5px 0 #fff, 0 5px #fff, 5px 5px #fff; }
.block .handle.move:active, .block .handle.rot:active { cursor:grabbing; }
.block.table .handle.move { left:7px; top:7px; }
.editing .block.table.selected .table-meta { padding-left:38px; }
.block .err { padding:10px; color:var(--err); font-size:12px; }

/* image + shape blocks */
.block .body.image { display:flex; align-items:center; justify-content:center; }
.block .body.image img { width:100%; height:100%; display:block; user-select:none; -webkit-user-drag:none; }
.block .body.image .ph { position:absolute; inset:0; }
.block .body.shape { overflow:visible; }
.block .ph { width:100%; height:100%; display:flex; align-items:center; justify-content:center;
             color:#9aa3b5; font-size:12px; text-align:center; padding:8px;
             background:repeating-conic-gradient(#eef0f4 0% 25%, #e2e5ec 0% 50%) 50%/18px 18px; }

/* scrollable data table blocks */
.block .body.table { display:flex; flex-direction:column; overflow:hidden; color:#20242c; background:#fff;
  border:1px solid rgba(31,41,55,.16); border-radius:6px; font-variant-numeric:tabular-nums; }
.table-meta { flex:0 0 auto; min-height:30px; display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding:6px 10px; border-bottom:1px solid rgba(31,41,55,.12); background:#f8fafc; color:#4b5563; font-size:11px; }
.table-meta strong { min-width:0; color:#20242c; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.table-meta span { flex:0 0 auto; }
.table-scroll { flex:1 1 auto; min-height:0; overflow:auto; overscroll-behavior:contain; scrollbar-gutter:stable;
  touch-action:pan-x pan-y; color-scheme:light; scrollbar-width:thin; scrollbar-color:#9aa5b5 #eef2f7; }
.table-scroll::-webkit-scrollbar { width:9px; height:9px; }
.table-scroll::-webkit-scrollbar-track { background:#eef2f7; }
.table-scroll::-webkit-scrollbar-thumb { background:#9aa5b5; border:2px solid #eef2f7; border-radius:8px; }
.data-table { width:max-content; min-width:100%; border-collapse:separate; border-spacing:0; font-size:12px; line-height:1.25; }
.data-table th, .data-table td { padding:7px 10px; max-width:320px; border-right:1px solid rgba(31,41,55,.1);
  border-bottom:1px solid rgba(31,41,55,.1); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.data-table th:last-child, .data-table td:last-child { border-right:0; }
.data-table thead th { position:sticky; top:0; z-index:2; background:#eef2f7; color:#374151; text-align:left;
  font-weight:700; box-shadow:0 1px 0 rgba(31,41,55,.12); }
.data-table th.numeric, .data-table td.numeric { text-align:right; }
.data-table tbody tr:nth-child(even) td { background:rgba(148,163,184,.08); }
.data-table.compact th, .data-table.compact td { padding:4px 8px; }
.data-table.no-stripes tbody tr:nth-child(even) td { background:transparent; }
.data-table .row-index { position:sticky; left:0; z-index:1; min-width:42px; color:#6b7280; text-align:right;
  background:#f8fafc !important; }
.data-table thead .row-index { z-index:3; background:#e8edf4 !important; }
.table-empty { display:flex; flex:1; align-items:center; justify-content:center; color:#6b7280; font-size:12px; }
.editing .block.table .body.table { cursor:default; }

/* slide-native rich text: the same DOM and box model in edit and present modes */
.rich { width:100%; min-height:100%; color:inherit; line-height:1.45; overflow-wrap:anywhere; }
.rich > :first-child { margin-top:0; } .rich > :last-child { margin-bottom:0; }
.rich h1 { font-size:2em; margin:.3em 0; font-weight:700; line-height:1.15; }
.rich h2 { font-size:1.5em; margin:.3em 0; font-weight:700; line-height:1.2; }
.rich h3 { font-size:1.2em; margin:.3em 0; font-weight:600; }
.rich p, .rich div { margin:.4em 0; }
.rich ul, .rich ol { margin:.4em 0; padding-left:1.4em; }
.rich li { margin:.2em 0; }
.rich li::marker { font-family:var(--marker-font-family, inherit); font-size:var(--marker-font-size, 1em);
                   font-weight:var(--marker-font-weight, inherit); font-style:var(--marker-font-style, inherit);
                   color:var(--marker-color, currentColor); }
.rich ul { list-style:disc; } .rich ul ul { list-style:circle; } .rich ul ul ul { list-style:square; }
.rich a { color:var(--accent); }
.rich b, .rich strong { font-weight:700; } .rich i, .rich em { font-style:italic; }
.rich blockquote { margin:.5em 0; padding:.15em .9em; border-left:3px solid var(--accent); opacity:.85; }
.rich code { background:rgba(125,135,155,.18); padding:.1em .35em; border-radius:4px;
           font-family:ui-monospace,Menlo,monospace; font-size:.9em; }
.rich pre { background:rgba(125,135,155,.14); padding:.6em .8em; border-radius:6px; overflow:auto; }
.rich pre code { background:none; padding:0; }
.rich hr { border:0; border-top:1px solid rgba(125,135,155,.35); margin:.6em 0; }
.rich img { max-width:100%; }
.rich[contenteditable="true"] { outline:0; cursor:text; caret-color:currentColor; height:100%; user-select:text; -webkit-user-select:text; }

/* inspector rich-text toolbar */
.rich-tools { display:flex; gap:4px; flex-wrap:wrap; margin-bottom:10px; }
.rich-tools .fmt { background:var(--card); border:1px solid var(--line); border-radius:6px;
                 padding:4px 9px; font-size:12px; font-weight:600; min-width:28px; line-height:1; }
.rich-tools .fmt:hover { border-color:var(--accent); filter:none; }
.rich-tools .fmt.on { color:#fff; border-color:var(--accent); background:color-mix(in srgb, var(--accent) 72%, var(--card)); }
#inspector .edit-text { width:100%; margin-bottom:12px; }

/* inspector controls */
#inspector .row.stack { flex-direction:column; align-items:stretch; gap:6px; }
#inspector .row.stack > label { font-size:11px; text-transform:uppercase; letter-spacing:0; }
#inspector input[type=text] { width:150px; }
#inspector input[type=number] { width:70px; }
#inspector input[type=range] { width:130px; accent-color:var(--accent); }
#inspector input[type=file] { font-size:11px; color:var(--muted); width:100%; }
#inspector input[type=file]::file-selector-button { background:var(--card); color:var(--fg);
  border:1px solid var(--line); border-radius:6px; padding:5px 9px; margin-right:8px; cursor:pointer; font:inherit; }
#inspector .fill { display:flex; align-items:center; gap:7px; }
#inspector .seg { display:flex; gap:0; border:1px solid var(--line); border-radius:8px; overflow:hidden; }
#inspector .seg button { background:var(--bg); border:0; border-radius:0; padding:6px 10px; font-size:12px; color:var(--muted); }
#inspector .seg button.on { background:var(--accent); color:#fff; }
#inspector .sub { font-size:11px; color:var(--muted); margin:-6px 0 10px; }
#inspector [data-character-property][data-mixed="true"] { outline:1px dashed var(--muted); outline-offset:2px; }
#inspector .mixed-value { color:var(--muted); font-size:11px; }

/* present mode */
#present-overlay { position:fixed; inset:0; background:#000; z-index:var(--present-layer); display:flex;
                   flex-direction:column; align-items:center; justify-content:center; }
#present-overlay[hidden] { display:none; }
#present-stage { flex:1; width:100%; min-height:0; display:flex; align-items:center; justify-content:center; overflow:hidden; }
#present-viewport { position:relative; flex:0 0 auto; }
#present-canvas { position:absolute; inset:0 auto auto 0; width:1040px; height:585px; background:#fff; }
#present-hud { position:fixed; bottom:16px; left:50%; transform:translateX(-50%);
               display:flex; gap:10px; align-items:center; background:rgba(20,22,28,.85);
               padding:8px 12px; border-radius:999px; opacity:.72; transition:opacity .2s;
               z-index:var(--present-controls-layer); isolation:isolate; }
#present-hud:hover { opacity:1; }
#present-count { font-size:13px; color:var(--fg); min-width:60px; text-align:center; }
"""

APP_JS = r"""
const S = { version:0, figures:[], htmls:[], images:[], tables:[], theme:{}, workspace:{configured:false, filename:null}, slides:[], cur:0, sel:null, dragging:false, present:false, pcur:0, editingText:null, grid:true, snap:false, zoom:1, shapeKind:"rect", deckName:"presentation.cast.json" };
const SLIDE_WIDTH = 1040;
const SLIDE_HEIGHT = 585;
let lastSlideId = null, lastStructSig = null;
let refreshPromise = null, refreshQueued = false, renderRequestSeq = 0;
let savedTextRange = null, savedTextBid = null;
let suspendTextBlur = false;
let statusResetTimer = null;
let draggedSlideId = null, slideOrderBeforeDrag = [], suppressSlideClick = false, slideDropAccepted = false;
let slideReorderPromise = null;
let fitZoom = true, layerSaving = false;
const desktopPanels = {rail:true, inspector:true};
const pendingTextContent = new Map();
const textSaveChains = new Map();
const legacyTextMigrations = new Set();
const pendingMutations = new Set();

const $ = (id) => document.getElementById(id);
function el(tag, attrs={}, kids=[]) {
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "style") e.setAttribute("style", v);
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) e.setAttribute(k, v);
  }
  for (const c of [].concat(kids)) if (c !== null && c !== undefined) e.append(c);
  return e;
}
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const tableVer = (name) => { const t = S.tables.find(x=>x.name===name); return t ? t.version : 0; };
const htmlVer = (name) => { const h = S.htmls.find(x=>x.name===name); return h ? (h.version || 0) : 0; };
const imageVer = (name) => { const image = S.images.find(x=>x.name===name); return image ? (image.version || 0) : 0; };
const snap = (v, step=1/96, force=false) => (S.snap || force) ? Math.round(v / step) * step : v;

function api(path, opts) {
  const request = fetch(path, opts).then(async response=>{
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
    return result;
  });
  if (opts?.method && !["GET", "HEAD"].includes(opts.method)) {
    pendingMutations.add(request);
    request.then(()=>pendingMutations.delete(request), ()=>pendingMutations.delete(request));
  }
  return request;
}
const jbody = (m, body) => ({ method:m, headers:{"Content-Type":"application/json"}, body: JSON.stringify(body||{}) });

function showStatus(message, duration=1800) {
  clearTimeout(statusResetTimer);
  $("status").textContent = message;
  if (duration) statusResetTimer = setTimeout(()=> $("status").textContent = "live", duration);
}

function curSlide() { return S.slides[S.cur] || null; }

function iconButton(name, label, action) {
  const button = el("button", {class:"icon-button", title:label, "aria-label":label, onclick:action});
  button.append(window.castIcon(name));
  return button;
}

function closeMenus(restoreFocus=false) {
  for (const button of document.querySelectorAll("[aria-controls].menu-open")) {
    $(button.getAttribute("aria-controls")).hidden = true;
    button.setAttribute("aria-expanded", "false");
    button.classList.remove("menu-open");
    if (restoreFocus) button.focus();
  }
}

function setPanel(panel) {
  $("inspector").hidden = panel !== "properties";
  $("layers").hidden = panel !== "layers";
  for (const name of ["properties", "layers"]) {
    $(name+"-tab").setAttribute("aria-selected", String(name === panel));
    $(name+"-tab").tabIndex = name === panel ? 0 : -1;
  }
  if (panel === "layers") renderLayers();
}

function togglePanel(name) {
  const hidden = document.body.classList.toggle(name+"-hidden");
  $(name+"-toggle").setAttribute("aria-pressed", String(!hidden));
  if (window.innerWidth > 760) desktopPanels[name] = !hidden;
  if (!hidden && window.innerWidth <= 760) {
    const other = name === "rail" ? "inspector" : "rail";
    document.body.classList.add(other+"-hidden");
    $(other+"-toggle").setAttribute("aria-pressed", "false");
  }
}

async function goToSlide(index) {
  if (slideReorderPromise) await slideReorderPromise;
  if (S.dragging || !S.slides.length) return;
  if (S.editingText) await stopTextEdit(S.editingText);
  S.cur = clamp(index, 0, S.slides.length-1);
  S.sel = null;
  applyTheme(); renderRail(); renderCanvas(); renderInspector(); renderTopbar();
  $("rail").querySelector(".thumb.active")?.scrollIntoView({block:"nearest"});
}

/* ---------------- data + render orchestration ---------------- */
function refresh() {
  refreshQueued = true;
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async ()=>{
    while (refreshQueued && !S.dragging && !layerSaving) {
      refreshQueued = false;
      const next = await api("./state");
      if (S.dragging || layerSaving) { refreshQueued = true; break; }
      for (const [bid, content] of pendingTextContent) {
        const pending = next.slides.flatMap(slide=>slide.blocks).find(block=>block.id===bid);
        if (pending && pending.type === "text") pending.content = content;
      }
      S.version = next.version; S.figures = next.figures; S.htmls = next.htmls || [];
      S.images = next.images || []; S.tables = next.tables;
      const activeId = curSlide()?.id, presentId = S.slides[S.pcur]?.id;
      S.theme = next.theme; S.workspace = next.workspace || {configured:false, filename:null}; S.slides = next.slides;
      const activeIndex = S.slides.findIndex(slide=>slide.id === activeId);
      const presentIndex = S.slides.findIndex(slide=>slide.id === presentId);
      if (activeIndex >= 0) S.cur = activeIndex;
      if (presentIndex >= 0) S.pcur = presentIndex;
      S.pcur = clamp(S.pcur, 0, Math.max(0, S.slides.length-1));
      canonicalizeTextBlocks();
      if (S.cur >= S.slides.length) S.cur = Math.max(0, S.slides.length - 1);
      if (S.sel && !curSlide()?.blocks.some(b=>b.id===S.sel)) S.sel = null;
      applyTheme();
      renderTopbar();
      renderRail();
      renderCanvas();
      // Don't rebuild the inspector while the user is editing one of its fields.
      const act = document.activeElement;
      if (!S.editingText && (!act || !$("inspector").contains(act))) renderInspector();
      renderLayers();
      if (S.present) renderPresent();
    }
  })().finally(()=>{
    refreshPromise = null;
    if (refreshQueued && !S.dragging && !layerSaving) queueMicrotask(refresh);
  });
  return refreshPromise;
}

function applyTheme() {
  if (S.theme.accent) document.documentElement.style.setProperty("--accent", S.theme.accent);
  const viewport = $("canvas-viewport");
  const cv = $("canvas"); if (cv) {
    if (viewport) {
      viewport.style.width = (SLIDE_WIDTH * S.zoom) + "px";
      viewport.style.height = (SLIDE_HEIGHT * S.zoom) + "px";
    }
    // CSS zoom keeps the logical slide size fixed but rasterizes text at its
    // displayed size. A transformed canvas leaves glyphs visibly soft.
    cv.style.zoom = S.zoom;
    cv.style.background = curSlide()?.background || S.theme.bg || "#fff";
    cv.style.color = S.theme.fg || "#1a1d24";
    cv.style.fontFamily = S.theme.font || "";
    cv.classList.toggle("show-grid", S.grid);
  }
  requestAnimationFrame(resizeFigures);
}

function resizeFigures() {
  document.querySelectorAll(".block.figure .body").forEach(node => {
    try { Plotly.Plots.resize(node); } catch (_) {}
  });
}

function fitStage() {
  const stage = $("stage");
  if (!stage) return;
  const availableW = stage.clientWidth - 64;
  const availableH = stage.clientHeight - 64;
  if (availableW <= 0 || availableH <= 0) return;
  S.zoom = clamp(
    Math.floor(Math.min(availableW / SLIDE_WIDTH, availableH / SLIDE_HEIGHT) * 100) / 100,
    0.1,
    1.6,
  );
  fitZoom = true;
  applyTheme();
  renderTopbar();
}

/* ---------------- topbar ---------------- */
function renderTopbar() {
  const figSel = $("add-figure"), tblSel = $("add-table"), htmlSel = $("add-html"), imageSel = $("add-image");
  const pf = figSel.value, pt = tblSel.value, ph = htmlSel.value, pi = imageSel.value;
  figSel.innerHTML = ""; tblSel.innerHTML = ""; htmlSel.innerHTML = ""; imageSel.innerHTML = "";
  for (const f of S.figures) figSel.append(el("option", {value:f.name}, f.title));
  for (const h of S.htmls) htmlSel.append(el("option", {value:h.name}, h.title));
  if (!S.images.length) imageSel.append(el("option", {value:""}, "Blank image"));
  for (const image of S.images) imageSel.append(el("option", {value:image.name}, image.title));
  for (const t of S.tables) tblSel.append(el("option", {value:t.name}, t.title));
  if (S.figures.some(f=>f.name===pf)) figSel.value = pf;
  if (S.htmls.some(h=>h.name===ph)) htmlSel.value = ph;
  if (S.images.some(image=>image.name===pi)) imageSel.value = pi;
  if (S.tables.some(t=>t.name===pt)) tblSel.value = pt;
  if (!S.figures.length) figSel.append(el("option", {value:""}, "No figures"));
  if (!S.tables.length) tblSel.append(el("option", {value:""}, "No tables"));
  if (!S.htmls.length) htmlSel.append(el("option", {value:""}, "No HTML objects"));
  const dataSel = $("figure-data"), pd = dataSel.value;
  dataSel.replaceChildren(el("option", {value:""}, "No data"));
  for (const t of S.tables) dataSel.append(el("option", {value:t.name}, t.title));
  if (S.tables.some(t=>t.name===pd)) dataSel.value = pd;
  const ready = S.figures.length;
  $("add-figure-btn").disabled = !ready || !S.slides.length;
  $("add-table-btn").disabled = !S.tables.length || !S.slides.length;
  $("add-html-btn").disabled = !S.htmls.length || !S.slides.length;
  $("add-text-btn").disabled = !S.slides.length;
  $("add-image-btn").disabled = !S.slides.length;
  $("add-shape-btn").disabled = !S.slides.length;
  $("present-btn").disabled = !S.slides.length;
  const saveButton = $("save-deck-btn");
  saveButton.disabled = !S.workspace.configured;
  saveButton.title = S.workspace.configured
    ? `Save to ${S.workspace.filename} (Cmd/Ctrl+S)`
    : "Create Cast('presentation.cast.json') to enable workspace saving";
  $("deck-filename").textContent = S.workspace.filename || S.deckName;
  $("deck-filename").title = $("deck-filename").textContent;
  if (document.activeElement !== $("slide-number")) $("slide-number").value = S.slides.length ? S.cur+1 : 0;
  $("slide-number").max = S.slides.length;
  $("slide-number").disabled = !S.slides.length;
  $("slide-total").textContent = `/ ${S.slides.length}`;
  $("slide-prev").disabled = S.cur <= 0;
  $("slide-next").disabled = S.cur >= S.slides.length-1;
  if (S.theme.accent) $("theme-accent").value = S.theme.accent;
  if (S.theme.bg) $("theme-bg").value = S.theme.bg;
  if (S.theme.fg) $("theme-fg").value = S.theme.fg;
  const fontSel = $("theme-font");
  fontSel.innerHTML = "";
  for (const [label, value] of FONTS) fontSel.append(el("option", {value}, label));
  if (S.theme.font && !FONTS.some(f=>f[1] === S.theme.font)) fontSel.append(el("option", {value:S.theme.font}, S.theme.font));
  fontSel.value = S.theme.font || FONTS[0][1];
  $("theme-preset").value = Object.keys(THEME_PRESETS).find(key=>Object.entries(THEME_PRESETS[key]).every(([k,v])=>S.theme[k] === v)) || "";
  $("grid-btn").classList.toggle("on", S.grid);
  $("snap-btn").classList.toggle("on", S.snap);
  $("grid-btn").setAttribute("aria-pressed", String(S.grid));
  $("snap-btn").setAttribute("aria-pressed", String(S.snap));
  $("zoom-fit").setAttribute("aria-pressed", String(fitZoom));
  $("zoom-label").textContent = Math.round(S.zoom * 100) + "%";
  renderShapePalette();
}

function renderShapePalette() {
  const pal = $("shape-palette"); if (!pal) return;
  pal.innerHTML = "";
  for (const [shape, title] of SHAPE_OPTIONS) {
    const btn = el("button", {class:shape === S.shapeKind ? "on" : "", type:"button", title, "aria-label":title, "aria-pressed":String(shape === S.shapeKind)});
    btn.innerHTML = shapeSvg({shape, fill:"currentColor", stroke:"currentColor", strokeWidth:LINE_SHAPES.has(shape) ? 8 : 0, radius:shape === "round-rect" ? 16 : 0});
    btn.addEventListener("click", ()=>{ S.shapeKind = shape; renderShapePalette(); });
    pal.append(btn);
  }
}

/* ---------------- slide rail ---------------- */
function buildMiniBlock(b) {
  const st = b.style || {};
  const mb = el("div", {class:"mini-block mini-"+b.type});
  mb.style.left = (b.x*100)+"%"; mb.style.top = (b.y*100)+"%";
  mb.style.width = (b.w*100)+"%"; mb.style.height = (b.h*100)+"%";
  mb.style.zIndex = b.z || 0;
  mb.style.opacity = st.opacity ?? 1;
  mb.style.transform = `rotate(${st.rotate || 0}deg)`;

  if (b.type === "text") {
    const code = st.textVariant === "code";
    mb.style.background = Object.prototype.hasOwnProperty.call(st, "bg")
      ? st.bg
      : (code ? "#111827" : "transparent");
    mb.style.color = S.theme.fg || "#1a1d24";
    mb.style.fontFamily = S.theme.font || "sans-serif";
    const logical = el("div", {style:`width:${b.w*SLIDE_WIDTH}px;height:${b.h*SLIDE_HEIGHT}px;zoom:var(--preview-scale)`});
    const body = el("div", {class:"body text"+(code ? " code-text" : "")});
    const rich = el("div", {class:"rich"});
    rich.innerHTML = b.content || "";
    applyTextStyle(rich, st);
    body.append(rich); logical.append(body); mb.append(logical);
    syncListMarkers(rich);
  } else if (b.type === "image") {
    const asset = b.image ? S.images.find(image=>image.name===b.image) : null;
    const src = asset
      ? `./render_image?image=${encodeURIComponent(asset.name)}&v=${asset.version || 0}`
      : (st.src || "");
    if (src) {
      const img = el("img", {src, alt:"", loading:"lazy", decoding:"async"});
      img.style.objectFit = st.fit || "contain";
      img.style.imageRendering = st.rendering || "auto";
      mb.append(img);
    }
  } else if (b.type === "shape") {
    mb.innerHTML = shapeSvg(st);
  } else if (b.type === "figure") {
    const chart = el("div", {class:"mini-chart"});
    for (const height of [42, 68, 51, 86, 64, 92]) {
      chart.append(el("i", {style:`height:${height}%`}));
    }
    const figure = S.figures.find(item=>item.name === b.figure);
    mb.append(chart, el("span", {class:"mini-label"}, figure?.title || b.figure || "Figure"));
  } else if (b.type === "table") {
    const table = S.tables.find(item=>item.name === b.table);
    mb.append(
      el("div", {class:"mini-table-head"}, table?.title || b.table || "Table"),
      el("div", {class:"mini-table-grid"}),
    );
    if (st.headerBg) mb.firstElementChild.style.background = st.headerBg;
    if (st.headerColor) mb.firstElementChild.style.color = st.headerColor;
  } else if (b.type === "html") {
    const htmlObject = S.htmls.find(item=>item.name === b.html);
    mb.title = htmlObject?.title || b.html || "HTML";
  }
  return mb;
}

function railSlideOrder() {
  return [...$("rail").querySelectorAll(".thumb[data-slide-id]")].map(thumb=>thumb.dataset.slideId);
}

function updateRailNumbers() {
  $("rail").querySelectorAll(".thumb[data-slide-id]").forEach((thumb, index)=>{
    const number = thumb.querySelector(".num");
    if (number) number.textContent = String(index + 1);
  });
}

function clearSlideDropMarkers() {
  $("rail").querySelectorAll(".slide-drop-before,.slide-drop-after").forEach(thumb=>{
    thumb.classList.remove("slide-drop-before", "slide-drop-after");
  });
}

async function finishSlideReorder(originalOrder, accepted) {
  const order = railSlideOrder();
  const activeId = curSlide()?.id;
  document.body.style.userSelect = "";
  clearSlideDropMarkers();

  if (!accepted || order.every((id, i)=>id === originalOrder[i])) {
    S.dragging = false;
    renderRail();
    await refresh();
    return;
  }

  const byId = new Map(S.slides.map(slide=>[slide.id, slide]));
  S.slides = order.map(id=>byId.get(id)).filter(Boolean);
  S.cur = Math.max(0, S.slides.findIndex(slide=>slide.id === activeId));
  renderRail();
  try {
    const result = await api("./slides/order", jbody("PATCH", {order}));
    if (!result.ok) showStatus("Could not reorder slides");
  } catch (_) {
    showStatus("Could not reorder slides");
  } finally {
    S.dragging = false;
    await refresh();
  }
}

function resizePreviews() {
  $("rail").querySelectorAll(".thumb").forEach(thumb=>{
    thumb.style.setProperty("--preview-scale", String(thumb.clientWidth / SLIDE_WIDTH));
  });
}

function blockLabel(b) {
  if (b.type === "text") {
    const holder = el("div"); holder.innerHTML = b.content || b.markdown || "";
    return holder.textContent.trim().replace(/\s+/g, " ").slice(0,100) || "Empty text";
  }
  if (b.type === "shape") return SHAPE_OPTIONS.find(s=>s[0] === b.style?.shape)?.[1] || "Shape";
  const assets = {figure:S.figures, image:S.images, html:S.htmls, table:S.tables};
  return assets[b.type]?.find(asset=>asset.name === b[b.type])?.title || b[b.type] || b.type;
}

async function duplicateSlide(slide=curSlide()) {
  if (!slide) return;
  if (S.editingText) await stopTextEdit(S.editingText);
  const result = await api(`./slides/${slide.id}/duplicate`, {method:"POST"});
  if (!result.id) return;
  await refresh();
  await goToSlide(S.slides.findIndex(s=>s.id === result.id));
}

function renderRail() {
  const rail = $("rail");
  rail.innerHTML = "";
  S.slides.forEach((s, i) => {
    const del = el("button", {class:"del", title:"Delete slide", onclick: async (e)=>{
      e.stopPropagation();
      if (s.blocks.length && !confirm(`Delete slide ${i+1}?`)) return;
      await api(`./slides/${s.id}`, {method:"DELETE"}); refresh();
    }}, "×");
    const duplicate = el("button", {class:"dup", title:"Duplicate slide", "aria-label":"Duplicate slide", onclick: async (e)=>{
      e.stopPropagation();
      await duplicateSlide(s);
    }}, "⧉");
    const mini = el("div", {class:"mini", "aria-hidden":"true"});
    mini.style.background = s.background || S.theme.bg || "#ffffff";
    for (const b of s.blocks) mini.append(buildMiniBlock(b));
    const thumb = el("div", {
      class:"thumb"+(i===S.cur?" active":""),
      "data-slide-id":s.id,
      tabindex:i === S.cur ? "0" : "-1",
      "aria-label":`Slide ${i+1}${s.blocks.find(b=>b.type === "text") ? ": "+blockLabel(s.blocks.find(b=>b.type === "text")) : ""}`,
      "aria-current":i === S.cur ? "true" : "false",
      draggable:"true",
      title:"Drag to reorder slide",
      ondragstart:(e)=>{
        if (e.target.closest("button")) { e.preventDefault(); return; }
        if (S.editingText) void stopTextEdit(S.editingText);
        draggedSlideId = s.id;
        slideDropAccepted = false;
        slideOrderBeforeDrag = railSlideOrder();
        suppressSlideClick = true;
        S.dragging = true;
        document.body.style.userSelect = "none";
        thumb.classList.add("slide-dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", s.id);
      },
      ondragover:(e)=>{
        const dragged = [...rail.querySelectorAll(".thumb")].find(item=>item.dataset.slideId === draggedSlideId);
        if (!dragged) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dragged === thumb) return;
        const rect = thumb.getBoundingClientRect();
        const after = e.clientY > rect.top + rect.height / 2;
        clearSlideDropMarkers();
        thumb.classList.add(after ? "slide-drop-after" : "slide-drop-before");
        if (after) thumb.after(dragged); else thumb.before(dragged);
        updateRailNumbers();
      },
      ondrop:(e)=>{ if (draggedSlideId) { e.preventDefault(); slideDropAccepted = true; clearSlideDropMarkers(); } },
      ondragend:async ()=>{
        thumb.classList.remove("slide-dragging");
        draggedSlideId = null;
        setTimeout(()=>{ suppressSlideClick = false; }, 0);
        slideReorderPromise = finishSlideReorder(slideOrderBeforeDrag, slideDropAccepted);
        try { await slideReorderPromise; }
        finally { slideReorderPromise = null; }
      },
      onclick:async ()=>{
        if (suppressSlideClick) return;
        await goToSlide(S.slides.findIndex(slide=>slide.id===s.id));
      },
      onkeydown:async (e)=>{
        if (e.target !== thumb || !["ArrowUp","ArrowDown","Home","End","Enter"," "].includes(e.key)) return;
        e.preventDefault(); e.stopPropagation();
        const next = e.key === "Home" ? 0 : e.key === "End" ? S.slides.length-1 : i+(e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0);
        await goToSlide(next);
        $("rail").querySelector(".thumb.active")?.focus();
      }
    },
      [mini, el("span", {class:"num"}, String(i+1)), duplicate, del]);
    rail.append(thumb);
  });
  rail.append(el("button", {class:"add-slide", onclick:()=> addSlideFromTemplate($("slide-template").value)}, "+ Slide"));
  resizePreviews();
}

/* ---------------- canvas (edit) ---------------- */
function structSig(slide) {
  if (!slide) return "none";
  // Figures carry their binding so a rebind re-fetches the plot; other block
  // types only need identity here — their look is updated live in syncCanvas.
  return slide.id + "::" + slide.blocks.map(b =>
    b.type === "figure" ? `${b.id}:fig:${b.figure}:${b.table}:${tableVer(b.table)}` :
    b.type === "html" ? `${b.id}:html:${b.html}:${htmlVer(b.html)}` :
    `${b.id}:${b.type}`
  ).join("|");
}

function renderCanvas() {
  const canvas = $("canvas");
  canvas.classList.add("editing");
  const slide = curSlide();
  const sig = structSig(slide);
  if (slide && slide.id === lastSlideId && sig === lastStructSig) {
    syncCanvas();           // geometry/text/style only — keep Plotly intact
    return;
  }
  lastSlideId = slide ? slide.id : null; lastStructSig = sig;
  canvas.innerHTML = "";
  if (!slide) { canvas.classList.remove("editing"); canvas.append(el("div", {style:"padding:40px;color:#888;text-align:center;width:100%"}, "No slides yet — click “+ Slide”.")); return; }
  for (const b of slide.blocks) canvas.append(buildBlock(b, true));
  syncCanvas();
}

// Selection happens during capture so nested Plotly/SVG/text elements cannot
// consume the first click before the editor sees it.
$("canvas").addEventListener("pointerdown", (e)=>{
  const target = e.target instanceof Element ? e.target : null;
  const wrap = target ? target.closest(".block[data-bid]") : null;
  if (wrap && $("canvas").contains(wrap)) {
    selectBlock(wrap.dataset.bid);
  } else if (target === $("canvas")) {
    if (S.editingText) stopTextEdit(S.editingText);
    S.sel = null;
    updateSelectionClasses();
    renderTopbar();
    renderInspector();
  }
}, true);

const BODY_CLASS = { text:"body text", image:"body image", shape:"body shape", figure:"body", table:"body table", html:"body html" };

function bodyRenderSig(b) {
  if (b.type === "table") return `${b.table}:${tableVer(b.table)}:${JSON.stringify(b.style || {})}`;
  if (b.type === "text") return `${b.content || ""}:${JSON.stringify(b.style || {})}`;
  if (b.type === "image") return `${b.image || ""}:${imageVer(b.image)}:${JSON.stringify(b.style || {})}`;
  return JSON.stringify(b.style || {});
}

function renderBlockBody(body, b) {
  const sig = bodyRenderSig(b);
  if (body.dataset.renderSig === sig) return;
  body.dataset.renderSig = sig;
  if (b.type === "figure") renderFigureInto(body, b);
  else if (b.type === "table") renderTableInto(body, b);
  else if (b.type === "html") renderHtmlInto(body, b);
  else if (b.type === "image") renderImageInto(body, b);
  else if (b.type === "shape") renderShapeInto(body, b);
  else renderTextInto(body, b);
}

function buildBlock(b, editable) {
  const body = el("div", {class: BODY_CLASS[b.type] || "body"});
  const wrap = el("div", {class:"block "+b.type, id:"blk-"+b.id}, [body]);
  wrap.dataset.bid = b.id;
  renderBlockBody(body, b);
  if (editable) {
    for (const d of ["nw","ne","sw","se"]) {
      const h = el("div", {class:"handle "+d});
      h.addEventListener("pointerdown", (e)=> startResize(e, b, d));
      wrap.append(h);
    }
    const rot = el("div", {class:"handle rot", title:"Drag to rotate"});
    rot.addEventListener("pointerdown", (e)=> startRotate(e, b));
    wrap.append(rot);
    const moveHandle = el("div", {class:"handle move", title:"Drag to move"});
    moveHandle.addEventListener("pointerdown", (e)=>{
      e.preventDefault(); e.stopPropagation(); selectBlock(b.id); startDrag(e, b, true);
    });
    wrap.append(moveHandle);
    if (b.type === "table") body.addEventListener("pointerdown", (e)=>e.stopPropagation());
    wrap.addEventListener("pointerdown", (e)=>{
      if (e.target.classList.contains("handle")) return;   // resize, not move
      if (S.editingText === b.id) return;                  // editing text in place
      if (b.type === "text" && e.detail > 1) return;       // let double-click edit
      startDrag(e, b);
    });
    if (b.type === "text") {
      wrap.addEventListener("dblclick", (e)=>{
        e.preventDefault();
        e.stopPropagation();
        startTextEdit(b.id, e);
      });
    }
  }
  return wrap;
}

function applyGeom(wrap, b) {
  wrap.style.left = (b.x*100)+"%"; wrap.style.top = (b.y*100)+"%";
  wrap.style.width = (b.w*100)+"%"; wrap.style.height = (b.h*100)+"%";
  wrap.style.zIndex = b.z;
  wrap.style.transform = `rotate(${(b.style || {}).rotate || 0}deg)`;
  wrap.style.transformOrigin = "50% 50%";
}

function syncCanvas() {
  const slide = curSlide(); if (!slide) return;
  for (const b of slide.blocks) {
    const wrap = document.getElementById("blk-"+b.id); if (!wrap) continue;
    applyGeom(wrap, b);
    wrap.classList.toggle("selected", b.id === S.sel);
    // Refresh appearance live (style tweaks, swapped image, etc.) — but never
    // rebuild live iframe/Plotly content only when structure changes, and
    // avoid disturbing a block being inline-edited.
    if (!["figure","html"].includes(b.type) && S.editingText !== b.id) renderBlockBody(wrap.querySelector(".body"), b);
  }
}

function applyTextStyle(node, st) {
  const code = st.textVariant === "code";
  node.style.fontFamily = st.fontFamily || (code ? "'Roboto Mono',ui-monospace,SFMono-Regular,Menlo,monospace" : "");
  node.style.fontSize = (st.fontSize || (code ? 16 : 18)) + "px";
  node.style.color = st.color || (code ? "#e5e7eb" : "");
  node.style.textAlign = st.align || "left";
  node.style.fontWeight = st.weight || "";
  node.style.fontStyle = st.italic ? "italic" : "";
  node.style.lineHeight = st.lineHeight || (code ? 1.55 : "");
}

function syncListMarkers(rich) {
  if (!rich.isConnected) {
    queueMicrotask(()=>{ if (rich.isConnected) syncListMarkers(rich); });
    return;
  }
  const markerProperties = [
    "--marker-font-family", "--marker-font-size", "--marker-font-weight",
    "--marker-font-style", "--marker-color",
  ];
  for (const item of rich.querySelectorAll("li")) {
    const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
    let character = null;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement?.closest("li") === item && node.data.replace(/\u200B/g, "").trim()) {
        character = node.parentElement;
        break;
      }
    }
    if (!character) {
      for (const property of markerProperties) item.style.removeProperty(property);
      continue;
    }
    const style = getComputedStyle(character);
    item.style.setProperty("--marker-font-family", style.fontFamily);
    item.style.setProperty("--marker-font-size", style.fontSize);
    item.style.setProperty("--marker-font-weight", style.fontWeight);
    item.style.setProperty("--marker-font-style", style.fontStyle);
    item.style.setProperty("--marker-color", style.color);
  }
}

function renderTextInto(body, b) {
  const st = b.style || {};
  const code = st.textVariant === "code";
  body.classList.toggle("code-text", code);
  body.style.background = Object.prototype.hasOwnProperty.call(st, "bg") ? st.bg : (code ? "#111827" : "transparent");
  let rich = body.querySelector(":scope > .rich");
  if (!rich) {
    body.innerHTML = "";
    rich = el("div", {class:"rich"});
    rich.dataset.bid = b.id;
    attachRichTextHandlers(rich, b.id);
    body.append(rich);
  }
  const editing = S.editingText === b.id;
  if (!editing && rich.innerHTML !== (b.content || "")) rich.innerHTML = b.content || "";
  applyTextStyle(rich, st);
  syncListMarkers(rich);
  setRichEditingState(rich, editing);
}

function setRichEditingState(rich, editing) {
  if (editing) {
    rich.setAttribute("contenteditable", "true");
    rich.setAttribute("spellcheck", "true");
    rich.setAttribute("role", "textbox");
    rich.setAttribute("aria-multiline", "true");
  } else {
    rich.removeAttribute("contenteditable");
    rich.removeAttribute("spellcheck");
    rich.removeAttribute("role");
    rich.removeAttribute("aria-multiline");
  }
}

function attachRichTextHandlers(rich, bid) {
  rich.addEventListener("input", ()=>syncTextContent(bid, rich));
  rich.addEventListener("pointerdown", (e)=>{ if (rich.isContentEditable) e.stopPropagation(); });
  rich.addEventListener("keydown", (e)=>{
    if ((e.metaKey || e.ctrlKey) && ["c","x","v"].includes(e.key.toLowerCase())) {
      e.stopPropagation();
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); rich.blur(); }
  });
  rich.addEventListener("copy", (e)=>e.stopPropagation());
  rich.addEventListener("cut", (e)=>{
    e.stopPropagation();
    queueMicrotask(()=>syncTextContent(bid, rich));
  });
  rich.addEventListener("paste", (e)=>{
    if (!rich.isContentEditable) return;
    e.preventDefault();
    e.stopPropagation();
    const html = e.clipboardData?.getData("text/html") || "";
    const text = e.clipboardData?.getData("text/plain") || "";
    document.execCommand("insertHTML", false, sanitizeRichHtml(html || plainTextToHtml(text)));
    syncTextContent(bid, rich);
  });
  rich.addEventListener("blur", (event)=>{
    const next = event.relatedTarget;
    if (next?.closest?.(".text-selection-control")) return;
    queueMicrotask(()=>{
      if (document.activeElement?.closest?.(".text-selection-control")) return;
      if (!suspendTextBlur && S.editingText === bid && document.activeElement !== rich) stopTextEdit(bid);
    });
  });
}

function syncTextContent(bid, rich, immediate=false) {
  const live = curSlide()?.blocks.find(x=>x.id===bid);
  if (!live) return Promise.resolve();
  syncListMarkers(rich);
  live.content = rich.innerHTML;
  pendingTextContent.set(bid, live.content);
  const body = rich.parentElement;
  if (body) body.dataset.renderSig = bodyRenderSig(live);
  if (immediate) return queueTextSave(bid, live.content);
  pushBlockContent(bid, live.content);
  return Promise.resolve();
}

function canonicalizeTextBlocks() {
  for (const slide of S.slides) {
    for (const b of slide.blocks) {
      if (b.type !== "text") continue;
      const legacyMode = (b.style || {}).textMode;
      const needsContent = b.content === null || b.content === undefined;
      if (needsContent) {
        const raw = b.markdown || "";
        const html = legacyMode === "rich"
          ? raw
          : (window.marked ? window.marked.parse(raw) : plainTextToHtml(raw));
        b.content = sanitizeRichHtml(html);
      }
      if (legacyMode !== undefined) {
        b.style = Object.assign({}, b.style || {});
        delete b.style.textMode;
      }
      if ((needsContent || legacyMode !== undefined) && !legacyTextMigrations.has(b.id)) {
        legacyTextMigrations.add(b.id);
        patchBlock(b.id, {content:b.content || "", style:b.style || {}})
          .catch(()=>legacyTextMigrations.delete(b.id));
      }
    }
  }
}

function sanitizeRichHtml(input) {
  if (!input) return "";
  const parsed = new DOMParser().parseFromString(`<body>${input}</body>`, "text/html");
  const output = document.createElement("div");
  const allowed = new Set(["P","BR","H1","H2","H3","UL","OL","LI","BLOCKQUOTE","STRONG","EM","U","S","A","CODE","PRE","HR","SUB","SUP","SPAN"]);
  const dropped = new Set(["SCRIPT","STYLE","IFRAME","OBJECT","EMBED","FORM","INPUT","BUTTON","SVG","MATH"]);
  const copyChildren = (source, target)=>{
    for (const child of source.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent || "").replace(/\u200B/g, "");
        if (text) target.append(document.createTextNode(text));
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      let tag = child.tagName.toUpperCase();
      if (dropped.has(tag)) continue;
      if (tag === "DIV") tag = "P";
      if (tag === "B") tag = "STRONG";
      if (tag === "I") tag = "EM";
      if (!allowed.has(tag)) { copyChildren(child, target); continue; }
      const clean = document.createElement(tag.toLowerCase());
      if (tag === "A") {
        const href = child.getAttribute("href") || "";
        if (/^(https?:|mailto:|#)/i.test(href)) {
          clean.setAttribute("href", href);
          if (/^https?:/i.test(href)) clean.setAttribute("target", "_blank");
          clean.setAttribute("rel", "noopener noreferrer");
        }
      }
      if (tag === "SPAN") {
        const safe = [];
        const weight = child.style.fontWeight.toLowerCase();
        const fontStyle = child.style.fontStyle.toLowerCase();
        const decoration = child.style.textDecorationLine.toLowerCase();
        const fontFamily = child.style.fontFamily.trim();
        const fontSize = child.style.fontSize.trim().toLowerCase();
        const color = child.style.color.trim().toLowerCase();
        if (/^(normal|bold|bolder|lighter|[1-9]00)$/.test(weight)) safe.push(`font-weight:${weight}`);
        if (/^(normal|italic)$/.test(fontStyle)) safe.push(`font-style:${fontStyle}`);
        if (/^(none|underline|line-through|underline line-through|line-through underline)$/.test(decoration)) safe.push(`text-decoration-line:${decoration}`);
        if (fontFamily && fontFamily.length <= 160 && !/[;{}<>]/.test(fontFamily)) safe.push(`font-family:${fontFamily}`);
        if (/^(?:[6-9]|[1-9]\d|[12]\d\d|300)px$/.test(fontSize)) safe.push(`font-size:${fontSize}`);
        if (color && color.length <= 80 && !/[;{}<>]/.test(color)) safe.push(`color:${color}`);
        if (safe.length) clean.setAttribute("style", safe.join(";"));
      }
      if (tag === "LI") {
        const safe = [];
        const markerFamily = child.style.getPropertyValue("--marker-font-family").trim();
        const markerSize = child.style.getPropertyValue("--marker-font-size").trim().toLowerCase();
        const markerWeight = child.style.getPropertyValue("--marker-font-weight").trim().toLowerCase();
        const markerStyle = child.style.getPropertyValue("--marker-font-style").trim().toLowerCase();
        const markerColor = child.style.getPropertyValue("--marker-color").trim().toLowerCase();
        if (markerFamily && markerFamily.length <= 160 && !/[;{}<>]/.test(markerFamily)) safe.push(`--marker-font-family:${markerFamily}`);
        if (/^(?:[6-9]|[1-9]\d|[12]\d\d|300)px$/.test(markerSize)) safe.push(`--marker-font-size:${markerSize}`);
        if (/^(normal|bold|bolder|lighter|[1-9]00)$/.test(markerWeight)) safe.push(`--marker-font-weight:${markerWeight}`);
        if (/^(normal|italic)$/.test(markerStyle)) safe.push(`--marker-font-style:${markerStyle}`);
        if (markerColor && markerColor.length <= 80 && !/[;{}<>]/.test(markerColor)) safe.push(`--marker-color:${markerColor}`);
        if (safe.length) clean.setAttribute("style", safe.join(";"));
      }
      copyChildren(child, clean);
      if (tag === "SPAN" && !clean.hasChildNodes()) continue;
      target.append(clean);
    }
  };
  copyChildren(parsed.body, output);
  return output.innerHTML;
}

function plainTextToHtml(text) {
  if (!text) return "";
  const escape = (value)=>{ const node=document.createElement("div"); node.textContent=value; return node.innerHTML; };
  return text.split(/\n{2,}/).map(block=>`<p>${escape(block).replace(/\n/g,"<br>")}</p>`).join("");
}

function plainTextFromHtml(html) {
  if (!html) return "";
  return new DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body.textContent.trim();
}

function renderImageInto(body, b) {
  const st = b.style || {};
  body.style.opacity = (st.opacity ?? 1);
  body.style.background = st.bg || "transparent";
  const asset = b.image ? S.images.find(image=>image.name===b.image) : null;
  const src = asset
    ? `./render_image?image=${encodeURIComponent(asset.name)}&v=${asset.version || 0}`
    : (st.src || "");
  if (!src) { body.innerHTML = ""; body.append(el("div", {class:"ph"}, "No image yet — choose an asset, file, or URL.")); return; }
  let img = body.querySelector("img");
  if (!img) {
    body.innerHTML = "";
    img = el("img", {draggable:"false", decoding:"async"});
    img.addEventListener("error", async ()=>{
      if (!img.isConnected) return;
      const failedSrc = img.getAttribute("src") || "";
      let message = "Unable to render this image.";
      if (asset && failedSrc) {
        try {
          const response = await fetch(failedSrc, {cache:"no-store"});
          const detail = (await response.text()).trim();
          if (detail && !response.ok) message = detail;
        } catch (_) {}
      }
      if (!img.isConnected || img.getAttribute("src") !== failedSrc) return;
      body.innerHTML = "";
      body.append(el("div", {class:"ph", title:message}, message));
    });
    body.append(img);
  }
  if (img.getAttribute("src") !== src) img.setAttribute("src", src);
  img.alt = st.alt || asset?.alt || asset?.title || "";
  img.style.objectFit = st.fit || "contain";
  img.style.borderRadius = (st.radius || 0) + "px";
  img.style.imageRendering = st.rendering || "auto";
}

function renderShapeInto(body, b) {
  const st = b.style || {};
  body.style.opacity = (st.opacity ?? 1);
  body.style.filter = st.shadow ? `drop-shadow(0 ${st.shadow}px ${st.shadow * 2}px rgba(0,0,0,.28))` : "";
  body.innerHTML = shapeSvg(st);
}

const SHAPE_OPTIONS = [
  ["rect", "Rectangle"], ["round-rect", "Rounded rectangle"], ["ellipse", "Ellipse"], ["triangle", "Triangle"],
  ["diamond", "Diamond"], ["pentagon", "Pentagon"], ["hexagon", "Hexagon"], ["star", "Star"],
  ["chevron", "Chevron"], ["arrow-right", "Block arrow"], ["line", "Line"], ["arrow-line", "Arrow line"],
];
const LINE_SHAPES = new Set(["line", "arrow-line"]);
const POLY_POINTS = {
  triangle:"50,3 97,97 3,97",
  diamond:"50,2 98,50 50,98 2,50",
  pentagon:"50,3 97,38 79,97 21,97 3,38",
  hexagon:"25,4 75,4 98,50 75,96 25,96 2,50",
  star:"50,4 61,36 96,36 68,56 79,91 50,70 21,91 32,56 4,36 39,36",
  chevron:"12,6 62,6 92,50 62,94 12,94 42,50",
  "arrow-right":"4,20 66,20 66,4 98,50 66,96 66,80 4,80",
};

function escAttr(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
function strokeDash(st) {
  const dash = st.dash || "solid";
  if (dash === "dash") return "10 7";
  if (dash === "dot") return "2 6";
  if (dash === "long") return "18 8";
  return "";
}
function shapeCommonAttrs(st, fillDefault=true) {
  const fill = fillDefault ? (st.fill || "#5b8cff") : "none";
  const stroke = (st.stroke && st.stroke !== "transparent" && st.stroke !== "none") ? st.stroke : "none";
  const sw = Number(st.strokeWidth || 0);
  const dash = strokeDash(st);
  return `fill="${escAttr(fill)}" stroke="${escAttr(stroke)}" stroke-width="${sw}" ${dash ? `stroke-dasharray="${dash}"` : ""} stroke-linecap="${escAttr(st.lineCap || "round")}" stroke-linejoin="${escAttr(st.lineJoin || "round")}" vector-effect="non-scaling-stroke"`;
}
function shapeSvg(st) {
  const shape = st.shape || "rect";
  const fill = st.fill || "#5b8cff";
  const stroke = (st.stroke && st.stroke !== "transparent" && st.stroke !== "none") ? st.stroke : fill;
  const sw = Number(st.strokeWidth || (LINE_SHAPES.has(shape) ? 4 : 0));
  const dash = strokeDash(st);
  const common = shapeCommonAttrs(st, !LINE_SHAPES.has(shape));
  let inner = "";
  if (shape === "ellipse") {
    inner = `<ellipse cx="50" cy="50" rx="48" ry="48" ${common}/>`;
  } else if (shape === "round-rect") {
    inner = `<rect x="1" y="1" width="98" height="98" rx="${Number(st.radius ?? 16)}" ry="${Number(st.radius ?? 16)}" ${common}/>`;
  } else if (shape === "rect") {
    inner = `<rect x="1" y="1" width="98" height="98" rx="${Number(st.radius || 0)}" ry="${Number(st.radius || 0)}" ${common}/>`;
  } else if (shape === "line" || shape === "arrow-line") {
    const marker = shape === "arrow-line" ? `<defs><marker id="arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L10,5 L0,10 Z" fill="${escAttr(stroke)}"/></marker></defs>` : "";
    inner = `${marker}<line x1="4" y1="50" x2="96" y2="50" stroke="${escAttr(stroke)}" stroke-width="${sw}" ${dash ? `stroke-dasharray="${dash}"` : ""} stroke-linecap="${escAttr(st.lineCap || "round")}" vector-effect="non-scaling-stroke" ${shape === "arrow-line" ? `marker-end="url(#arrowhead)"` : ""}/>`;
  } else {
    inner = `<polygon points="${POLY_POINTS[shape] || POLY_POINTS.triangle}" ${common}/>`;
  }
  return `<svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style="display:block;overflow:visible">${inner}</svg>`;
}

function queueTextSave(bid, content) {
  pendingTextContent.set(bid, content);
  const previous = textSaveChains.get(bid) || Promise.resolve();
  const next = previous.catch(()=>{}).then(()=>patchBlock(bid, {content}));
  textSaveChains.set(bid, next);
  return next.finally(()=>{
    if (textSaveChains.get(bid) === next) textSaveChains.delete(bid);
    if (pendingTextContent.get(bid) === content && !textSaveChains.has(bid)) pendingTextContent.delete(bid);
  });
}
const pushBlockContent = debounce((bid, content)=> queueTextSave(bid, content), 220);

function startTextEdit(bid, event=null) {
  if (S.editingText && S.editingText !== bid) stopTextEdit(S.editingText);
  S.editingText = bid;
  S.sel = bid;
  const wrap = document.getElementById("blk-"+bid); if (!wrap) return;
  const block = curSlide()?.blocks.find(x=>x.id===bid); if (!block) return;
  const body = wrap.querySelector(".body");
  renderTextInto(body, block);
  const rich = body.querySelector(":scope > .rich");
  if (!rich) return;
  rich.focus({preventScroll:true});
  if (event) placeCaretFromPoint(event, rich);
  else if (!restoreTextSelection(bid, rich)) placeCaretAtEnd(rich);
  updateEditTextButton();
  updateRichToolbarState();
  updateCharacterControlState(bid, rich);
  return rich;
}

function stopTextEdit(bid=S.editingText) {
  if (!bid || S.editingText !== bid) return Promise.resolve();
  const wrap = document.getElementById("blk-"+bid);
  const b = curSlide()?.blocks.find(x=>x.id===bid);
  const rich = wrap?.querySelector(":scope > .body > .rich");
  let saved = Promise.resolve();
  if (rich && b) {
    pushBlockContent.cancel();
    const clean = sanitizeRichHtml(rich.innerHTML);
    if (clean !== rich.innerHTML) rich.innerHTML = clean;
    saved = syncTextContent(bid, rich, true);
  }
  S.editingText = null;
  if (rich) setRichEditingState(rich, false);
  savedTextRange = null;
  savedTextBid = null;
  updateEditTextButton();
  updateRichToolbarState();
  if (rich) updateCharacterControlState(bid, rich);
  return saved;
}

function updateEditTextButton() {
  const button = document.querySelector("#inspector .edit-text");
  if (!button) return;
  const editing = !!S.editingText && S.editingText === S.sel;
  button.textContent = editing ? "Finish editing" : "Edit text";
}

function placeCaretFromPoint(event, root) {
  if (!event) return;
  let range = null;
  if (document.caretRangeFromPoint) range = document.caretRangeFromPoint(event.clientX, event.clientY);
  else if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(event.clientX, event.clientY);
    if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); }
  }
  if (!range || !root.contains(range.startContainer)) return;
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  saveTextSelection(root.dataset.bid, root);
}

function placeCaretAtEnd(root) {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  saveTextSelection(root.dataset.bid, root);
}

function saveTextSelection(bid, root) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || !root.contains(selection.anchorNode)) return;
  savedTextRange = selection.getRangeAt(0).cloneRange();
  savedTextBid = bid;
}

function restoreTextSelection(bid, root) {
  if (!savedTextRange || savedTextBid !== bid || !root.contains(savedTextRange.commonAncestorContainer)) return false;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(savedTextRange);
  return true;
}

async function renderFigureInto(body, b) {
  body.innerHTML = "";
  if (!b.figure) { body.append(el("div",{class:"err"},"No figure assigned.")); return; }
  const requestToken = `${b.figure}:${b.table || ""}:${tableVer(b.table)}:${++renderRequestSeq}`;
  body.dataset.requestToken = requestToken;
  const tableQuery = b.table ? `&table=${encodeURIComponent(b.table)}` : "";
  let res;
  try { res = await api(`./render?figure=${encodeURIComponent(b.figure)}${tableQuery}`); }
  catch (err) { res = {ok:false, error:String(err)}; }
  if (!body.isConnected || body.dataset.requestToken !== requestToken) return;
  if (res.ok) {
    const fig = JSON.parse(res.plotly);
    const layout = Object.assign({autosize:true, margin:{l:48,r:18,t:28,b:40}, paper_bgcolor:"rgba(0,0,0,0)", plot_bgcolor:"rgba(0,0,0,0)"}, fig.layout||{});
    // Notebook figures often carry fixed pixel dimensions. Inside cast, the
    // slide block owns the size, so fixed Plotly width/height would clip.
    delete layout.width;
    delete layout.height;
    layout.autosize = true;
    Plotly.newPlot(body, fig.data, layout, {responsive:true, displaylogo:false, displayModeBar:S.present});
  } else {
    body.append(el("div", {class:"err"}, res.error));
  }
}

async function renderTableInto(body, b) {
  body.innerHTML = "";
  if (!b.table) { body.append(el("div",{class:"err"},"No data assigned.")); return; }
  const st = b.style || {};
  const limit = clamp(Number(st.rowLimit || 200), 1, 1000);
  const requestToken = `${b.table}:${tableVer(b.table)}:${limit}:${++renderRequestSeq}`;
  body.dataset.requestToken = requestToken;
  body.append(el("div", {class:"table-empty"}, "Loading data..."));
  let res;
  try { res = await api(`./render_table?table=${encodeURIComponent(b.table)}&limit=${limit}`); }
  catch (err) { res = {ok:false, error:String(err)}; }
  if (!body.isConnected || body.dataset.requestToken !== requestToken) return;
  body.innerHTML = "";
  if (!res.ok) { body.append(el("div", {class:"err"}, res.error || "Unable to render table.")); return; }

  body.style.background = st.bg || "#ffffff";
  body.style.borderColor = st.borderColor || "rgba(31,41,55,.16)";
  body.style.fontSize = (st.fontSize || 12) + "px";
  const meta = el("div", {class:"table-meta"}, [
    el("strong", {}, res.title || b.table),
    el("span", {}, `${(res.rows || []).length}${res.truncated ? "+" : ""} rows`),
  ]);
  if (st.headerBg) meta.style.background = st.headerBg;
  const scroll = el("div", {class:"table-scroll"});
  const table = el("table", {class:`data-table${st.compact ? " compact" : ""}${st.striped === false ? " no-stripes" : ""}`});
  table.style.fontSize = (st.fontSize || 12) + "px";
  const headRow = el("tr");
  if (st.showIndex !== false) headRow.append(el("th", {class:"row-index"}, "#"));
  for (const col of (res.columns || [])) {
    const th = el("th", {class:col.numeric ? "numeric" : "", title:`${col.name} (${col.dtype})`}, col.name);
    if (st.headerBg) th.style.background = st.headerBg;
    if (st.headerColor) th.style.color = st.headerColor;
    headRow.append(th);
  }
  const thead = el("thead", {}, headRow);
  table.append(thead);
  const tbody = el("tbody");
  for (const [rowIndex, row] of (res.rows || []).entries()) {
    const tr = el("tr");
    if (st.showIndex !== false) tr.append(el("td", {class:"row-index"}, String(rowIndex + 1)));
    row.forEach((value, index)=>{
      const column = (res.columns || [])[index] || {};
      tr.append(el("td", {class:column.numeric ? "numeric" : "", title:value}, value));
    });
    tbody.append(tr);
  }
  table.append(tbody);
  scroll.append(table);
  body.append(meta, scroll);
}

async function renderHtmlInto(body, b) {
  body.innerHTML = "";
  if (!b.html) { body.append(el("div",{class:"err"},"No HTML object assigned.")); return; }
  const requestToken = `${b.html}:${htmlVer(b.html)}:${++renderRequestSeq}`;
  body.dataset.requestToken = requestToken;
  let res;
  try { res = await api(`./render_html?html=${encodeURIComponent(b.html)}`); }
  catch (err) { res = {ok:false, error:String(err)}; }
  if (!body.isConnected || body.dataset.requestToken !== requestToken) return;
  if (res.ok) {
    const iframe = el("iframe", {
      sandbox:"allow-scripts allow-forms allow-popups allow-modals",
      title:(S.htmls.find(h=>h.name===b.html)||{}).title || b.html,
    });
    iframe.srcdoc = res.html || "";
    body.append(iframe);
  } else {
    body.append(el("div", {class:"err"}, res.error));
  }
}

/* ---------------- drag / resize ---------------- */
function trackPointer(e, onMove, onEnd) {
  const target = e.currentTarget;
  const pointerId = e.pointerId;
  let finished = false;
  const move = (ev)=>{ if (ev.pointerId === pointerId) onMove(ev); };
  const finish = (ev)=>{
    if (finished || (ev.pointerId !== undefined && ev.pointerId !== pointerId)) return;
    finished = true;
    target.removeEventListener("pointermove", move);
    target.removeEventListener("pointerup", finish);
    target.removeEventListener("pointercancel", finish);
    target.removeEventListener("lostpointercapture", finish);
    try { if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId); } catch (_) {}
    onEnd(ev.type === "pointercancel");
  };
  target.addEventListener("pointermove", move);
  target.addEventListener("pointerup", finish);
  target.addEventListener("pointercancel", finish);
  target.addEventListener("lostpointercapture", finish);
  try { target.setPointerCapture(pointerId); } catch (_) {}
}

function settleInteraction(save) {
  S.dragging = false;
  document.body.style.userSelect = "";
  Promise.resolve(save).catch(()=>{}).finally(()=>refresh());
}

// Move the whole block. A small movement threshold keeps plain clicks (select)
// and double-clicks (edit text) from being treated as drags.
function startDrag(e, b, immediate=false) {
  if (e.button !== 0) return;
  const rect = $("canvas").getBoundingClientRect();
  const sx = e.clientX, sy = e.clientY;
  const ox = b.x, oy = b.y;
  const wrap = document.getElementById("blk-"+b.id);
  let active = immediate;
  if (active) { S.dragging = true; document.body.style.userSelect = "none"; }
  function move(ev) {
    if (!active) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
      active = true; S.dragging = true; document.body.style.userSelect = "none";
    }
    const dx = (ev.clientX - sx)/rect.width, dy = (ev.clientY - sy)/rect.height;
    b.x = clamp(snap(ox+dx, 1/96, ev.shiftKey), 0, 1-b.w); b.y = clamp(snap(oy+dy, 1/96, ev.shiftKey), 0, 1-b.h);
    applyGeom(wrap, b);
  }
  trackPointer(e, move, ()=>{
    if (active) settleInteraction(patchBlock(b.id, {x:b.x, y:b.y}));
  });
}

// Resize from any corner handle.
function startResize(e, b, dir) {
  e.preventDefault(); e.stopPropagation();
  selectBlock(b.id);
  const rect = $("canvas").getBoundingClientRect();
  const sx = e.clientX, sy = e.clientY;
  const ox = b.x, oy = b.y, ow = b.w, oh = b.h;
  const wrap = document.getElementById("blk-"+b.id);
  const west = dir.includes("w"), north = dir.includes("n"),
        east = dir.includes("e"), south = dir.includes("s");
  const MIN = 0.03;
  S.dragging = true; document.body.style.userSelect = "none";
  function move(ev) {
    const dx = (ev.clientX - sx)/rect.width, dy = (ev.clientY - sy)/rect.height;
    if (east)  b.w = clamp(snap(ow + dx, 1/96, ev.shiftKey), MIN, 1 - ox);
    if (south) b.h = clamp(snap(oh + dy, 1/96, ev.shiftKey), MIN, 1 - oy);
    if (west)  { const nx = clamp(snap(ox + dx, 1/96, ev.shiftKey), 0, ox + ow - MIN); b.w = ow + (ox - nx); b.x = nx; }
    if (north) { const ny = clamp(snap(oy + dy, 1/96, ev.shiftKey), 0, oy + oh - MIN); b.h = oh + (oy - ny); b.y = ny; }
    applyGeom(wrap, b);
    if (b.type === "figure") { try { Plotly.Plots.resize(wrap.querySelector(".body")); } catch(_){} }
  }
  trackPointer(e, move, ()=>settleInteraction(patchBlock(b.id, {x:b.x, y:b.y, w:b.w, h:b.h})));
}

function startRotate(e, b) {
  e.preventDefault(); e.stopPropagation();
  selectBlock(b.id);
  const wrap = document.getElementById("blk-"+b.id);
  const box = wrap.getBoundingClientRect();
  const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
  const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
  const startRotate = Number((b.style || {}).rotate || 0);
  S.dragging = true; document.body.style.userSelect = "none";
  function move(ev) {
    const angle = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI;
    let next = startRotate + angle - startAngle;
    if (ev.shiftKey) next = Math.round(next / 15) * 15;
    b.style = Object.assign({}, b.style || {}, {rotate: Math.round(next)});
    applyGeom(wrap, b);
  }
  trackPointer(e, move, ()=>{
    settleInteraction(patchBlock(b.id, {style:b.style}));
    renderInspector();
  });
}

function updateSelectionClasses() {
  const slide = curSlide(); if (!slide) return;
  for (const b of slide.blocks) {
    const wrap = document.getElementById("blk-"+b.id);
    if (wrap) wrap.classList.toggle("selected", b.id === S.sel);
  }
}
function selectBlock(bid) {
  if (S.sel === bid) { updateSelectionClasses(); return; }
  if (S.editingText && S.editingText !== bid) stopTextEdit(S.editingText);
  S.sel = bid;
  updateSelectionClasses();
  renderTopbar();
  renderInspector();
}

function orderedBlocks() {
  return [...(curSlide()?.blocks || [])].sort((a,b)=>(a.z || 0)-(b.z || 0));
}

async function moveLayer(bid, direction) {
  if (layerSaving || S.dragging) return;
  if (S.editingText) await stopTextEdit(S.editingText);
  const blocks = orderedBlocks(), index = blocks.findIndex(b=>b.id === bid);
  if (index < 0) return;
  const target = direction === "front" ? blocks.length-1 : direction === "back" ? 0
    : clamp(index+(direction === "up" ? 1 : -1), 0, blocks.length-1);
  if (target === index) return;
  const [block] = blocks.splice(index, 1);
  blocks.splice(target, 0, block);
  layerSaving = true;
  renderLayers();
  try {
    // Normalize tied legacy z values as well as the moved object.
    for (let i=0; i<blocks.length; i++) {
      if (blocks[i].z === i) continue;
      const result = await api(`./blocks/${blocks[i].id}`, jbody("PATCH", {z:i}));
      if (!result.ok) throw new Error(result.error || "Layer change failed");
      blocks[i].z = i;
    }
    syncCanvas();
  } catch (error) {
    showStatus("Could not change layer order", 3000);
  } finally {
    layerSaving = false;
    await refresh();
  }
}

function renderLayers() {
  const panel = $("layers"), blocks = orderedBlocks().reverse();
  const focused = panel.contains(document.activeElement) ? document.activeElement.dataset.focusKey : null;
  panel.replaceChildren();
  const selected = blocks.findIndex(b=>b.id === S.sel);
  const tools = el("div", {class:"layer-tools"});
  for (const [icon, label, direction] of [
    ["arrow-up-to-line", "Bring to front", "front"], ["arrow-up", "Bring forward", "up"],
    ["arrow-down", "Send backward", "down"], ["arrow-down-to-line", "Send to back", "back"],
  ]) {
    const button = iconButton(icon, label, ()=>moveLayer(S.sel, direction));
    button.dataset.focusKey = direction;
    button.disabled = layerSaving || selected < 0 || (["front","up"].includes(direction) ? selected === 0 : selected === blocks.length-1);
    tools.append(button);
  }
  const duplicate = iconButton("copy", "Duplicate object", ()=>duplicateBlock(blocks.find(b=>b.id === S.sel)));
  duplicate.disabled = selected < 0 || layerSaving;
  duplicate.dataset.focusKey = "duplicate";
  tools.append(duplicate);
  panel.append(tools, el("p", {class:"panel-summary"}, `${blocks.length} object${blocks.length === 1 ? "" : "s"}`));
  const icons = {text:"type", shape:"shapes", figure:"chart-no-axes-combined", table:"table2", html:"code", image:"image"};
  for (const b of blocks) {
    const name = blockLabel(b);
    const button = el("button", {class:"layer-item", title:name, "aria-pressed":String(b.id === S.sel), onclick:()=>selectBlock(b.id)});
    button.dataset.focusKey = b.id;
    button.append(window.castIcon(icons[b.type] || "shapes"), el("span", {class:"layer-name"}, name), el("span", {class:"layer-type"}, b.type));
    panel.append(button);
  }
  if (focused) [...panel.querySelectorAll("button")].find(button=>button.dataset.focusKey === focused)?.focus({preventScroll:true});
}

/* ---------------- inspector ---------------- */
const FONTS = [
  ["System", "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"],
  ["Inter", "'Inter',sans-serif"],
  ["Poppins", "'Poppins',sans-serif"],
  ["Playfair Display", "'Playfair Display',serif"],
  ["Georgia", "Georgia,'Times New Roman',serif"],
  ["Roboto Mono", "'Roboto Mono',ui-monospace,monospace"],
];

const THEME_PRESETS = {
  studio: {accent:"#5b8cff", bg:"#ffffff", fg:"#1a1d24", font:"'Inter',sans-serif"},
  paper:  {accent:"#0f766e", bg:"#fbfaf7", fg:"#22201c", font:"Georgia,'Times New Roman',serif"},
  night:  {accent:"#f59e0b", bg:"#111827", fg:"#f8fafc", font:"'Poppins',sans-serif"},
  mint:   {accent:"#16a34a", bg:"#f3fff8", fg:"#14342b", font:"'Inter',sans-serif"},
};

function renderInspector() {
  renderLayers();
  const ins = $("inspector");
  const slide = curSlide();
  const b = slide ? slide.blocks.find(x=>x.id===S.sel) : null;
  ins.innerHTML = "";
  if (!b) {
    ins.append(el("h3", {}, slide ? `Slide ${S.cur+1}` : "Presentation"));
    if (slide) {
      ins.append(el("p", {class:"panel-summary"}, `${slide.blocks.length} objects`));
      ins.append(el("button", {class:"icon-button", onclick:()=>duplicateSlide()}, [window.castIcon("copy"), "Duplicate slide"]));
    }
    return;
  }
  const st = b.style || {};
  const rows = [
    el("h3", {}, "Arrange"),
    el("div", {class:"quick"}, [
      iconButton("align-start-vertical", "Align left", ()=>alignBlock(b, "left")),
      iconButton("align-center-vertical", "Align center", ()=>alignBlock(b, "hcenter")),
      iconButton("align-end-vertical", "Align right", ()=>alignBlock(b, "right")),
      iconButton("align-start-horizontal", "Align top", ()=>alignBlock(b, "top")),
      iconButton("align-center-horizontal", "Align middle", ()=>alignBlock(b, "vcenter")),
      iconButton("align-end-horizontal", "Align bottom", ()=>alignBlock(b, "bottom")),
    ]),
    el("div", {class:"split"}, [
      el("button", {onclick:()=>duplicateBlock(b)}, "Duplicate"),
      el("button", {onclick:()=>sendBackward(b)}, "Send back"),
    ]),
    el("div", {class:"section"}),
  ];
  if (b.type === "text") {
    rows.push(el("h3", {}, "Text"));
    rows.push(styleRow("Style", selectInput(
      ["plain","code"], st.textVariant||"plain", v=>setTextVariant(b, v), ["Plain","Code"]
    )));
    rows.push(richToolbar(b));
    const editing = S.editingText === b.id;
    rows.push(el("button", {
      class:"edit-text",
      onmousedown:(event)=>event.preventDefault(),
      onclick:()=>S.editingText === b.id ? stopTextEdit(b.id) : startTextEdit(b.id),
    }, editing ? "Finish editing" : "Edit text"));
    rows.push(styleRow("Font", preserveTextSelectionControl(
      fontSelect(st.fontFamily||"", v=>applyCharacterStyle(b, "font-family", v)), b.id, "font-family"
    )));
    rows.push(styleRow("Size", preserveTextSelectionControl(
      numInput(st.fontSize||18, 8, 200, v=>applyCharacterStyle(b, "font-size", `${v}px`)), b.id, "font-size"
    )));
    rows.push(styleRow("Line height", numInput(st.lineHeight||1.45, 0.8, 3, v=>patchStyle(b, {lineHeight:v}), 0.05)));
    rows.push(styleRow("Color", preserveTextSelectionControl(
      colorInput(st.color||"#1a1d24", v=>applyCharacterStyle(b, "color", v)), b.id, "color"
    )));
    rows.push(styleRow("Background", fillControl(st.bg||"transparent", v=>patchStyle(b, {bg:v}))));
    rows.push(styleRow("Align", selectInput(["left","center","right"], st.align||"left", v=>patchStyle(b, {align:v}))));
    rows.push(styleRow("Weight", preserveTextSelectionControl(
      selectInput(["normal","600","bold"], st.weight||"normal", v=>applyCharacterStyle(b, "font-weight", v)), b.id, "font-weight"
    )));
    rows.push(styleRow("Italic", preserveTextSelectionControl(
      toggleInput(!!st.italic, v=>applyCharacterStyle(b, "font-style", v ? "italic" : "normal")), b.id, "font-style"
    )));
  } else if (b.type === "image") {
    rows.push(el("h3", {}, "Image"));
    rows.push(styleRow("Asset", selectInput(
      [""].concat(S.images.map(image=>image.name)), b.image || "", v=>bindImageAsset(b, v),
      ["Uploaded / URL"].concat(S.images.map(image=>image.title))
    )));
    rows.push(el("div", {class:"row stack"}, [el("label",{},"Upload"), fileInput(dataUrl=>setManualImage(b, dataUrl))]));
    rows.push(el("div", {class:"row stack"}, [el("label",{},"Or image URL"), textInput(
      !b.image && st.src && !st.src.startsWith("data:") ? st.src : "",
      v=>setManualImage(b, v), "https://…"
    )]));
    rows.push(styleRow("Fit", selectInput(["contain","cover","fill"], st.fit||"contain", v=>patchStyle(b, {fit:v}), ["Contain","Cover","Stretch"])));
    rows.push(styleRow("Ratio", el("button", {onclick:()=>fitImageToSource(b)}, "Use source ratio")));
    rows.push(styleRow("Rendering", selectInput(
      ["auto","crisp-edges","pixelated"], st.rendering||"auto", v=>patchStyle(b, {rendering:v}),
      ["Smooth","Crisp edges","Pixelated"]
    )));
    rows.push(styleRow("Background", fillControl(st.bg||"transparent", v=>patchStyle(b, {bg:v}))));
    rows.push(el("div", {class:"row stack"}, [el("label",{},"Alt text"), textInput(st.alt||"", v=>patchStyle(b, {alt:v}), "Describe the image")]));
    rows.push(styleRow("Corner", numInput(st.radius||0, 0, 200, v=>patchStyle(b, {radius:v}))));
    rows.push(styleRow("Opacity", rangeInput(st.opacity ?? 1, 0, 1, 0.05, v=>patchStyle(b, {opacity:v}))));
  } else if (b.type === "shape") {
    rows.push(el("h3", {}, "Shape"));
    rows.push(shapePicker(st.shape || "rect", v=>patchStyle(b, normalizeShapePatch(b, {shape:v}))));
    rows.push(styleRow("Type", selectInput(SHAPE_OPTIONS.map(s=>s[0]), st.shape||"rect", v=>patchStyle(b, normalizeShapePatch(b, {shape:v})), SHAPE_OPTIONS.map(s=>s[1]))));
    rows.push(el("div", {class:"row stack"}, [el("label",{},"Swatches"), shapeSwatches(c=>patchStyle(b, {fill:c, stroke:c === "transparent" ? (st.stroke || "transparent") : st.stroke}))]));
    if (!LINE_SHAPES.has(st.shape||"rect"))
      rows.push(styleRow("Fill", fillControl(st.fill||"#5b8cff", v=>patchStyle(b, {fill:v}))));
    rows.push(styleRow("Stroke", fillControl(st.stroke||"transparent", v=>patchStyle(b, {stroke:v}))));
    rows.push(styleRow("Stroke width", rangeInput(st.strokeWidth ?? (LINE_SHAPES.has(st.shape||"rect") ? 4 : 0), 0, 32, 1, v=>patchStyle(b, {strokeWidth:v}))));
    rows.push(styleRow("Stroke style", selectInput(["solid","dash","dot","long"], st.dash||"solid", v=>patchStyle(b, {dash:v}), ["solid","dashed","dotted","long dash"])));
    rows.push(styleRow("Line cap", selectInput(["round","butt","square"], st.lineCap||"round", v=>patchStyle(b, {lineCap:v}), ["round","flat","square"])));
    if (["rect","round-rect"].includes(st.shape||"rect"))
      rows.push(styleRow("Corner", numInput(st.radius||0, 0, 50, v=>patchStyle(b, {radius:v}))));
    rows.push(styleRow("Shadow", rangeInput(st.shadow || 0, 0, 24, 1, v=>patchStyle(b, {shadow:v}))));
    rows.push(styleRow("Opacity", rangeInput(st.opacity ?? 1, 0, 1, 0.05, v=>patchStyle(b, {opacity:v}))));
  } else if (b.type === "table") {
    rows.push(el("h3", {}, "Table"));
    rows.push(styleRow("Data", selectInput(S.tables.map(t=>t.name), b.table, v=>{
      const live = curSlide()?.blocks.find(x=>x.id===b.id); if (live) live.table = v;
      renderCanvas(); patchBlock(b.id, {table:v});
    }, S.tables.map(t=>t.title))));
    rows.push(styleRow("Rows", selectInput([25,50,100,200,500,1000], Number(st.rowLimit || 200), v=>patchStyle(b, {rowLimit:Number(v)}))));
    rows.push(styleRow("Font size", rangeInput(st.fontSize || 12, 9, 22, 1, v=>patchStyle(b, {fontSize:v}))));
    rows.push(styleRow("Compact", toggleInput(!!st.compact, v=>patchStyle(b, {compact:v}))));
    rows.push(styleRow("Striped", toggleInput(st.striped !== false, v=>patchStyle(b, {striped:v}))));
    rows.push(styleRow("Row numbers", toggleInput(st.showIndex !== false, v=>patchStyle(b, {showIndex:v}))));
    rows.push(styleRow("Header", colorInput(st.headerBg || "#eef2f7", v=>patchStyle(b, {headerBg:v}))));
    rows.push(styleRow("Header text", colorInput(st.headerColor || "#374151", v=>patchStyle(b, {headerColor:v}))));
    rows.push(styleRow("Background", colorInput(st.bg || "#ffffff", v=>patchStyle(b, {bg:v}))));
    rows.push(styleRow("Border", colorInput(st.borderColor || "#d1d5db", v=>patchStyle(b, {borderColor:v}))));
  } else if (b.type === "html") {
    rows.push(el("h3", {}, "HTML"));
    rows.push(styleRow("Object", selectInput(S.htmls.map(h=>h.name), b.html, v=>{
      const live = curSlide()?.blocks.find(x=>x.id===b.id); if (live) live.html = v;
      renderCanvas(); patchBlock(b.id, {html:v});
    }, S.htmls.map(h=>h.title))));
    rows.push(styleRow("Refresh", el("button", {onclick:()=>renderCanvas()}, "Reload iframe")));
  } else {
    rows.push(el("h3", {}, "Figure"));
    rows.push(styleRow("Plot", selectInput(S.figures.map(f=>f.name), b.figure, v=>{
      const live = curSlide()?.blocks.find(x=>x.id===b.id); if (live) live.figure = v;
      renderCanvas(); patchBlock(b.id, {figure:v});
    }, S.figures.map(f=>f.title))));
    if (S.tables.length) {
      rows.push(styleRow("Data", selectInput([""].concat(S.tables.map(t=>t.name)), b.table || "", v=>{
        const live = curSlide()?.blocks.find(x=>x.id===b.id); if (live) live.table = v;
        renderCanvas(); patchBlock(b.id, {table:v});
      }, ["No data"].concat(S.tables.map(t=>t.title)))));
    } else {
      rows.push(styleRow("Data", el("span", {}, "No data")));
    }
  }
  rows.push(el("div", {class:"section"}));
  rows.push(el("h3", {}, "Geometry"));
  rows.push(styleRow("X", numInput(Math.round(b.x*100), 0, 100, v=>patchGeom(b, {x:v/100}))));
  rows.push(styleRow("Y", numInput(Math.round(b.y*100), 0, 100, v=>patchGeom(b, {y:v/100}))));
  rows.push(styleRow("Width", numInput(Math.round(b.w*100), 3, 100, v=>patchGeom(b, {w:v/100}))));
  rows.push(styleRow("Height", numInput(Math.round(b.h*100), 3, 100, v=>patchGeom(b, {h:v/100}))));
  rows.push(styleRow("Rotate", rangeInput(st.rotate || 0, -180, 180, 1, v=>patchStyle(b, {rotate:v}))));
  const del = el("button", {class:"danger", onclick: async ()=>{ await api(`./blocks/${b.id}`, {method:"DELETE"}); S.sel=null; refresh(); }}, "Delete block");
  ins.append(...rows, del);
  if (b.type === "text") {
    queueMicrotask(()=>{
      const rich = document.querySelector(`#blk-${b.id} > .body > .rich`);
      if (rich && S.sel === b.id) updateCharacterControlState(b.id, rich);
    });
  }
}
function styleRow(label, control) { return el("div", {class:"row"}, [el("label",{}, label), control]); }
function numInput(val, min, max, on, step) { const i = el("input",{type:"number", min, max, step:step||1, value:val, style:"width:70px"}); i.addEventListener("input", ()=>on(Number(i.value))); return i; }
function colorInput(val, on) { const i = el("input",{type:"color", value:val}); i.addEventListener("input", ()=>on(i.value)); return i; }
function rangeInput(val, min, max, step, on) { const i = el("input",{type:"range", min, max, step, value:val}); i.addEventListener("input", ()=>on(Number(i.value))); return i; }
function textInput(val, on, ph) { const i = el("input",{type:"text", value:val||"", placeholder:ph||""}); i.addEventListener("change", ()=>on(i.value)); return i; }
function toggleInput(val, on) { const i = el("input",{type:"checkbox"}); i.checked = !!val; i.addEventListener("change", ()=>on(i.checked)); return i; }
function fileInput(on) {
  const i = el("input",{type:"file", accept:"image/*"});
  i.addEventListener("change", ()=>{ const f = i.files && i.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = ()=> on(r.result); r.readAsDataURL(f); });
  return i;
}
function bindImageAsset(b, imageName) {
  const live = curSlide()?.blocks.find(x=>x.id===b.id); if (!live) return;
  const asset = S.images.find(image=>image.name===imageName);
  live.image = imageName;
  live.style = Object.assign({}, live.style || {}, {
    fit:(live.style || {}).fit || "contain",
    alt:asset?.alt || asset?.title || (live.style || {}).alt || "",
  });
  renderCanvas(); renderInspector();
  patchBlock(live.id, {image:imageName, style:live.style});
}
function setManualImage(b, src) {
  const live = curSlide()?.blocks.find(x=>x.id===b.id); if (!live) return;
  live.image = "";
  live.style = Object.assign({}, live.style || {}, {src, fit:(live.style || {}).fit || "contain"});
  renderCanvas(); renderInspector();
  patchBlock(live.id, {image:"", style:live.style});
}
async function fitImageToSource(b) {
  const img = document.querySelector(`#blk-${b.id} > .body.image > img`);
  if (!img || !img.naturalWidth || !img.naturalHeight) return;
  const aspect = await imageSourceAspect(img);
  if (!aspect || !Number.isFinite(aspect)) return;
  const slideAspect = 16 / 9;
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  let w = b.w, h = w * slideAspect / aspect;
  if (h > .9) { h = .9; w = h * aspect / slideAspect; }
  if (w > .9) { w = .9; h = w * slideAspect / aspect; }
  patchGeom(b, {
    x:clamp(cx - w / 2, 0, 1 - w), y:clamp(cy - h / 2, 0, 1 - h), w, h,
  });
  renderInspector();
}
async function imageSourceAspect(img) {
  const fallback = img.naturalWidth / img.naturalHeight;
  try {
    const response = await fetch(img.currentSrc || img.src);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("image/svg+xml")) return fallback;
    const svg = new DOMParser().parseFromString(await response.text(), "image/svg+xml").documentElement;
    const viewBox = (svg.getAttribute("viewBox") || "").trim().split(/[ ,]+/).map(Number);
    if (viewBox.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) return viewBox[2] / viewBox[3];
    const width = parseFloat(svg.getAttribute("width") || "");
    const height = parseFloat(svg.getAttribute("height") || "");
    if (width > 0 && height > 0) return width / height;
  } catch (_) {}
  return fallback;
}
function selectInput(opts, val, on, labels) { const s = el("select"); opts.forEach((o,idx)=>{ const op=el("option",{value:o}, labels?labels[idx]:o); if(o===val) op.setAttribute("selected",""); s.append(op);}); s.value=val; s.addEventListener("change", ()=>on(s.value)); return s; }
function fontSelect(val, on) { return selectInput(FONTS.map(f=>f[1]), val || FONTS[0][1], on, FONTS.map(f=>f[0])); }
function preserveTextSelectionControl(control, bid, property=null) {
  control.classList.add("text-selection-control");
  if (property) control.dataset.characterProperty = property;
  const hold = ()=>{
    const rich = document.querySelector(`#blk-${bid} > .body > .rich[contenteditable="true"]`);
    if (rich) saveTextSelection(bid, rich);
    suspendTextBlur = true;
  };
  const release = ()=>queueMicrotask(()=>{ suspendTextBlur = false; });
  control.addEventListener("pointerdown", hold);
  control.addEventListener("mousedown", hold);
  control.addEventListener("change", release);
  control.addEventListener("blur", release);
  return control;
}
function shapePicker(val, on) {
  return el("div", {class:"shape-grid"}, SHAPE_OPTIONS.map(([shape, label]) => {
    const b = el("button", {class:shape === val ? "on" : "", type:"button", title:label}, "");
    b.innerHTML = shapeSvg({shape, fill:"#dbe4ff", stroke:"#5b8cff", strokeWidth: shape.includes("line") ? 8 : 4});
    b.addEventListener("click", ()=>on(shape));
    return b;
  }));
}
function shapeSwatches(on) {
  const colors = ["#5b8cff","#111827","#ffffff","#ef4444","#f59e0b","#16a34a","#06b6d4","#a855f7","transparent"];
  return el("div", {class:"swatches"}, colors.map(c => {
    const b = el("button", {class:"swatch"+(c === "transparent" ? " none" : ""), title:c === "transparent" ? "No fill" : c});
    if (c !== "transparent") b.style.background = c;
    b.addEventListener("click", ()=>on(c));
    return b;
  }));
}
function normalizeShapePatch(b, patch) {
  if (!("shape" in patch)) return patch;
  const shape = patch.shape;
  const st = b.style || {};
  const next = Object.assign({}, patch);
  if (LINE_SHAPES.has(shape)) {
    next.stroke = (st.stroke && st.stroke !== "transparent") ? st.stroke : (st.fill || S.theme.accent || "#5b8cff");
    next.strokeWidth = st.strokeWidth || 5;
    next.fill = "transparent";
    if (shape === "arrow-line" && !st.lineCap) next.lineCap = "round";
  } else {
    next.fill = (st.fill && st.fill !== "transparent") ? st.fill : (S.theme.accent || "#5b8cff");
    if (st.strokeWidth == null) next.strokeWidth = 0;
  }
  if (shape === "round-rect" && !st.radius) next.radius = 16;
  return next;
}
// A color picker that can also be "none/transparent" via a checkbox.
function fillControl(val, on) {
  const enabled = val && val !== "transparent" && val !== "none";
  const chk = el("input", {type:"checkbox"}); chk.checked = !!enabled;
  const col = el("input", {type:"color", value: enabled ? val : "#5b8cff"});
  col.disabled = !enabled;
  const sync = ()=>{ col.disabled = !chk.checked; on(chk.checked ? col.value : "transparent"); };
  chk.addEventListener("change", sync);
  col.addEventListener("input", sync);
  return el("div", {class:"fill"}, [chk, col]);
}

function patchGeom(b, patch) {
  const live = curSlide()?.blocks.find(x=>x.id===b.id) || b;
  Object.assign(live, patch);
  live.x = clamp(live.x, 0, 1 - live.w);
  live.y = clamp(live.y, 0, 1 - live.h);
  live.w = clamp(live.w, 0.03, 1 - live.x);
  live.h = clamp(live.h, 0.03, 1 - live.y);
  syncCanvas();
  patchBlock(live.id, {x:live.x, y:live.y, w:live.w, h:live.h});
}

function alignBlock(b, where) {
  const patch = {};
  if (where === "left") patch.x = 0.06;
  if (where === "hcenter") patch.x = (1 - b.w) / 2;
  if (where === "right") patch.x = 0.94 - b.w;
  if (where === "top") patch.y = 0.08;
  if (where === "vcenter") patch.y = (1 - b.h) / 2;
  if (where === "bottom") patch.y = 0.92 - b.h;
  patchGeom(b, patch);
}

async function duplicateBlock(b) {
  const slide = curSlide(); if (!slide || !b) return;
  if (S.editingText) await stopTextEdit(S.editingText);
  b = curSlide()?.blocks.find(block=>block.id === b.id) || b;
  const payload = {
    type:b.type, figure:b.figure, table:b.table, html:b.html, image:b.image, content:b.content,
    x:clamp(b.x + 0.035, 0, 1 - b.w), y:clamp(b.y + 0.045, 0, 1 - b.h),
    w:b.w, h:b.h, style:Object.assign({}, b.style || {}),
  };
  const r = await api(`./slides/${slide.id}/blocks`, jbody("POST", payload));
  await refresh();
  if (r && r.id) { S.sel = r.id; updateSelectionClasses(); renderInspector(); }
}

async function sendBackward(b) {
  await moveLayer(b.id, "back");
}

/* ---------------- rich-text formatting toolbar ---------------- */
function fmtBtn(label, fn, title, command=null, value=null) {
  const b = el("button", {class:"fmt", type:"button", title}, label);
  if (command) b.dataset.command = command;
  if (value) b.dataset.value = value;
  b.addEventListener("pointerdown", (e)=>{
    suspendTextBlur = true;
    e.preventDefault();
  });
  b.addEventListener("mousedown", (e)=> e.preventDefault());
  b.addEventListener("click", ()=>{
    try { fn(); }
    finally { queueMicrotask(()=>{ suspendTextBlur = false; }); }
  });
  b.addEventListener("pointercancel", ()=>{ suspendTextBlur = false; });
  return b;
}
function richToolbar(b) {
  return el("div", {class:"rich-tools", id:"rich-tools-"+b.id}, [
    fmtBtn("↶", ()=>richCommand(b.id, "undo"), "Undo"),
    fmtBtn("↷", ()=>richCommand(b.id, "redo"), "Redo"),
    fmtBtn("H1", ()=>richCommand(b.id, "formatBlock", "h1"), "Heading 1", "formatBlock", "h1"),
    fmtBtn("H2", ()=>richCommand(b.id, "formatBlock", "h2"), "Heading 2", "formatBlock", "h2"),
    fmtBtn("P", ()=>richCommand(b.id, "formatBlock", "p"), "Paragraph", "formatBlock", "p"),
    fmtBtn("<>", ()=>richCommand(b.id, "formatBlock", "pre"), "Code block", "formatBlock", "pre"),
    fmtBtn("B", ()=>richCommand(b.id, "bold"), "Bold", "bold"),
    fmtBtn("I", ()=>richCommand(b.id, "italic"), "Italic", "italic"),
    fmtBtn("U", ()=>richCommand(b.id, "underline"), "Underline", "underline"),
    fmtBtn("•", ()=>richCommand(b.id, "insertUnorderedList"), "Bullet list", "insertUnorderedList"),
    fmtBtn("1.", ()=>richCommand(b.id, "insertOrderedList"), "Numbered list", "insertOrderedList"),
    fmtBtn("❝", ()=>richCommand(b.id, "formatBlock", "blockquote"), "Quote", "formatBlock", "blockquote"),
    fmtBtn("Link", ()=>addRichLink(b.id), "Link selected text"),
    fmtBtn("Tx", ()=>richCommand(b.id, "removeFormat"), "Clear inline formatting"),
  ]);
}
function richCommand(bid, command, value=null) {
  const rich = startTextEdit(bid); if (!rich) return;
  restoreTextSelection(bid, rich);
  document.execCommand("styleWithCSS", false, false);
  document.execCommand(command, false, value);
  syncTextContent(bid, rich);
  saveTextSelection(bid, rich);
  updateRichToolbarState();
  updateCharacterControlState(bid, rich);
}
function addRichLink(bid) {
  let rich = startTextEdit(bid); if (!rich) return;
  saveTextSelection(bid, rich);
  suspendTextBlur = true;
  const url = prompt("Link URL");
  suspendTextBlur = false;
  if (!url) { rich.focus({preventScroll:true}); restoreTextSelection(bid, rich); return; }
  const href = normalizeLinkUrl(url);
  if (!href) { rich.focus({preventScroll:true}); restoreTextSelection(bid, rich); return; }
  rich = startTextEdit(bid);
  restoreTextSelection(bid, rich);
  const selection = window.getSelection();
  if (selection && selection.rangeCount && selection.getRangeAt(0).collapsed) {
    const link = document.createElement("a");
    link.href = href; link.textContent = url.trim(); link.target = "_blank"; link.rel = "noopener noreferrer";
    document.execCommand("insertHTML", false, sanitizeRichHtml(link.outerHTML));
  } else {
    document.execCommand("createLink", false, href);
  }
  syncTextContent(bid, rich);
  saveTextSelection(bid, rich);
  updateCharacterControlState(bid, rich);
}
function activeTextRange(bid, rich) {
  const selection = window.getSelection();
  let range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
  if (range?.collapsed && S.editingText !== bid) range = null;
  if (!range || !rich.contains(range.commonAncestorContainer)) {
    range = savedTextBid === bid ? savedTextRange : null;
  }
  return range && rich.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
}
function wrapTextRange(rich, range, property, value) {
  if (range.collapsed) {
    const span = document.createElement("span");
    span.style.setProperty(property, value);
    const marker = document.createTextNode("\u200B");
    span.append(marker);
    range.insertNode(span);
    range.setStart(marker, marker.length);
    range.collapse(true);
    return range;
  }
  const walker = document.createTreeWalker(rich, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.data && range.intersectsNode(node)) nodes.push(node);
  }
  const wrapped = new Array(nodes.length);
  for (let index = nodes.length - 1; index >= 0; index--) {
    let node = nodes[index];
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : node.length;
    if (end <= start) continue;
    if (end < node.length) node.splitText(end);
    if (start > 0) node = node.splitText(start);
    const parent = node.parentElement;
    if (parent?.tagName === "SPAN" && parent.childNodes.length === 1
        && node.length === end - start) {
      parent.style.setProperty(property, value);
      wrapped[index] = parent;
      continue;
    }
    const span = document.createElement("span");
    span.style.setProperty(property, value);
    node.parentNode.insertBefore(span, node);
    span.append(node);
    wrapped[index] = span;
  }
  const pieces = wrapped.filter(Boolean);
  if (!pieces.length) return range;
  const next = document.createRange();
  next.setStartBefore(pieces[0]);
  next.setEndAfter(pieces[pieces.length - 1]);
  return next;
}
function applyCharacterStyle(b, property, value) {
  const bid = b.id;
  const rich = document.querySelector(`#blk-${bid} > .body > .rich`);
  if (!rich) return;
  let range = activeTextRange(bid, rich);
  if (!range) {
    range = document.createRange();
    range.selectNodeContents(rich);
  }
  S.editingText = bid;
  setRichEditingState(rich, true);
  updateEditTextButton();
  rich.focus({preventScroll:true});
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  range = wrapTextRange(rich, range, property, value);
  selection.removeAllRanges();
  selection.addRange(range);
  syncTextContent(bid, rich);
  saveTextSelection(bid, rich);
  updateRichToolbarState();
  updateCharacterControlState(bid, rich);
}
function normalizeLinkUrl(value) {
  const url = String(value || "").trim();
  if (!url) return null;
  if (/^(https?:|mailto:|#)/i.test(url)) return url;
  if (/^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(url)) return "https://"+url;
  return null;
}
function updateRichToolbarState() {
  const bid = S.editingText;
  const toolbar = bid ? document.getElementById("rich-tools-"+bid) : null;
  if (!toolbar) return;
  let blockValue = "";
  try { blockValue = String(document.queryCommandValue("formatBlock") || "").toLowerCase().replace(/[<>]/g, ""); } catch (_) {}
  toolbar.querySelectorAll(".fmt[data-command]").forEach(button=>{
    const command = button.dataset.command;
    let active = command === "formatBlock" ? blockValue === button.dataset.value : false;
    if (command !== "formatBlock") { try { active = document.queryCommandState(command); } catch (_) {} }
    button.classList.toggle("on", !!active);
  });
}
function characterStyleElement(range, rich) {
  if (!range) return rich;
  if (range.collapsed) {
    const node = range.startContainer;
    return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement || rich;
  }
  const walker = document.createTreeWalker(rich, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (walker.currentNode.data && range.intersectsNode(walker.currentNode)) {
      return walker.currentNode.parentElement || rich;
    }
  }
  return rich;
}
function normalizedFont(value) {
  return String(value || "").replace(/[\"']/g, "").replace(/\s+/g, "").toLowerCase();
}
function primaryFont(value) {
  return normalizedFont(value).split(",", 1)[0];
}
function colorToHex(value) {
  const match = String(value || "").match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return /^#[0-9a-f]{6}$/i.test(value) ? value : null;
  return "#" + match.slice(1, 4).map(channel=>Number(channel).toString(16).padStart(2, "0")).join("");
}
function characterStyles(range, rich) {
  if (range?.collapsed) return [getComputedStyle(characterStyleElement(range, rich))];
  const styles = [];
  const walker = document.createTreeWalker(rich, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.data.replace(/\u200B/g, "")) continue;
    if (!range || range.intersectsNode(node)) styles.push(getComputedStyle(node.parentElement || rich));
  }
  return styles.length ? styles : [getComputedStyle(rich)];
}
function styleConsensus(styles, read, normalize=String) {
  const entries = styles.map(style=>read(style));
  const unique = new Set(entries.map(value=>normalize(value)));
  return {mixed:unique.size > 1, value:entries[0]};
}
function setSelectState(control, value, label, mixed=false) {
  control.querySelectorAll("option[data-transient]").forEach(option=>option.remove());
  if (mixed) {
    const option = el("option", {value:"__mixed__", "data-transient":"true", disabled:""}, "Mixed");
    control.prepend(option);
    control.value = option.value;
    return;
  }
  const existing = [...control.options].find(option=>option.value === value);
  if (existing) { control.value = existing.value; return; }
  const option = el("option", {value, "data-transient":"true"}, label || value);
  control.prepend(option);
  control.value = option.value;
}
function updateCharacterControlState(bid, rich) {
  if (!rich || S.sel !== bid) return;
  const range = activeTextRange(bid, rich);
  const styles = characterStyles(range, rich);
  document.querySelectorAll("#inspector [data-character-property]").forEach(control=>{
    const property = control.dataset.characterProperty;
    let mixed = false;
    if (property === "font-family") {
      const summary = styleConsensus(styles, style=>style.fontFamily, primaryFont);
      mixed = summary.mixed;
      const current = primaryFont(summary.value);
      const option = [...control.options].find(item=>primaryFont(item.value) === current);
      setSelectState(control, option?.value || summary.value, summary.value.split(",", 1)[0].replace(/[\"']/g, ""), mixed);
    } else if (property === "font-size") {
      const summary = styleConsensus(styles, style=>Math.round(parseFloat(style.fontSize) || 18), Number);
      mixed = summary.mixed;
      control.value = mixed ? "" : String(summary.value);
      control.placeholder = mixed ? "Mixed" : "";
    } else if (property === "color") {
      const summary = styleConsensus(styles, style=>colorToHex(style.color), String);
      mixed = summary.mixed;
      const color = summary.value;
      if (color) control.value = color;
    } else if (property === "font-weight") {
      const weightValue = style=>{
        const numeric = parseInt(style.fontWeight, 10);
        return numeric >= 700 ? "bold" : numeric >= 600 ? "600" : "normal";
      };
      const summary = styleConsensus(styles, weightValue, String);
      mixed = summary.mixed;
      setSelectState(control, summary.value, summary.value, mixed);
    } else if (property === "font-style") {
      const summary = styleConsensus(styles, style=>style.fontStyle === "italic", String);
      mixed = summary.mixed;
      control.indeterminate = mixed;
      control.checked = !mixed && summary.value;
    }
    if (mixed) {
      control.dataset.mixed = "true";
      control.title = "Mixed formatting in selection";
    } else {
      delete control.dataset.mixed;
      if (control.title === "Mixed formatting in selection") control.removeAttribute("title");
    }
    if (property === "color") {
      let indicator = control.parentElement?.querySelector(":scope > .mixed-value");
      if (mixed && !indicator) {
        indicator = el("span", {class:"mixed-value"}, "Mixed");
        control.parentElement?.append(indicator);
      } else if (!mixed) {
        indicator?.remove();
      }
    }
  });
}
function debounce(fn, ms) {
  let t, pending;
  const wrapped = (...args)=>{ clearTimeout(t); pending=args; t=setTimeout(()=>wrapped.flush(), ms); };
  wrapped.cancel = ()=>{ clearTimeout(t); t = null; pending = null; };
  wrapped.flush = ()=>{
    if (!pending) return;
    const args = pending;
    wrapped.cancel();
    return fn(...args);
  };
  return wrapped;
}
function patchStyle(b, patch) {
  const live = curSlide()?.blocks.find(x=>x.id===b.id) || b;
  live.style = Object.assign({}, live.style, patch);
  syncCanvas();
  // Some shape/image controls change which other controls are shown.
  if (live.type === "shape" && "shape" in patch) renderInspector();
  patchBlock(b.id, {style: live.style});
}
function setTextVariant(b, variant) {
  const code = variant === "code";
  patchStyle(b, code ? {
    textVariant:"code",
    fontFamily:"'Roboto Mono',ui-monospace,SFMono-Regular,Menlo,monospace",
    fontSize:16, lineHeight:1.55, color:"#e5e7eb", bg:"#111827",
    align:"left", weight:"normal", italic:false,
  } : {
    textVariant:"plain",
    fontFamily:S.theme.font || FONTS[0][1],
    fontSize:18, lineHeight:1.45, color:S.theme.fg || "#1a1d24", bg:"transparent",
    align:"left", weight:"normal", italic:false,
  });
  renderInspector();
}
async function patchBlock(bid, patch) { await api(`./blocks/${bid}`, jbody("PATCH", patch)); }

/* ---------------- editable deck files ---------------- */
async function flushDeckEdits() {
  if (S.editingText) await stopTextEdit(S.editingText);
  await pushBlockContent.flush();
  await pushGeom.flush();
  await Promise.all([...textSaveChains.values(), ...pendingMutations]);
}

async function downloadEditableDeck() {
  const button = $("download-deck-btn");
  button.disabled = true;
  try {
    await flushDeckEdits();
    const deck = await api("./deck");
    const url = URL.createObjectURL(new Blob([JSON.stringify(deck, null, 2)], {type:"application/json"}));
    const link = el("a", {href:url, download:S.workspace.filename || S.deckName});
    document.body.append(link); link.click(); link.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
    showStatus("Downloaded editable copy");
  } catch (error) {
    showStatus("Download failed", 3000);
  } finally {
    button.disabled = false;
  }
}

async function saveEditableDeck() {
  const button = $("save-deck-btn");
  try {
    button.disabled = true;
    showStatus("saving", 0);
    await flushDeckEdits();
    const response = await fetch("./deck/save", {method:"POST"});
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || `Save failed (${response.status}).`);
    showStatus(`saved ${result.filename || "workspace"}`);
  } catch (error) {
    showStatus("save failed", 2600);
    alert(`Could not save presentation.\n\n${error.message || error}`);
  } finally {
    renderTopbar();
  }
}

async function openEditableDeck(file) {
  if (!file) return;
  try {
    const documentData = JSON.parse(await file.text());
    if (S.slides.length && !confirm(`Replace the current presentation with “${file.name}”?`)) return;
    showStatus("opening", 0);
    await flushDeckEdits();
    if (S.present) exitPresent();
    const response = await fetch("./deck", jbody("PUT", documentData));
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || `Open failed (${response.status}).`);
    S.cur = 0; S.sel = null; S.deckName = file.name || "presentation.cast.json";
    S.slides = []; legacyTextMigrations.clear();
    lastSlideId = null; lastStructSig = null;
    await refresh();
    showStatus("opened");
  } catch (error) {
    showStatus("open failed", 2600);
    alert(`Could not open presentation.\n\n${error.message || error}`);
  } finally {
    $("open-deck-file").value = "";
  }
}

/* ---------------- present mode ---------------- */
async function enterPresent() {
  if (!S.slides.length) return;
  if (S.editingText) await stopTextEdit(S.editingText);
  closeMenus();
  S.present = true; S.pcur = S.cur; $("present-overlay").hidden = false; sizePresent(); renderPresent();
}
function exitPresent() { S.present = false; $("present-overlay").hidden = true; }
function sizePresent() {
  const stage = $("present-stage"), viewport = $("present-viewport"), cv = $("present-canvas");
  const scale = Math.min(stage.clientWidth / SLIDE_WIDTH, stage.clientHeight / SLIDE_HEIGHT);
  viewport.style.width = (SLIDE_WIDTH * scale) + "px";
  viewport.style.height = (SLIDE_HEIGHT * scale) + "px";
  cv.style.zoom = scale;
  cv.style.background = S.theme.bg || "#fff"; cv.style.color = S.theme.fg || "#1a1d24"; cv.style.fontFamily = S.theme.font || "";
}
function renderPresent() {
  const cv = $("present-canvas"); cv.innerHTML = "";
  const slide = S.slides[S.pcur]; if (!slide) { exitPresent(); return; }
  cv.style.background = slide.background || S.theme.bg || "#fff";
  $("present-count").textContent = `${S.pcur+1} / ${S.slides.length}`;
  $("p-prev").disabled = S.pcur === 0;
  $("p-next").disabled = S.pcur === S.slides.length-1;
  for (const b of slide.blocks) {
    const wrap = buildBlock(b, false);
    applyGeom(wrap, b);
    cv.append(wrap);
  }
}
function presentGo(d) { S.pcur = clamp(S.pcur+d, 0, S.slides.length-1); renderPresent(); }

/* ---------------- wiring ---------------- */
function addFigure() {
  addBlock({type:"figure", figure:$("add-figure").value, table:$("figure-data").value || "", x:0.07, y:0.16, w:0.52, h:0.66});
}
function addHtml() {
  addBlock({type:"html", html:$("add-html").value, x:0.12, y:0.16, w:0.76, h:0.62});
}
function addTable() {
  if (!S.tables.length) return;
  addBlock({
    type:"table", table:$("add-table").value,
    x:0.12, y:0.18, w:0.76, h:0.58,
    style:{rowLimit:200, fontSize:12, compact:false, striped:true, showIndex:true,
      headerBg:"#eef2f7", headerColor:"#374151", bg:"#ffffff", borderColor:"#d1d5db"},
  });
}
// Create a block, then refresh and select it so the inspector opens on it.
async function addBlock(payload) {
  const slide = curSlide(); if (!slide) return;
  if (S.editingText) await stopTextEdit(S.editingText);
  closeMenus();
  const r = await api(`./slides/${slide.id}/blocks`, jbody("POST", payload));
  await refresh();
  if (r && r.id) { S.sel = r.id; setPanel("properties"); updateSelectionClasses(); renderTopbar(); renderInspector(); }
}
function addText()  { addBlock({type:"text", content:"<h2>New text</h2><p>Add your message here.</p>", x:0.6, y:0.18, w:0.33, h:0.4, style:{fontSize:24}}); }
function addImage() {
  const imageName = $("add-image").value || "";
  const asset = S.images.find(image=>image.name===imageName);
  addBlock({
    type:"image", image:imageName,
    x:0.24, y:0.2, w:0.52, h:0.58,
    style:{fit:"contain", rendering:"auto", alt:asset?.alt || asset?.title || ""},
  });
}
function addShape() {
  const sh = S.shapeKind || "rect";
  const accent = S.theme.accent || "#5b8cff";
  const line = LINE_SHAPES.has(sh);
  addBlock({
    type:"shape",
    x:line ? 0.26 : 0.33,
    y:line ? 0.46 : 0.3,
    w:line ? 0.45 : 0.26,
    h:line ? 0.08 : 0.34,
    style:{
      shape:sh,
      fill:line ? "transparent" : accent,
      stroke:line ? accent : "transparent",
      strokeWidth:line ? 5 : 0,
      radius:sh === "round-rect" ? 16 : 0,
      opacity:1,
    },
  });
}

async function addSlideFromTemplate(kind="blank") {
  closeMenus();
  if (S.editingText) await stopTextEdit(S.editingText);
  const r = await api("./slides", {method:"POST"});
  await refresh();
  S.cur = Math.max(0, S.slides.findIndex(s=>s.id === r.id));
  const slide = curSlide(); if (!slide) return;
  const accent = S.theme.accent || "#5b8cff";
  const fg = S.theme.fg || "#1a1d24";
  const add = (payload) => api(`./slides/${slide.id}/blocks`, jbody("POST", payload));
  if (kind === "title") {
    await add({type:"shape", x:0.07, y:0.13, w:0.035, h:0.56, style:{shape:"rect", fill:accent, opacity:1}});
    await add({type:"text", content:"<h1>Presentation title</h1><p>A sharp one-sentence takeaway.</p>", x:0.14, y:0.18, w:0.7, h:0.42, style:{fontSize:40, color:fg, lineHeight:1.12, weight:"bold"}});
  } else if (kind === "data") {
    await add({type:"text", content:"<h2>Main result</h2><ul><li>Key finding</li><li>Supporting detail</li><li>Next decision</li></ul>", x:0.07, y:0.12, w:0.34, h:0.68, style:{fontSize:25, color:fg, lineHeight:1.25}});
    if (S.figures.length && S.tables.length) await add({type:"figure", figure:S.figures[0].name, table:S.tables[0].name, x:0.46, y:0.14, w:0.47, h:0.65});
    else await add({type:"shape", x:0.48, y:0.18, w:0.42, h:0.56, style:{shape:"rect", fill:accent, opacity:.16, radius:18}});
  } else if (kind === "split") {
    await add({type:"image", x:0, y:0, w:0.5, h:1, style:{fit:"cover"}});
    await add({type:"text", content:"<h2>Section title</h2><p>Add the argument on this side.</p>", x:0.57, y:0.2, w:0.34, h:0.45, style:{fontSize:30, color:fg, lineHeight:1.22}});
  } else if (kind === "quote") {
    await add({type:"shape", x:0.08, y:0.16, w:0.84, h:0.68, style:{shape:"rect", fill:accent, opacity:.08, radius:24}});
    await add({type:"text", content:"<blockquote>The clearest slide says one thing well.</blockquote><p>Source or note</p>", x:0.16, y:0.24, w:0.68, h:0.48, style:{fontSize:36, color:fg, lineHeight:1.18, fontFamily:"Georgia,'Times New Roman',serif"}});
  }
  await refresh();
  S.sel = null;
  await goToSlide(S.slides.findIndex(s=>s.id === r.id));
}

$("add-slide-btn").addEventListener("click", ()=> addSlideFromTemplate($("slide-template").value));
$("add-figure-btn").addEventListener("click", addFigure);
$("add-table-btn").addEventListener("click", addTable);
$("add-html-btn").addEventListener("click", addHtml);
$("add-text-btn").addEventListener("click", addText);
$("add-image-btn").addEventListener("click", addImage);
$("add-shape-btn").addEventListener("click", addShape);
$("open-deck-btn").addEventListener("click", ()=> $("open-deck-file").click());
$("open-deck-file").addEventListener("change", ()=>openEditableDeck($("open-deck-file").files?.[0]));
$("save-deck-btn").addEventListener("click", saveEditableDeck);
$("download-deck-btn").addEventListener("click", downloadEditableDeck);
$("present-btn").addEventListener("click", enterPresent);
$("p-prev").addEventListener("click", ()=>presentGo(-1));
$("p-next").addEventListener("click", ()=>presentGo(1));
$("p-exit").addEventListener("click", exitPresent);
$("theme-accent").addEventListener("input", debounce(()=> api("./theme", jbody("PATCH", {accent:$("theme-accent").value})), 150));
$("theme-bg").addEventListener("input", debounce(()=> api("./theme", jbody("PATCH", {bg:$("theme-bg").value})), 150));
$("theme-fg").addEventListener("input", debounce(()=> api("./theme", jbody("PATCH", {fg:$("theme-fg").value})), 150));
$("theme-font").addEventListener("change", ()=> api("./theme", jbody("PATCH", {font:$("theme-font").value})));
$("theme-preset").addEventListener("change", ()=>{
  const preset = THEME_PRESETS[$("theme-preset").value]; if (!preset) return;
  Object.assign(S.theme, preset); applyTheme(); renderTopbar();
  api("./theme", jbody("PATCH", preset));
});
$("grid-btn").addEventListener("click", ()=>{ S.grid = !S.grid; applyTheme(); renderTopbar(); });
$("snap-btn").addEventListener("click", ()=>{ S.snap = !S.snap; renderTopbar(); });
$("zoom-out").addEventListener("click", ()=>{ fitZoom = false; S.zoom = clamp(Number((S.zoom - 0.1).toFixed(2)), 0.1, 1.6); applyTheme(); renderTopbar(); });
$("zoom-fit").addEventListener("click", fitStage);
$("zoom-in").addEventListener("click", ()=>{ fitZoom = false; S.zoom = clamp(Number((S.zoom + 0.1).toFixed(2)), 0.1, 1.6); applyTheme(); renderTopbar(); });
window.addEventListener("resize", ()=>{ closeMenus(); resizeFigures(); if (S.present) { sizePresent(); renderPresent(); } });

$("slide-prev").addEventListener("click", ()=>goToSlide(S.cur-1));
$("slide-next").addEventListener("click", ()=>goToSlide(S.cur+1));
$("slide-number").addEventListener("change", async ()=>{
  const n = Number($("slide-number").value);
  if (Number.isInteger(n) && n >= 1) await goToSlide(n-1);
  $("slide-number").value = S.slides.length ? S.cur+1 : 0;
});
$("slide-number").addEventListener("blur", ()=>{ $("slide-number").value = S.slides.length ? S.cur+1 : 0; });
for (const name of ["rail", "inspector"]) $(name+"-toggle").addEventListener("click", ()=>togglePanel(name));
for (const name of ["properties", "layers"]) {
  $(name+"-tab").addEventListener("click", ()=>setPanel(name));
  $(name+"-tab").addEventListener("keydown", e=>{
    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    const other = name === "properties" ? "layers" : "properties";
    setPanel(other); $(other+"-tab").focus();
  });
}
for (const name of ["slide", "shape", "insert", "theme"]) {
  const button = $(name+"-menu-btn"), menu = $(name+"-menu");
  button.addEventListener("click", ()=>{
    const opening = menu.hidden;
    closeMenus();
    if (!opening) return;
    menu.hidden = false;
    button.classList.add("menu-open"); button.setAttribute("aria-expanded", "true");
    const rect = button.getBoundingClientRect();
    menu.style.top = rect.bottom+8+"px";
    menu.style.left = Math.max(12, Math.min(rect.left, window.innerWidth-menu.offsetWidth-12))+"px";
    menu.querySelector("select, button, input")?.focus();
  });
}
document.addEventListener("pointerdown", e=>{ if (!e.target.closest(".tool-menu")) closeMenus(); });
document.addEventListener("focusin", e=>{ if (!e.target.closest(".tool-menu")) closeMenus(); });
$("rail").addEventListener("dragover", e=>{
  if (!draggedSlideId) return;
  e.preventDefault();
  const rail = $("rail"), rect = rail.getBoundingClientRect();
  if (e.clientY < rect.top+40) rail.scrollTop -= 18;
  if (e.clientY > rect.bottom-40) rail.scrollTop += 18;
});
$("rail").addEventListener("drop", e=>{ if (draggedSlideId) { e.preventDefault(); slideDropAccepted = true; } });
new ResizeObserver(()=>{ if (fitZoom) fitStage(); }).observe($("stage"));
new ResizeObserver(resizePreviews).observe($("rail"));

const pushGeom = debounce((id, g)=> patchBlock(id, g), 200);
window.addEventListener("keydown", (e)=>{
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    if (S.workspace.configured) saveEditableDeck();
    return;
  }
  if (S.present) {
    if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); presentGo(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); presentGo(-1); }
    else if (e.key === "Escape") { e.preventDefault(); exitPresent(); }
    return;
  }
  if (e.key === "Escape" && document.querySelector(".menu-open")) { e.preventDefault(); closeMenus(true); return; }
  // Editing-canvas shortcuts: nudge with arrows, remove with Delete — but only
  // when not typing in a field and a block is selected.
  const ae = document.activeElement;
  if (ae && (["INPUT", "TEXTAREA", "SELECT"].includes(ae.tagName) || ae.isContentEditable)) return;
  if (S.editingText) return;
  const b = curSlide()?.blocks.find(x=>x.id===S.sel);
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
    e.preventDefault(); if (b) duplicateBlock(b); else duplicateSlide(); return;
  }
  if (["PageDown", "PageUp"].includes(e.key)) {
    e.preventDefault(); goToSlide(S.cur+(e.key === "PageDown" ? 1 : -1)); return;
  }
  if (e.key === "Escape") { selectBlock(null); return; }
  if (!b) return;
  const step = e.shiftKey ? 0.05 : 0.01;
  if (e.key === "ArrowLeft")       b.x = clamp(b.x - step, 0, 1-b.w);
  else if (e.key === "ArrowRight") b.x = clamp(b.x + step, 0, 1-b.w);
  else if (e.key === "ArrowUp")    b.y = clamp(b.y - step, 0, 1-b.h);
  else if (e.key === "ArrowDown")  b.y = clamp(b.y + step, 0, 1-b.h);
  else if (e.key === "Delete" || e.key === "Backspace") {
    e.preventDefault();
    api(`./blocks/${b.id}`, {method:"DELETE"}).then(()=>{ S.sel=null; refresh(); });
    return;
  } else return;
  e.preventDefault();
  syncCanvas();
  pushGeom(b.id, {x:b.x, y:b.y});
});

document.addEventListener("selectionchange", ()=>{
  const bid = S.editingText; if (!bid) return;
  const rich = document.querySelector(`#blk-${bid} > .body > .rich[contenteditable="true"]`);
  if (!rich) return;
  saveTextSelection(bid, rich);
  updateRichToolbarState();
  updateCharacterControlState(bid, rich);
});

function connect() {
  const es = new EventSource("./events");
  es.onopen = ()=> $("status").textContent = "live";
  es.onmessage = ()=> refresh();
  es.onerror = ()=> $("status").textContent = "reconnecting…";
}
for (const button of document.querySelectorAll("button[data-icon]")) {
  const name = button.getAttribute("aria-label") || button.textContent.trim() || button.title;
  button.setAttribute("aria-label", name);
  if (!button.title) button.title = name;
  button.prepend(window.castIcon(button.dataset.icon));
}
setPanel("properties");
const compactLayout = window.matchMedia("(max-width:760px)");
function syncResponsivePanels() {
  for (const name of ["rail", "inspector"]) {
    const visible = !compactLayout.matches && desktopPanels[name];
    document.body.classList.toggle(name+"-hidden", !visible);
    $(name+"-toggle").setAttribute("aria-pressed", String(visible));
  }
}
compactLayout.addEventListener("change", syncResponsivePanels);
syncResponsivePanels();
refresh().then(()=>{ fitStage(); connect(); });
"""
