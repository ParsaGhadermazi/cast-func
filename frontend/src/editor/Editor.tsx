import { useEffect } from "react";

import { useSession, useStatus, useUi } from "../app/SessionContext";
import { saveWorkspace } from "./commands";
import { isTypingTarget, useSlideNavigation } from "./hooks";
import { PresentOverlay } from "./PresentOverlay";
import { SlideRail } from "./SlideRail";
import { Stage } from "./Stage";
import { Topbar } from "./Topbar";
import { Viewbar } from "./Viewbar";

function useEditorShortcuts() {
  const session = useSession();
  const nav = useSlideNavigation();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (session.ui.getState().present) return; // present mode owns the keyboard
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === "s") {
        event.preventDefault();
        if (session.assets.getState().workspace.configured) void saveWorkspace(session);
        return;
      }
      if (isTypingTarget(event.target)) return; // fields keep their own undo and keys
      if (mod && !event.altKey && key === "z") {
        event.preventDefault();
        if (event.shiftKey) session.doc.getState().redo();
        else session.doc.getState().undo();
      } else if (mod && !event.altKey && key === "y") {
        event.preventDefault();
        session.doc.getState().redo();
      } else if (event.key === "PageDown") {
        event.preventDefault();
        nav.step(1);
      } else if (event.key === "PageUp") {
        event.preventDefault();
        nav.step(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
}

function Notices() {
  const notices = useStatus((state) => state.notices);
  const dismiss = useStatus((state) => state.dismiss);
  return (
    <div className="notices" aria-live="polite">
      {notices.map((notice) => (
        <div key={notice.id} className={`notice ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
          <span>{notice.message}</span>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(notice.id)}>×</button>
        </div>
      ))}
    </div>
  );
}

export function Editor() {
  const railOpen = useUi((state) => state.railOpen);
  const sidebarOpen = useUi((state) => state.sidebarOpen);
  const presenting = useUi((state) => state.present !== null);
  useEditorShortcuts();

  return (
    <div className="editor">
      <Topbar />
      <div className="workspace">
        {railOpen && <SlideRail />}
        <Stage />
        {sidebarOpen && (
          <aside className="sidebar" aria-label="Properties">
            <p className="muted">Selection, properties and layers arrive in M3.</p>
          </aside>
        )}
      </div>
      <Viewbar />
      {presenting && <PresentOverlay />}
      <Notices />
    </div>
  );
}
