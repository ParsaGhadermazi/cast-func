/**
 * Shape geometry in a 0..100 viewBox, ported from the legacy editor and
 * `cast/export.py` so saved decks render identically.
 */

import { clamp } from "../model/geometry";
import type { BlockStyle, ShapeKind, ShapePoint } from "../model/types";

export const SHAPE_OPTIONS: readonly [ShapeKind, string][] = [
  ["rect", "Rectangle"], ["round-rect", "Rounded rectangle"], ["ellipse", "Ellipse"], ["triangle", "Triangle"],
  ["diamond", "Diamond"], ["pentagon", "Pentagon"], ["hexagon", "Hexagon"], ["star", "Star"],
  ["chevron", "Chevron"], ["arrow-right", "Block arrow"], ["line", "Line"], ["arrow-line", "Arrow line"],
];

export const shapeTitle = (kind: string | undefined): string =>
  SHAPE_OPTIONS.find(([value]) => value === kind)?.[1] ?? "Shape";

export const isLineShape = (kind: string | undefined): boolean => kind === "line" || kind === "arrow-line";

export const MAX_SHAPE_POINTS = 64;

const POLY_POINTS: Record<string, string> = {
  triangle: "50,3 97,97 3,97",
  diamond: "50,2 98,50 50,98 2,50",
  pentagon: "50,3 97,38 79,97 21,97 3,38",
  hexagon: "25,4 75,4 98,50 75,96 25,96 2,50",
  star: "50,4 61,36 96,36 68,56 79,91 50,70 21,91 32,56 4,36 39,36",
  chevron: "12,6 62,6 92,50 62,94 12,94 42,50",
  "arrow-right": "4,20 66,20 66,4 98,50 66,96 66,80 4,80",
};

const parsePoints = (spec: string): ShapePoint[] =>
  spec.split(" ").map((pair) => pair.split(",").map(Number) as ShapePoint);

/** Custom points are used only when they are a valid outline for the kind. */
export function hasCustomPoints(style: BlockStyle): boolean {
  const points = style.points;
  return (
    Array.isArray(points) &&
    points.length >= (isLineShape(style.shape) ? 2 : 3) &&
    points.length <= MAX_SHAPE_POINTS &&
    points.every(
      (point) => Array.isArray(point) && point.length === 2 && point.every((v) => typeof v === "number" && Number.isFinite(v)),
    )
  );
}

/** The outline as editable points: stored points, or the kind's implicit outline. */
export function editableShapePoints(style: BlockStyle): ShapePoint[] {
  if (hasCustomPoints(style)) {
    return style.points!.map(([x, y]) => [clamp(x, 0, 100), clamp(y, 0, 100)]);
  }
  const shape = style.shape ?? "rect";
  if (isLineShape(shape)) return [[4, 50], [96, 50]];
  if (shape === "ellipse") {
    return Array.from({ length: 12 }, (_, i) => {
      const angle = -Math.PI / 2 + (i * Math.PI) / 6;
      return [50 + 48 * Math.cos(angle), 50 + 48 * Math.sin(angle)];
    });
  }
  if (shape === "rect") return [[1, 1], [99, 1], [99, 99], [1, 99]];
  if (shape === "round-rect") {
    const radius = clamp(Number(style.radius ?? 16), 0, 49);
    if (radius < 2) return [[1, 1], [99, 1], [99, 99], [1, 99]];
    const corners: [number, number, number, number][] = [
      [99 - radius, 1 + radius, -Math.PI / 2, 0],
      [99 - radius, 99 - radius, 0, Math.PI / 2],
      [1 + radius, 99 - radius, Math.PI / 2, Math.PI],
      [1 + radius, 1 + radius, Math.PI, (3 * Math.PI) / 2],
    ];
    return corners.flatMap(([cx, cy, start, end]) =>
      [start, end].map((angle): ShapePoint => [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]),
    );
  }
  return parsePoints(POLY_POINTS[shape] ?? POLY_POINTS.triangle!);
}

/** Catmull-Rom spline through the points, as cubic Béziers (tangents / 6). */
export function smoothShapePath(points: ShapePoint[], closed: boolean): string {
  if (points.length < 3) return straightPath(points);
  const at = (i: number) => points[i]!;
  const path = [`M${at(0)[0]} ${at(0)[1]}`];
  const n = points.length;
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const p0 = at(closed ? (i - 1 + n) % n : Math.max(0, i - 1));
    const p1 = at(i);
    const p2 = at((i + 1) % n);
    const p3 = at(closed ? (i + 2) % n : Math.min(n - 1, i + 2));
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    path.push(`C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${p2[0]} ${p2[1]}`);
  }
  if (closed) path.push("Z");
  return path.join(" ");
}

export const straightPath = (points: ShapePoint[]): string =>
  points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");

export function strokeDash(dash: string | undefined): string | undefined {
  if (dash === "dash") return "10 7";
  if (dash === "dot") return "2 6";
  if (dash === "long") return "18 8";
  return undefined;
}

const visibleStroke = (stroke: string | undefined) =>
  stroke && stroke !== "transparent" && stroke !== "none" ? stroke : undefined;

export type ShapeElement =
  | { tag: "polygon"; points: string }
  | { tag: "path"; d: string; line: boolean }
  | { tag: "ellipse" }
  | { tag: "rect"; radius: number };

export interface ShapePaint {
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash: string | undefined;
  lineCap: string;
  lineJoin: string;
  arrow: boolean;
}

/** Everything needed to draw a shape, independent of the DOM. */
export function describeShape(style: BlockStyle): { element: ShapeElement; paint: ShapePaint } {
  const shape = style.shape ?? "rect";
  const line = isLineShape(shape);
  const custom = hasCustomPoints(style);
  const fill = style.fill || "#5b8cff";
  const paint: ShapePaint = {
    fill: line ? "none" : fill,
    // Lines fall back to the fill colour; filled shapes have no stroke by default.
    stroke: visibleStroke(style.stroke) ?? (line ? fill : "none"),
    strokeWidth: Number(style.strokeWidth || (line ? 4 : 0)),
    dash: strokeDash(style.dash),
    lineCap: style.lineCap || "round",
    lineJoin: line ? "round" : style.lineJoin || "round",
    arrow: shape === "arrow-line",
  };

  let element: ShapeElement;
  if (line) {
    const points = custom ? editableShapePoints(style) : ([[4, 50], [96, 50]] as ShapePoint[]);
    element = { tag: "path", d: style.smooth ? smoothShapePath(points, false) : straightPath(points), line: true };
  } else if (custom) {
    const points = editableShapePoints(style);
    element = style.smooth
      ? { tag: "path", d: smoothShapePath(points, true), line: false }
      : { tag: "polygon", points: points.map((p) => p.join(",")).join(" ") };
  } else if (shape === "ellipse") {
    element = { tag: "ellipse" };
  } else if (shape === "round-rect") {
    element = { tag: "rect", radius: Number(style.radius ?? 16) };
  } else if (shape === "rect") {
    element = { tag: "rect", radius: Number(style.radius || 0) };
  } else {
    element = { tag: "polygon", points: POLY_POINTS[shape] ?? POLY_POINTS.triangle! };
  }
  return { element, paint };
}
