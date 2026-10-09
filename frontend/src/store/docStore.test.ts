import { describe, expect, it } from "vitest";

import { decodeDeck } from "../model/normalize";
import { createDocStore } from "./docStore";

const fixture = () =>
  decodeDeck({
    format: "cast.presentation",
    schema_version: 1,
    theme: {},
    slides: [{ id: "s1", blocks: [{ id: "b1", type: "shape", x: 0.1, y: 0.1, w: 0.2, h: 0.2 }] }],
  }).deck;

const block = (store: ReturnType<typeof createDocStore>) => store.getState().doc.slides[0]!.blocks[0]!;

describe("doc store", () => {
  it("records one undo step per transaction and syncs each change", () => {
    const store = createDocStore(fixture());
    store.getState().transact("move", (d) => { d.slides[0]!.blocks[0]!.x = 0.3; });
    expect(block(store).x).toBe(0.3);
    expect(store.getState().changeSeq).toBe(1);
    expect(store.getState().undo()).toBe(true);
    expect(block(store).x).toBe(0.1);
    expect(store.getState().changeSeq).toBe(2);
    expect(store.getState().redo()).toBe(true);
    expect(block(store).x).toBe(0.3);
  });

  it("ignores no-op transactions", () => {
    const store = createDocStore(fixture());
    store.getState().transact("noop", (d) => { d.slides[0]!.blocks[0]!.x = 0.1; });
    expect(store.getState().canUndo).toBe(false);
    expect(store.getState().changeSeq).toBe(0);
  });

  it("merges steps with the same key inside the window", () => {
    let now = 0;
    const store = createDocStore(fixture(), () => now);
    const nudge = () => store.getState().transact("nudge", (d) => { d.slides[0]!.blocks[0]!.x += 0.01; }, { mergeKey: "nudge", mergeWindowMs: 500 });
    nudge(); now = 200; nudge(); now = 400; nudge();
    now = 2000; nudge(); // outside the window: a new step
    store.getState().undo();
    expect(block(store).x).toBeCloseTo(0.13);
    store.getState().undo();
    expect(block(store).x).toBeCloseTo(0.1);
    expect(store.getState().canUndo).toBe(false);
  });

  it("does not merge into a step after undo", () => {
    const store = createDocStore(fixture());
    const type = (x: number) => store.getState().transact("text", (d) => { d.slides[0]!.blocks[0]!.x = x; }, { mergeKey: "text" });
    type(0.2); type(0.3);
    store.getState().transact("other", (d) => { d.slides[0]!.blocks[0]!.y = 0.5; });
    store.getState().undo();
    type(0.4);
    store.getState().undo();
    expect(block(store).x).toBe(0.3);
  });

  it("clears redo after a new edit", () => {
    const store = createDocStore(fixture());
    store.getState().transact("a", (d) => { d.slides[0]!.blocks[0]!.x = 0.2; });
    store.getState().undo();
    store.getState().transact("b", (d) => { d.slides[0]!.blocks[0]!.y = 0.2; });
    expect(store.getState().canRedo).toBe(false);
  });

  describe("gestures", () => {
    it("re-applies each update to the starting document and commits once", () => {
      const store = createDocStore(fixture());
      const { beginGesture, updateGesture, commitGesture } = store.getState();
      beginGesture();
      for (const dx of [0.01, 0.05, 0.2]) updateGesture((d) => { d.slides[0]!.blocks[0]!.x += dx; });
      expect(block(store).x).toBeCloseTo(0.3);
      expect(store.getState().changeSeq).toBe(0); // nothing synced mid-gesture
      commitGesture("move");
      expect(store.getState().changeSeq).toBe(1);
      store.getState().undo();
      expect(block(store).x).toBeCloseTo(0.1);
      expect(store.getState().canUndo).toBe(false);
    });

    it("cancel restores the starting document without history", () => {
      const store = createDocStore(fixture());
      store.getState().beginGesture();
      store.getState().updateGesture((d) => { d.slides[0]!.blocks[0]!.w = 0.9; });
      store.getState().cancelGesture();
      expect(block(store).w).toBe(0.2);
      expect(store.getState().canUndo).toBe(false);
      expect(store.getState().changeSeq).toBe(0);
    });

    it("a gesture that ends where it began records nothing", () => {
      const store = createDocStore(fixture());
      store.getState().beginGesture();
      store.getState().updateGesture((d) => { d.slides[0]!.blocks[0]!.x = 0.1; });
      store.getState().commitGesture("move");
      expect(store.getState().canUndo).toBe(false);
    });

    it("defers a server replacement until the gesture ends", () => {
      const store = createDocStore(fixture());
      store.getState().beginGesture();
      store.getState().updateGesture((d) => { d.slides[0]!.blocks[0]!.x = 0.5; });
      const remote = fixture();
      remote.slides[0]!.blocks[0]!.y = 0.7;
      store.getState().replaceFromServer(remote, 9);
      expect(block(store).x).toBe(0.5);
      store.getState().commitGesture("move");
      expect(block(store).y).toBe(0.7);
      expect(store.getState().rev).toBe(9);
      expect(store.getState().canUndo).toBe(false);
    });

    it("rejects discrete edits during a gesture", () => {
      const store = createDocStore(fixture());
      store.getState().beginGesture();
      expect(() => store.getState().transact("x", () => {})).toThrow();
      expect(store.getState().undo()).toBe(false);
    });
  });
});
