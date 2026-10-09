/**
 * Editor keyboard shortcuts and clipboard handling.
 *
 * Shortcuts are skipped while focus is in a form field or editable text, so
 * native editing (and its own undo) keeps working there. Copy, cut and
 * paste use the browser's clipboard events, which need no permission prompt.
 */

import { useEffect } from "react";

import { plainTextToHtml } from "../model/sanitize";
import { SLIDE_HEIGHT, SLIDE_WIDTH, type Block } from "../model/types";
import type { Session } from "../store/session";
import { saveWorkspace } from "./commands";
import { isTypingTarget, useSlideNavigation } from "./hooks";
import type { CanvasInteraction } from "./interaction";
import {
  CLIPBOARD_MIME,
  CLIPBOARD_TEXT_PREFIX,
  deleteBlocks,
  duplicateBlocks,
  insertBlocks,
  nudgeBlocks,
  parseBlocks,
  serializeBlocks,
  stackOrder,
  type BlockPayload,
} from "./operations";
import { resolveSlideIndex } from "./uiStore";

function currentSlide(session: Session) {
  const { doc } = session.doc.getState();
  const { currentSlideId, currentIndexHint } = session.ui.getState();
  return doc.slides[resolveSlideIndex(doc.slides, currentSlideId, currentIndexHint)];
}

function selectedBlocks(session: Session): Block[] {
  const slide = currentSlide(session);
  const { selection } = session.ui.getState();
  if (!slide) return [];
  const order = stackOrder(slide);
  return slide.blocks.filter((block) => selection.includes(block.id)).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

export function deleteSelection(session: Session): void {
  const slide = currentSlide(session);
  const ids = session.ui.getState().selection;
  if (!slide || !ids.length) return;
  session.doc.getState().transact(ids.length > 1 ? `Delete ${ids.length} objects` : "Delete", (draft) => deleteBlocks(draft, slide.id, ids));
  session.ui.getState().clearSelection();
}

export function duplicateSelection(session: Session): void {
  const slide = currentSlide(session);
  const ids = session.ui.getState().selection;
  if (!slide || !ids.length) return;
  let created: string[] = [];
  session.doc.getState().transact("Duplicate", (draft) => {
    created = duplicateBlocks(draft, slide.id, ids);
  });
  session.ui.getState().select(created);
}

export function pastePayloads(session: Session, payloads: BlockPayload[], label = "Paste"): void {
  const slide = currentSlide(session);
  if (!slide || !payloads.length) return;
  let created: string[] = [];
  session.doc.getState().transact(label, (draft) => {
    created = insertBlocks(draft, slide.id, payloads);
  });
  session.ui.getState().select(created);
}

function emptyBlock(type: Block["type"]): Omit<BlockPayload, "x" | "y" | "w" | "h"> {
  return { type, figure: null, table: null, html: null, image: null, content: null, markdown: null, style: {} };
}

/** Pasted plain text becomes a text box; a pasted image becomes an image block. */
async function payloadsFromForeignClipboard(data: DataTransfer): Promise<BlockPayload[]> {
  const file = Array.from(data.files).find((item) => item.type.startsWith("image/"));
  if (file) {
    const src = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const size = await new Promise<{ width: number; height: number }>((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth || 400, height: image.naturalHeight || 300 });
      image.onerror = () => resolve({ width: 400, height: 300 });
      image.src = src;
    });
    // Fit within 60% of the slide, keep the aspect ratio, centre it.
    const scale = Math.min((0.6 * SLIDE_WIDTH) / size.width, (0.6 * SLIDE_HEIGHT) / size.height, 1);
    const w = (size.width * scale) / SLIDE_WIDTH;
    const h = (size.height * scale) / SLIDE_HEIGHT;
    return [{ ...emptyBlock("image"), x: (1 - w) / 2, y: (1 - h) / 2, w, h, style: { src, fit: "contain", alt: file.name } }];
  }
  const text = data.getData("text/plain").trim();
  if (text) {
    return [{ ...emptyBlock("text"), x: 0.1, y: 0.15, w: 0.5, h: 0.3, content: plainTextToHtml(text), style: { fontSize: 24 } }];
  }
  return [];
}

export function useEditorShortcuts(session: Session, interaction: CanvasInteraction): void {
  const nav = useSlideNavigation();

  useEffect(() => {
    const nudgeKeys: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };

    const onKey = (event: KeyboardEvent) => {
      const ui = session.ui.getState();
      if (ui.present) return; // present mode owns the keyboard
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (mod && key === "s") {
        event.preventDefault();
        if (session.assets.getState().workspace.configured) void saveWorkspace(session);
        return;
      }
      if (event.key === "Escape") {
        if (interaction.cancel()) return event.preventDefault();
        if (isTypingTarget(event.target)) return (event.target as HTMLElement).blur();
        ui.clearSelection();
        return;
      }
      if (isTypingTarget(event.target)) return; // fields keep their own keys and undo
      if (interaction.busy) return;
      const slide = currentSlide(session);

      if (mod && !event.altKey && key === "z") {
        event.preventDefault();
        if (event.shiftKey) session.doc.getState().redo();
        else session.doc.getState().undo();
      } else if (mod && !event.altKey && key === "y") {
        event.preventDefault();
        session.doc.getState().redo();
      } else if (mod && key === "a") {
        event.preventDefault();
        if (slide) ui.select(stackOrder(slide));
      } else if (mod && key === "d") {
        event.preventDefault();
        duplicateSelection(session);
      } else if ((event.key === "Delete" || event.key === "Backspace") && ui.selection.length) {
        event.preventDefault();
        deleteSelection(session);
      } else if (nudgeKeys[event.key] && ui.selection.length && slide) {
        event.preventDefault();
        const [dx, dy] = nudgeKeys[event.key]!;
        const step = event.shiftKey ? 10 : 1;
        // A burst of nudges is one undo step.
        session.doc.getState().transact(
          "Nudge",
          (draft) => nudgeBlocks(draft, slide.id, ui.selection, dx * step, dy * step),
          { mergeKey: `nudge:${ui.selection.join(",")}`, mergeWindowMs: 1000 },
        );
      } else if (event.key === "Tab" && slide?.blocks.length) {
        // Tab / Shift+Tab walk through objects from the top of the stack.
        event.preventDefault();
        const order = stackOrder(slide).reverse();
        const at = ui.primary ? order.indexOf(ui.primary) : -1;
        const next = order[(at + (event.shiftKey ? -1 : 1) + order.length) % order.length]!;
        ui.select([next]);
      } else if (event.key === "PageDown") {
        event.preventDefault();
        nav.step(1);
      } else if (event.key === "PageUp") {
        event.preventDefault();
        nav.step(-1);
      }
    };

    const writeClipboard = (event: ClipboardEvent): boolean => {
      if (isTypingTarget(event.target) || session.ui.getState().present) return false;
      const blocks = selectedBlocks(session);
      if (!blocks.length || !event.clipboardData) return false;
      const json = serializeBlocks(blocks);
      event.clipboardData.setData(CLIPBOARD_MIME, json);
      event.clipboardData.setData("text/plain", CLIPBOARD_TEXT_PREFIX + json);
      event.preventDefault();
      return true;
    };
    const onCopy = (event: ClipboardEvent) => void writeClipboard(event);
    const onCut = (event: ClipboardEvent) => {
      if (writeClipboard(event)) deleteSelection(session);
    };
    const onPaste = (event: ClipboardEvent) => {
      if (isTypingTarget(event.target) || session.ui.getState().present || !event.clipboardData) return;
      const data = event.clipboardData;
      const ours = data.getData(CLIPBOARD_MIME) || data.getData("text/plain");
      const payloads = ours.startsWith("[") || ours.startsWith(CLIPBOARD_TEXT_PREFIX) ? parseBlocks(ours) : [];
      event.preventDefault();
      if (payloads.length) return pastePayloads(session, payloads);
      void payloadsFromForeignClipboard(data).then((foreign) => pastePayloads(session, foreign));
    };

    window.addEventListener("keydown", onKey);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
    };
  });
}
