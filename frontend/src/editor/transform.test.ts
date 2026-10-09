import { describe, expect, it } from "vitest";

import {
  boundsOf,
  centerOf,
  clampTranslation,
  cornersOf,
  normalizeAngle,
  rectsIntersect,
  resizeBox,
  resizeGroup,
  rotateBoxes,
  rotationDelta,
  snapAngle,
  snapMove,
  snapResize,
  snapTargetsFor,
  guidesFor,
  type Box,
} from "./transform";

const box = (x: number, y: number, w: number, h: number, rotation = 0): Box => ({ x, y, w, h, rotation });
const close = (actual: Box, expected: Box) => {
  for (const key of ["x", "y", "w", "h", "rotation"] as const) expect(actual[key]).toBeCloseTo(expected[key], 6);
};

describe("resizeBox", () => {
  it("drags a corner with the opposite corner fixed", () => {
    close(resizeBox(box(100, 100, 200, 100), "se", { x: 400, y: 300 }), box(100, 100, 300, 200));
    close(resizeBox(box(100, 100, 200, 100), "nw", { x: 50, y: 80 }), box(50, 80, 250, 120));
  });

  it("edge handles change one dimension", () => {
    close(resizeBox(box(100, 100, 200, 100), "e", { x: 500, y: 999 }), box(100, 100, 400, 100));
    close(resizeBox(box(100, 100, 200, 100), "n", { x: 0, y: 50 }), box(100, 50, 200, 150));
  });

  it("keeps the aspect ratio with Shift", () => {
    close(resizeBox(box(0, 0, 200, 100), "se", { x: 400, y: 120 }, { keepAspect: true }), box(0, 0, 400, 200));
    // Dragging only sideways still shrinks proportionally.
    close(resizeBox(box(0, 0, 200, 100), "se", { x: 100, y: 100 }, { keepAspect: true }), box(0, 0, 100, 50));
    // Edge handle with a kept ratio grows about the edge's middle.
    close(resizeBox(box(0, 0, 200, 100), "e", { x: 400, y: 0 }, { keepAspect: true }), box(0, -50, 400, 200));
  });

  it("resizes from the centre with Alt", () => {
    close(resizeBox(box(100, 100, 200, 100), "e", { x: 350, y: 0 }, { fromCenter: true }), box(50, 100, 300, 100));
  });

  it("stops at the minimum size instead of flipping", () => {
    const result = resizeBox(box(100, 100, 200, 100), "se", { x: 0, y: 0 }, { minW: 10, minH: 10 });
    close(result, box(100, 100, 10, 10));
  });

  it("keeps the opposite corner fixed on screen for rotated boxes", () => {
    const start = box(100, 100, 200, 100, 30);
    const fixed = cornersOf(start)[0]!; // nw stays put when dragging se
    const result = resizeBox(start, "se", { x: 500, y: 400 });
    const after = cornersOf(result)[0]!;
    expect(after.x).toBeCloseTo(fixed.x, 6);
    expect(after.y).toBeCloseTo(fixed.y, 6);
    expect(result.rotation).toBe(30);
  });
});

describe("group transforms", () => {
  it("scales boxes inside the shared bounds", () => {
    const result = resizeGroup([box(0, 0, 100, 100), box(200, 0, 100, 100)], "e", { x: 600, y: 50 });
    close(result[0]!, box(0, 0, 200, 100));
    close(result[1]!, box(400, 0, 200, 100));
  });

  it("scales uniformly when a member is rotated obliquely", () => {
    const result = resizeGroup([box(0, 0, 100, 100, 45), box(200, 0, 100, 100)], "e", { x: 2 * 320.71, y: 0 });
    const ratio = result[1]!.w / 100;
    expect(result[1]!.h / 100).toBeCloseTo(ratio, 6);
  });

  it("rotates a group rigidly about a pivot", () => {
    const [a] = rotateBoxes([box(100, 0, 100, 100)], { x: 0, y: 50 }, 90);
    expect(centerOf(a!).x).toBeCloseTo(0, 6);
    expect(centerOf(a!).y).toBeCloseTo(200, 6);
    expect(a!.rotation).toBe(90);
  });
});

describe("rotation helpers", () => {
  it("normalises angles to (-180, 180]", () => {
    expect(normalizeAngle(190)).toBe(-170);
    expect(normalizeAngle(-180)).toBe(180);
    expect(normalizeAngle(360)).toBe(0);
    expect(Object.is(normalizeAngle(-360), -0)).toBe(false);
  });

  it("measures the drag angle around a centre and snaps to 15°", () => {
    expect(rotationDelta({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90, 6);
    expect(snapAngle(52)).toBe(45);
    expect(snapAngle(53)).toBe(60);
  });

  it("computes bounds of rotated boxes", () => {
    const bounds = boundsOf(box(0, 0, 100, 100, 45));
    expect(bounds.w).toBeCloseTo(Math.SQRT2 * 100, 6);
    expect(rectsIntersect(bounds, { x: -20, y: -20, w: 5, h: 5 })).toBe(true);
  });
});

describe("moving", () => {
  it("keeps stored rectangles on the slide", () => {
    expect(clampTranslation([box(10, 10, 100, 100)], -50, 900)).toEqual({ x: -10, y: 475 });
    // Group: limited by whichever member hits the edge first.
    expect(clampTranslation([box(10, 10, 100, 100), box(900, 10, 100, 100)], 100, 0).x).toBe(40);
  });
});

describe("snapping", () => {
  const targets = snapTargetsFor([{ x: 300, y: 200, w: 100, h: 50 }]);

  it("snaps the nearest edge or centre within the threshold", () => {
    // Left edge 297 -> snaps to the other object's left edge at 300.
    expect(snapMove({ x: 290, y: 0, w: 50, h: 50 }, 7, 0, targets, 5)).toEqual({ x: 10, y: 0 });
    // Centre near the slide centre (520).
    expect(snapMove({ x: 0, y: 0, w: 100, h: 50 }, 468, 0, targets, 5).x).toBe(470);
    expect(snapMove({ x: 0, y: 0, w: 10, h: 10 }, 120, 0, targets, 5).x).toBe(120);
  });

  it("reports guides for every alignment", () => {
    const guides = guidesFor({ x: 300, y: 0, w: 100, h: 50 }, targets);
    expect(guides.xs.sort()).toEqual([300, 350, 400]);
    expect(guides.ys).toEqual([0]);
  });

  it("snaps a moving edge while resizing", () => {
    const snapped = snapResize(box(100, 100, 197, 50), "e", targets, 5);
    expect(snapped.w).toBe(200);
    expect(snapResize(box(100, 100, 197, 50, 10), "e", targets, 5).w).toBe(197);
  });
});
