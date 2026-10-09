import { useEffect, useState } from "react";

import { SLIDE_HEIGHT, SLIDE_WIDTH, type Block } from "../../model/types";
import { useAssetSource, useAssetVersion } from "../assets";
import { cropLayout, hasCrop, normalizedCrop } from "../crop";

export function ImageBody({ block }: { block: Block }) {
  const source = useAssetSource();
  const { style } = block;
  const version = useAssetVersion("image", block.image);
  void version; // re-render on refresh; imageSrc embeds the version
  const src = block.image ? source.imageSrc(block.image) : style.src || null;
  const [natural, setNatural] = useState<{ src: string; width: number; height: number } | null>(null);
  const [failure, setFailure] = useState<{ src: string; message: string } | null>(null);

  useEffect(() => setFailure(null), [src]);

  const frame = { background: style.bg || "transparent", borderRadius: `${style.radius || 0}px` };
  if (!src) {
    return (
      <div className="body image" style={frame}>
        <div className="ph">No image yet — choose an asset, file, or URL.</div>
      </div>
    );
  }
  if (failure?.src === src) {
    return (
      <div className="body image" style={frame}>
        <div className="ph" title={failure.message}>{failure.message}</div>
      </div>
    );
  }

  const crop = normalizedCrop(style);
  // The frame's size in slide pixels is known from the geometry, so the crop
  // can be laid out without measuring the DOM.
  const cropped = hasCrop(crop) && natural?.src === src;
  const placement = cropped
    ? cropLayout(block.w * SLIDE_WIDTH, block.h * SLIDE_HEIGHT, natural.width, natural.height, style.fit, crop)
    : null;

  const onError = async () => {
    let message = "Unable to render this image.";
    if (block.image) {
      try {
        const response = await fetch(src, { cache: "no-store" });
        const detail = (await response.text()).trim();
        if (detail && !response.ok) message = detail;
      } catch {
        // keep the generic message
      }
    }
    setFailure({ src, message });
  };

  return (
    <div className={`body image${cropped ? " cropped" : ""}`} style={frame}>
      <img
        src={src}
        alt={style.alt || (block.image ? source.imageAlt(block.image) ?? source.title("image", block.image) : "") || ""}
        draggable={false}
        decoding="async"
        onLoad={(event) =>
          setNatural({ src, width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
        }
        onError={onError}
        style={
          placement
            ? {
                position: "absolute",
                left: placement.left,
                top: placement.top,
                width: placement.width,
                height: placement.height,
                objectFit: "fill",
                imageRendering: style.rendering || "auto",
              }
            : { objectFit: style.fit || "contain", imageRendering: style.rendering || "auto" }
        }
      />
    </div>
  );
}
