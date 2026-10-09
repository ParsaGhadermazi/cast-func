/**
 * The editable presentation document (`.cast.json`, schema version 1).
 *
 * These types mirror `cast/registry.py` (`Block`, `Slide`, `_decode_deck`) and
 * the style keys the legacy editor and `cast/export.py` read. Unknown style
 * keys are preserved so older or newer documents round-trip unchanged.
 */

export const DECK_FORMAT = "cast.presentation";
export const DECK_SCHEMA_VERSION = 1;

/** Logical slide size in CSS pixels; geometry is stored normalised to 0..1. */
export const SLIDE_WIDTH = 1040;
export const SLIDE_HEIGHT = 585;
export const MIN_BLOCK_SIZE = 0.03;

export type BlockType = "figure" | "table" | "html" | "text" | "image" | "shape";
export const BLOCK_TYPES: readonly BlockType[] = ["figure", "table", "html", "text", "image", "shape"];

export type ShapeKind =
  | "rect" | "round-rect" | "ellipse" | "triangle" | "diamond" | "pentagon"
  | "hexagon" | "star" | "chevron" | "arrow-right" | "line" | "arrow-line";

/** A point in a shape's 0..100 viewBox. */
export type ShapePoint = [number, number];

export interface CommonStyle {
  /** Degrees, clockwise. */
  rotate?: number;
  /** 0..1. */
  opacity?: number;
}

export interface TextStyle {
  textVariant?: "plain" | "code";
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  align?: "left" | "center" | "right";
  weight?: string;
  italic?: boolean;
  lineHeight?: number;
  /** Checked with hasOwnProperty: an explicit "transparent" overrides the code default. */
  bg?: string;
  /** Legacy; removed by `normalizeDeck`. */
  textMode?: string;
}

export interface CropBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ImageStyle {
  /** Manual upload (data URL) or http(s) URL when no asset is bound. */
  src?: string;
  fit?: "contain" | "cover" | "fill";
  crop?: Partial<CropBox>;
  rendering?: "auto" | "crisp-edges" | "pixelated";
  bg?: string;
  alt?: string;
  radius?: number;
}

export interface ShapeStyle {
  shape?: ShapeKind;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  dash?: "solid" | "dash" | "dot" | "long";
  lineCap?: "round" | "butt" | "square";
  lineJoin?: string;
  radius?: number;
  points?: ShapePoint[] | null;
  smooth?: boolean;
  shadow?: number;
}

export interface TableStyle {
  rowLimit?: number;
  fontSize?: number;
  compact?: boolean;
  striped?: boolean;
  showIndex?: boolean;
  headerBg?: string;
  headerColor?: string;
  bg?: string;
  borderColor?: string;
}

/**
 * Style is one flat object shared by all block types (the file format has no
 * per-type nesting). Keys that two types share (`bg`, `radius`, `fontSize`)
 * mean the same kind of thing for each.
 */
export type BlockStyle = CommonStyle &
  Omit<TextStyle, "bg"> &
  Omit<ImageStyle, "bg" | "radius"> &
  Omit<ShapeStyle, "radius"> &
  Omit<TableStyle, "bg" | "fontSize"> & {
    bg?: string;
    radius?: number;
    fontSize?: number;
    [key: string]: unknown;
  };

export interface Block {
  id: string;
  type: BlockType;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  figure: string | null;
  table: string | null;
  html: string | null;
  image: string | null;
  content: string | null;
  /** Legacy markdown; migrated into `content` by `normalizeDeck`. */
  markdown: string | null;
  style: BlockStyle;
}

export interface Slide {
  id: string;
  /** Legacy per-slide colour; overrides `theme.bg` when set. */
  background: string | null;
  blocks: Block[];
}

export interface Theme {
  accent: string;
  font: string;
  bg: string;
  fg: string;
}

export interface Deck {
  format: typeof DECK_FORMAT;
  schema_version: typeof DECK_SCHEMA_VERSION;
  theme: Theme;
  slides: Slide[];
}

export const DEFAULT_THEME: Theme = {
  accent: "#5b8cff",
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  bg: "#ffffff",
  fg: "#1a1d24",
};

export function emptyDeck(): Deck {
  return {
    format: DECK_FORMAT,
    schema_version: DECK_SCHEMA_VERSION,
    theme: { ...DEFAULT_THEME },
    slides: [],
  };
}
