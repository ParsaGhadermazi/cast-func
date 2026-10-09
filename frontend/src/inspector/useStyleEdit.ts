import { useSession } from "../app/SessionContext";
import { patchStyle } from "../editor/operations";

/**
 * Apply style changes to the selected blocks. Rapid changes to the same
 * control (dragging a slider or colour picker) merge into one undo step.
 */
export function useStyleEdit(slideId: string, ids: string[]) {
  const session = useSession();
  return (patch: Record<string, unknown>, label = "Edit style") => {
    const control = Object.keys(patch).sort().join(",");
    session.doc.getState().transact(label, (draft) => patchStyle(draft, slideId, ids, patch), {
      mergeKey: `style:${ids.join(",")}:${control}`,
      mergeWindowMs: 800,
    });
  };
}
