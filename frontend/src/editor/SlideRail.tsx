import { Copy, Plus, Trash2 } from "lucide-react";
import { memo, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

import { useDoc, useSession } from "../app/SessionContext";
import { SLIDE_WIDTH, type Slide, type Theme } from "../model/types";
import { SlideView } from "../render/SlideView";
import { Popover } from "../ui/Popover";
import { addSlideCommand, deleteSlideCommand, duplicateSlideCommand, moveSlideCommand } from "./commands";
import { useCurrentSlide, useSlideNavigation } from "./hooks";
import { SLIDE_TEMPLATES } from "./slides";

const Thumb = memo(function Thumb({ slide, theme, index, active, dragging, onPointerDown, onSelect, onDuplicate, onDelete }: {
  slide: Slide; theme: Theme; index: number; active: boolean; dragging: boolean;
  onPointerDown(event: ReactPointerEvent, index: number): void;
  onSelect(index: number): void; onDuplicate(id: string): void; onDelete(id: string): void;
}) {
  return (
    <div className={`thumb${active ? " active" : ""}${dragging ? " dragging" : ""}`} data-slide-id={slide.id}>
      <button
        type="button"
        className="thumb-button"
        aria-current={active ? "true" : undefined}
        aria-label={`Slide ${index + 1}`}
        tabIndex={active ? 0 : -1}
        onPointerDown={(event) => onPointerDown(event, index)}
        onClick={() => onSelect(index)}
      >
        <span className="thumb-frame">
          <span className="thumb-zoom">
            <SlideView slide={slide} theme={theme} mode="thumb" />
          </span>
        </span>
      </button>
      <span className="thumb-number">{index + 1}</span>
      <span className="thumb-actions">
        <button type="button" className="icon" aria-label={`Duplicate slide ${index + 1}`} title="Duplicate slide" onClick={() => onDuplicate(slide.id)}>
          <Copy size={13} />
        </button>
        <button type="button" className="icon" aria-label={`Delete slide ${index + 1}`} title="Delete slide" onClick={() => onDelete(slide.id)}>
          <Trash2 size={13} />
        </button>
      </span>
    </div>
  );
});

interface Drag {
  id: string;
  from: number;
  startY: number;
  active: boolean;
  drop: number;
}

export function SlideRail() {
  const session = useSession();
  const slides = useDoc((state) => state.doc.slides);
  const theme = useDoc((state) => state.doc.theme);
  const { index: current } = useCurrentSlide();
  const nav = useSlideNavigation();
  const rail = useRef<HTMLElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClick = useRef(false);

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

  const update = (next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  /** Where a dragged slide would land: before the thumb under the pointer's midpoint. */
  const dropIndex = (clientY: number) => {
    const thumbs = Array.from(rail.current?.querySelectorAll<HTMLElement>(".thumb") ?? []);
    for (let i = 0; i < thumbs.length; i++) {
      const rect = thumbs[i]!.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return thumbs.length;
  };

  const onThumbPointerDown = (event: ReactPointerEvent, index: number) => {
    if (event.button !== 0) return;
    update({ id: slides[index]!.id, from: index, startY: event.clientY, active: false, drop: index });
    const move = (moveEvent: PointerEvent) => {
      const state = dragRef.current;
      if (!state) return;
      const active = state.active || Math.abs(moveEvent.clientY - state.startY) > 5;
      if (active) {
        // Scroll the rail when dragging near its edges.
        const rect = rail.current!.getBoundingClientRect();
        if (moveEvent.clientY < rect.top + 40) rail.current!.scrollBy(0, -14);
        if (moveEvent.clientY > rect.bottom - 40) rail.current!.scrollBy(0, 14);
      }
      update({ ...state, active, drop: active ? dropIndex(moveEvent.clientY) : state.drop });
    };
    const finish = (commit: boolean) => {
      const state = dragRef.current;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", key, true);
      update(null);
      if (!state?.active) return;
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      if (commit && state.drop !== state.from && state.drop !== state.from + 1) moveSlideCommand(session, state.id, state.drop);
    };
    const up = () => finish(true);
    const key = (keyEvent: globalThis.KeyboardEvent) => {
      if (keyEvent.key === "Escape" && dragRef.current?.active) {
        keyEvent.stopPropagation();
        finish(false);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", key, true);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      // Alt+↑/↓ moves the current slide.
      event.preventDefault();
      const slide = slides[current];
      if (!slide) return;
      const to = event.key === "ArrowUp" ? current - 1 : current + 2;
      if (to < 0 || to > slides.length) return;
      moveSlideCommand(session, slide.id, to);
      requestAnimationFrame(() => rail.current?.querySelector<HTMLElement>(".thumb.active .thumb-button")?.focus());
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && slides[current]) {
      event.preventDefault();
      event.stopPropagation();
      deleteSlideCommand(session);
      return;
    }
    const moves: Record<string, number> = { ArrowUp: current - 1, ArrowDown: current + 1, Home: 0, End: slides.length - 1 };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    nav.goTo(target);
    requestAnimationFrame(() => rail.current?.querySelector<HTMLElement>(".thumb.active .thumb-button")?.focus());
  };

  return (
    <nav ref={rail} className={`rail${drag?.active ? " reordering" : ""}`} aria-label="Slides" onKeyDown={onKeyDown}>
      {slides.map((slide, index) => (
        <div key={slide.id} className="thumb-slot">
          {drag?.active && drag.drop === index && <div className="drop-indicator" />}
          <Thumb
            slide={slide}
            theme={theme}
            index={index}
            active={index === current}
            dragging={!!drag?.active && drag.id === slide.id}
            onPointerDown={onThumbPointerDown}
            onSelect={(i) => {
              if (!suppressClick.current) nav.goTo(i);
            }}
            onDuplicate={(id) => duplicateSlideCommand(session, id)}
            onDelete={(id) => deleteSlideCommand(session, id)}
          />
        </div>
      ))}
      {drag?.active && drag.drop === slides.length && <div className="drop-indicator" />}
      <div className="rail-add split">
        <button type="button" className="add-slide" onClick={() => addSlideCommand(session)} title="New blank slide after the current one">
          <Plus size={15} /> New slide
        </button>
        <Popover label="New slide from a template" buttonClassName="icon split-arrow" button={<span aria-hidden>▾</span>} width={260}>
          {(close) => (
            <div className="template-list">
              {SLIDE_TEMPLATES.map(([template, label, description]) => (
                <button key={template} type="button" onClick={() => { addSlideCommand(session, template); close(); }}>
                  <strong>{label}</strong>
                  <span>{description}</span>
                </button>
              ))}
            </div>
          )}
        </Popover>
      </div>
    </nav>
  );
}
