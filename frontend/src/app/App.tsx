import { useState } from "react";

import { SLIDE_HEIGHT, SLIDE_WIDTH } from "../model/types";
import { useAssets, useDoc, useStatus } from "./SessionContext";

const SYNC_LABEL = {
  saved: "All changes synced",
  pending: "Unsynced changes",
  saving: "Syncing…",
  offline: "Offline — retrying",
  error: "Sync failed",
} as const;

/** M0 shell: proves load, render and sync. Replaced by the real editor in M2. */
export function App() {
  const slides = useDoc((state) => state.doc.slides);
  const theme = useDoc((state) => state.doc.theme);
  const filename = useAssets((state) => state.workspace.filename);
  const sync = useStatus((state) => state.sync);
  const connection = useStatus((state) => state.connection);
  const notices = useStatus((state) => state.notices);
  const [current, setCurrent] = useState(0);
  const slide = slides[Math.min(current, slides.length - 1)];

  return (
    <div className="shell">
      <header className="topbar">
        <strong>cast</strong>
        <span className="filename">{filename ?? "presentation.cast.json"}</span>
        <span className="status" role="status" data-sync={sync}>
          {connection === "live" ? SYNC_LABEL[sync] : connection === "connecting" ? "Connecting…" : "Reconnecting…"}
        </span>
      </header>
      <nav className="rail">
        {slides.map((s, index) => (
          <button key={s.id} className={index === current ? "active" : ""} onClick={() => setCurrent(index)}>
            {index + 1}
          </button>
        ))}
      </nav>
      <main className="stage">
        {slide ? (
          <div
            className="slide"
            style={{ width: SLIDE_WIDTH, height: SLIDE_HEIGHT, background: slide.background ?? theme.bg, color: theme.fg, fontFamily: theme.font }}
          >
            {slide.blocks.map((block) => (
              <div
                key={block.id}
                className="block-outline"
                data-bid={block.id}
                style={{
                  left: `${block.x * 100}%`,
                  top: `${block.y * 100}%`,
                  width: `${block.w * 100}%`,
                  height: `${block.h * 100}%`,
                  zIndex: block.z,
                  transform: `rotate(${block.style.rotate ?? 0}deg)`,
                }}
              >
                {block.type} · {block.id}
              </div>
            ))}
          </div>
        ) : (
          <p className="empty">No slides yet.</p>
        )}
      </main>
      <div className="notices">
        {notices.map((notice) => (
          <div key={notice.id} className={`notice ${notice.kind}`}>{notice.message}</div>
        ))}
      </div>
    </div>
  );
}
