/**
 * Slide-level document edits and slide templates (ported from the legacy
 * editor). Like `operations.ts`, every function mutates an Immer draft so a
 * command is one undo step.
 */

import type { Draft } from "immer";

import type { Deck, Theme } from "../model/types";
import { emptyPayload, insertBlocks, nextIds, shapePayload, type BlockPayload } from "./operations";

type DraftDeck = Draft<Deck>;

export type SlideTemplate = "blank" | "title" | "data" | "split" | "quote";

export const SLIDE_TEMPLATES: readonly [SlideTemplate, string, string][] = [
  ["blank", "Blank", "An empty slide"],
  ["title", "Title", "Accent bar, title and takeaway"],
  ["data", "Text + figure", "Key points beside your first figure"],
  ["split", "Split", "Full-height image beside a statement"],
  ["quote", "Quote", "A large quotation on a tinted panel"],
];

const text = (content: string, rect: { x: number; y: number; w: number; h: number }, style: Record<string, unknown>): BlockPayload => ({
  ...emptyPayload("text", rect),
  content,
  style,
});

export function templateBlocks(template: SlideTemplate, theme: Theme, firstFigure?: { figure: string; table: string }): BlockPayload[] {
  const { accent, fg } = theme;
  switch (template) {
    case "blank":
      return [];
    case "title":
      return [
        shapePayload("rect", accent, { x: 0.07, y: 0.13, w: 0.035, h: 0.56 }),
        text("<h1>Presentation title</h1><p>A sharp one-sentence takeaway.</p>", { x: 0.14, y: 0.18, w: 0.7, h: 0.42 },
          { fontSize: 40, color: fg, lineHeight: 1.12, weight: "bold" }),
      ];
    case "data":
      return [
        text("<h2>Main result</h2><ul><li>Key finding</li><li>Supporting detail</li><li>Next decision</li></ul>",
          { x: 0.07, y: 0.12, w: 0.34, h: 0.68 }, { fontSize: 25, color: fg, lineHeight: 1.25 }),
        firstFigure
          ? { ...emptyPayload("figure", { x: 0.46, y: 0.14, w: 0.47, h: 0.65 }), figure: firstFigure.figure, table: firstFigure.table }
          : { ...shapePayload("rect", accent, { x: 0.48, y: 0.18, w: 0.42, h: 0.56 }), style: { shape: "round-rect", fill: accent, opacity: 0.16, radius: 18 } },
      ];
    case "split":
      return [
        { ...emptyPayload("image", { x: 0, y: 0, w: 0.5, h: 1 }), style: { fit: "cover" } },
        text("<h2>Section title</h2><p>Add the argument on this side.</p>", { x: 0.57, y: 0.2, w: 0.34, h: 0.45 },
          { fontSize: 30, color: fg, lineHeight: 1.22 }),
      ];
    case "quote":
      return [
        { ...shapePayload("rect", accent, { x: 0.08, y: 0.16, w: 0.84, h: 0.68 }), style: { shape: "round-rect", fill: accent, opacity: 0.08, radius: 24 } },
        text("<blockquote>The clearest slide says one thing well.</blockquote><p>Source or note</p>", { x: 0.16, y: 0.24, w: 0.68, h: 0.48 },
          { fontSize: 36, color: fg, lineHeight: 1.18, fontFamily: "Georgia,'Times New Roman',serif" }),
      ];
  }
}

/** Insert a slide after `afterIndex` (or at the end) and return its id. */
export function addSlide(deck: DraftDeck, afterIndex: number | null, blocks: BlockPayload[] = []): string {
  const id = nextIds(deck.slides.map((slide) => slide.id), "s", 1)[0]!;
  const index = afterIndex === null ? deck.slides.length : Math.min(afterIndex + 1, deck.slides.length);
  deck.slides.splice(index, 0, { id, background: null, blocks: [] });
  if (blocks.length) insertBlocks(deck, id, blocks, 0);
  return id;
}

/** Copy slides (with new block ids) right after the last of them. Returns the new ids in order. */
export function duplicateSlides(deck: DraftDeck, slideIds: string[]): string[] {
  const indices = slideIds.map((id) => deck.slides.findIndex((slide) => slide.id === id)).filter((i) => i >= 0).sort((a, b) => a - b);
  if (!indices.length) return [];
  const created: string[] = [];
  let insertAt = indices[indices.length - 1]!;
  for (const index of indices) {
    const source = deck.slides[index]!;
    const id = nextIds(deck.slides.map((slide) => slide.id), "s", 1)[0]!;
    deck.slides.splice(insertAt + 1, 0, { id, background: source.background, blocks: [] });
    insertAt += 1;
    const payloads = [...source.blocks]
      .sort((a, b) => a.z - b.z)
      .map(({ id: _id, z: _z, ...rest }) => JSON.parse(JSON.stringify(rest)) as BlockPayload);
    insertBlocks(deck, id, payloads, 0);
    created.push(id);
  }
  return created;
}

export function deleteSlides(deck: DraftDeck, slideIds: string[]): void {
  const doomed = new Set(slideIds);
  deck.slides = deck.slides.filter((slide) => !doomed.has(slide.id));
}

/** Move one slide to a new position (index in the list before the move). */
export function moveSlide(deck: DraftDeck, slideId: string, toIndex: number): void {
  const from = deck.slides.findIndex((slide) => slide.id === slideId);
  if (from < 0) return;
  const [slide] = deck.slides.splice(from, 1);
  const target = Math.max(0, Math.min(toIndex > from ? toIndex - 1 : toIndex, deck.slides.length));
  deck.slides.splice(target, 0, slide!);
}

export function setSlideBackground(deck: DraftDeck, slideId: string, background: string | null): void {
  const slide = deck.slides.find((candidate) => candidate.id === slideId);
  if (slide) slide.background = background;
}
