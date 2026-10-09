/** Editor actions that span several stores. */

import { api } from "../api/client";
import type { Block } from "../model/types";
import type { Session } from "../store/session";
import { addSlide, deleteSlides, duplicateSlides, moveSlide, templateBlocks, type SlideTemplate } from "./slides";
import { flushTextEditing } from "./TextEditor";
import { resolveSlideIndex } from "./uiStore";

/** Make sure the server has every change, then write the workspace file. */
export async function saveWorkspace(session: Session): Promise<void> {
  const { notify } = session.status.getState();
  try {
    flushTextEditing();
    await session.sync.flush();
    const result = await api.saveWorkspace();
    notify(`Saved ${result.filename}`);
  } catch (error) {
    notify(`Could not save: ${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

/** Double-click: edit the object in place, in the way that suits its type. */
export function enterEditing(session: Session, block: Block, caret?: { x: number; y: number }): void {
  const ui = session.ui.getState();
  if (block.type === "shape") ui.startEditing({ kind: "points", id: block.id, point: null });
  // Without a click position (Enter key), select the text so typing replaces it.
  else if (block.type === "text") ui.startEditing({ kind: "text", id: block.id, caret, selectAll: !caret });
  else if (block.type === "image") ui.startEditing({ kind: "crop", id: block.id });
}

// ------------------------------------------------------------------ slides


function currentIndex(session: Session): number {
  const { doc } = session.doc.getState();
  const { currentSlideId, currentIndexHint } = session.ui.getState();
  return resolveSlideIndex(doc.slides, currentSlideId, currentIndexHint);
}

function goToSlideId(session: Session, id: string): void {
  const slides = session.doc.getState().doc.slides;
  session.ui.getState().goToSlide(slides, slides.findIndex((slide) => slide.id === id));
}

export function addSlideCommand(session: Session, template: SlideTemplate = "blank"): void {
  const { figures, tables } = session.assets.getState();
  const first = figures[0] && tables[0] ? { figure: figures[0].name, table: tables[0].name } : undefined;
  const after = currentIndex(session);
  let id = "";
  session.doc.getState().transact("Add slide", (draft) => {
    id = addSlide(draft, after < 0 ? null : after, templateBlocks(template, draft.theme, first));
  });
  goToSlideId(session, id);
}

export function duplicateSlideCommand(session: Session, slideId?: string): void {
  const slides = session.doc.getState().doc.slides;
  const id = slideId ?? slides[currentIndex(session)]?.id;
  if (!id) return;
  let created: string[] = [];
  session.doc.getState().transact("Duplicate slide", (draft) => {
    created = duplicateSlides(draft, [id]);
  });
  if (created[0]) goToSlideId(session, created[0]);
}

export function deleteSlideCommand(session: Session, slideId?: string): void {
  const slides = session.doc.getState().doc.slides;
  const index = slideId ? slides.findIndex((slide) => slide.id === slideId) : currentIndex(session);
  const target = slides[index];
  if (!target) return;
  const wasCurrent = index === currentIndex(session);
  session.doc.getState().transact("Delete slide", (draft) => deleteSlides(draft, [target.id]));
  const remaining = session.doc.getState().doc.slides;
  if (wasCurrent) session.ui.getState().goToSlide(remaining, Math.min(index, remaining.length - 1));
  session.status.getState().notify(`Deleted slide ${index + 1}. Undo with Cmd/Ctrl+Z.`);
}

export function moveSlideCommand(session: Session, slideId: string, toIndex: number): void {
  session.doc.getState().transact("Move slide", (draft) => moveSlide(draft, slideId, toIndex));
}
