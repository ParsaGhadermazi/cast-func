/**
 * Transform geometry for selection, move, resize, rotate and snapping.
 *
 * Everything here works in slide pixels (1040 × 585) and is pure, so the
 * pointer code stays small and the maths is unit-tested. A `Box` is a block's
 * unrotated rectangle plus a rotation (degrees, clockwise) about its centre,
 * which is exactly how blocks are stored.
 */

import type { Draft } from "immer";

import { clampRect } from "../model/geometry";
import { MIN_BLOCK_SIZE, SLIDE_HEIGHT, SLIDE_WIDTH, type Block } from "../model/types";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Box extends Rect {
  rotation: number;
}

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const HANDLES: readonly Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export const MIN_W = MIN_BLOCK_SIZE * SLIDE_WIDTH;
export const MIN_H = MIN_BLOCK_SIZE * SLIDE_HEIGHT;

const RAD = Math.PI / 180;

// --------------------------------------------------------------------------
// Conversions
// --------------------------------------------------------------------------

export function boxOf(block: Pick<Block, "x" | "y" | "w" | "h" | "style">): Box {
  return {
    x: block.x * SLIDE_WIDTH,
    y: block.y * SLIDE_HEIGHT,
    w: block.w * SLIDE_WIDTH,
    h: block.h * SLIDE_HEIGHT,
    rotation: Number(block.style.rotate) || 0,
  };
}

/** Write a box back to a block (inside an Immer recipe), clamped like the server. */
export function applyBox(block: Draft<Block>, box: Box): void {
  const rect = clampRect({
    x: box.x / SLIDE_WIDTH,
    y: box.y / SLIDE_HEIGHT,
    w: box.w / SLIDE_WIDTH,
    h: box.h / SLIDE_HEIGHT,
  });
  block.x = rect.x;
  block.y = rect.y;
  block.w = rect.w;
  block.h = rect.h;
  const rotation = normalizeAngle(Math.round(box.rotation));
  if (rotation) block.style.rotate = rotation;
  else if (block.style.rotate !== undefined) block.style.rotate = 0;
}

// --------------------------------------------------------------------------
// Basic geometry
// --------------------------------------------------------------------------

export const centerOf = (rect: Rect): Point => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });

export function rotate(point: Point, degrees: number, around: Point = { x: 0, y: 0 }): Point {
  if (!degrees) return { ...point };
  const cos = Math.cos(degrees * RAD);
  const sin = Math.sin(degrees * RAD);
  const dx = point.x - around.x;
  const dy = point.y - around.y;
  return { x: around.x + dx * cos - dy * sin, y: around.y + dx * sin + dy * cos };
}

/** Normalise to (-180, 180]. */
export function normalizeAngle(degrees: number): number {
  let angle = degrees % 360;
  if (angle > 180) angle -= 360;
  if (angle <= -180) angle += 360;
  return angle === 0 ? 0 : angle; // avoid -0
}

/** Corners in order nw, ne, se, sw, after rotation. */
export function cornersOf(box: Box): Point[] {
  const center = centerOf(box);
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ].map((corner) => rotate(corner, box.rotation, center));
}

/** Axis-aligned bounds of a (possibly rotated) box. */
export function boundsOf(box: Box): Rect {
  if (!box.rotation) return { x: box.x, y: box.y, w: box.w, h: box.h };
  const corners = cornersOf(box);
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function unionRects(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: right - x, h: bottom - y };
}

export function rectFromPoints(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export const rectsIntersect = (a: Rect, b: Rect): boolean =>
  a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;

/** The frame drawn around a selection: the box itself for one object, bounds for several. */
export function selectionFrame(boxes: Box[]): Box | null {
  if (boxes.length === 1) return { ...boxes[0]! };
  const bounds = unionRects(boxes.map(boundsOf));
  return bounds ? { ...bounds, rotation: 0 } : null;
}

// --------------------------------------------------------------------------
// Move
// --------------------------------------------------------------------------

/**
 * Limit a translation so every block's stored rectangle stays on the slide
 * (the server clamps stored rectangles, so allowing more would only make the
 * two copies of the deck disagree).
 */
export function clampTranslation(boxes: Box[], dx: number, dy: number): Point {
  let minDx = -Infinity;
  let maxDx = Infinity;
  let minDy = -Infinity;
  let maxDy = Infinity;
  for (const box of boxes) {
    minDx = Math.max(minDx, -box.x);
    maxDx = Math.min(maxDx, SLIDE_WIDTH - box.w - box.x);
    minDy = Math.max(minDy, -box.y);
    maxDy = Math.min(maxDy, SLIDE_HEIGHT - box.h - box.y);
  }
  return {
    x: Math.min(Math.max(dx, Math.min(minDx, 0)), Math.max(maxDx, 0)),
    y: Math.min(Math.max(dy, Math.min(minDy, 0)), Math.max(maxDy, 0)),
  };
}

export const translateBox = (box: Box, dx: number, dy: number): Box => ({ ...box, x: box.x + dx, y: box.y + dy });

// --------------------------------------------------------------------------
// Resize
// --------------------------------------------------------------------------

const HANDLE_SIDES: Record<Handle, [number, number]> = {
  nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0],
};

export const handleSides = (handle: Handle): [number, number] => HANDLE_SIDES[handle];

export interface ResizeOptions {
  /** Keep the starting aspect ratio (Shift). */
  keepAspect?: boolean;
  /** Resize symmetrically about the centre (Alt). */
  fromCenter?: boolean;
  minW?: number;
  minH?: number;
}

/**
 * Resize a box by dragging one of its handles to `pointer` (slide pixels).
 * Works in the box's own rotated frame, so the opposite handle stays put on
 * screen. Dragging past the opposite side stops at the minimum size.
 */
export function resizeBox(start: Box, handle: Handle, pointer: Point, options: ResizeOptions = {}): Box {
  const { keepAspect = false, fromCenter = false, minW = MIN_W, minH = MIN_H } = options;
  const [hx, hy] = HANDLE_SIDES[handle];
  const center = centerOf(start);
  const local = rotate(pointer, -start.rotation, center);
  const px = local.x - center.x;
  const py = local.y - center.y;
  const halfW = start.w / 2;
  const halfH = start.h / 2;

  // Size along each axis the handle controls.
  let w = start.w;
  let h = start.h;
  if (hx) w = fromCenter ? 2 * hx * px : hx * px + halfW;
  if (hy) h = fromCenter ? 2 * hy * py : hy * py + halfH;

  if (keepAspect) {
    const ratio = start.w / start.h;
    if (hx && hy) {
      // Follow whichever axis the pointer moved further (relative to the size).
      const sx = w / start.w;
      const sy = h / start.h;
      const scale = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy;
      w = start.w * scale;
      h = start.h * scale;
    } else if (hx) {
      h = w / ratio;
    } else {
      w = h * ratio;
    }
  }

  // Respect minimum sizes (keeping the ratio when asked).
  if (keepAspect) {
    const scale = Math.max(1, minW / w, minH / h);
    w *= scale;
    h *= scale;
  } else {
    w = Math.max(w, minW);
    h = Math.max(h, minH);
  }

  // New centre in the local frame: anchored at the opposite side, or the
  // centre itself. Edge handles with a kept ratio grow about the edge's middle.
  const cx = fromCenter || !hx ? 0 : -hx * halfW + (hx * w) / 2;
  const cy = fromCenter || !hy ? 0 : -hy * halfH + (hy * h) / 2;
  const world = rotate({ x: center.x + cx, y: center.y + cy }, start.rotation, center);
  return { x: world.x - w / 2, y: world.y - h / 2, w, h, rotation: start.rotation };
}

/**
 * Resize several boxes by resizing their shared bounds. Boxes rotated by
 * anything other than a multiple of 90° cannot be stretched without
 * skewing, so such groups always scale uniformly.
 */
export function resizeGroup(starts: Box[], handle: Handle, pointer: Point, options: ResizeOptions = {}): Box[] {
  const frame = selectionFrame(starts);
  if (!frame) return starts;
  const oblique = starts.some((box) => box.rotation % 90 !== 0);
  const next = resizeBox(frame, handle, pointer, { ...options, keepAspect: options.keepAspect || oblique, minW: 1, minH: 1 });
  return scaleBoxesInto(starts, frame, next);
}

/** Map boxes laid out in `from` into `to`, scaling positions and sizes. */
export function scaleBoxesInto(boxes: Box[], from: Rect, to: Rect): Box[] {
  const sx = to.w / from.w;
  const sy = to.h / from.h;
  return boxes.map((box) => {
    const center = centerOf(box);
    const nextCenter = { x: to.x + (center.x - from.x) * sx, y: to.y + (center.y - from.y) * sy };
    const quarterTurn = Math.abs(normalizeAngle(box.rotation)) === 90;
    const w = Math.max(MIN_W, box.w * (quarterTurn ? sy : sx));
    const h = Math.max(MIN_H, box.h * (quarterTurn ? sx : sy));
    return { x: nextCenter.x - w / 2, y: nextCenter.y - h / 2, w, h, rotation: box.rotation };
  });
}

// --------------------------------------------------------------------------
// Rotate
// --------------------------------------------------------------------------

export const angleOf = (center: Point, point: Point): number =>
  Math.atan2(point.y - center.y, point.x - center.x) / RAD;

/** Rotation after dragging the rotate handle from `from` to `to`. */
export function rotationDelta(center: Point, from: Point, to: Point): number {
  return normalizeAngle(angleOf(center, to) - angleOf(center, from));
}

export function snapAngle(degrees: number, step = 15): number {
  return normalizeAngle(Math.round(degrees / step) * step);
}

/** Rotate boxes as a rigid group about `pivot`. */
export function rotateBoxes(boxes: Box[], pivot: Point, delta: number): Box[] {
  return boxes.map((box) => {
    const center = rotate(centerOf(box), delta, pivot);
    return { ...box, x: center.x - box.w / 2, y: center.y - box.h / 2, rotation: normalizeAngle(box.rotation + delta) };
  });
}

// --------------------------------------------------------------------------
// Snapping
// --------------------------------------------------------------------------

export interface SnapTargets {
  xs: number[];
  ys: number[];
}

export interface Guides {
  xs: number[];
  ys: number[];
}

export const NO_GUIDES: Guides = { xs: [], ys: [] };

/** Slide edges and centre, plus the edges and centres of other objects. */
export function snapTargetsFor(others: Rect[]): SnapTargets {
  const xs = [0, SLIDE_WIDTH / 2, SLIDE_WIDTH];
  const ys = [0, SLIDE_HEIGHT / 2, SLIDE_HEIGHT];
  for (const rect of others) {
    xs.push(rect.x, rect.x + rect.w / 2, rect.x + rect.w);
    ys.push(rect.y, rect.y + rect.h / 2, rect.y + rect.h);
  }
  return { xs, ys };
}

function nearest(values: number[], targets: number[], threshold: number): number | null {
  let best: number | null = null;
  for (const value of values) {
    for (const target of targets) {
      const diff = target - value;
      if (Math.abs(diff) <= threshold && (best === null || Math.abs(diff) < Math.abs(best))) best = diff;
    }
  }
  return best;
}

const EPSILON = 0.5;
const matches = (values: number[], targets: number[]) =>
  [...new Set(targets.filter((target) => values.some((value) => Math.abs(value - target) <= EPSILON)))];

/** Guides for every target that lines up with the rect's edges or centre. */
export function guidesFor(rect: Rect, targets: SnapTargets): Guides {
  return {
    xs: matches([rect.x, rect.x + rect.w / 2, rect.x + rect.w], targets.xs),
    ys: matches([rect.y, rect.y + rect.h / 2, rect.y + rect.h], targets.ys),
  };
}

/** Adjust a move so the moved bounds' edges or centre land on a target. */
export function snapMove(bounds: Rect, dx: number, dy: number, targets: SnapTargets, threshold: number): Point {
  const moved = { ...bounds, x: bounds.x + dx, y: bounds.y + dy };
  const sx = nearest([moved.x, moved.x + moved.w / 2, moved.x + moved.w], targets.xs, threshold);
  const sy = nearest([moved.y, moved.y + moved.h / 2, moved.y + moved.h], targets.ys, threshold);
  return { x: dx + (sx ?? 0), y: dy + (sy ?? 0) };
}

/**
 * Snap the edges a resize is moving. Only for unrotated frames without a
 * kept ratio; otherwise snapping one edge would fight the constraint.
 */
export function snapResize(box: Box, handle: Handle, targets: SnapTargets, threshold: number): Box {
  if (box.rotation) return box;
  const [hx, hy] = HANDLE_SIDES[handle];
  const next = { ...box };
  if (hx) {
    const edge = hx > 0 ? box.x + box.w : box.x;
    const diff = nearest([edge], targets.xs, threshold);
    if (diff !== null) {
      if (hx > 0) next.w = Math.max(MIN_W, box.w + diff);
      else {
        next.x = box.x + diff;
        next.w = Math.max(MIN_W, box.w - diff);
      }
    }
  }
  if (hy) {
    const edge = hy > 0 ? box.y + box.h : box.y;
    const diff = nearest([edge], targets.ys, threshold);
    if (diff !== null) {
      if (hy > 0) next.h = Math.max(MIN_H, box.h + diff);
      else {
        next.y = box.y + diff;
        next.h = Math.max(MIN_H, box.h - diff);
      }
    }
  }
  return next;
}
