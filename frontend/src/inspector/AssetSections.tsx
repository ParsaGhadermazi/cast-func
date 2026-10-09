/** Inspector sections for notebook-backed blocks: images, tables, figures, HTML. */

import { Crop, RefreshCw, RotateCcw, Scaling, Upload } from "lucide-react";
import { useRef } from "react";

import { api } from "../api/client";
import { useAssets, useDoc, useSession } from "../app/SessionContext";
import { readFileAsDataUrl } from "../editor/insert";
import { slideById } from "../editor/operations";
import { boxOf } from "../editor/transform";
import { clampRect } from "../model/geometry";
import { SLIDE_HEIGHT, SLIDE_WIDTH, type Block } from "../model/types";
import { reloadHtmlBlock } from "../render/assets";
import { normalizedCrop } from "../render/crop";
import { ColorField, RangeField, Row, Segmented, SelectField, TextField, Toggle } from "../ui/controls";
import { useStyleEdit } from "./useStyleEdit";

function useBlockEdit(slideId: string, block: Block) {
  const session = useSession();
  return (label: string, recipe: (target: Block) => void) =>
    session.doc.getState().transact(label, (draft) => {
      const target = slideById(draft, slideId)?.blocks.find((candidate) => candidate.id === block.id);
      if (target) recipe(target as Block);
    });
}

/** Aspect ratio of an image source; SVGs use their viewBox (naturalWidth is unreliable). */
async function sourceAspect(src: string): Promise<number | null> {
  try {
    const response = await fetch(src);
    const type = response.headers.get("content-type") ?? "";
    if (type.includes("svg") || src.startsWith("data:image/svg")) {
      const svg = new DOMParser().parseFromString(await response.text(), "image/svg+xml").documentElement;
      const box = (svg.getAttribute("viewBox") ?? "").trim().split(/[ ,]+/).map(Number);
      if (box.length === 4 && box[2]! > 0 && box[3]! > 0) return box[2]! / box[3]!;
      const width = parseFloat(svg.getAttribute("width") ?? "");
      const height = parseFloat(svg.getAttribute("height") ?? "");
      if (width > 0 && height > 0) return width / height;
    }
    const bitmap = await createImageBitmap(await response.blob());
    return bitmap.width / bitmap.height;
  } catch {
    return null;
  }
}

export function ImageSection({ slideId, block }: { slideId: string; block: Block }) {
  const session = useSession();
  const images = useAssets((state) => state.images);
  const accent = useDoc((state) => state.doc.theme.accent);
  const edit = useStyleEdit(slideId, [block.id]);
  const change = useBlockEdit(slideId, block);
  const upload = useRef<HTMLInputElement>(null);
  const { style } = block;
  const crop = normalizedCrop(style);
  const asset = images.find((image) => image.name === block.image);
  const src = asset ? api.imageUrl(asset.name, asset.version) : style.src;

  const matchShape = async () => {
    if (!src) return;
    const aspect = await sourceAspect(src);
    if (!aspect) return;
    const visible = (aspect * (1 - crop.left - crop.right)) / (1 - crop.top - crop.bottom);
    const box = boxOf(block);
    const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    let w = box.w;
    let h = w / visible;
    if (h > 0.9 * SLIDE_HEIGHT) { h = 0.9 * SLIDE_HEIGHT; w = h * visible; }
    if (w > 0.9 * SLIDE_WIDTH) { w = 0.9 * SLIDE_WIDTH; h = w / visible; }
    change("Match image shape", (target) => {
      Object.assign(target, clampRect({ x: (center.x - w / 2) / SLIDE_WIDTH, y: (center.y - h / 2) / SLIDE_HEIGHT, w: w / SLIDE_WIDTH, h: h / SLIDE_HEIGHT }));
    });
  };

  return (
    <section className="panel-section">
      <h3>Image</h3>
      <Row label="Source">
        <select aria-label="Image source" value={block.image ?? ""} onChange={(event) => {
          const name = event.target.value;
          const chosen = images.find((image) => image.name === name);
          change("Change image", (target) => {
            target.image = name || null;
            if (chosen) target.style.alt = chosen.alt || chosen.title;
          });
        }}>
          <option value="">{style.src ? "Uploaded / URL" : "None"}</option>
          {images.map((image) => <option key={image.name} value={image.name}>{image.title}</option>)}
        </select>
      </Row>
      <Row label="Replace">
        <button type="button" onClick={() => upload.current?.click()}><Upload size={14} /> Upload…</button>
        <input ref={upload} type="file" accept="image/*" hidden onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          const dataUrl = await readFileAsDataUrl(file);
          change("Replace image", (target) => {
            target.image = null;
            target.style.src = dataUrl;
            target.style.alt = file.name.replace(/\.[^.]+$/, "");
          });
        }} />
      </Row>
      <Row label="URL">
        <TextField label="Image URL" placeholder="https://…" value={style.src && !style.src.startsWith("data:") ? style.src : ""}
          onCommit={(url) => change("Image URL", (target) => {
            target.image = null;
            target.style.src = url.trim();
          })} />
      </Row>
      <Row label="Fit">
        <Segmented label="Fit" value={style.fit ?? "contain"} onChange={(fit) => edit({ fit }, "Image fit")}
          options={[["contain", "Contain", "Show the whole image"], ["cover", "Cover", "Fill the box, trimming edges"], ["fill", "Stretch", "Stretch to the box"]] as const} />
      </Row>
      <div className="button-row">
        <button type="button" disabled={!src} onClick={() => void matchShape()} title="Resize the box to the image's proportions">
          <Scaling size={14} /> Match image shape
        </button>
        <button type="button" disabled={!src} onClick={() => session.ui.getState().startEditing({ kind: "crop", id: block.id })}
          title="Crop on the slide (or double-click the image)">
          <Crop size={14} /> Crop
        </button>
        {(crop.left || crop.top || crop.right || crop.bottom) ? (
          <button type="button" className="icon" aria-label="Reset crop" title="Reset crop" onClick={() => edit({ crop: undefined }, "Reset crop")}>
            <RotateCcw size={14} />
          </button>
        ) : null}
      </div>
      <Row label="Rendering">
        <SelectField label="Rendering" value={style.rendering ?? "auto"} onChange={(rendering) => edit({ rendering }, "Image rendering")}
          options={[["auto", "Smooth"], ["crisp-edges", "Crisp"], ["pixelated", "Pixel art"]] as const} />
      </Row>
      <Row label="Corners">
        <RangeField label="Corner radius" min={0} max={120} value={style.radius ?? 0} format={(v) => `${v}px`} onChange={(radius) => edit({ radius }, "Corner radius")} />
      </Row>
      <Row label="Opacity">
        <RangeField label="Opacity" min={0} max={1} step={0.05} value={style.opacity ?? 1} format={(v) => `${Math.round(v * 100)}%`} onChange={(opacity) => edit({ opacity }, "Opacity")} />
      </Row>
      <Row label="Fill">
        <ColorField label="Image background" allowNone accent={accent} value={style.bg ?? "transparent"} onChange={(bg) => edit({ bg }, "Image background")} />
      </Row>
      <Row label="Alt text" hint="Describes the image for screen readers">
        <TextField label="Alt text" placeholder="Describe the image" value={style.alt ?? ""} onCommit={(alt) => edit({ alt }, "Alt text")} />
      </Row>
    </section>
  );
}

const ROW_LIMITS = [["25", "25 rows"], ["50", "50 rows"], ["100", "100 rows"], ["200", "200 rows"], ["500", "500 rows"], ["1000", "1000 rows"]] as const;

export function TableSection({ slideId, block }: { slideId: string; block: Block }) {
  const tables = useAssets((state) => state.tables);
  const accent = useDoc((state) => state.doc.theme.accent);
  const edit = useStyleEdit(slideId, [block.id]);
  const change = useBlockEdit(slideId, block);
  const { style } = block;
  return (
    <section className="panel-section">
      <h3>Table</h3>
      <Row label="Data">
        <select aria-label="Table data" value={block.table ?? ""} onChange={(event) => change("Change data", (target) => { target.table = event.target.value || null; })}>
          {!block.table && <option value="">None</option>}
          {tables.map((table) => <option key={table.name} value={table.name}>{table.title}</option>)}
        </select>
      </Row>
      <Row label="Show">
        <SelectField label="Rows shown" value={String(style.rowLimit ?? 200) as typeof ROW_LIMITS[number][0]} options={ROW_LIMITS}
          onChange={(value) => edit({ rowLimit: Number(value) }, "Rows shown")} />
      </Row>
      <Row label="Text size">
        <RangeField label="Table text size" min={9} max={22} value={style.fontSize ?? 12} format={(v) => `${v}px`} onChange={(fontSize) => edit({ fontSize }, "Table text size")} />
      </Row>
      <div className="toggle-grid">
        <Toggle label="Compact" checked={!!style.compact} onChange={(compact) => edit({ compact }, "Compact table")} />
        <Toggle label="Stripes" checked={style.striped !== false} onChange={(striped) => edit({ striped }, "Table stripes")} />
        <Toggle label="Row numbers" checked={style.showIndex !== false} onChange={(showIndex) => edit({ showIndex }, "Row numbers")} />
      </div>
      <Row label="Header">
        <ColorField label="Header background" accent={accent} value={style.headerBg ?? "#eef2f7"} onChange={(headerBg) => edit({ headerBg }, "Header colour")} />
      </Row>
      <Row label="Header text">
        <ColorField label="Header text" accent={accent} value={style.headerColor ?? "#374151"} onChange={(headerColor) => edit({ headerColor }, "Header text colour")} />
      </Row>
      <Row label="Fill">
        <ColorField label="Table background" accent={accent} value={style.bg ?? "#ffffff"} onChange={(bg) => edit({ bg }, "Table background")} />
      </Row>
      <Row label="Border">
        <ColorField label="Border" accent={accent} allowNone value={style.borderColor ?? "#d1d5db"} onChange={(borderColor) => edit({ borderColor }, "Table border")} />
      </Row>
    </section>
  );
}

export function FigureSection({ slideId, block }: { slideId: string; block: Block }) {
  const figures = useAssets((state) => state.figures);
  const tables = useAssets((state) => state.tables);
  const change = useBlockEdit(slideId, block);
  return (
    <section className="panel-section">
      <h3>Figure</h3>
      <Row label="Plot">
        <select aria-label="Figure" value={block.figure ?? ""} onChange={(event) => change("Change figure", (target) => { target.figure = event.target.value || null; })}>
          {!block.figure && <option value="">None</option>}
          {figures.map((figure) => <option key={figure.name} value={figure.name}>{figure.title}</option>)}
        </select>
      </Row>
      <Row label="Data">
        <select aria-label="Figure data" value={block.table ?? ""} onChange={(event) => change("Change data", (target) => { target.table = event.target.value || null; })}>
          <option value="">No data</option>
          {tables.map((table) => <option key={table.name} value={table.name}>{table.title}</option>)}
        </select>
      </Row>
      <p className="hint">The figure re-renders in Python whenever its data changes. In present mode it is interactive.</p>
    </section>
  );
}

export function HtmlSection({ slideId, block }: { slideId: string; block: Block }) {
  const htmls = useAssets((state) => state.htmls);
  const change = useBlockEdit(slideId, block);
  return (
    <section className="panel-section">
      <h3>HTML</h3>
      <Row label="Object">
        <select aria-label="HTML object" value={block.html ?? ""} onChange={(event) => change("Change HTML", (target) => { target.html = event.target.value || null; })}>
          {!block.html && <option value="">None</option>}
          {htmls.map((html) => <option key={html.name} value={html.name}>{html.title}</option>)}
        </select>
      </Row>
      <button type="button" onClick={() => reloadHtmlBlock(block.id)}><RefreshCw size={14} /> Reload</button>
      <p className="hint">Widgets are interactive in present mode; in the editor, clicks select the block.</p>
    </section>
  );
}
