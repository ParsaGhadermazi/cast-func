import { useMemo, useRef } from "react";

import { useSession, useStatus, useUi } from "../app/SessionContext";
import { CanvasInteraction } from "./interaction";
import { PresentOverlay } from "./PresentOverlay";
import { useEditorShortcuts } from "./shortcuts";
import { Sidebar } from "./Sidebar";
import { SlideRail } from "./SlideRail";
import { Stage } from "./Stage";
import { Topbar } from "./Topbar";
import { Viewbar } from "./Viewbar";

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
  const session = useSession();
  const railOpen = useUi((state) => state.railOpen);
  const sidebarOpen = useUi((state) => state.sidebarOpen);
  const presenting = useUi((state) => state.present !== null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const interaction = useMemo(() => new CanvasInteraction(session, () => viewportRef.current), [session]);
  // Debugging and test handle, like window.__castSession.
  (window as unknown as { __castInteraction: CanvasInteraction }).__castInteraction = interaction;
  useEditorShortcuts(session, interaction);

  return (
    <div className="editor">
      <Topbar />
      <div className="workspace">
        {railOpen && <SlideRail />}
        <Stage interaction={interaction} viewportRef={viewportRef} />
        {sidebarOpen && <Sidebar />}
      </div>
      <Viewbar />
      {presenting && <PresentOverlay />}
      <Notices />
    </div>
  );
}
