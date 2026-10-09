import { describe, expect, it } from "vitest";

import { fitOutline, flipPoints, insertVertex, lineBetween, moveVertex, pointsToSlide, removeVertex, snapToAngle } from "./shapeEdit";
import { MIN_H } from "./transform";

const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 1); // stored points are rounded to 0.01 viewBox units
  expect(a.y).toBeCloseTo(b.y, 1);
};

describe("outline editing", () => {
  it("maps viewBox points onto the slide, including rotation", () => {
    const [p] = pointsToSlide({ x: 100, y: 100, w: 200, h: 100, rotation: 0 }, [[50, 100]]);
    near(p!, { x: 200, y: 200 });
    const [q] = pointsToSlide({ x: 0, y: 0, w: 100, h: 100, rotation: 90 }, [[100, 50]]);
    near(q!, { x: 50, y: 100 });
  });

  it("grows the box when a vertex moves outside it, keeping the others in place", () => {
    const box = { x: 100, y: 100, w: 100, h: 100, rotation: 0 };
    const points: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const result = moveVertex(box, points, 2, { x: 300, y: 250 });
    expect(result.box).toMatchObject({ x: 100, y: 100, w: 200, h: 150 });
    const slide = pointsToSlide(result.box, result.points);
    near(slide[0]!, { x: 100, y: 100 });
    near(slide[2]!, { x: 300, y: 250 });
  });

  it("keeps other vertices fixed on screen for rotated shapes", () => {
    const box = { x: 100, y: 100, w: 100, h: 100, rotation: 30 };
    const points: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const before = pointsToSlide(box, points);
    const result = moveVertex(box, points, 2, { x: 400, y: 400 });
    const after = pointsToSlide(result.box, result.points);
    near(after[0]!, before[0]!);
    near(after[1]!, before[1]!);
    near(after[2]!, { x: 400, y: 400 });
    expect(result.box.rotation).toBe(30);
  });

  it("gives a horizontal line the minimum height", () => {
    const { box, points } = lineBetween({ x: 10, y: 50 }, { x: 210, y: 50 });
    expect(box.h).toBeCloseTo(MIN_H, 6);
    expect(points).toEqual([[0, 50], [100, 50]]);
    near(pointsToSlide(box, points)[1]!, { x: 210, y: 50 });
  });

  it("inserts, removes and flips vertices", () => {
    expect(insertVertex([[0, 0], [100, 0], [50, 100]], 0)).toEqual([[0, 0], [50, 0], [100, 0], [50, 100]]);
    expect(removeVertex([[0, 0], [100, 0], [50, 100]], 0, "triangle")).toHaveLength(3); // minimum reached
    expect(removeVertex([[0, 0], [100, 0]], 0, "line")).toHaveLength(2);
    expect(flipPoints([[10, 20]], "x")).toEqual([[90, 20]]);
  });

  it("snaps a line direction to 45°", () => {
    near(snapToAngle({ x: 0, y: 0 }, { x: 100, y: 10 }), { x: Math.hypot(100, 10), y: 0 });
    const diagonal = snapToAngle({ x: 0, y: 0 }, { x: 100, y: 90 });
    expect(diagonal.x).toBeCloseTo(diagonal.y, 6);
  });

  it("fits around a pivot independent of where the pivot is", () => {
    const a = fitOutline(20, [{ x: 0, y: 0 }, { x: 100, y: 40 }, { x: 30, y: 90 }], { x: 0, y: 0 });
    const b = fitOutline(20, [{ x: 0, y: 0 }, { x: 100, y: 40 }, { x: 30, y: 90 }], { x: 500, y: -200 });
    near(pointsToSlide(a.box, a.points)[1]!, pointsToSlide(b.box, b.points)[1]!);
  });
});
