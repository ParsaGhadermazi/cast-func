import { ChevronDown, MousePointer2, Type } from "lucide-react";

import { useSession, useUi } from "../app/SessionContext";
import { ShapeSvg } from "../render/blocks/ShapeBody";
import { SHAPE_OPTIONS, isLineShape } from "../render/shapes";
import type { ShapeKind } from "../model/types";
import { Popover } from "../ui/Popover";
import { useCurrentSlide } from "./hooks";

const SHAPE_KEYS: Partial<Record<ShapeKind, string>> = { rect: "R", ellipse: "O", line: "L", "arrow-line": "Shift+L" };

export function ShapeIcon({ shape, size = 18 }: { shape: ShapeKind; size?: number }) {
  return (
    <span className="shape-icon" style={{ width: size, height: size }}>
      <ShapeSvg
        style={{
          shape,
          fill: "currentColor",
          stroke: "currentColor",
          strokeWidth: isLineShape(shape) ? 2 : 0,
          radius: shape === "round-rect" ? 22 : 0,
        }}
      />
    </span>
  );
}

export function Toolbar() {
  const session = useSession();
  const tool = useUi((state) => state.tool);
  const shapeKind = useUi((state) => state.shapeKind);
  const { slide } = useCurrentSlide();
  const ui = session.ui.getState();
  const hasSlide = !!slide;

  return (
    <div className="toolbar" role="toolbar" aria-label="Tools">
      <button type="button" className={`icon toggle${tool.kind === "select" ? " on" : ""}`} aria-pressed={tool.kind === "select"}
        aria-label="Select" title="Select (V)" onClick={() => ui.setTool({ kind: "select" })}>
        <MousePointer2 size={16} />
      </button>
      <button type="button" className={`toggle${tool.kind === "text" ? " on" : ""}`} aria-pressed={tool.kind === "text"} disabled={!hasSlide}
        title="Text (T): click to place a text box, or drag to size it" onClick={() => ui.setTool({ kind: "text" })}>
        <Type size={16} /> <span>Text</span>
      </button>
      <div className="split">
        <button type="button" className={`toggle${tool.kind === "shape" ? " on" : ""}`} aria-pressed={tool.kind === "shape"} disabled={!hasSlide}
          title="Shape: drag on the slide to draw (Shift keeps proportions), or click for a default size"
          onClick={() => ui.setTool({ kind: "shape", shape: shapeKind })}>
          <ShapeIcon shape={shapeKind} size={16} /> <span>Shape</span>
        </button>
        <Popover label="Choose a shape" buttonClassName="icon toggle split-arrow" button={<ChevronDown size={14} />} width={252} disabled={!hasSlide}>
          {(close) => (
            <div className="shape-palette">
              {SHAPE_OPTIONS.map(([shape, title]) => (
                <button
                  key={shape}
                  type="button"
                  className={shape === shapeKind ? "on" : ""}
                  aria-label={title}
                  title={SHAPE_KEYS[shape] ? `${title} (${SHAPE_KEYS[shape]})` : title}
                  onClick={() => {
                    ui.setTool({ kind: "shape", shape });
                    close();
                  }}
                >
                  <ShapeIcon shape={shape} size={20} />
                </button>
              ))}
            </div>
          )}
        </Popover>
      </div>
    </div>
  );
}
