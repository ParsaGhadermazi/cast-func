/**
 * Document edits behind the editor's commands. Each function is an Immer
 * recipe body (it mutates a draft deck), so a caller wraps it in one
 * `transact()` and the whole command is a single undo step.
 */

import { current, isDraft, type Draft } from "immer";

import { migrateTextBlock } from "../model/normalize";
import {
  BLOCK_TYPES,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type Block,
  type BlockType,
  type Deck,
  type ShapeKind,
  type ShapePoint,
  type Slide,
} from "../model/types";
import { applyBox, boundsOf, boxOf, clampTranslation, translateBox, unionRects, type Box } from "./transform";

type DraftDeck = Draft<Deck>;

export function slideById<T extends Deck | DraftDeck>(deck: T, slideId: string): T["slides"][number] | undefined {
  return deck.slides.find((slide) => slide.id === slideId) as T["slides"][number] | undefined;
}

/** Next free ids in the `prefix<number>` scheme the server also uses. */
export function nextIds(existing: Iterable<string>, prefix: string, count: number): string[] {
  let max = 0;
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  for (const id of existing) {
    const match = pattern.exec(id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return Array.from({ length: count }, (_, i) => `${prefix}${max + i + 1}`);
}

export const allBlockIds = (deck: Deck | DraftDeck): string[] =>
  deck.slides.flatMap((slide) => slide.blocks.map((block) => block.id));

// --------------------------------------------------------------------------
// Layers
// --------------------------------------------------------------------------

/** Block ids bottom to top: by z, ties broken by document order (as rendered). */
export function stackOrder(slide: Slide | Draft<Slide>): string[] {
  return slide.blocks
    .map((block, index) => ({ id: block.id, z: block.z, index }))
    .sort((a, b) => a.z - b.z || a.index - b.index)
    .map((entry) => entry.id);
}

export type LayerMove = "front" | "forward" | "backward" | "back";

export function moveInStack(order: string[], selected: Set<string>, move: LayerMove): string[] {
  const picked = order.filter((id) => selected.has(id));
  const rest = order.filter((id) => !selected.has(id));
  if (move === "front") return [...rest, ...picked];
  if (move === "back") return [...picked, ...rest];
  const next = [...order];
  if (move === "forward") {
    for (let i = next.length - 2; i >= 0; i--) {
      if (selected.has(next[i]!) && !selected.has(next[i + 1]!)) [next[i], next[i + 1]] = [next[i + 1]!, next[i]!];
    }
  } else {
    for (let i = 1; i < next.length; i++) {
      if (selected.has(next[i]!) && !selected.has(next[i - 1]!)) [next[i], next[i - 1]] = [next[i - 1]!, next[i]!];
    }
  }
  return next;
}

/** Write a stacking order back as z = 0..n-1 (also normalises tied legacy z values). */
export function applyStackOrder(slide: Draft<Slide>, order: string[]): void {
  const rank = new Map(order.map((id, index) => [id, index]));
  for (const block of slide.blocks) {
    const z = rank.get(block.id);
    if (z !== undefined && block.z !== z) block.z = z;
  }
}

export function reorderLayers(deck: DraftDeck, slideId: string, ids: string[], move: LayerMove): void {
  const slide = slideById(deck, slideId);
  if (!slide) return;
  applyStackOrder(slide, moveInStack(stackOrder(slide), new Set(ids), move));
}

// --------------------------------------------------------------------------
// Delete, insert, duplicate, paste
// --------------------------------------------------------------------------

export function deleteBlocks(deck: DraftDeck, slideId: string, ids: string[]): void {
  const slide = slideById(deck, slideId);
  if (!slide) return;
  const doomed = new Set(ids);
  slide.blocks = slide.blocks.filter((block) => !doomed.has(block.id));
}

/** A block as it travels through the clipboard: no id, no z. */
export type BlockPayload = Omit<Block, "id" | "z">;

export function toPayload(block: Block | Draft<Block>): BlockPayload {
  const source = isDraft(block) ? current(block) : block;
  const { id: _id, z: _z, ...rest } = source as Block;
  return structuredClone(rest);
}

/**
 * Add blocks on top of a slide's stack, returning their new ids. If every
 * pasted block would land exactly on a block that is already there (pasting
 * or duplicating in place), the copies are offset so they are visible.
 */
export function insertBlocks(deck: DraftDeck, slideId: string, payloads: BlockPayload[], offset = 12): string[] {
  const slide = slideById(deck, slideId);
  if (!slide || !payloads.length) return [];
  const ids = nextIds(allBlockIds(deck), "b", payloads.length);
  const top = slide.blocks.reduce((max, block) => Math.max(max, block.z), -1);
  const occupied = (payload: BlockPayload, dx: number, dy: number) =>
    slide.blocks.some(
      (block) =>
        Math.abs(block.x - (payload.x + dx)) < 1e-6 &&
        Math.abs(block.y - (payload.y + dy)) < 1e-6 &&
        Math.abs(block.w - payload.w) < 1e-6 &&
        Math.abs(block.h - payload.h) < 1e-6,
    );
  // Step diagonally until the copies no longer sit exactly on existing blocks.
  let dx = 0;
  let dy = 0;
  for (let step = 0; offset > 0 && step < 20 && payloads.every((payload) => occupied(payload, dx, dy)); step++) {
    dx += offset / SLIDE_WIDTH;
    dy += offset / SLIDE_HEIGHT;
  }
  const shift = clampTranslation(
    payloads.map((payload) => boxOf(payload)),
    dx * SLIDE_WIDTH,
    dy * SLIDE_HEIGHT,
  );
  payloads.forEach((payload, index) => {
    const block = { ...structuredClone(payload), id: ids[index]!, z: top + 1 + index } as Block;
    slide.blocks.push(block);
    const added = slide.blocks[slide.blocks.length - 1]!;
    applyBox(added, translateBox(boxOf(block), shift.x, shift.y));
  });
  return ids;
}

export function duplicateBlocks(deck: DraftDeck, slideId: string, ids: string[]): string[] {
  const slide = slideById(deck, slideId);
  if (!slide) return [];
  const wanted = new Set(ids);
  const order = stackOrder(slide);
  const sources = order.map((id) => slide.blocks.find((block) => block.id === id)!).filter((block) => wanted.has(block.id));
  return insertBlocks(deck, slideId, sources.map(toPayload));
}

// --------------------------------------------------------------------------
// Geometry commands
// --------------------------------------------------------------------------

function selectedBlocks(deck: DraftDeck, slideId: string, ids: string[]): Draft<Block>[] {
  const wanted = new Set(ids);
  return slideById(deck, slideId)?.blocks.filter((block) => wanted.has(block.id)) ?? [];
}

export function setBoxes(deck: DraftDeck, slideId: string, boxes: Map<string, Box>): void {
  for (const block of slideById(deck, slideId)?.blocks ?? []) {
    const box = boxes.get(block.id);
    if (box) applyBox(block, box);
  }
}

/** Move blocks by a number of slide pixels, kept on the slide as a group. */
export function nudgeBlocks(deck: DraftDeck, slideId: string, ids: string[], dx: number, dy: number): void {
  const blocks = selectedBlocks(deck, slideId, ids);
  const boxes = blocks.map((block) => boxOf(block));
  const shift = clampTranslation(boxes, dx, dy);
  blocks.forEach((block, index) => applyBox(block, translateBox(boxes[index]!, shift.x, shift.y)));
}

export type AlignEdge = "left" | "center" | "right" | "top" | "middle" | "bottom";

/** Margins used when aligning a single object to the slide (legacy values). */
const SLIDE_MARGIN = { x: 0.06 * SLIDE_WIDTH, y: 0.08 * SLIDE_HEIGHT };

/**
 * Align one object to the slide (with the legacy margins), or several
 * objects to their shared bounds. Rotated objects align by their visible bounds.
 */
export function alignBlocks(deck: DraftDeck, slideId: string, ids: string[], edge: AlignEdge): void {
  const blocks = selectedBlocks(deck, slideId, ids);
  if (!blocks.length) return;
  const boxes = blocks.map((block) => boxOf(block));
  const frame =
    blocks.length === 1
      ? { x: SLIDE_MARGIN.x, y: SLIDE_MARGIN.y, w: SLIDE_WIDTH - 2 * SLIDE_MARGIN.x, h: SLIDE_HEIGHT - 2 * SLIDE_MARGIN.y }
      : unionRects(boxes.map(boundsOf))!;
  blocks.forEach((block, index) => {
    const box = boxes[index]!;
    const bounds = boundsOf(box);
    let dx = 0;
    let dy = 0;
    if (edge === "left") dx = frame.x - bounds.x;
    if (edge === "center") dx = frame.x + frame.w / 2 - (bounds.x + bounds.w / 2);
    if (edge === "right") dx = frame.x + frame.w - (bounds.x + bounds.w);
    if (edge === "top") dy = frame.y - bounds.y;
    if (edge === "middle") dy = frame.y + frame.h / 2 - (bounds.y + bounds.h / 2);
    if (edge === "bottom") dy = frame.y + frame.h - (bounds.y + bounds.h);
    applyBox(block, translateBox(box, dx, dy));
  });
}

/** Space three or more objects evenly between the outermost two. */
export function distributeBlocks(deck: DraftDeck, slideId: string, ids: string[], axis: "x" | "y"): void {
  const blocks = selectedBlocks(deck, slideId, ids);
  if (blocks.length < 3) return;
  const items = blocks
    .map((block) => ({ block, box: boxOf(block), bounds: boundsOf(boxOf(block)) }))
    .sort((a, b) => (axis === "x" ? a.bounds.x - b.bounds.x : a.bounds.y - b.bounds.y));
  const size = (rect: { w: number; h: number }) => (axis === "x" ? rect.w : rect.h);
  const start = (rect: { x: number; y: number }) => (axis === "x" ? rect.x : rect.y);
  const first = items[0]!.bounds;
  const last = items[items.length - 1]!.bounds;
  const span = start(last) + size(last) - start(first);
  const gap = (span - items.reduce((sum, item) => sum + size(item.bounds), 0)) / (items.length - 1);
  let cursor = start(first);
  for (const item of items) {
    const delta = cursor - start(item.bounds);
    applyBox(item.block, translateBox(item.box, axis === "x" ? delta : 0, axis === "y" ? delta : 0));
    cursor += size(item.bounds) + gap;
  }
}

// --------------------------------------------------------------------------
// Clipboard format (compatible with the legacy editor)
// --------------------------------------------------------------------------

export const CLIPBOARD_MIME = "application/x-cast-blocks+json";
export const CLIPBOARD_TEXT_PREFIX = "CAST_BLOCKS:";

export function serializeBlocks(blocks: Block[]): string {
  return JSON.stringify(blocks.map(toPayload));
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * Parse clipboard JSON, keeping only well-formed blocks. Clipboard data can
 * come from any page, so text is sanitised exactly like a loaded deck.
 */
export function parseBlocks(text: string): BlockPayload[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text.startsWith(CLIPBOARD_TEXT_PREFIX) ? text.slice(CLIPBOARD_TEXT_PREFIX.length) : text);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const str = (value: unknown) => (typeof value === "string" ? value : null);
  return raw.flatMap((item): BlockPayload[] => {
    if (typeof item !== "object" || item === null) return [];
    const block = item as Record<string, unknown>;
    if (!BLOCK_TYPES.includes(block.type as BlockType)) return [];
    if (![block.x, block.y, block.w, block.h].every(finite)) return [];
    const style = typeof block.style === "object" && block.style !== null && !Array.isArray(block.style) ? block.style : {};
    const payload: BlockPayload = {
      type: block.type as BlockType,
      x: block.x as number,
      y: block.y as number,
      w: Math.max(block.w as number, 0.03),
      h: Math.max(block.h as number, 0.03),
      figure: str(block.figure),
      table: str(block.table),
      html: str(block.html),
      image: str(block.image),
      content: str(block.content),
      markdown: str(block.markdown),
      style: structuredClone(style) as Block["style"],
    };
    migrateTextBlock(payload as Block);
    return [payload];
  });
}

// --------------------------------------------------------------------------
// New objects
// --------------------------------------------------------------------------

export function emptyPayload(type: BlockType, rect: { x: number; y: number; w: number; h: number }): BlockPayload {
  return { type, ...rect, figure: null, table: null, html: null, image: null, content: null, markdown: null, style: {} };
}

const WIDE_SHAPES = new Set(["rect", "round-rect", "chevron", "arrow-right"]);

/** Size (as slide fractions) of a shape dropped with a single click. */
export function defaultShapeSize(kind: string): { w: number; h: number } {
  if (kind === "line" || kind === "arrow-line") return { w: 0.27, h: 0.035 };
  if (WIDE_SHAPES.has(kind)) return { w: 0.19, h: 0.21 };
  return { w: 0.125, h: 0.22 };
}

/** A new shape with the legacy editor's default styling in the deck accent. */
export function shapePayload(
  kind: ShapeKind,
  accent: string,
  rect: { x: number; y: number; w: number; h: number },
  points?: ShapePoint[],
): BlockPayload {
  const line = kind === "line" || kind === "arrow-line";
  return {
    ...emptyPayload("shape", rect),
    style: {
      shape: kind,
      fill: line ? "transparent" : accent,
      stroke: line ? accent : "transparent",
      strokeWidth: line ? 5 : 0,
      radius: kind === "round-rect" ? 16 : 0,
      opacity: 1,
      ...(points ? { points } : {}),
    },
  };
}

// --------------------------------------------------------------------------
// Style edits
// --------------------------------------------------------------------------

/** Merge a style patch into every given block. `null`/`undefined` values delete the key. */
export function patchStyle(deck: DraftDeck, slideId: string, ids: string[], patch: Record<string, unknown>): void {
  for (const block of selectedBlocks(deck, slideId, ids)) {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete block.style[key];
      else block.style[key] = value;
    }
  }
}

const visibleColor = (value: unknown): string | undefined =>
  typeof value === "string" && value && value !== "transparent" && value !== "none" ? value : undefined;

/**
 * Change shape kind, carrying colours across sensibly: a filled shape that
 * becomes a line keeps its colour as the stroke, and back again. Custom
 * outlines are reset because they belong to the old kind.
 */
export function setShapeKind(deck: DraftDeck, slideId: string, ids: string[], kind: ShapeKind, accent: string): void {
  const line = kind === "line" || kind === "arrow-line";
  for (const block of selectedBlocks(deck, slideId, ids)) {
    if (block.type !== "shape") continue;
    const style = block.style;
    const wasLine = style.shape === "line" || style.shape === "arrow-line";
    style.shape = kind;
    style.points = null;
    style.smooth = false;
    if (line) {
      style.stroke = visibleColor(style.stroke) ?? visibleColor(style.fill) ?? accent;
      style.strokeWidth = Number(style.strokeWidth) || 5;
      style.fill = "transparent";
      if (kind === "arrow-line" && !style.lineCap) style.lineCap = "round";
    } else {
      style.fill = visibleColor(style.fill) ?? (wasLine ? visibleColor(style.stroke) : undefined) ?? accent;
      if (wasLine) {
        style.stroke = "transparent";
        style.strokeWidth = 0;
      } else if (style.strokeWidth == null) style.strokeWidth = 0;
      if (kind === "round-rect" && !style.radius) style.radius = 16;
    }
    // A flat line turned into a shape gets a usable height, centred on the line.
    if (wasLine && !line) {
      const size = defaultShapeSize(kind);
      if (block.h < size.h) {
        const centre = block.y + block.h / 2;
        block.h = size.h;
        block.y = Math.min(Math.max(centre - size.h / 2, 0), 1 - size.h);
      }
    }
  }
}
