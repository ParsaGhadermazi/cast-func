/** Editor actions that span several stores. */

import { api } from "../api/client";
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
