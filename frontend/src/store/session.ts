/**
 * One editor session: the document store, its sync client, the asset list
 * from Python, and the server event stream that keeps them current.
 */

import { createStore, type StoreApi } from "zustand/vanilla";

import { api, stateToRawDeck, type Assets, type ChangeMarker } from "../api/client";
import { createUiStore, type UiStore } from "../editor/uiStore";
import { decodeDeck } from "../model/normalize";
import { createDocStore, type DocStore } from "./docStore";
import { SyncClient, type SyncStatus } from "./sync";

export interface Notice {
  id: number;
  message: string;
  kind: "info" | "error";
}

export interface StatusState {
  sync: SyncStatus;
  connection: "connecting" | "live" | "reconnecting";
  notices: Notice[];
  notify(message: string, kind?: Notice["kind"]): void;
  dismiss(id: number): void;
}

export interface Session {
  doc: DocStore;
  assets: StoreApi<Assets>;
  status: StoreApi<StatusState>;
  ui: UiStore;
  sync: SyncClient;
  close(): void;
}

let noticeSeq = 0;

function createStatusStore(): StoreApi<StatusState> {
  return createStore<StatusState>()((set, get) => ({
    sync: "saved",
    connection: "connecting",
    notices: [],
    notify(message, kind = "info") {
      const id = ++noticeSeq;
      set((state) => ({ notices: [...state.notices, { id, message, kind }] }));
      if (kind === "info") setTimeout(() => get().dismiss(id), 5000);
    },
    dismiss(id) {
      set((state) => ({ notices: state.notices.filter((notice) => notice.id !== id) }));
    },
  }));
}

async function fetchDeck() {
  const state = await api.state();
  const { deck, changed } = decodeDeck(stateToRawDeck(state));
  return { deck, rev: state.deck_rev, changed, state };
}

export async function startSession(): Promise<Session> {
  const status = createStatusStore();
  const initial = await fetchDeck();
  const doc = createDocStore();
  const { state } = initial;
  const assets = createStore<Assets>()(() => ({
    version: state.version,
    assets_version: state.assets_version,
    figures: state.figures,
    tables: state.tables,
    htmls: state.htmls,
    images: state.images,
    workspace: state.workspace,
  }));

  const sync = new SyncClient(doc, {
    syncDeck: api.syncDeck,
    fetchDeck: async () => {
      const { deck, rev, changed } = await fetchDeck();
      return { deck, rev, changed };
    },
    onStatus: (value) => status.setState({ sync: value }),
    onNotice: (message, kind) => status.getState().notify(message, kind),
  });
  doc.getState().replaceFromServer(initial.deck, initial.rev);
  sync.start();
  if (initial.changed) {
    // Legacy migration or sanitising rewrote the document: save it back,
    // as a sync only (it is not an undoable edit).
    doc.setState((current) => ({ changeSeq: current.changeSeq + 1 }));
  }

  const refreshAssets = async (marker: ChangeMarker) => {
    if (marker.assets_version === assets.getState().assets_version) return;
    const next = await api.assets();
    assets.setState({
      version: next.version,
      assets_version: next.assets_version,
      figures: next.figures,
      tables: next.tables,
      htmls: next.htmls,
      images: next.images,
      workspace: next.workspace,
    });
  };

  const events = new EventSource("./events");
  events.onopen = () => status.setState({ connection: "live" });
  events.onerror = () => status.setState({ connection: "reconnecting" });
  events.onmessage = (event) => {
    let marker: ChangeMarker;
    try {
      marker = JSON.parse(event.data);
    } catch {
      return;
    }
    refreshAssets(marker).catch(() => status.getState().notify("Could not refresh notebook assets.", "error"));
    sync.handleMarker(marker).catch(() => status.getState().notify("Could not load the latest deck.", "error"));
  };

  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!sync.dirty) return;
    void sync.flush();
    event.preventDefault();
  };
  window.addEventListener("beforeunload", beforeUnload);

  const ui = createUiStore();
  ui.getState().goToSlide(initial.deck.slides, 0);
  // Keep the selection valid when blocks disappear (delete, undo, another tab).
  doc.subscribe((state, previous) => {
    if (state.doc === previous.doc) return;
    const { currentSlideId, selection } = ui.getState();
    if (!selection.length) return;
    const slide = state.doc.slides.find((candidate) => candidate.id === currentSlideId);
    ui.getState().pruneSelection(new Set(slide?.blocks.map((block) => block.id) ?? []));
  });

  return {
    doc,
    assets,
    status,
    ui,
    sync,
    close() {
      events.close();
      sync.stop();
      window.removeEventListener("beforeunload", beforeUnload);
    },
  };
}
