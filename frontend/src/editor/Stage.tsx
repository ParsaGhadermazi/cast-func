import { useEffect, useRef } from "react";

import { useDoc, useSession, useUi } from "../app/SessionContext";
import { SLIDE_HEIGHT, SLIDE_WIDTH } from "../model/types";
import { SlideView } from "../render/SlideView";
import { useCurrentSlide } from "./hooks";

export function Stage() {
  const session = useSession();
  const theme = useDoc((state) => state.doc.theme);
  const zoom = useUi((state) => state.zoom);
  const grid = useUi((state) => state.grid);
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

  return (
    <main ref={stage} className="stage">
      {slide ? (
        <div className="canvas-viewport" style={{ width: SLIDE_WIDTH * zoom, height: SLIDE_HEIGHT * zoom }}>
          {/* CSS zoom (not transform) so text is rasterised at its displayed size. */}
          <div className="canvas" style={{ zoom }}>
            <SlideView slide={slide} theme={theme} mode="edit" className={grid ? "show-grid" : undefined} />
          </div>
        </div>
      ) : (
        <p className="stage-empty">No slides yet.</p>
      )}
    </main>
  );
}
