import { describe, expect, it } from "vitest";

import { DeckError, decodeDeck } from "./normalize";

const deck = (slides: unknown[], extra: Record<string, unknown> = {}) => ({
  format: "cast.presentation",
  schema_version: 1,
  theme: {},
  slides,
  ...extra,
});

describe("decodeDeck", () => {
  it("fills defaults like the Python decoder", () => {
    const { deck: out, changed } = decodeDeck(deck([{ id: "s1", blocks: [{ id: "b1", type: "shape" }] }]));
    expect(changed).toBe(false);
    expect(out.theme.accent).toBe("#5b8cff");
    expect(out.slides[0]!.background).toBeNull();
    expect(out.slides[0]!.blocks[0]).toMatchObject({ x: 0.1, y: 0.1, w: 0.5, h: 0.5, z: 0, figure: null, style: {} });
  });

  it("clamps size before position", () => {
    const { deck: out } = decodeDeck(
      deck([{ id: "s1", blocks: [{ id: "b1", type: "shape", x: 0.9, y: -1, w: 2, h: 0.001 }] }]),
    );
    expect(out.slides[0]!.blocks[0]).toMatchObject({ w: 1, h: 0.03, x: 0, y: 0 });
  });

  it("reports precise locations", () => {
    expect(() => decodeDeck(deck([{ id: "s1", blocks: [{ id: "b1", type: "shape", w: "wide" }] }]))).toThrow(
      "slides[0].blocks[0].w must be a number.",
    );
    expect(() => decodeDeck(deck([{ id: "s1" }, { id: "s1" }]))).toThrow("Duplicate id 's1' at slides[1].id.");
    expect(() => decodeDeck(deck([{ id: "s1", blocks: [{ id: "b1", type: "video" }] }]))).toThrow(DeckError);
    expect(() => decodeDeck({ format: "other" })).toThrow("Not a cast.presentation file.");
    expect(() => decodeDeck(deck([], { schema_version: 2 }))).toThrow("Unsupported presentation schema 2");
  });

  it("rejects booleans as numbers, like Python", () => {
    expect(() => decodeDeck(deck([{ id: "s1", blocks: [{ id: "b1", type: "shape", z: true }] }]))).toThrow(
      "slides[0].blocks[0].z must be a number.",
    );
  });

  it("migrates legacy markdown text and drops textMode", () => {
    const { deck: out, changed } = decodeDeck(
      deck([{ id: "s1", blocks: [{ id: "b1", type: "text", markdown: "## Hello\n\n- a", style: { textMode: "markdown" } }] }]),
    );
    const block = out.slides[0]!.blocks[0]!;
    expect(changed).toBe(true);
    expect(block.content).toContain("<h2>Hello</h2>");
    expect(block.content).toContain("<li>a</li>");
    expect(block.style).not.toHaveProperty("textMode");
  });

  it("sanitises stored content on load", () => {
    const { deck: out, changed } = decodeDeck(
      deck([{ id: "s1", blocks: [{ id: "b1", type: "text", content: '<p>ok<img src=x onerror="alert(1)"></p>' }] }]),
    );
    expect(changed).toBe(true);
    expect(out.slides[0]!.blocks[0]!.content).toBe("<p>ok</p>");
  });

  it("does not report a change for already clean content", () => {
    const { changed } = decodeDeck(deck([{ id: "s1", blocks: [{ id: "b1", type: "text", content: "<p>ok</p>" }] }]));
    expect(changed).toBe(false);
  });

  it("does not share style objects with the input", () => {
    const raw = deck([{ id: "s1", blocks: [{ id: "b1", type: "shape", style: { fill: "red" } }] }]);
    const { deck: out } = decodeDeck(raw);
    out.slides[0]!.blocks[0]!.style.fill = "blue";
    expect((raw.slides[0] as any).blocks[0].style.fill).toBe("red");
  });
});
