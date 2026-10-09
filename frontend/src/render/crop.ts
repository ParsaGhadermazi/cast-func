/**
 * Non-destructive image crop, ported from the legacy `applyImageCrop`.
 *
 * Crop values are fractions of the source image cut from each side. The
 * cropped region is fitted into the frame with the block's `fit` mode, and
 * the full image is positioned so only that region shows.
 */

import { clamp } from "../model/geometry";
import type { BlockStyle, CropBox } from "../model/types";

export function normalizedCrop(style: BlockStyle): CropBox {
  const crop = style.crop ?? {};
  const left = clamp(Number(crop.left) || 0, 0, 0.8);
  const top = clamp(Number(crop.top) || 0, 0, 0.8);
  return {
    left,
    top,
    right: clamp(Number(crop.right) || 0, 0, 0.9 - left),
    bottom: clamp(Number(crop.bottom) || 0, 0, 0.9 - top),
  };
}

export const hasCrop = (crop: CropBox): boolean =>
  crop.left > 0 || crop.top > 0 || crop.right > 0 || crop.bottom > 0;

export interface CropLayout {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where to place the full image (in frame pixels) so the cropped region is
 * fitted into a `frameWidth` × `frameHeight` frame.
 */
export function cropLayout(
  frameWidth: number,
  frameHeight: number,
  naturalWidth: number,
  naturalHeight: number,
  fit: BlockStyle["fit"],
  crop: CropBox,
): CropLayout {
  const cropWidth = 1 - crop.left - crop.right;
  const cropHeight = 1 - crop.top - crop.bottom;
  let width: number;
  let height: number;
  if (fit === "fill") {
    width = frameWidth / cropWidth;
    height = frameHeight / cropHeight;
  } else {
    const scale = (fit === "cover" ? Math.max : Math.min)(
      frameWidth / (naturalWidth * cropWidth),
      frameHeight / (naturalHeight * cropHeight),
    );
    width = naturalWidth * scale;
    height = naturalHeight * scale;
  }
  return {
    left: (frameWidth - width * cropWidth) / 2 - width * crop.left,
    top: (frameHeight - height * cropHeight) / 2 - height * crop.top,
    width,
    height,
  };
}
