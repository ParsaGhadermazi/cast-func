/**
 * Decode an untrusted presentation document into a `Deck`.
 *
 * Validation and clamping mirror `cast/registry.py::_decode_deck`, so the error
 * messages point to the same locations (e.g. `slides[2].blocks[0].w`). On top
 * of that the client:
 *
 * - migrates legacy markdown text blocks into sanitised rich `content`;
 * - drops the legacy `style.textMode` key;
 * - re-sanitises every text block's `content`.
 *
 * `changed` reports whether any of these rewrites happened, so the caller can
 * sync the cleaned document without recording an undo step.
 */

import { marked } from "marked";

import { clampRect } from "./geometry";
import { sanitizeRichHtml } from "./sanitize";
import {
  BLOCK_TYPES,
  DECK_FORMAT,
  DECK_SCHEMA_VERSION,
  DEFAULT_THEME,
  type Block,
  type BlockStyle,
  type BlockType,
  type Deck,
  type Slide,
  type Theme,
} from "./types";

export class DeckError extends Error {}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function documentId(value: unknown, location: string, seen: Set<string>): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new DeckError(`${location} must be a non-empty string.`);
  }
  if (seen.has(value)) throw new DeckError(`Duplicate id '${value}' at ${location}.`);
  seen.add(value);
  return value;
}

function optionalString(value: unknown, location: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new DeckError(`${location} must be a string or null.`);
  return value;
}

function deckNumber(value: unknown, location: string): number {
  if (typeof value !== "number") throw new DeckError(`${location} must be a number.`);
  if (!Number.isFinite(value)) throw new DeckError(`${location} must be finite.`);
  return value;
}

function decodeTheme(raw: unknown): Theme {
  const source = raw ?? {};
  if (!isObject(source)) throw new DeckError("Presentation theme must be an object.");
  const theme: Theme = { ...DEFAULT_THEME };
  for (const key of Object.keys(DEFAULT_THEME) as (keyof Theme)[]) {
    if (key in source) {
      const value = source[key];
      if (typeof value !== "string") throw new DeckError(`Theme value '${key}' must be a string.`);
      theme[key] = value;
    }
  }
  return theme;
}

function decodeBlock(raw: unknown, location: string, ids: Set<string>): Block {
  if (!isObject(raw)) throw new DeckError(`${location} must be an object.`);
  const id = documentId(raw.id, `${location}.id`, ids);
  const type = raw.type;
  if (typeof type !== "string" || !BLOCK_TYPES.includes(type as BlockType)) {
    throw new DeckError(`${location}.type must be one of ${JSON.stringify([...BLOCK_TYPES].sort())}.`);
  }
  const rect = clampRect({
    x: deckNumber(raw.x ?? 0.1, `${location}.x`),
    y: deckNumber(raw.y ?? 0.1, `${location}.y`),
    w: deckNumber(raw.w ?? 0.5, `${location}.w`),
    h: deckNumber(raw.h ?? 0.5, `${location}.h`),
  });
  const z = Math.trunc(deckNumber(raw.z ?? 0, `${location}.z`));
  const style = raw.style ?? {};
  if (!isObject(style)) throw new DeckError(`${location}.style must be an object.`);
  const field = (key: string) => optionalString(raw[key], `${location}.${key}`);
  return {
    id,
    type: type as BlockType,
    ...rect,
    z,
    figure: field("figure"),
    table: field("table"),
    html: field("html"),
    image: field("image"),
    content: field("content"),
    markdown: field("markdown"),
    style: structuredClone(style) as BlockStyle,
  };
}

/** Bring a text block up to date. Returns true if anything changed. */
export function migrateTextBlock(block: Block): boolean {
  if (block.type !== "text") return false;
  let changed = false;
  const legacyMode = block.style.textMode;
  let html = block.content;
  if (html === null) {
    const raw = block.markdown ?? "";
    html = legacyMode === "rich" ? raw : (marked.parse(raw, { async: false }) as string);
    changed = true;
  }
  const clean = sanitizeRichHtml(html);
  if (clean !== block.content) {
    block.content = clean;
    changed = true;
  }
  if ("textMode" in block.style) {
    delete block.style.textMode;
    changed = true;
  }
  return changed;
}

export interface DecodedDeck {
  deck: Deck;
  /** True when migration or sanitising rewrote part of the document. */
  changed: boolean;
}

export function decodeDeck(raw: unknown): DecodedDeck {
  if (!isObject(raw)) throw new DeckError("Presentation file must contain a JSON object.");
  if (raw.format !== DECK_FORMAT) throw new DeckError(`Not a ${DECK_FORMAT} file.`);
  if (raw.schema_version !== DECK_SCHEMA_VERSION) {
    throw new DeckError(
      `Unsupported presentation schema ${JSON.stringify(raw.schema_version ?? null)}; ` +
        `this version supports schema ${DECK_SCHEMA_VERSION}.`,
    );
  }
  const theme = decodeTheme(raw.theme);
  if (!Array.isArray(raw.slides)) throw new DeckError("Presentation slides must be an array.");

  const slideIds = new Set<string>();
  const blockIds = new Set<string>();
  let changed = false;
  const slides: Slide[] = raw.slides.map((rawSlide, slideIndex) => {
    const location = `slides[${slideIndex}]`;
    if (!isObject(rawSlide)) throw new DeckError(`${location} must be an object.`);
    const id = documentId(rawSlide.id, `${location}.id`, slideIds);
    const background = optionalString(rawSlide.background, `${location}.background`);
    const rawBlocks = rawSlide.blocks ?? [];
    if (!Array.isArray(rawBlocks)) throw new DeckError(`${location}.blocks must be an array.`);
    const blocks = rawBlocks.map((rawBlock, blockIndex) => {
      const block = decodeBlock(rawBlock, `${location}.blocks[${blockIndex}]`, blockIds);
      if (migrateTextBlock(block)) changed = true;
      return block;
    });
    return { id, background, blocks };
  });

  return {
    deck: { format: DECK_FORMAT, schema_version: DECK_SCHEMA_VERSION, theme, slides },
    changed,
  };
}
