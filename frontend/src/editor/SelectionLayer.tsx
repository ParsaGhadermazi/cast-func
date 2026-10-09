/**
 * Everything the editor draws over the slide, in screen pixels:
 *
 * - a transparent hit target per block, stacked exactly like the blocks,
 *   so Plotly charts, iframes and tables never swallow a click;
 * - selection outlines, the transform frame and its handles;
 * - snap guides and the marquee.
 *
 * Blocks themselves are never restyled or re-stacked when selected.
 */

import type { CSSProperties } from "react";

import { useUi } from "../app/SessionContext";
import { SLIDE_HEIGHT, SLIDE_WIDTH, type Block, type Slide } from "../model/types";
import { describeShape, editableShapePoints, isLineShape } from "../render/shapes";
import { insertableEdges, pointsToSlide } from "./shapeEdit";
import { boxOf, HANDLES, handleSides, selectionFrame, type Box, type Handle } from "./transform";

function boxStyle(box: Box, zoom: number): CSSProperties {
  return {
    left: box.x * zoom,
    top: box.y * zoom,
    width: box.w * zoom,
    height: box.h * zoom,
    transform: box.rotation ? `rotate(${box.rotation}deg)` : undefined,
  };
}

const CURSORS = ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"];

/** Resize cursor for a handle, accounting for the frame's rotation. */
function handleCursor(handle: Handle, rotation: number): string {
  const [hx, hy] = handleSides(handle);
  const angle = (Math.atan2(hy, hx) * 180) / Math.PI + rotation;
  const index = ((Math.round(angle / 45) % 4) + 4) % 4;
  return CURSORS[index]!;
}

function Frame({ frame, zoom, showHandles }: { frame: Box; zoom: number; showHandles: boolean }) {
  const width = frame.w * zoom;
  const height = frame.h * zoom;
  // Edge handles crowd tiny frames; corners are enough there.
  const handles = HANDLES.filter((handle) => {
    const [hx, hy] = handleSides(handle);
    if (hx && hy) return true;
    return hx ? height >= 36 : width >= 36;
  });
  return (
    <div className="transform-frame" style={boxStyle(frame, zoom)}>
      {showHandles &&
        handles.map((handle) => {
          const [hx, hy] = handleSides(handle);
          return (
            <div
              key={handle}
              className="handle"
              data-handle={handle}
              style={{
                left: `${((hx + 1) / 2) * 100}%`,
                top: `${((hy + 1) / 2) * 100}%`,
                cursor: handleCursor(handle, frame.rotation),
              }}
            />
          );
        })}
      {showHandles && (
        <>
          <div className="rotate-stem" />
          <div className="rotate-handle" data-rotate="true" title="Drag to rotate (Shift snaps to 15°)" />
        </>
      )}
    </div>
  );
}

/**
 * Hit area that follows a shape's geometry: the filled area of closed shapes
 * and a generous band along lines, so empty corners of the bounding box (a
 * diagonal arrow, a triangle) never steal clicks from objects underneath.
 */
function ShapeHit({ block }: { block: Block }) {
  const { element, paint } = describeShape(block.style);
  const band = Math.max(paint.strokeWidth, 12);
  const common = {
    fill: element.tag === "path" && element.line ? "none" : "transparent",
    stroke: "transparent",
    strokeWidth: band,
    vectorEffect: "non-scaling-stroke" as const,
    pointerEvents: "visiblePainted" as const,
  };
  return (
    <svg className="shape-hit" viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%">
      {element.tag === "polygon" && <polygon points={element.points} {...common} />}
      {element.tag === "ellipse" && <ellipse cx="50" cy="50" rx="48" ry="48" {...common} />}
      {element.tag === "rect" && <rect x="1" y="1" width="98" height="98" rx={element.radius} ry={element.radius} {...common} />}
      {element.tag === "path" && <path d={element.d} {...common} />}
    </svg>
  );
}

/** Vertex handles (and "+" handles to add points) for an outline being edited. */
function OutlineHandles({ block, zoom, editing, activePoint }: {
  block: Block; zoom: number; editing: boolean; activePoint: number | null;
}) {
  const points = editableShapePoints(block.style);
  const slidePoints = pointsToSlide(boxOf(block), points);
  const edges = editing ? insertableEdges(points, block.style.shape) : [];
  return (
    <>
      {edges.map((index) => {
        const a = slidePoints[index]!;
        const b = slidePoints[(index + 1) % slidePoints.length]!;
        return (
          <div
            key={`insert-${index}`}
            className="insert-handle"
            data-insert={index}
            title="Click or drag to add a point"
            style={{ left: ((a.x + b.x) / 2) * zoom, top: ((a.y + b.y) / 2) * zoom }}
          />
        );
      })}
      {slidePoints.map((point, index) => (
        <div
          key={`vertex-${index}`}
          className={`vertex-handle${activePoint === index ? " active" : ""}`}
          data-vertex={index}
          title={editing ? "Drag to move; Delete removes the selected point" : "Drag to move this end"}
          style={{ left: point.x * zoom, top: point.y * zoom }}
        />
      ))}
    </>
  );
}

export function SelectionLayer({ slide, zoom, editingId }: { slide: Slide; zoom: number; editingId?: string | null }) {
  const selection = useUi((state) => state.selection);
  const primary = useUi((state) => state.primary);
  const guides = useUi((state) => state.guides);
  const marquee = useUi((state) => state.marquee);
  const gestureFrame = useUi((state) => state.gestureFrame);
  const gesture = useUi((state) => state.activeGesture);
  const editing = useUi((state) => state.editing);
  const drawing = useUi((state) => state.tool.kind !== "select");

  const selected = slide.blocks.filter((block) => selection.includes(block.id));
  const boxes = selected.map((block) => boxOf(block));
  const single = selected.length === 1 ? selected[0]! : null;
  const pointsEditing = editing?.kind === "points" && single?.id === editing.id;
  const line = single?.type === "shape" && isLineShape(single.style.shape) ? single : null;
  const outline = pointsEditing ? single : line;
  const frame = gestureFrame ?? selectionFrame(boxes);
  const showHandles = !outline && (gesture === null || gesture === "resize" || gesture === "rotate");

  return (
    <div className="selection-layer" style={{ width: SLIDE_WIDTH * zoom, height: SLIDE_HEIGHT * zoom }}>
      <div className="hit-layer">
        {slide.blocks.map((block) =>
          block.id === editingId ? null : (
            <div
              key={block.id}
              className={`hit${selection.includes(block.id) ? " selected" : ""}${block.type === "shape" ? " shape" : ""}`}
              data-hit={block.id}
              style={{ ...boxStyle(boxOf(block), zoom), zIndex: block.z }}
            >
              {block.type === "shape" && <ShapeHit block={block} />}
            </div>
          ),
        )}
      </div>
      <div className="chrome-layer">
        {selected.length > 1 &&
          selected.map((block, index) => (
            <div
              key={block.id}
              className={`member-outline${block.id === primary ? " primary" : ""}`}
              style={boxStyle(boxes[index]!, zoom)}
            />
          ))}
        {frame && !line && (
          <Frame frame={frame} zoom={zoom} showHandles={showHandles} />
        )}
        {pointsEditing && <div className="points-frame" style={boxStyle(boxes[0]!, zoom)} />}
        {outline && !drawing && (
          <OutlineHandles
            block={outline}
            zoom={zoom}
            editing={pointsEditing}
            activePoint={editing?.kind === "points" ? editing.point : null}
          />
        )}
        {guides?.xs.map((x) => (
          <div key={`x${x}`} className="guide vertical" style={{ left: x * zoom }} />
        ))}
        {guides?.ys.map((y) => (
          <div key={`y${y}`} className="guide horizontal" style={{ top: y * zoom }} />
        ))}
        {marquee && (
          <div
            className="marquee"
            style={{ left: marquee.x * zoom, top: marquee.y * zoom, width: marquee.w * zoom, height: marquee.h * zoom }}
          />
        )}
      </div>
    </div>
  );
}
