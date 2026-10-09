/** Editor actions that span several stores. */

import { api } from "../api/client";
import type { Block } from "../model/types";
import type { Session } from "../store/session";

/** Make sure the server has every change, then write the workspace file. */
export async function saveWorkspace(session: Session): Promise<void> {
  const { notify } = session.status.getState();
  try {
    await session.sync.flush();
    const result = await api.saveWorkspace();
    notify(`Saved ${result.filename}`);
  } catch (error) {
    notify(`Could not save: ${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

/** Double-click: edit the object in place, in the way that suits its type. */
export function enterEditing(session: Session, block: Block): void {
  const ui = session.ui.getState();
  if (block.type === "shape") ui.startEditing({ kind: "points", id: block.id, point: null });
  else if (block.type === "text") ui.startEditing({ kind: "text", id: block.id });
  else if (block.type === "image") ui.startEditing({ kind: "crop", id: block.id });
}
