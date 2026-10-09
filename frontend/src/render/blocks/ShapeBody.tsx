import { useId } from "react";

import type { BlockStyle } from "../../model/types";
import { describeShape } from "../shapes";

/** A shape drawn in a stretched 0..100 viewBox; strokes keep their width. */
export function ShapeSvg({ style }: { style: BlockStyle }) {
  // Each SVG gets its own marker id; a shared id would let one arrow's
  // colour leak into every other arrow on the page.
  const markerId = `arrow-${useId().replace(/:/g, "")}`;
  const { element, paint } = describeShape(style);
  const stroke = {
    fill: paint.fill,
    stroke: paint.stroke,
    strokeWidth: paint.strokeWidth,
    strokeDasharray: paint.dash,
    strokeLinecap: paint.lineCap as "round" | "butt" | "square",
    strokeLinejoin: paint.lineJoin as "round" | "miter" | "bevel",
    vectorEffect: "non-scaling-stroke" as const,
  };
  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" className="shape-svg" aria-hidden="true">
      {paint.arrow && (
        <defs>
          <marker id={markerId} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L10,5 L0,10 Z" fill={paint.stroke} />
          </marker>
        </defs>
      )}
      {element.tag === "polygon" && <polygon points={element.points} {...stroke} />}
      {element.tag === "ellipse" && <ellipse cx="50" cy="50" rx="48" ry="48" {...stroke} />}
      {element.tag === "rect" && <rect x="1" y="1" width="98" height="98" rx={element.radius} ry={element.radius} {...stroke} />}
      {element.tag === "path" && (
        <path d={element.d} {...stroke} markerEnd={paint.arrow ? `url(#${markerId})` : undefined} />
      )}
    </svg>
  );
}

export function ShapeBody({ style }: { style: BlockStyle }) {
  const shadow = Number(style.shadow) || 0;
  return (
    <div
      className="body shape"
      style={{ filter: shadow ? `drop-shadow(0 ${shadow}px ${shadow * 2}px rgba(0,0,0,.28))` : undefined }}
    >
      <ShapeSvg style={style} />
    </div>
  );
}
