import { Download, FolderOpen, Keyboard, Play, Redo2, Save, Undo2 } from "lucide-react";
import { useRef, useState } from "react";

import { useAssets, useDoc, useSession, useStatus } from "../app/SessionContext";
import { useCurrentSlide } from "./hooks";
import { saveWorkspace } from "./commands";
import { downloadDeck, openDeckFile } from "./deckFile";
import { ShortcutsDialog } from "./ShortcutsDialog";

const SYNC_LABEL = {
  saved: "Synced",
  pending: "Unsynced changes",
  saving: "Syncing…",
  offline: "Offline — retrying",
  error: "Sync failed",
} as const;

export function Topbar() {
  const session = useSession();
  const workspace = useAssets((state) => state.workspace);
  const canUndo = useDoc((state) => state.canUndo);
  const canRedo = useDoc((state) => state.canRedo);
  const sync = useStatus((state) => state.sync);
  const connection = useStatus((state) => state.connection);
  const { index, count } = useCurrentSlide();
  const filename = workspace.filename ?? "presentation.cast.json";
  const fileInput = useRef<HTMLInputElement>(null);
  const [help, setHelp] = useState(false);

  return (
    <header className="topbar">
      <span className="brand">cast</span>
      <span className="filename" title={filename}>{filename}</span>
      <span className="status" role="status" aria-live="polite" data-sync={sync} data-connection={connection}>
        {connection === "live" ? SYNC_LABEL[sync] : connection === "connecting" ? "Connecting…" : "Reconnecting…"}
      </span>
      <span className="spacer" />
      <button type="button" className="icon" aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)" onClick={() => setHelp(true)}>
        <Keyboard size={17} />
      </button>
      <button type="button" className="icon" aria-label="Open presentation file" title="Open a .cast.json file (undoable)" onClick={() => fileInput.current?.click()}>
        <FolderOpen size={17} />
      </button>
      <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void openDeckFile(session, file);
      }} />
      <button type="button" className="icon" aria-label="Download editable copy" title="Download an editable copy (.cast.json)" onClick={() => downloadDeck(session)}>
        <Download size={17} />
      </button>
      <span className="divider" />
      <button type="button" className="icon" aria-label="Undo" title="Undo (Cmd/Ctrl+Z)" disabled={!canUndo}
        onClick={() => session.doc.getState().undo()}>
        <Undo2 size={17} />
      </button>
      <button type="button" className="icon" aria-label="Redo" title="Redo (Cmd/Ctrl+Shift+Z)" disabled={!canRedo}
        onClick={() => session.doc.getState().redo()}>
        <Redo2 size={17} />
      </button>
      <button type="button" disabled={!workspace.configured}
        title={workspace.configured ? `Save to ${workspace.filename} (Cmd/Ctrl+S)` : "Create Cast('presentation.cast.json') to enable saving"}
        onClick={() => void saveWorkspace(session)}>
        <Save size={16} /> <span>Save</span>
      </button>
      <button type="button" className="primary" disabled={!count}
        onClick={() => {
          session.ui.getState().stopEditing();
          session.ui.getState().startPresent(session.ui.getState().currentSlideId, index);
          // Fullscreen needs this click's user gesture; it may be refused inside a notebook iframe.
          void document.documentElement.requestFullscreen?.().catch(() => undefined);
        }}>
        <Play size={16} /> <span>Present</span>
      </button>
      {help && <ShortcutsDialog onClose={() => setHelp(false)} />}
    </header>
  );
}
