import { describe, expect, it } from "vitest";

import type { Slide } from "../model/types";
import { createUiStore, fitZoom, resolveSlideIndex } from "./uiStore";

const slides = (...ids: string[]): Slide[] => ids.map((id) => ({ id, background: null, blocks: [] }));

describe("slide tracking", () => {
  it("follows a slide by id when the deck is reordered", () => {
    expect(resolveSlideIndex(slides("a", "b", "c"), "b", 1)).toBe(1);
    expect(resolveSlideIndex(slides("b", "c", "a"), "b", 1)).toBe(0);
  });

  it("lands near the old position when the slide is deleted", () => {
    expect(resolveSlideIndex(slides("a", "c"), "b", 1)).toBe(1);
    expect(resolveSlideIndex(slides("a"), "z", 5)).toBe(0);
    expect(resolveSlideIndex([], "a", 0)).toBe(-1);
  });

  it("returns to the presented slide when present mode ends", () => {
    const ui = createUiStore();
    const deck = slides("a", "b", "c");
    ui.getState().goToSlide(deck, 0);
    ui.getState().startPresent("a", 0);
    ui.getState().presentGo(deck, 2);
    ui.getState().stopPresent();
    expect(ui.getState().currentSlideId).toBe("c");
  });
});

describe("zoom", () => {
  it("fits the slide with padding, rounded down to whole percent", () => {
    expect(fitZoom(1040 + 64, 585 + 64)).toBe(1);
    expect(fitZoom(600, 2000)).toBe(0.51);
    expect(fitZoom(10, 10)).toBeNull();
  });

  it("manual zoom turns Fit off and is clamped", () => {
    const ui = createUiStore();
    ui.getState().setZoom(5);
    expect(ui.getState()).toMatchObject({ zoom: 1.6, fit: false });
    ui.getState().fitTo(2000, 2000); // ignored while Fit is off
    expect(ui.getState().zoom).toBe(1.6);
  });
});
