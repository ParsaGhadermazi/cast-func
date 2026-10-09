import type { Assets } from "../api/client";
import { plainTextFromHtml } from "../model/sanitize";
import type { Block } from "../model/types";
import { shapeTitle } from "../render/shapes";

/** A short human label for a block (layers list, accessible names). */
export function blockLabel(block: Block, assets: Assets): string {
  if (block.type === "text") return plainTextFromHtml(block.content).replace(/\s+/g, " ").slice(0, 80) || "Empty text";
  if (block.type === "shape") return shapeTitle(block.style.shape);
  if (block.type === "image" && !block.image) return block.style.alt || "Image";
  const lists = { figure: assets.figures, table: assets.tables, html: assets.htmls, image: assets.images } as const;
  const name = block[block.type as keyof typeof lists] as string | null;
  return lists[block.type as keyof typeof lists].find((asset) => asset.name === name)?.title || name || block.type;
}
