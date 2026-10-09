import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useDoc, useSession, useUi } from "../app/SessionContext";
import { SLIDE_HEIGHT, SLIDE_WIDTH } from "../model/types";
import { SlideView } from "../render/SlideView";
import { resolveSlideIndex } from "./uiStore";

export function PresentOverlay() {
  const session = useSession();
  const slides = useDoc((state) => state.doc.slides);
  const theme = useDoc((state) => state.doc.theme);
  const present = useUi((state) => state.present);
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const index = present ? resolveSlideIndex(slides, present.slideId, present.indexHint) : -1;
  const slide = slides[index];

  const go = (target: number) => session.ui.getState().presentGo(session.doc.getState().doc.slides, target);
  const exit = () => {
    session.ui.getState().stopPresent();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  };

  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setScale(Math.min(node.clientWidth / SLIDE_WIDTH, node.clientHeight / SLIDE_HEIGHT)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", " ", "Enter"].includes(event.key)) {
        event.preventDefault();
        go(index + 1);
      } else if (["ArrowLeft", "PageUp", "Backspace"].includes(event.key)) {
        event.preventDefault();
        go(index - 1);
      } else if (event.key === "Home") go(0);
      else if (event.key === "End") go(slides.length - 1);
      else if (event.key === "Escape") exit();
    };
    // Leaving browser fullscreen (Esc in most browsers) also leaves present mode.
    const onFullscreen = () => {
      if (!document.fullscreenElement) session.ui.getState().stopPresent();
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  });

  return (
    <div className="present-overlay" role="dialog" aria-label="Presentation">
      <div ref={stage} className="present-stage">
        {slide && (
          <div className="present-viewport" style={{ width: SLIDE_WIDTH * scale, height: SLIDE_HEIGHT * scale }}>
            <div className="present-canvas" style={{ zoom: scale }}>
              <SlideView slide={slide} theme={theme} mode="present" />
            </div>
          </div>
        )}
      </div>
      <div className="present-hud">
        <button type="button" className="icon" aria-label="Previous slide" disabled={index <= 0} onClick={() => go(index - 1)}>
          <ChevronLeft size={18} />
        </button>
        <span className="present-count">{index + 1} / {slides.length}</span>
        <button type="button" className="icon" aria-label="Next slide" disabled={index >= slides.length - 1} onClick={() => go(index + 1)}>
          <ChevronRight size={18} />
        </button>
        <button type="button" className="icon" aria-label="Exit presentation" onClick={exit}>
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
