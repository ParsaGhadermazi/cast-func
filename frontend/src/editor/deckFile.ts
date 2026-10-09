/** Opening and downloading editable `.cast.json` files from the browser. */

import { DeckError, decodeDeck } from "../model/normalize";
import type { Session } from "../store/session";
import { flushTextEditing } from "./TextEditor";

export async function openDeckFile(session: Session, file: File): Promise<void> {
  const { notify } = session.status.getState();
  let decoded;
  try {
    decoded = decodeDeck(JSON.parse(await file.text()));
  } catch (error) {
    const message = error instanceof DeckError ? error.message : error instanceof SyntaxError ? "The file is not valid JSON." : String(error);
    notify(`Could not open ${file.name}: ${message}`, "error");
    return;
  }
  flushTextEditing();
  const { deck } = decoded;
  // Replacing the document is one undoable step, so opening the wrong file is harmless.
  session.doc.getState().transact(`Open ${file.name}`, (draft) => {
    draft.theme = deck.theme;
    draft.slides = deck.slides;
  });
  session.ui.getState().goToSlide(session.doc.getState().doc.slides, 0);
  const workspace = session.assets.getState().workspace;
  notify(
    workspace.configured
      ? `Opened ${file.name}. Save writes it to ${workspace.filename}; undo restores the previous deck.`
      : `Opened ${file.name}. Undo restores the previous deck.`,
  );
}

export function downloadDeck(session: Session): void {
  flushTextEditing();
  const { doc } = session.doc.getState();
  const blob = new Blob([JSON.stringify(doc, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = session.assets.getState().workspace.filename ?? "presentation.cast.json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
