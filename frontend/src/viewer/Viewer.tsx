/**
 * Stand-alone presentation viewer for `cast.freeze()` exports. It renders
 * slides with the same `SlideView` as the editor, so a frozen file looks
 * exactly like present mode.
 */

import { ChevronLeft, ChevronRight, Maximize } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { SLIDE_HEIGHT, SLIDE_WIDTH, type Deck } from "../model/types";
import { SlideView } from "../render/SlideView";

const indexFromHash = (count: number) => {
  const value = Number(window.location.hash.replace("#", ""));
  return Number.isInteger(value) && value >= 1 && value <= count ? value - 1 : 0;
};

export function Viewer({ deck }: { deck: Deck }) {
  const count = deck.slides.length;
  const [index, setIndex] = useState(() => indexFromHash(count));
  const [scale, setScale] = useState(1);
  const stage = useRef<HTMLDivElement>(null);
  const touchStart = useRef<number | null>(null);

  const go = (target: number) => setIndex(Math.max(0, Math.min(count - 1, target)));

  useEffect(() => {
    const url = `${window.location.pathname}${window.location.search}#${index + 1}`;
    window.history.replaceState(null, "", url);
  }, [index]);

  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setScale(Math.min(node.clientWidth / SLIDE_WIDTH, node.clientHeight / SLIDE_HEIGHT)));
    observer.observe(node);
    const onHash = () => setIndex(indexFromHash(count));
    window.addEventListener("hashchange", onHash);
    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", onHash);
    };
  }, [count]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowRight", "PageDown", " ", "Enter"].includes(event.key)) {
        event.preventDefault();
        go(index + 1);
      } else if (["ArrowLeft", "PageUp", "Backspace"].includes(event.key)) {
        event.preventDefault();
        go(index - 1);
      } else if (event.key === "Home") go(0);
      else if (event.key === "End") go(count - 1);
      else if (event.key.toLowerCase() === "f") void document.documentElement.requestFullscreen?.().catch(() => undefined);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const slide = deck.slides[index];
  return (
    <div className="viewer"
      onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null; }}
      onTouchEnd={(event) => {
        const start = touchStart.current;
        const end = event.changedTouches[0]?.clientX;
        touchStart.current = null;
        if (start === null || end === undefined || Math.abs(end - start) < 50) return;
        go(index + (end < start ? 1 : -1));
      }}>
      <div ref={stage} className="present-stage">
        {slide ? (
          <div className="present-viewport" style={{ width: SLIDE_WIDTH * scale, height: SLIDE_HEIGHT * scale }}>
            <div className="present-canvas" style={{ zoom: scale }}>
              <SlideView slide={slide} theme={deck.theme} mode="present" />
            </div>
          </div>
        ) : (
          <p className="viewer-empty">This presentation has no slides.</p>
        )}
      </div>
      <nav className="present-hud" aria-label="Slide navigation">
        <button type="button" className="icon" aria-label="Previous slide" disabled={index <= 0} onClick={() => go(index - 1)}><ChevronLeft size={18} /></button>
        <span className="present-count">{count ? index + 1 : 0} / {count}</span>
        <button type="button" className="icon" aria-label="Next slide" disabled={index >= count - 1} onClick={() => go(index + 1)}><ChevronRight size={18} /></button>
        <button type="button" className="icon" aria-label="Full screen (F)" title="Full screen (F)"
          onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}><Maximize size={16} /></button>
      </nav>
    </div>
  );
}
