import { ChevronLeft, ChevronRight, Grid3x3, Magnet, Minus, PanelLeft, PanelRight, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { useSession, useUi } from "../app/SessionContext";
import { useCurrentSlide, useSlideNavigation } from "./hooks";

export function Viewbar() {
  const session = useSession();
  const zoom = useUi((state) => state.zoom);
  const fit = useUi((state) => state.fit);
  const grid = useUi((state) => state.grid);
  const snap = useUi((state) => state.snap);
  const railOpen = useUi((state) => state.railOpen);
  const sidebarOpen = useUi((state) => state.sidebarOpen);
  const { index, count } = useCurrentSlide();
  const nav = useSlideNavigation();
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [index]);
  const ui = session.ui.getState();

  return (
    <footer className="viewbar">
      <div className="group">
        <button type="button" className={`icon toggle${railOpen ? " on" : ""}`} aria-label="Slides panel" aria-pressed={railOpen}
          title="Show or hide the slides" onClick={() => ui.togglePanel("rail")}>
          <PanelLeft size={16} />
        </button>
        <button type="button" className="icon" aria-label="Previous slide" disabled={index <= 0} onClick={() => nav.step(-1)}>
          <ChevronLeft size={16} />
        </button>
        <input
          className="slide-number"
          aria-label="Slide number"
          inputMode="numeric"
          disabled={!count}
          value={draft ?? (count ? String(index + 1) : "0")}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => setDraft(null)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              const value = Number(draft);
              if (Number.isFinite(value)) nav.goTo(value - 1);
              setDraft(null);
            } else if (event.key === "Escape") setDraft(null);
          }}
        />
        <span className="slide-total">/ {count}</span>
        <button type="button" className="icon" aria-label="Next slide" disabled={index >= count - 1} onClick={() => nav.step(1)}>
          <ChevronRight size={16} />
        </button>
      </div>
      <span className="spacer" />
      <div className="group">
        <button type="button" className={`icon toggle${snap ? " on" : ""}`} aria-label="Snap to objects"
          title="Snap to the slide and other objects (hold Cmd/Ctrl while dragging to place freely)" aria-pressed={snap} onClick={ui.toggleSnap}>
          <Magnet size={16} />
        </button>
        <button type="button" className={`icon toggle${grid ? " on" : ""}`} aria-label="Grid" aria-pressed={grid} onClick={ui.toggleGrid}>
          <Grid3x3 size={16} />
        </button>
        <button type="button" className="icon" aria-label="Zoom out" onClick={() => ui.setZoom(zoom - 0.1)}>
          <Minus size={16} />
        </button>
        <span className="zoom-label">{Math.round(zoom * 100)}%</span>
        <button type="button" className="icon" aria-label="Zoom in" onClick={() => ui.setZoom(zoom + 0.1)}>
          <Plus size={16} />
        </button>
        <button type="button" className={`toggle${fit ? " on" : ""}`} aria-pressed={fit} onClick={ui.enableFit}>
          Fit
        </button>
        <button type="button" className={`icon toggle${sidebarOpen ? " on" : ""}`} aria-label="Inspector panel" aria-pressed={sidebarOpen}
          title="Show or hide properties and layers" onClick={() => ui.togglePanel("sidebar")}>
          <PanelRight size={16} />
        </button>
      </div>
    </footer>
  );
}
