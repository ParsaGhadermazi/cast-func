/** Inserting notebook assets and image files onto the current slide. */

import { SLIDE_HEIGHT, SLIDE_WIDTH } from "../model/types";
import type { Session } from "../store/session";
import { emptyPayload, insertBlocks, type BlockPayload } from "./operations";
import { resolveSlideIndex } from "./uiStore";

export const TABLE_STYLE = {
  rowLimit: 200, fontSize: 12, compact: false, striped: true, showIndex: true,
  headerBg: "#eef2f7", headerColor: "#374151", bg: "#ffffff", borderColor: "#d1d5db",
};

export function insertPayloads(session: Session, payloads: BlockPayload[], label: string): string[] {
  const { doc } = session.doc.getState();
  const { currentSlideId, currentIndexHint } = session.ui.getState();
  const slide = doc.slides[resolveSlideIndex(doc.slides, currentSlideId, currentIndexHint)];
  if (!slide || !payloads.length) return [];
  let created: string[] = [];
  session.doc.getState().transact(label, (draft) => {
    created = insertBlocks(draft, slide.id, payloads);
  });
  const ui = session.ui.getState();
  ui.setTool({ kind: "select" });
  ui.select(created);
  ui.setSidebarTab("properties");
  return created;
}

export const figurePayload = (figure: string, table: string | null): BlockPayload => ({
  ...emptyPayload("figure", { x: 0.07, y: 0.16, w: 0.52, h: 0.66 }), figure, table,
});

export const tablePayload = (table: string): BlockPayload => ({
  ...emptyPayload("table", { x: 0.12, y: 0.18, w: 0.76, h: 0.58 }), table, style: { ...TABLE_STYLE },
});

export const htmlPayload = (html: string): BlockPayload => ({
  ...emptyPayload("html", { x: 0.12, y: 0.16, w: 0.76, h: 0.62 }), html,
});

/** Natural size of an image URL (SVGs without a size fall back to 4:3). */
export function imageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 400, height: image.naturalHeight || 300 });
    image.onerror = () => resolve({ width: 400, height: 300 });
    image.src = src;
  });
}

/**
 * An image block sized to the picture's own aspect ratio, fitting within
 * 60% of the slide and centred on `center` (slide fractions).
 */
export async function imagePayload(
  source: { image: string; src: string } | { src: string },
  alt: string,
  center = { x: 0.5, y: 0.5 },
): Promise<BlockPayload> {
  const size = await imageSize(source.src);
  const scale = Math.min((0.6 * SLIDE_WIDTH) / size.width, (0.6 * SLIDE_HEIGHT) / size.height, 1.5);
  const w = (size.width * scale) / SLIDE_WIDTH;
  const h = (size.height * scale) / SLIDE_HEIGHT;
  const rect = {
    x: Math.min(Math.max(center.x - w / 2, 0), 1 - w),
    y: Math.min(Math.max(center.y - h / 2, 0), 1 - h),
    w,
    h,
  };
  const base = emptyPayload("image", rect);
  return "image" in source
    ? { ...base, image: source.image, style: { fit: "contain", rendering: "auto", alt } }
    : { ...base, style: { src: source.src, fit: "contain", rendering: "auto", alt } };
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Insert image files (upload, drop, paste); each is placed at its natural aspect. */
export async function insertImageFiles(session: Session, files: File[], center?: { x: number; y: number }): Promise<void> {
  const images = files.filter((file) => file.type.startsWith("image/"));
  if (!images.length) {
    if (files.length) session.status.getState().notify("Only image files can be added to a slide.", "error");
    return;
  }
  const payloads = await Promise.all(
    images.map(async (file, index) => {
      const src = await readFileAsDataUrl(file);
      const offset = (index * 24) / SLIDE_WIDTH;
      const at = center ? { x: center.x + offset, y: center.y + offset } : undefined;
      return imagePayload({ src }, file.name.replace(/\.[^.]+$/, ""), at);
    }),
  );
  insertPayloads(session, payloads, images.length > 1 ? `Add ${images.length} images` : "Add image");
}
