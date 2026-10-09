import { useEffect, useRef } from "react";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const M = isMac ? "⌘" : "Ctrl";
const ALT = isMac ? "⌥" : "Alt";

const GROUPS: [string, [string, string][]][] = [
  ["Tools", [["V", "Select"], ["T", "Text (click to place, drag to size)"], ["R / O", "Rectangle / ellipse"], ["L / ⇧L", "Line / arrow"], ["Esc", "Back to Select, then deselect"]]],
  ["Selecting", [["Click", "Select the top object"], ["⇧ / " + M + " click", "Add to or remove from the selection"], ["Drag on empty space", "Select with a box"],
    [ALT + " click", "Cycle through objects under the pointer"], ["Tab / ⇧Tab", "Next / previous object"], [M + "A", "Select all"]]],
  ["Moving and sizing", [["Drag", "Move (snaps to edges and centres)"], ["⇧ drag", "Keep to one axis / keep proportions"], [ALT + " drag", "Duplicate while moving; resize from centre"],
    ["Hold " + M, "Place freely without snapping"], ["Arrows / ⇧ arrows", "Nudge 1 px / 10 px"], ["Esc during a drag", "Cancel it"]]],
  ["Editing", [["Double-click / ↵", "Edit text, points, or crop"], [M + "D", "Duplicate (the slide, if nothing is selected)"], [M + "C / X / V", "Copy, cut, paste (also text and images)"],
    ["⌫", "Delete"], [M + "Z / ⇧" + M + "Z", "Undo / redo"], [M + "S", "Save"]]],
  ["Slides", [["Page Up / Down", "Previous / next slide"], [ALT + "↑ / ↓ (in the rail)", "Move the slide"], ["Drag a thumbnail", "Reorder"]]],
  ["Presenting", [["→ / Space / ↵", "Next"], ["← / ⌫", "Previous"], ["Esc", "Stop"]]],
];

export function ShortcutsDialog({ onClose }: { onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog ref={dialog} className="shortcuts-dialog" aria-label="Keyboard shortcuts" onClose={onClose}
      onClick={(event) => { if (event.target === dialog.current) onClose(); }}>
      <header>
        <h2>Keyboard shortcuts</h2>
        <button type="button" className="icon" aria-label="Close" onClick={onClose}>×</button>
      </header>
      <div className="shortcut-groups">
        {GROUPS.map(([title, items]) => (
          <section key={title}>
            <h3>{title}</h3>
            <dl>
              {items.map(([keys, action]) => (
                <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{action}</dd></div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </dialog>
  );
}
