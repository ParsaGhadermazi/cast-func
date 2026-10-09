import { memo, useEffect, useRef, type KeyboardEvent } from "react";

import { useDoc } from "../app/SessionContext";
import { SLIDE_WIDTH, type Slide, type Theme } from "../model/types";
import { SlideView } from "../render/SlideView";
import { useCurrentSlide, useSlideNavigation } from "./hooks";

const Thumb = memo(function Thumb({ slide, theme, index, active, onSelect }: {
  slide: Slide; theme: Theme; index: number; active: boolean; onSelect(index: number): void;
}) {
  return (
    <button
      type="button"
      className={`thumb${active ? " active" : ""}`}
      data-slide-id={slide.id}
      aria-current={active ? "true" : undefined}
      aria-label={`Slide ${index + 1}`}
      tabIndex={active ? 0 : -1}
      onClick={() => onSelect(index)}
    >
      <span className="thumb-frame">
        <span className="thumb-zoom">
          <SlideView slide={slide} theme={theme} mode="thumb" />
        </span>
      </span>
      <span className="thumb-number">{index + 1}</span>
    </button>
  );
});

export function SlideRail() {
  const slides = useDoc((state) => state.doc.slides);
  const theme = useDoc((state) => state.doc.theme);
  const { index: current } = useCurrentSlide();
  const nav = useSlideNavigation();
  const rail = useRef<HTMLElement>(null);

  // Thumbnails draw the real slide at 1040 px and zoom it to the rail width.
  useEffect(() => {
    const node = rail.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const frame = node.querySelector<HTMLElement>(".thumb-frame");
      if (frame) node.style.setProperty("--preview-scale", String(frame.clientWidth / SLIDE_WIDTH));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [slides.length > 0]);

  useEffect(() => {
    rail.current?.querySelector(".thumb.active")?.scrollIntoView({ block: "nearest" });
  }, [current]);

  const onKeyDown = (event: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowUp: current - 1, ArrowDown: current + 1, Home: 0, End: slides.length - 1 };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    nav.goTo(target);
    requestAnimationFrame(() => rail.current?.querySelector<HTMLElement>(".thumb.active")?.focus());
  };

  return (
    <nav ref={rail} className="rail" aria-label="Slides" onKeyDown={onKeyDown}>
      {slides.map((slide, index) => (
        <Thumb key={slide.id} slide={slide} theme={theme} index={index} active={index === current} onSelect={nav.goTo} />
      ))}
      {!slides.length && <p className="rail-empty">No slides yet.</p>}
    </nav>
  );
}
