/**
 * Geometry rules shared with `cast/registry.py::_decode_deck`.
 *
 * Blocks are stored normalised to the slide (0..1). The server clamps every
 * saved block, so the client applies the same rules before anything is synced;
 * otherwise the two copies of the document would silently diverge.
 */

import { MIN_BLOCK_SIZE, type Block } from "./types";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/** Clamp size first, then position, exactly like the Python decoder. */
export function clampRect(rect: Rect): Rect {
  const w = clamp(rect.w, MIN_BLOCK_SIZE, 1);
  const h = clamp(rect.h, MIN_BLOCK_SIZE, 1);
  return {
    w,
    h,
    x: clamp(rect.x, 0, 1 - w),
    y: clamp(rect.y, 0, 1 - h),
  };
}

export function rectOf(block: Pick<Block, "x" | "y" | "w" | "h">): Rect {
  return { x: block.x, y: block.y, w: block.w, h: block.h };
}

/** Apply a clamped rect to a block in place (for use inside Immer recipes). */
export function setRect(block: Block, rect: Rect): void {
  const next = clampRect(rect);
  block.x = next.x;
  block.y = next.y;
  block.w = next.w;
  block.h = next.h;
}
