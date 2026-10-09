/** Right-click menu for objects and the slide. */

import { useEffect, useRef } from "react";
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import { useSession } from "../app/SessionContext";
import type { Session } from "../store/session";
import { addSlideCommand, enterEditing } from "./commands";
import { reorderLayers, parseBlocks, stackOrder } from "./operations";
import { deleteSelection, duplicateSelection, pastePayloads } from "./shortcuts";
import { resolveSlideIndex } from "./uiStore";

export const contextMenu = createStore<{ at: { x: number; y: number } | null }>()(() => ({ at: null }));

function slideOf(session: Session) {
  const { doc } = session.doc.getState();
  const { currentSlideId, currentIndexHint } = session.ui.getState();
  return doc.slides[resolveSlideIndex(doc.slides, currentSlideId, currentIndexHint)];
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl+";

export function ContextMenu() {
  const session = useSession();
  const at = useStore(contextMenu, (state) => state.at);
  const menu = useRef<HTMLDivElement>(null);
  const close = () => contextMenu.setState({ at: null });

  useEffect(() => {
    if (!at) return;
    menu.current?.querySelector<HTMLElement>("button")?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const items = Array.from(menu.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? []);
        const index = items.indexOf(document.activeElement as HTMLElement);
        items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [at]);

  if (!at) return null;
  const ui = session.ui.getState();
  const slide = slideOf(session);
  const selected = slide?.blocks.filter((block) => ui.selection.includes(block.id)) ?? [];
  const single = selected.length === 1 ? selected[0]! : null;
  const run = (action: () => void) => () => {
    close();
    action();
  };
  const layer = (move: "front" | "back") => {
    if (!slide) return;
    session.doc.getState().transact("Change layer", (draft) => reorderLayers(draft, slide.id, ui.selection, move));
  };
  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const payloads = parseBlocks(text);
      if (payloads.length) pastePayloads(session, payloads);
      else session.status.getState().notify(`Nothing to paste here. Use ${mod}V to paste text or images.`);
    } catch {
      session.status.getState().notify(`Use ${mod}V to paste.`);
    }
  };
  const style = { left: Math.min(at.x, window.innerWidth - 220), top: Math.min(at.y, window.innerHeight - 320) };

  return (
    <div ref={menu} className="context-menu" role="menu" style={style} onContextMenu={(event) => event.preventDefault()}>
      {single && ["text", "shape", "image"].includes(single.type) && (
        <button type="button" role="menuitem" onClick={run(() => enterEditing(session, single))}>
          {single.type === "text" ? "Edit text" : single.type === "shape" ? "Edit points" : "Crop"}<kbd>↵</kbd>
        </button>
      )}
      {selected.length > 0 && (
        <>
          <button type="button" role="menuitem" onClick={run(() => document.execCommand("cut"))}>Cut<kbd>{mod}X</kbd></button>
          <button type="button" role="menuitem" onClick={run(() => document.execCommand("copy"))}>Copy<kbd>{mod}C</kbd></button>
        </>
      )}
      <button type="button" role="menuitem" onClick={run(() => void paste())}>Paste<kbd>{mod}V</kbd></button>
      {selected.length > 0 ? (
        <>
          <button type="button" role="menuitem" onClick={run(() => duplicateSelection(session))}>Duplicate<kbd>{mod}D</kbd></button>
          <button type="button" role="menuitem" onClick={run(() => deleteSelection(session))}>Delete<kbd>⌫</kbd></button>
          <hr />
          <button type="button" role="menuitem" onClick={run(() => layer("front"))}>Bring to front</button>
          <button type="button" role="menuitem" onClick={run(() => layer("back"))}>Send to back</button>
        </>
      ) : (
        <>
          <button type="button" role="menuitem" disabled={!slide?.blocks.length}
            onClick={run(() => slide && ui.select(stackOrder(slide)))}>Select all<kbd>{mod}A</kbd></button>
          <hr />
          <button type="button" role="menuitem" onClick={run(() => addSlideCommand(session))}>New slide</button>
        </>
      )}
    </div>
  );
}
