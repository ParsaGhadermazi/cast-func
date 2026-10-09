import { describe, expect, it } from "vitest";

import { describeShape, editableShapePoints, hasCustomPoints, smoothShapePath, strokeDash } from "./shapes";

describe("shape geometry", () => {
  it("uses stored points only when they form a valid outline", () => {
    expect(hasCustomPoints({ shape: "rect", points: [[0, 0], [10, 10]] })).toBe(false);
    expect(hasCustomPoints({ shape: "line", points: [[0, 0], [10, 10]] })).toBe(true);
    expect(hasCustomPoints({ shape: "rect", points: [[0, 0], [10, 10], [Number.NaN, 1]] })).toBe(false);
    expect(hasCustomPoints({ shape: "rect", points: Array.from({ length: 65 }, () => [1, 1]) as [number, number][] })).toBe(false);
  });

  it("clamps stored points into the viewBox", () => {
    expect(editableShapePoints({ shape: "rect", points: [[-5, 0], [120, 50], [50, 50]] })).toEqual([[0, 0], [100, 50], [50, 50]]);
  });

  it("gives every kind an implicit editable outline", () => {
    expect(editableShapePoints({ shape: "ellipse" })).toHaveLength(12);
    expect(editableShapePoints({ shape: "round-rect" })).toHaveLength(8);
    expect(editableShapePoints({ shape: "round-rect", radius: 1 })).toHaveLength(4);
    expect(editableShapePoints({ shape: "star" })).toHaveLength(10);
    expect(editableShapePoints({ shape: "line" })).toEqual([[4, 50], [96, 50]]);
  });

  it("builds closed and open smooth paths", () => {
    const square: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]];
    expect(smoothShapePath(square, true).endsWith("Z")).toBe(true);
    expect(smoothShapePath(square, true).match(/C/g)).toHaveLength(4);
    expect(smoothShapePath(square, false).match(/C/g)).toHaveLength(3);
    expect(smoothShapePath([[0, 0], [1, 1]], false)).toBe("M0 0 L1 1");
  });

  it("maps dash styles", () => {
    expect(strokeDash("dash")).toBe("10 7");
    expect(strokeDash("solid")).toBeUndefined();
  });

  it("paints lines with the fill colour as stroke and no fill", () => {
    const { element, paint } = describeShape({ shape: "arrow-line", fill: "#f00" });
    expect(element).toMatchObject({ tag: "path", line: true });
    expect(paint).toMatchObject({ fill: "none", stroke: "#f00", strokeWidth: 4, arrow: true });
  });

  it("treats transparent strokes as none on filled shapes", () => {
    expect(describeShape({ shape: "rect", stroke: "transparent" }).paint.stroke).toBe("none");
    expect(describeShape({ shape: "round-rect" }).element).toEqual({ tag: "rect", radius: 16 });
    expect(describeShape({ shape: "rect", points: [[0, 0], [100, 0], [50, 100]], smooth: true }).element.tag).toBe("path");
  });
});
