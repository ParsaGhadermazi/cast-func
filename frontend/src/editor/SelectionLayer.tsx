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
import { SLIDE_HEIGHT, SLIDE_WIDTH, type Slide } from "../model/types";
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

export function SelectionLayer({ slide, zoom, editingId }: { slide: Slide; zoom: number; editingId?: string | null }) {
  const selection = useUi((state) => state.selection);
  const primary = useUi((state) => state.primary);
  const guides = useUi((state) => state.guides);
  const marquee = useUi((state) => state.marquee);
  const gestureFrame = useUi((state) => state.gestureFrame);
  const gesture = useUi((state) => state.activeGesture);

  const selected = slide.blocks.filter((block) => selection.includes(block.id));
  const boxes = selected.map((block) => boxOf(block));
  const frame = gestureFrame ?? selectionFrame(boxes);
  const showHandles = gesture === null || gesture === "resize" || gesture === "rotate";

  return (
    <div className="selection-layer" style={{ width: SLIDE_WIDTH * zoom, height: SLIDE_HEIGHT * zoom }}>
      <div className="hit-layer">
        {slide.blocks.map((block) =>
          block.id === editingId ? null : (
            <div
              key={block.id}
              className={`hit${selection.includes(block.id) ? " selected" : ""}`}
              data-hit={block.id}
              style={{ ...boxStyle(boxOf(block), zoom), zIndex: block.z }}
            />
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
        {frame && <Frame frame={frame} zoom={zoom} showHandles={showHandles} />}
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
