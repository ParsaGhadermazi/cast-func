import { FlipHorizontal2, FlipVertical2, Minus, PenLine, Plus, RotateCcw } from "lucide-react";

import { useDoc, useSession, useUi } from "../app/SessionContext";
import { setShapeKind, slideById } from "../editor/operations";
import { flipPoints, insertVertex, removeVertex, minPoints } from "../editor/shapeEdit";
import { ShapeIcon } from "../editor/Toolbar";
import type { Block, ShapeKind } from "../model/types";
import { editableShapePoints, isLineShape, MAX_SHAPE_POINTS, SHAPE_OPTIONS } from "../render/shapes";
import { ColorField, RangeField, Row, SelectField, shared, Toggle } from "../ui/controls";
import { useStyleEdit } from "./useStyleEdit";

const DASHES = [["solid", "Solid"], ["dash", "Dashed"], ["dot", "Dotted"], ["long", "Long dash"]] as const;
const CAPS = [["round", "Round"], ["butt", "Flat"], ["square", "Square"]] as const;

export function ShapeSection({ slideId, blocks }: { slideId: string; blocks: Block[] }) {
  const session = useSession();
  const accent = useDoc((state) => state.doc.theme.accent);
  const editing = useUi((state) => state.editing);
  const ids = blocks.map((block) => block.id);
  const edit = useStyleEdit(slideId, ids);
  const pick = <K extends keyof Block["style"]>(key: K) => shared(blocks.map((block) => block.style[key]));
  const kind = pick("shape") ?? (blocks.every((block) => !block.style.shape) ? "rect" : undefined);
  const allLines = blocks.every((block) => isLineShape(block.style.shape));
  const anyLine = blocks.some((block) => isLineShape(block.style.shape));
  const single = blocks.length === 1 ? blocks[0]! : null;
  const pointsMode = editing?.kind === "points" && single?.id === editing.id;
  const points = single ? editableShapePoints(single.style) : [];

  const setPoints = (next: typeof points | null, label: string, smooth?: boolean) =>
    session.doc.getState().transact(label, (draft) => {
      const block = slideById(draft, slideId)?.blocks.find((candidate) => candidate.id === single!.id);
      if (!block) return;
      block.style.points = next;
      if (smooth !== undefined) block.style.smooth = smooth;
    });

  return (
    <section className="panel-section">
      <h3>{allLines ? "Line" : "Shape"}</h3>
      <div className="shape-grid" role="radiogroup" aria-label="Shape type">
        {SHAPE_OPTIONS.map(([shape, title]) => (
          <button key={shape} type="button" role="radio" aria-checked={kind === shape} aria-label={title} title={title}
            className={kind === shape ? "on" : ""}
            onClick={() => session.doc.getState().transact("Change shape", (draft) => setShapeKind(draft, slideId, ids, shape as ShapeKind, accent))}>
            <ShapeIcon shape={shape} size={18} />
          </button>
        ))}
      </div>

      {!allLines && (
        <Row label="Fill">
          <ColorField label="Fill" value={anyLine ? undefined : (pick("fill") as string | undefined) ?? "#5b8cff"} accent={accent}
            allowNone onChange={(fill) => edit({ fill }, "Fill")} />
        </Row>
      )}
      <Row label={allLines ? "Colour" : "Stroke"}>
        <ColorField label={allLines ? "Line colour" : "Stroke"} accent={accent} allowNone={!allLines}
          value={(pick("stroke") as string | undefined) ?? (allLines ? (pick("fill") as string | undefined) : "transparent")}
          onChange={(stroke) => {
            // Giving an outline a colour should make it visible straight away.
            const width = Number(pick("strokeWidth")) || 0;
            edit(stroke !== "transparent" && !width && !allLines ? { stroke, strokeWidth: 2 } : { stroke }, "Stroke");
          }} />
      </Row>
      <Row label="Width">
        <RangeField label="Stroke width" min={0} max={32} value={pick("strokeWidth") as number | undefined ?? (allLines ? 4 : 0)}
          format={(v) => `${v}px`} onChange={(strokeWidth) => edit({ strokeWidth }, "Stroke width")} />
      </Row>
      <Row label="Style">
        <SelectField label="Stroke style" value={(pick("dash") as typeof DASHES[number][0] | undefined) ?? "solid"} options={DASHES}
          onChange={(dash) => edit({ dash }, "Stroke style")} />
      </Row>
      {allLines && (
        <>
          <Row label="Ends">
            <SelectField label="Line ends" value={(pick("lineCap") as typeof CAPS[number][0] | undefined) ?? "round"} options={CAPS}
              onChange={(lineCap) => edit({ lineCap }, "Line ends")} />
          </Row>
          <Row label="Arrow">
            <Toggle label="Arrowhead at the end" checked={shared(blocks.map((block) => block.style.shape === "arrow-line"))}
              onChange={(arrow) => session.doc.getState().transact("Arrowhead", (draft) =>
                setShapeKind(draft, slideId, ids, arrow ? "arrow-line" : "line", accent))} />
          </Row>
        </>
      )}
      {(kind === "rect" || kind === "round-rect") && !blocks.some((block) => block.style.points) && (
        <Row label="Corners">
          <RangeField label="Corner radius" min={0} max={50} value={pick("radius") as number | undefined ?? (kind === "round-rect" ? 16 : 0)}
            onChange={(radius) => edit({ radius, shape: radius > 0 ? "round-rect" : "rect" }, "Corner radius")} />
        </Row>
      )}
      <Row label="Shadow">
        <RangeField label="Shadow" min={0} max={24} value={pick("shadow") as number | undefined ?? 0} onChange={(shadow) => edit({ shadow }, "Shadow")} />
      </Row>
      <Row label="Opacity">
        <RangeField label="Opacity" min={0} max={1} step={0.05} value={pick("opacity") as number | undefined ?? 1}
          format={(v) => `${Math.round(v * 100)}%`} onChange={(opacity) => edit({ opacity }, "Opacity")} />
      </Row>

      {single && (
        <div className="outline-tools">
          <button type="button" className={pointsMode ? "on" : ""} aria-pressed={pointsMode}
            onClick={() => (pointsMode ? session.ui.getState().stopEditing() : session.ui.getState().startEditing({ kind: "points", id: single.id, point: null }))}>
            <PenLine size={15} /> {pointsMode ? "Done editing points" : "Edit points"}
          </button>
          {pointsMode && (
            <p className="hint">
              Drag a point to move it (Shift locks the direction). Drag a ◇ to add a point. Select a point and press Delete to
              remove it. Escape when done.
            </p>
          )}
          <div className="button-row">
            {pointsMode && (
              <>
                <button type="button" className="icon" aria-label="Add point" title="Add point" disabled={points.length >= MAX_SHAPE_POINTS}
                  onClick={() => {
                    const at = editing?.kind === "points" && editing.point !== null ? editing.point : 0;
                    setPoints(insertVertex(points, Math.min(at, isLineShape(single.style.shape) ? points.length - 2 : points.length - 1)), "Add point");
                  }}>
                  <Plus size={15} />
                </button>
                <button type="button" className="icon" aria-label="Remove point" title="Remove the selected point"
                  disabled={editing?.kind !== "points" || editing.point === null || points.length <= minPoints(single.style.shape)}
                  onClick={() => {
                    if (editing?.kind !== "points" || editing.point === null) return;
                    setPoints(removeVertex(points, editing.point, single.style.shape), "Remove point");
                    session.ui.getState().selectPoint(null);
                  }}>
                  <Minus size={15} />
                </button>
              </>
            )}
            <button type="button" className="icon" aria-label="Flip horizontally" title="Flip horizontally" onClick={() => setPoints(flipPoints(points, "x"), "Flip")}>
              <FlipHorizontal2 size={15} />
            </button>
            <button type="button" className="icon" aria-label="Flip vertically" title="Flip vertically" onClick={() => setPoints(flipPoints(points, "y"), "Flip")}>
              <FlipVertical2 size={15} />
            </button>
            <button type="button" className="icon" aria-label="Reset outline" title="Reset outline" disabled={!single.style.points}
              onClick={() => setPoints(null, "Reset outline", false)}>
              <RotateCcw size={15} />
            </button>
          </div>
          <Toggle label="Smooth curves" checked={!!single.style.smooth}
            onChange={(smooth) => setPoints(single.style.points ?? points, "Smooth outline", smooth)} />
        </div>
      )}
    </section>
  );
}
