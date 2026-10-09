/** Editor actions that span several stores. */

import { api } from "../api/client";
import type { Block } from "../model/types";
import type { Session } from "../store/session";
import { flushTextEditing } from "./TextEditor";

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
