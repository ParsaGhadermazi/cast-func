/**
 * Editor UI state that is not part of the document: which slide is open,
 * zoom, present mode. Slides are tracked by id so reordering, another tab's
 * edits, or undo never silently switch the slide you are looking at.
 */

import { createStore, type StoreApi } from "zustand/vanilla";

import { clamp } from "../model/geometry";
import { SLIDE_HEIGHT, SLIDE_WIDTH, type ShapeKind, type Slide } from "../model/types";
import type { Box, Guides, Rect } from "./transform";

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 1.6;
const STAGE_PADDING = 64;

/** What a click on empty canvas does. */
export type Tool = { kind: "select" } | { kind: "shape"; shape: ShapeKind } | { kind: "text" };

/** An object being edited in place (one at a time). */
export type Editing =
  | { kind: "text"; id: string }
  | { kind: "points"; id: string; point: number | null }
  | { kind: "crop"; id: string };

export interface UiState {
  currentSlideId: string | null;
  /** Index of the last known current slide, to land nearby if it is deleted. */
  currentIndexHint: number;
  zoom: number;
  fit: boolean;
  grid: boolean;
  present: { slideId: string | null; indexHint: number } | null;
  railOpen: boolean;
  sidebarOpen: boolean;
  /** Selected block ids on the current slide; `primary` is the last one clicked. */
  selection: string[];
  primary: string | null;
  /** Snap to the slide and other objects while dragging (hold Cmd/Ctrl to bypass). */
  snap: boolean;
  /** Transient overlay state while a gesture runs. */
  guides: Guides | null;
  marquee: Rect | null;
  /** Frame to draw instead of the computed one (a group mid-rotation). */
  gestureFrame: Box | null;
  activeGesture: "move" | "resize" | "rotate" | "marquee" | null;
  sidebarTab: "properties" | "layers";
  tool: Tool;
  /** The shape the shape button inserts (last one picked). */
  shapeKind: ShapeKind;
  editing: Editing | null;

  goToSlide(slides: Slide[], index: number): void;
  setZoom(zoom: number): void;
  fitTo(stageWidth: number, stageHeight: number): void;
  enableFit(): void;
  toggleGrid(): void;
  startPresent(slideId: string | null, index: number): void;
  presentGo(slides: Slide[], index: number): void;
  stopPresent(): void;
  togglePanel(panel: "rail" | "sidebar"): void;
  select(ids: string[], primary?: string | null): void;
  toggleSelected(id: string): void;
  clearSelection(): void;
  /** Drop selected ids that are no longer on the slide. */
  pruneSelection(present: Set<string>): void;
  toggleSnap(): void;
  setSidebarTab(tab: UiState["sidebarTab"]): void;
  setTool(tool: Tool): void;
  startEditing(editing: Editing): void;
  stopEditing(): void;
  selectPoint(point: number | null): void;
}

export type UiStore = StoreApi<UiState>;

/** Resolve a tracked slide id to an index, falling back near the hint. */
export function resolveSlideIndex(slides: Slide[], id: string | null, hint: number): number {
  if (!slides.length) return -1;
  const index = id ? slides.findIndex((slide) => slide.id === id) : -1;
  return index >= 0 ? index : clamp(hint, 0, slides.length - 1);
}

export function fitZoom(stageWidth: number, stageHeight: number): number | null {
  const width = stageWidth - STAGE_PADDING;
  const height = stageHeight - STAGE_PADDING;
  if (width <= 0 || height <= 0) return null;
  return clamp(Math.floor(Math.min(width / SLIDE_WIDTH, height / SLIDE_HEIGHT) * 100) / 100, MIN_ZOOM, MAX_ZOOM);
}

export function createUiStore(): UiStore {
  return createStore<UiState>()((set, get) => ({
    currentSlideId: null,
    currentIndexHint: 0,
    zoom: 1,
    fit: true,
    grid: false,
    present: null,
    railOpen: true,
    sidebarOpen: true,
    selection: [],
    primary: null,
    snap: true,
    guides: null,
    marquee: null,
    gestureFrame: null,
    activeGesture: null,
    sidebarTab: "properties",
    tool: { kind: "select" },
    shapeKind: "rect",
    editing: null,

    goToSlide(slides, index) {
      if (!slides.length) return set({ currentSlideId: null, currentIndexHint: 0, selection: [], primary: null });
      const target = clamp(index, 0, slides.length - 1);
      const id = slides[target]!.id;
      if (id === get().currentSlideId) return set({ currentIndexHint: target });
      set({ currentSlideId: id, currentIndexHint: target, selection: [], primary: null, editing: null });
    },
    setZoom(zoom) {
      set({ zoom: clamp(Math.round(zoom * 100) / 100, MIN_ZOOM, MAX_ZOOM), fit: false });
    },
    fitTo(stageWidth, stageHeight) {
      if (!get().fit) return;
      const zoom = fitZoom(stageWidth, stageHeight);
      if (zoom !== null && zoom !== get().zoom) set({ zoom });
    },
    enableFit() {
      set({ fit: true });
    },
    toggleGrid() {
      set({ grid: !get().grid });
    },
    startPresent(slideId, index) {
      set({ present: { slideId, indexHint: index } });
    },
    presentGo(slides, index) {
      if (!slides.length) return;
      const target = clamp(index, 0, slides.length - 1);
      set({ present: { slideId: slides[target]!.id, indexHint: target } });
    },
    stopPresent() {
      // Like Keynote: the editor lands on the slide where the presentation stopped.
      const present = get().present;
      if (present?.slideId) set({ present: null, currentSlideId: present.slideId, currentIndexHint: present.indexHint });
      else set({ present: null });
    },
    select(ids, primary) {
      const unique = [...new Set(ids)];
      const editing = get().editing;
      set({
        selection: unique,
        primary: primary === undefined ? unique.at(-1) ?? null : primary,
        // In-place editing ends when its object is no longer the only selection.
        editing: editing && unique.length === 1 && unique[0] === editing.id ? editing : null,
      });
    },
    toggleSelected(id) {
      const { selection } = get();
      if (selection.includes(id)) {
        const rest = selection.filter((value) => value !== id);
        set({ selection: rest, primary: rest.at(-1) ?? null });
      } else set({ selection: [...selection, id], primary: id });
    },
    clearSelection() {
      if (get().selection.length || get().editing) set({ selection: [], primary: null, editing: null });
    },
    pruneSelection(present) {
      const { selection, primary } = get();
      const kept = selection.filter((id) => present.has(id));
      if (kept.length !== selection.length) {
        const editing = get().editing;
        set({
          selection: kept,
          primary: primary && present.has(primary) ? primary : kept.at(-1) ?? null,
          editing: editing && present.has(editing.id) ? editing : null,
        });
      }
    },
    toggleSnap() {
      set({ snap: !get().snap });
    },
    setSidebarTab(tab) {
      set({ sidebarTab: tab });
    },
    setTool(tool) {
      set({ tool, ...(tool.kind === "shape" ? { shapeKind: tool.shape } : {}), ...(tool.kind !== "select" ? { editing: null } : {}) });
    },
    startEditing(editing) {
      set({ editing, selection: [editing.id], primary: editing.id, tool: { kind: "select" } });
    },
    stopEditing() {
      if (get().editing) set({ editing: null });
    },
    selectPoint(point) {
      const editing = get().editing;
      if (editing?.kind === "points") set({ editing: { ...editing, point } });
    },
    togglePanel(panel) {
      if (panel === "rail") set({ railOpen: !get().railOpen });
      else set({ sidebarOpen: !get().sidebarOpen });
    },
  }));
}
