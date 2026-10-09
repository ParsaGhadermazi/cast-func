/**
 * Editor UI state that is not part of the document: which slide is open,
 * zoom, present mode. Slides are tracked by id so reordering, another tab's
 * edits, or undo never silently switch the slide you are looking at.
 */

import { createStore, type StoreApi } from "zustand/vanilla";

import { clamp } from "../model/geometry";
import { SLIDE_HEIGHT, SLIDE_WIDTH, type Slide } from "../model/types";

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 1.6;
const STAGE_PADDING = 64;

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

  goToSlide(slides: Slide[], index: number): void;
  setZoom(zoom: number): void;
  fitTo(stageWidth: number, stageHeight: number): void;
  enableFit(): void;
  toggleGrid(): void;
  startPresent(slideId: string | null, index: number): void;
  presentGo(slides: Slide[], index: number): void;
  stopPresent(): void;
  togglePanel(panel: "rail" | "sidebar"): void;
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

    goToSlide(slides, index) {
      if (!slides.length) return set({ currentSlideId: null, currentIndexHint: 0 });
      const target = clamp(index, 0, slides.length - 1);
      set({ currentSlideId: slides[target]!.id, currentIndexHint: target });
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
    togglePanel(panel) {
      if (panel === "rail") set({ railOpen: !get().railOpen });
      else set({ sidebarOpen: !get().sidebarOpen });
    },
  }));
}
