/**
 * Keeps the server's copy of the deck in step with the browser's.
 *
 * - Local changes (`changeSeq`) are sent as whole documents after a short
 *   debounce, one request at a time, never mid-gesture.
 * - Change markers from the server's event stream trigger a reload only when
 *   the deck changed somewhere else (another tab, or Python). The tab that made
 *   a change recognises its own `deck_origin` and ignores the echo.
 * - Conflicts resolve as "server wins": the newer server copy replaces the
 *   local one and the caller is told, so nothing changes silently.
 */

import type { ChangeMarker, SyncResult } from "../api/client";
import type { Deck } from "../model/types";
import type { DocStore } from "./docStore";

export type SyncStatus = "saved" | "pending" | "saving" | "offline" | "error";

export interface SyncDeps {
  syncDeck(baseRev: number, clientId: string, doc: Deck): Promise<SyncResult>;
  /** Fetch the current server deck, already decoded and migrated. */
  fetchDeck(): Promise<{ deck: Deck; rev: number; changed: boolean }>;
  onStatus?(status: SyncStatus): void;
  onNotice?(message: string, kind: "info" | "error"): void;
  debounceMs?: number;
  retryMs?: number;
}

export function newClientId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class SyncClient {
  readonly clientId: string;
  private syncedSeq: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private unsubscribe: (() => void) | null = null;
  private status: SyncStatus = "saved";

  constructor(
    private readonly store: DocStore,
    private readonly deps: SyncDeps,
    clientId: string = newClientId(),
  ) {
    this.clientId = clientId;
    this.syncedSeq = store.getState().changeSeq;
  }

  /** True while local changes have not reached the server. */
  get dirty(): boolean {
    return this.store.getState().changeSeq !== this.syncedSeq || this.inFlight !== null;
  }

  start(): void {
    this.unsubscribe = this.store.subscribe((state, previous) => {
      if (state.changeSeq !== previous.changeSeq) this.schedule();
      // A gesture that ends with nothing pending needs no request, but one
      // that committed while a flush was skipped must be picked up.
      if (previous.gestureActive && !state.gestureActive && state.changeSeq !== this.syncedSeq) this.schedule();
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  schedule(delay = this.deps.debounceMs ?? 150): void {
    if (this.timer) clearTimeout(this.timer);
    this.setStatus("pending");
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, delay);
  }

  /** Send any pending changes now; resolves once the server has them. */
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.run().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async run(): Promise<void> {
    while (this.store.getState().changeSeq !== this.syncedSeq) {
      const { doc, rev, changeSeq, gestureActive } = this.store.getState();
      if (gestureActive) {
        this.setStatus("pending"); // the commit schedules another flush
        return;
      }
      this.setStatus("saving");
      let result: SyncResult;
      try {
        result = await this.deps.syncDeck(rev, this.clientId, doc);
      } catch {
        this.setStatus("offline");
        this.schedule(this.deps.retryMs ?? 2000);
        return;
      }
      if (result.status === "ok") {
        this.syncedSeq = changeSeq;
        this.store.getState().setRev(result.rev);
      } else if (result.status === "conflict") {
        await this.reload();
        this.deps.onNotice?.("The deck changed in another window; showing the latest version.", "info");
        return;
      } else {
        // The server rejected the document. Stop retrying the same content;
        // the next edit will try again.
        this.syncedSeq = changeSeq;
        this.setStatus("error");
        this.deps.onNotice?.(`Could not save the deck: ${result.error}`, "error");
        return;
      }
    }
    this.setStatus("saved");
  }

  /** React to a server change marker from the event stream. */
  async handleMarker(marker: ChangeMarker): Promise<void> {
    if (marker.deck_origin === this.clientId) return;
    if (marker.deck_rev === this.store.getState().rev) return;
    // Let an in-flight save land first; its response may already cover this rev.
    if (this.inFlight) await this.inFlight;
    if (marker.deck_rev <= this.store.getState().rev) return;
    const hadLocalChanges = this.dirty;
    await this.reload();
    if (hadLocalChanges) {
      this.deps.onNotice?.("The deck changed in another window; showing the latest version.", "info");
    }
  }

  /** Replace the local document with the server's copy (server wins). */
  async reload(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const { deck, rev, changed } = await this.deps.fetchDeck();
    const before = this.store.getState().changeSeq;
    this.store.getState().replaceFromServer(deck, rev, changed);
    this.syncedSeq = before;
    if (changed) this.schedule();
    else this.setStatus("saved");
  }

  private setStatus(status: SyncStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.deps.onStatus?.(status);
  }
}
