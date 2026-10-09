import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  ChartNoAxesCombined,
  Code,
  Copy,
  Image as ImageIcon,
  Shapes,
  Table2,
  Trash2,
  Type,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { useAssets, useSession, useUi } from "../app/SessionContext";
import { SLIDE_HEIGHT, SLIDE_WIDTH, type Block, type BlockType } from "../model/types";
import { blockLabel } from "./blockLabel";
import { useCurrentSlide } from "./hooks";
import {
  alignBlocks,
  applyStackOrder,
  distributeBlocks,
  reorderLayers,
  setBoxes,
  slideById,
  stackOrder,
  type AlignEdge,
  type LayerMove,
} from "./operations";
import { ShapeSection } from "../inspector/ShapeSection";
import { TextSection } from "../inspector/TextSection";
import { FigureSection, HtmlSection, ImageSection, TableSection } from "../inspector/AssetSections";
import { SlidePanel } from "../inspector/SlidePanel";
import { deleteSelection, duplicateSelection } from "./shortcuts";
import { boxOf, type Box } from "./transform";

const TYPE_ICONS: Record<BlockType, ReactNode> = {
  text: <Type size={15} />,
  shape: <Shapes size={15} />,
  figure: <ChartNoAxesCombined size={15} />,
  table: <Table2 size={15} />,
  html: <Code size={15} />,
  image: <ImageIcon size={15} />,
};

function IconButton({ label, onClick, disabled, children }: { label: string; onClick(): void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" className="icon" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

/** A number field that commits on Enter or blur, and steps with the arrow keys. */
function NumberField({ label, value, onCommit, suffix }: { label: string; value: number; onCommit(value: number): void; suffix?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [value]);
  const commit = () => {
    if (draft === null) return;
    const parsed = Number(draft);
    if (Number.isFinite(parsed) && parsed !== value) onCommit(parsed);
    setDraft(null);
  };
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={draft ?? String(Math.round(value))}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") setDraft(null);
        }}
      />
      {suffix && <em>{suffix}</em>}
    </label>
  );
}

function ArrangeSection({ slideId, ids }: { slideId: string; ids: string[] }) {
  const session = useSession();
  const { slide } = useCurrentSlide();
  const transact = session.doc.getState().transact;
  const align = (edge: AlignEdge) => transact("Align", (draft) => alignBlocks(draft, slideId, ids, edge));
  const layer = (move: LayerMove) => transact("Change layer", (draft) => reorderLayers(draft, slideId, ids, move));
  const order = slide ? stackOrder(slide) : [];
  const atTop = order.slice(-ids.length).every((id) => ids.includes(id));
  const atBottom = order.slice(0, ids.length).every((id) => ids.includes(id));
  const toWhat = ids.length > 1 ? "selection" : "slide";
  return (
    <section className="panel-section">
      <h3>Arrange</h3>
      <div className="button-row">
        <IconButton label={`Align left to ${toWhat}`} onClick={() => align("left")}><AlignStartVertical size={16} /></IconButton>
        <IconButton label={`Align centres horizontally to ${toWhat}`} onClick={() => align("center")}><AlignCenterVertical size={16} /></IconButton>
        <IconButton label={`Align right to ${toWhat}`} onClick={() => align("right")}><AlignEndVertical size={16} /></IconButton>
        <IconButton label={`Align top to ${toWhat}`} onClick={() => align("top")}><AlignStartHorizontal size={16} /></IconButton>
        <IconButton label={`Align middles vertically to ${toWhat}`} onClick={() => align("middle")}><AlignCenterHorizontal size={16} /></IconButton>
        <IconButton label={`Align bottom to ${toWhat}`} onClick={() => align("bottom")}><AlignEndHorizontal size={16} /></IconButton>
      </div>
      {ids.length >= 3 && (
        <div className="button-row">
          <IconButton label="Distribute horizontally" onClick={() => transact("Distribute", (d) => distributeBlocks(d, slideId, ids, "x"))}>
            <AlignHorizontalDistributeCenter size={16} />
          </IconButton>
          <IconButton label="Distribute vertically" onClick={() => transact("Distribute", (d) => distributeBlocks(d, slideId, ids, "y"))}>
            <AlignVerticalDistributeCenter size={16} />
          </IconButton>
        </div>
      )}
      <div className="button-row">
        <IconButton label="Bring to front" disabled={atTop} onClick={() => layer("front")}><ArrowUpToLine size={16} /></IconButton>
        <IconButton label="Bring forward" disabled={atTop} onClick={() => layer("forward")}><ArrowUp size={16} /></IconButton>
        <IconButton label="Send backward" disabled={atBottom} onClick={() => layer("backward")}><ArrowDown size={16} /></IconButton>
        <IconButton label="Send to back" disabled={atBottom} onClick={() => layer("back")}><ArrowDownToLine size={16} /></IconButton>
        <span className="spacer" />
        <IconButton label="Duplicate (Cmd/Ctrl+D)" onClick={() => duplicateSelection(session)}><Copy size={16} /></IconButton>
        <IconButton label="Delete" onClick={() => deleteSelection(session)}><Trash2 size={16} /></IconButton>
      </div>
    </section>
  );
}

function GeometrySection({ slideId, block }: { slideId: string; block: Block }) {
  const session = useSession();
  const box = boxOf(block);
  const update = (patch: Partial<Box>) =>
    session.doc.getState().transact("Edit geometry", (draft) => setBoxes(draft, slideId, new Map([[block.id, { ...box, ...patch }]])));
  return (
    <section className="panel-section">
      <h3>Position and size</h3>
      <div className="field-grid">
        <NumberField label="X" value={box.x} onCommit={(x) => update({ x })} />
        <NumberField label="Y" value={box.y} onCommit={(y) => update({ y })} />
        <NumberField label="W" value={box.w} onCommit={(w) => update({ w })} />
        <NumberField label="H" value={box.h} onCommit={(h) => update({ h })} />
        <NumberField label="Rotate" value={box.rotation} suffix="°" onCommit={(rotation) => update({ rotation })} />
      </div>
      <p className="hint">Slide pixels ({SLIDE_WIDTH} × {SLIDE_HEIGHT}).</p>
    </section>
  );
}

function PropertiesPanel() {
  const selection = useUi((state) => state.selection);
  const editing = useUi((state) => state.editing);
  const { slide, index } = useCurrentSlide();
  if (!slide) return <p className="muted">No slides yet.</p>;
  const selected = slide.blocks.filter((block) => selection.includes(block.id));
  if (!selected.length) return <SlidePanel slide={slide} index={index} />;
  const single = selected.length === 1 ? selected[0]! : null;
  return (
    <>
      {selected.length > 1 && <p className="panel-summary">{selected.length} objects selected</p>}
      {selected.every((block) => block.type === "shape") && <ShapeSection slideId={slide.id} blocks={selected} />}
      {selected.every((block) => block.type === "text") && (
        <TextSection slideId={slide.id} blocks={selected} editing={editing?.kind === "text"} />
      )}
      {single?.type === "image" && <ImageSection slideId={slide.id} block={single} />}
      {single?.type === "table" && <TableSection slideId={slide.id} block={single} />}
      {single?.type === "figure" && <FigureSection slideId={slide.id} block={single} />}
      {single?.type === "html" && <HtmlSection slideId={slide.id} block={single} />}
      <ArrangeSection slideId={slide.id} ids={selected.map((block) => block.id)} />
      {selected.length === 1 && <GeometrySection slideId={slide.id} block={selected[0]!} />}
    </>
  );
}

function LayersPanel() {
  const session = useSession();
  const assets = useAssets((state) => state);
  const selection = useUi((state) => state.selection);
  const { slide } = useCurrentSlide();
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  if (!slide) return null;
  const topFirst = stackOrder(slide).reverse();
  const byId = new Map(slide.blocks.map((block) => [block.id, block]));

  const drop = (targetIndex: number) => {
    if (!dragging) return;
    const moving = selection.includes(dragging) ? topFirst.filter((id) => selection.includes(id)) : [dragging];
    const rest = topFirst.filter((id) => !moving.includes(id));
    const before = topFirst.slice(0, targetIndex).filter((id) => !moving.includes(id)).length;
    const nextTopFirst = [...rest.slice(0, before), ...moving, ...rest.slice(before)];
    session.doc.getState().transact("Change layer", (draft) => {
      const target = slideById(draft, slide.id);
      if (target) applyStackOrder(target, [...nextTopFirst].reverse());
    });
    setDragging(null);
    setDropIndex(null);
  };

  return (
    <section className="panel-section layers">
      <p className="panel-summary">
        {selection.length ? `${selection.length} selected · ` : ""}{slide.blocks.length} object{slide.blocks.length === 1 ? "" : "s"} · top first
      </p>
      <ol className="layer-list">
        {topFirst.map((id, index) => {
          const block = byId.get(id)!;
          return (
            <li
              key={id}
              className={`${dropIndex === index ? "drop-before" : ""}`}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                setDropIndex(event.clientY < rect.top + rect.height / 2 ? index : index + 1);
              }}
              onDrop={(event) => {
                event.preventDefault();
                drop(dropIndex ?? index);
              }}
            >
              <button
                type="button"
                className="layer-item"
                aria-pressed={selection.includes(id)}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  setDragging(id);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setDropIndex(null);
                }}
                onClick={(event) => {
                  const ui = session.ui.getState();
                  if (event.shiftKey || event.metaKey || event.ctrlKey) ui.toggleSelected(id);
                  else ui.select([id]);
                }}
              >
                {TYPE_ICONS[block.type]}
                <span className="layer-name">{blockLabel(block, assets)}</span>
                <span className="layer-type">{block.type}</span>
              </button>
            </li>
          );
        })}
        {dropIndex === topFirst.length && <li className="drop-before" />}
      </ol>
      {topFirst.length > 1 && (
        <p className="hint">Drag to restack. The layer order is also the order Tab walks through objects.</p>
      )}
    </section>
  );
}

export function Sidebar() {
  const session = useSession();
  const tab = useUi((state) => state.sidebarTab);
  const tabs: [typeof tab, string][] = [["properties", "Properties"], ["layers", "Layers"]];
  return (
    <aside className="sidebar" aria-label="Inspector">
      <div className="tabs" role="tablist">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? "on" : ""}
            onClick={() => session.ui.getState().setSidebarTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="panel" role="tabpanel">{tab === "properties" ? <PropertiesPanel /> : <LayersPanel />}</div>
    </aside>
  );
}

