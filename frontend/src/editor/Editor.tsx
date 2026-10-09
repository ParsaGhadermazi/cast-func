import { useEffect, useMemo, useRef } from "react";

import { useSession, useStatus, useUi } from "../app/SessionContext";
import { ContextMenu } from "./ContextMenu";
import { CanvasInteraction } from "./interaction";
import { PresentOverlay } from "./PresentOverlay";
import { useEditorShortcuts } from "./shortcuts";
import { Sidebar } from "./Sidebar";
import { SlideRail } from "./SlideRail";
import { Stage } from "./Stage";
import { Toolbar } from "./Toolbar";
import { Topbar } from "./Topbar";
import { trackTextSelection } from "./textSession";
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
  useEffect(trackTextSelection, []);
  // Narrow screens start with the side panels closed; they open as overlays.
  useEffect(() => {
    if (window.matchMedia("(max-width: 760px)").matches) session.ui.setState({ railOpen: false, sidebarOpen: false });
  }, [session]);

  return (
    <div className={`editor${railOpen ? " rail-open" : ""}${sidebarOpen ? " sidebar-open" : ""}`}>
      <Topbar />
      <Toolbar />
      <div className="workspace">
        {railOpen && <SlideRail />}
        <Stage interaction={interaction} viewportRef={viewportRef} />
        {sidebarOpen && <Sidebar />}
      </div>
      <Viewbar />
      {presenting && <PresentOverlay />}
      <ContextMenu />
      <Notices />
    </div>
  );
}
