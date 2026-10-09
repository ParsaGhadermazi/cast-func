/** Text block styling shared by every renderer (legacy `applyTextStyle`). */

import type { CSSProperties } from "react";

import type { BlockStyle } from "../model/types";

export const CODE_FONT = "'Roboto Mono',ui-monospace,SFMono-Regular,Menlo,monospace";

export const isCodeText = (style: BlockStyle): boolean => style.textVariant === "code";

/** Inline style for the `.rich` element. */
export function richStyle(style: BlockStyle): CSSProperties {
  const code = isCodeText(style);
  return {
    fontFamily: style.fontFamily || (code ? CODE_FONT : undefined),
    fontSize: `${style.fontSize || (code ? 16 : 18)}px`,
    color: style.color || (code ? "#e5e7eb" : undefined),
    textAlign: style.align || "left",
    fontWeight: style.weight || undefined,
    fontStyle: style.italic ? "italic" : undefined,
    lineHeight: style.lineHeight || (code ? 1.55 : undefined),
  };
}

/** An explicitly stored `bg` (even "transparent") overrides the code default. */
export function textBackground(style: BlockStyle): string {
  if (Object.prototype.hasOwnProperty.call(style, "bg")) return String(style.bg);
  return isCodeText(style) ? "#111827" : "transparent";
}

const MARKER_PROPERTIES = [
  "--marker-font-family",
  "--marker-font-size",
  "--marker-font-weight",
  "--marker-font-style",
  "--marker-color",
] as const;

/**
 * `::marker` cannot inherit styles from spans inside the list item, so copy
 * the computed style of each item's first visible character into the
 * `--marker-*` variables that the stylesheet's `li::marker` rule reads.
 */
export function syncListMarkers(rich: HTMLElement): void {
  if (!rich.isConnected) return;
  for (const item of Array.from(rich.querySelectorAll("li"))) {
    const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
    let character: HTMLElement | null = null;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (node.parentElement?.closest("li") === item && node.data.replace(/​/g, "").trim()) {
        character = node.parentElement;
        break;
      }
    }
    if (!character) {
      for (const property of MARKER_PROPERTIES) item.style.removeProperty(property);
      continue;
    }
    const computed = getComputedStyle(character);
    item.style.setProperty("--marker-font-family", computed.fontFamily);
    item.style.setProperty("--marker-font-size", computed.fontSize);
    item.style.setProperty("--marker-font-weight", computed.fontWeight);
    item.style.setProperty("--marker-font-style", computed.fontStyle);
    item.style.setProperty("--marker-color", computed.color);
  }
}
