/**
 * Applying a text property follows one rule: with characters selected, it
 * styles those characters; otherwise it styles the whole text box (and
 * clears per-character overrides of that property so the change shows).
 */

import type { Block } from "../model/types";
import { sanitizeRichHtml } from "../model/sanitize";
import type { Session } from "../store/session";
import { slideById } from "./operations";
import { stripInlineStyle, styleRange, type InlineStyle } from "./richText";
import { restoreTextSelection, textSession } from "./textSession";

const BLOCK_KEY: Record<keyof InlineStyle, string> = {
  "font-size": "fontSize",
  "font-family": "fontFamily",
  color: "color",
  "font-weight": "weight",
  "font-style": "italic",
};

function blockValue(property: keyof InlineStyle, value: string): unknown {
  if (property === "font-size") return parseFloat(value);
  if (property === "font-style") return value === "italic";
  return value;
}

export function applyTextProperty(session: Session, slideId: string, block: Block, property: keyof InlineStyle, value: string): void {
  applyTextPropertyToBlocks(session, slideId, [block], property, value);
}

/** The same rule for several selected text boxes (no character selection then). */
export function applyTextPropertyToBlocks(
  session: Session, slideId: string, blocks: Block[], property: keyof InlineStyle, value: string,
): void {
  const { rich, range } = textSession.getState();
  const block = blocks[0]!;
  if (blocks.length === 1 && rich && range && !range.collapsed) {
    restoreTextSelection();
    const styled = styleRange(range, { [property]: value });
    if (styled) {
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(styled);
      textSession.setState({ range: styled.cloneRange() });
    }
    textSession.getState().commit?.();
    return;
  }
  // Whole boxes. While editing, the live element must change too.
  const key = BLOCK_KEY[property];
  const editingId = rich ? block.id : null;
  const contents = new Map(
    blocks.map((target) => [target.id, stripInlineStyle(target.id === editingId ? rich!.innerHTML : target.content ?? "", [property])]),
  );
  if (rich && editingId) rich.innerHTML = contents.get(editingId)!;
  session.doc.getState().transact(`Text ${key}`, (draft) => {
    for (const target of slideById(draft, slideId)?.blocks ?? []) {
      if (!contents.has(target.id)) continue;
      target.style[key] = blockValue(property, value);
      target.content = sanitizeRichHtml(contents.get(target.id)!);
    }
  }, { mergeKey: `text-style:${blocks.map((b) => b.id).join(",")}:${key}`, mergeWindowMs: 800 });
}
