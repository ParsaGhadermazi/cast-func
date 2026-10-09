import { describe, expect, it } from "vitest";

import { cropLayout, hasCrop, normalizedCrop } from "./crop";

describe("image crop", () => {
  it("clamps each side and keeps at least 10% visible", () => {
    expect(normalizedCrop({ crop: { left: 0.9, right: 0.5, top: -1, bottom: 2 } })).toEqual({
      left: 0.8, right: 0.09999999999999998, top: 0, bottom: 0.9,
    });
    expect(hasCrop(normalizedCrop({}))).toBe(false);
  });

  it("fits the cropped region with contain", () => {
    // 200x100 image, left half cropped away -> visible 100x100 region in a 50x50 frame.
    const layout = cropLayout(50, 50, 200, 100, "contain", { left: 0.5, top: 0, right: 0, bottom: 0 });
    expect(layout).toEqual({ left: -50, top: 0, width: 100, height: 50 });
  });

  it("stretches the cropped region with fill", () => {
    const layout = cropLayout(100, 100, 10, 10, "fill", { left: 0.25, top: 0.25, right: 0.25, bottom: 0.25 });
    expect(layout).toEqual({ left: -50, top: -50, width: 200, height: 200 });
  });
});
