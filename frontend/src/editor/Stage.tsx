import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

import { useDoc, useSession, useUi } from "../app/SessionContext";
import { SLIDE_HEIGHT, SLIDE_WIDTH } from "../model/types";
import { SlideView } from "../render/SlideView";
import { useCurrentSlide } from "./hooks";
import type { CanvasInteraction, PointerTarget } from "./interaction";
import { enterEditing } from "./commands";
import { SelectionLayer } from "./SelectionLayer";
import { TextEditor } from "./TextEditor";
import type { Block } from "../model/types";
import type { Handle } from "./transform";

function classify(element: Element | null): PointerTarget | null {
  if (!element) return null;
  const vertex = element.closest<HTMLElement>("[data-vertex]");
  if (vertex) return { kind: "vertex", index: Number(vertex.dataset.vertex) };
  const insert = element.closest<HTMLElement>("[data-insert]");
  if (insert) return { kind: "insert", index: Number(insert.dataset.insert) };
  const handle = element.closest<HTMLElement>("[data-handle]");
  if (handle) return { kind: "handle", handle: handle.dataset.handle as Handle };
  if (element.closest("[data-rotate]")) return { kind: "rotate" };
  const hit = element.closest<HTMLElement>("[data-hit]");
  if (hit) return { kind: "block", id: hit.dataset.hit! };
  // Anything else inside the stage (slide background, grey area) is empty canvas.
  return { kind: "background" };
}

export function Stage({ interaction, viewportRef }: {
  interaction: CanvasInteraction;
  viewportRef: React.RefObject<HTMLDivElement | null>;
}) {
  const session = useSession();
  const theme = useDoc((state) => state.doc.theme);
  const zoom = useUi((state) => state.zoom);
  const grid = useUi((state) => state.grid);
  const tool = useUi((state) => state.tool.kind);
  const editing = useUi((state) => state.editing);
  const textEditing = editing?.kind === "text" ? editing : null;
  const slideId = useCurrentSlide().slide?.id;
  const override = useCallback(
    (block: Block) =>
      textEditing && block.id === textEditing.id && slideId ? (
        <TextEditor key={`${block.id}`} block={block} slideId={slideId} caret={textEditing.caret} selectAll={textEditing.selectAll} />
      ) : undefined,
    [textEditing, slideId],
  );
  const { slide } = useCurrentSlide();
  const stage = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const observer = new ResizeObserver(() => session.ui.getState().fitTo(node.clientWidth, node.clientHeight));
    observer.observe(node);
    // Re-fit when Fit is switched back on.
    const unsubscribe = session.ui.subscribe((state, previous) => {
      if (state.fit && !previous.fit) state.fitTo(node.clientWidth, node.clientHeight);
    });
    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, [session]);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    // Let native scrollbars and future in-place editors keep their pointer.
    if ((event.target as Element).closest("[data-native-pointer]")) return;
    const target = classify(event.target as Element);
    if (!target) return;
    event.preventDefault(); // no text selection or native image drag
    (document.activeElement as HTMLElement | null)?.blur?.();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic or already-released pointers cannot be captured; moves still bubble here.
    }
    interaction.pointerDown(event.nativeEvent, target);
  };

  return (
    <main
      ref={stage}
      className={`stage tool-${tool}`}
      onPointerDown={onPointerDown}
      onDoubleClick={(event) => {
        // Pointer capture retargets the event to the stage; look at what is under the pointer.
        const target = classify(document.elementFromPoint(event.clientX, event.clientY));
        if (target?.kind !== "block") return;
        const block = slide?.blocks.find((candidate) => candidate.id === target.id);
        if (block) enterEditing(session, block, { x: event.clientX, y: event.clientY });
      }}
      onPointerMove={(event) => interaction.pointerMove(event.nativeEvent)}
      onPointerUp={(event) => interaction.pointerUp(event.nativeEvent)}
      onPointerCancel={() => interaction.cancel()}
      onLostPointerCapture={(event) => interaction.pointerUp(event.nativeEvent)}
    >
      {slide ? (
        <div ref={viewportRef} className="canvas-viewport" style={{ width: SLIDE_WIDTH * zoom, height: SLIDE_HEIGHT * zoom }}>
          {/* CSS zoom (not transform) so text is rasterised at its displayed size. */}
          <div className="canvas" style={{ zoom }}>
            <SlideView slide={slide} theme={theme} mode="edit" className={grid ? "show-grid" : undefined} override={override} />
          </div>
          <SelectionLayer slide={slide} zoom={zoom} editingId={textEditing?.id ?? null} />
        </div>
      ) : (
        <p className="stage-empty">No slides yet.</p>
      )}
    </main>
  );
}
