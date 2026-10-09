/**
 * Editing a shape's outline in slide space.
 *
 * Shapes store their outline as points in a 0..100 viewBox stretched over
 * the block. Editing works on the points' positions on the slide instead:
 * move a vertex anywhere (even outside the current box) and the box is
 * refitted around the outline, keeping every other vertex where it is on
 * screen. Lines and arrows are simply two-point outlines.
 */

import type { ShapePoint } from "../model/types";
import { isLineShape, MAX_SHAPE_POINTS } from "../render/shapes";
import { centerOf, MIN_H, MIN_W, normalizeAngle, rotate, type Box, type Point } from "./transform";

/** Where each 0..100 point sits on the slide. */
export function pointsToSlide(box: Box, points: ShapePoint[]): Point[] {
  const center = centerOf(box);
  return points.map(([px, py]) =>
    rotate({ x: box.x + (px / 100) * box.w, y: box.y + (py / 100) * box.h }, box.rotation, center),
  );
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Fit a box (keeping its rotation) around outline points given on the slide,
 * and express the points in the box's 0..100 viewBox.
 */
export function fitOutline(rotation: number, slidePoints: Point[], pivot: Point): { box: Box; points: ShapePoint[] } {
  // Work in the shape's own (unrotated) frame around an arbitrary pivot.
  const local = slidePoints.map((point) => rotate(point, -rotation, pivot));
  let minX = Math.min(...local.map((p) => p.x));
  let maxX = Math.max(...local.map((p) => p.x));
  let minY = Math.min(...local.map((p) => p.y));
  let maxY = Math.max(...local.map((p) => p.y));
  // A straight line has zero height; give the box its minimum size around it.
  if (maxX - minX < MIN_W) {
    const mid = (minX + maxX) / 2;
    minX = mid - MIN_W / 2;
    maxX = mid + MIN_W / 2;
  }
  if (maxY - minY < MIN_H) {
    const mid = (minY + maxY) / 2;
    minY = mid - MIN_H / 2;
    maxY = mid + MIN_H / 2;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const centerLocal = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const center = rotate(centerLocal, rotation, pivot);
  const box = { x: center.x - w / 2, y: center.y - h / 2, w, h, rotation: normalizeAngle(rotation) };
  const points = local.map((p): ShapePoint => [round(((p.x - minX) / w) * 100), round(((p.y - minY) / h) * 100)]);
  return { box, points };
}

/** Move one vertex to a slide position and refit the box. */
export function moveVertex(box: Box, points: ShapePoint[], index: number, to: Point): { box: Box; points: ShapePoint[] } {
  const slidePoints = pointsToSlide(box, points);
  slidePoints[index] = to;
  return fitOutline(box.rotation, slidePoints, centerOf(box));
}

/** Insert a vertex in the middle of the edge that starts at `index`. */
export function insertVertex(points: ShapePoint[], index: number): ShapePoint[] {
  if (points.length >= MAX_SHAPE_POINTS) return points;
  const a = points[index]!;
  const b = points[(index + 1) % points.length]!;
  const next = [...points];
  next.splice(index + 1, 0, [round((a[0] + b[0]) / 2), round((a[1] + b[1]) / 2)]);
  return next;
}

export const minPoints = (shape: string | undefined): number => (isLineShape(shape) ? 2 : 3);

export function removeVertex(points: ShapePoint[], index: number, shape: string | undefined): ShapePoint[] {
  if (points.length <= minPoints(shape)) return points;
  return points.filter((_, i) => i !== index);
}

export function flipPoints(points: ShapePoint[], axis: "x" | "y"): ShapePoint[] {
  return points.map(([x, y]) => (axis === "x" ? [round(100 - x), y] : [x, round(100 - y)]));
}

/** Edges that can take a new vertex: all edges of a closed outline, the segments of a line. */
export function insertableEdges(points: ShapePoint[], shape: string | undefined): number[] {
  if (points.length >= MAX_SHAPE_POINTS) return [];
  const count = isLineShape(shape) ? points.length - 1 : points.length;
  return Array.from({ length: count }, (_, i) => i);
}

/** Constrain `to` relative to `from` to the nearest 45° direction (Shift). */
export function snapToAngle(from: Point, to: Point, step = 45): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const angle = Math.round(Math.atan2(dy, dx) / ((step * Math.PI) / 180)) * ((step * Math.PI) / 180);
  return { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length };
}

/** A line from `a` to `b` as a block box plus two endpoints. */
export function lineBetween(a: Point, b: Point): { box: Box; points: ShapePoint[] } {
  return fitOutline(0, [a, b], { x: 0, y: 0 });
}
