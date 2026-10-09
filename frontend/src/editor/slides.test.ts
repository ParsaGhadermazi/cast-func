import { produce } from "immer";
import { describe, expect, it } from "vitest";

import { decodeDeck } from "../model/normalize";
import { DEFAULT_THEME } from "../model/types";
import { addSlide, deleteSlides, duplicateSlides, moveSlide, templateBlocks } from "./slides";

const deck = () =>
  decodeDeck({
    format: "cast.presentation",
    schema_version: 1,
    theme: {},
    slides: [
      { id: "s1", blocks: [{ id: "b1", type: "shape", z: 3 }, { id: "b2", type: "text", content: "<p>x</p>", z: 1 }] },
      { id: "s2", blocks: [] },
      { id: "s3", blocks: [] },
    ],
  }).deck;

describe("slides", () => {
  it("adds after a given slide with template blocks", () => {
    let id = "";
    const next = produce(deck(), (d) => { id = addSlide(d, 0, templateBlocks("title", DEFAULT_THEME)); });
    expect(id).toBe("s4");
    expect(next.slides.map((s) => s.id)).toEqual(["s1", "s4", "s2", "s3"]);
    expect(next.slides[1]!.blocks.map((b) => b.type)).toEqual(["shape", "text"]);
    expect(next.slides[1]!.blocks.map((b) => b.id)).toEqual(["b3", "b4"]);
  });

  it("duplicates with fresh block ids, keeping stacking order", () => {
    let created: string[] = [];
    const next = produce(deck(), (d) => { created = duplicateSlides(d, ["s1"]); });
    expect(created).toEqual(["s4"]);
    const copy = next.slides[1]!;
    expect(copy.blocks.map((b) => b.type)).toEqual(["text", "shape"]); // bottom to top
    expect(copy.blocks.every((b) => !["b1", "b2"].includes(b.id))).toBe(true);
  });

  it("moves and deletes", () => {
    const moved = produce(deck(), (d) => moveSlide(d, "s1", 3));
    expect(moved.slides.map((s) => s.id)).toEqual(["s2", "s3", "s1"]);
    const back = produce(moved, (d) => moveSlide(d, "s1", 0));
    expect(back.slides.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    const deleted = produce(deck(), (d) => deleteSlides(d, ["s2"]));
    expect(deleted.slides.map((s) => s.id)).toEqual(["s1", "s3"]);
  });

  it("uses the first figure in the data template when there is one", () => {
    const blocks = templateBlocks("data", DEFAULT_THEME, { figure: "trend", table: "monthly" });
    expect(blocks[1]).toMatchObject({ type: "figure", figure: "trend", table: "monthly" });
    expect(templateBlocks("data", DEFAULT_THEME)[1]!.type).toBe("shape");
  });
});
