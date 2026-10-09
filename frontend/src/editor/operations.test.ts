import { produce } from "immer";
import { describe, expect, it } from "vitest";

import { decodeDeck } from "../model/normalize";
import type { Deck } from "../model/types";
import {
  alignBlocks,
  deleteBlocks,
  distributeBlocks,
  duplicateBlocks,
  insertBlocks,
  moveInStack,
  nextIds,
  nudgeBlocks,
  parseBlocks,
  reorderLayers,
  serializeBlocks,
  stackOrder,
} from "./operations";

const deck = (): Deck =>
  decodeDeck({
    format: "cast.presentation",
    schema_version: 1,
    theme: {},
    slides: [
      {
        id: "s1",
        blocks: [
          { id: "b1", type: "shape", x: 0.1, y: 0.1, w: 0.1, h: 0.1, z: 0 },
          { id: "b2", type: "shape", x: 0.3, y: 0.1, w: 0.1, h: 0.1, z: 0 },
          { id: "b3", type: "shape", x: 0.7, y: 0.1, w: 0.1, h: 0.1, z: 1 },
        ],
      },
      { id: "s2", blocks: [{ id: "b9", type: "text", content: "<p>x</p>" }] },
    ],
  }).deck;

const blocks = (d: Deck, slide = 0) => d.slides[slide]!.blocks;

describe("ids", () => {
  it("continues the server's numbering", () => {
    expect(nextIds(["b1", "b9", "x12", "s4"], "b", 2)).toEqual(["b10", "b11"]);
  });
});

describe("layers", () => {
  it("orders by z, then document order", () => {
    expect(stackOrder(deck().slides[0]!)).toEqual(["b1", "b2", "b3"]);
  });

  it("moves selections through the stack, keeping their relative order", () => {
    const order = ["a", "b", "c", "d"];
    expect(moveInStack(order, new Set(["a", "b"]), "front")).toEqual(["c", "d", "a", "b"]);
    expect(moveInStack(order, new Set(["c"]), "back")).toEqual(["c", "a", "b", "d"]);
    expect(moveInStack(order, new Set(["a", "c"]), "forward")).toEqual(["b", "a", "d", "c"]);
    expect(moveInStack(order, new Set(["b", "d"]), "backward")).toEqual(["b", "a", "d", "c"]);
    expect(moveInStack(order, new Set(["d"]), "forward")).toEqual(order);
  });

  it("writes unique z values in one edit", () => {
    const next = produce(deck(), (d) => reorderLayers(d, "s1", ["b1"], "front"));
    expect(stackOrder(next.slides[0]!)).toEqual(["b2", "b3", "b1"]);
    expect(blocks(next).map((b) => b.z).sort()).toEqual([0, 1, 2]);
  });
});

describe("delete, duplicate, paste", () => {
  it("deletes only the given blocks", () => {
    const next = produce(deck(), (d) => deleteBlocks(d, "s1", ["b1", "b3"]));
    expect(blocks(next).map((b) => b.id)).toEqual(["b2"]);
  });

  it("duplicates on top of the stack, offset so the copy is visible", () => {
    let ids: string[] = [];
    const next = produce(deck(), (d) => { ids = duplicateBlocks(d, "s1", ["b1"]); });
    expect(ids).toEqual(["b10"]);
    const copy = blocks(next).find((b) => b.id === "b10")!;
    expect(copy.z).toBe(2);
    expect(copy.x).toBeGreaterThan(0.1);
  });

  it("pastes onto another slide at the same position", () => {
    const payload = parseBlocks(serializeBlocks([blocks(deck())[0]!]));
    const next = produce(deck(), (d) => { insertBlocks(d, "s2", payload); });
    const pasted = blocks(next, 1).at(-1)!;
    expect(pasted).toMatchObject({ x: 0.1, y: 0.1, type: "shape" });
  });

  it("accepts the legacy text clipboard format and sanitises text", () => {
    const text = 'CAST_BLOCKS:[{"type":"text","x":0,"y":0,"w":0.2,"h":0.2,"content":"<p>hi<img src=x onerror=alert(1)></p>"},{"type":"video","x":0,"y":0,"w":1,"h":1}]';
    const parsed = parseBlocks(text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.content).toBe("<p>hi</p>");
    expect(parseBlocks("not json")).toEqual([]);
  });
});

describe("geometry commands", () => {
  it("nudges a group but keeps it on the slide", () => {
    const next = produce(deck(), (d) => nudgeBlocks(d, "s1", ["b1", "b3"], 1000, 0));
    expect(blocks(next)[2]!.x).toBeCloseTo(0.9, 6); // b3 hits the right edge
    expect(blocks(next)[0]!.x).toBeCloseTo(0.3, 6); // b1 moved by the same amount
  });

  it("aligns several objects to their shared bounds", () => {
    const next = produce(deck(), (d) => alignBlocks(d, "s1", ["b1", "b3"], "right"));
    expect(blocks(next)[0]!.x).toBeCloseTo(0.7, 6);
  });

  it("aligns one object to the slide margins", () => {
    const next = produce(deck(), (d) => alignBlocks(d, "s1", ["b2"], "left"));
    expect(blocks(next)[1]!.x).toBeCloseTo(0.06, 6);
  });

  it("distributes evenly between the outermost objects", () => {
    const d0 = produce(deck(), (d) => { d.slides[0]!.blocks[1]!.x = 0.2; });
    const next = produce(d0, (d) => distributeBlocks(d, "s1", ["b1", "b2", "b3"], "x"));
    expect(blocks(next)[1]!.x).toBeCloseTo(0.4, 6);
  });
});
