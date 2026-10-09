import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SyncResult } from "../api/client";
import { decodeDeck } from "../model/normalize";
import type { Deck } from "../model/types";
import { createDocStore } from "./docStore";
import { SyncClient, type SyncDeps } from "./sync";

const makeDeck = (x = 0.1) =>
  decodeDeck({
    format: "cast.presentation",
    schema_version: 1,
    theme: {},
    slides: [{ id: "s1", blocks: [{ id: "b1", type: "shape", x, w: 0.2, h: 0.2 }] }],
  }).deck;

function setup(overrides: Partial<SyncDeps> = {}) {
  const store = createDocStore(makeDeck());
  store.getState().setRev(1);
  let serverRev = 1;
  let serverDoc: Deck = makeDeck();
  const sent: Deck[] = [];
  const deps: SyncDeps = {
    debounceMs: 100,
    syncDeck: vi.fn(async (baseRev: number, _id: string, doc: Deck): Promise<SyncResult> => {
      if (baseRev !== serverRev) return { status: "conflict", rev: serverRev };
      sent.push(doc);
      serverDoc = doc;
      serverRev += 1;
      return { status: "ok", rev: serverRev };
    }),
    fetchDeck: vi.fn(async () => ({ deck: serverDoc, rev: serverRev, changed: false })),
    onNotice: vi.fn(),
    ...overrides,
  };
  const sync = new SyncClient(store, deps, "me");
  sync.start();
  const server = {
    get rev() { return serverRev; },
    externalEdit(x: number) { serverDoc = makeDeck(x); serverRev += 1; },
  };
  return { store, sync, deps, sent, server };
}

const move = (store: ReturnType<typeof createDocStore>, x: number) =>
  store.getState().transact("move", (d) => { d.slides[0]!.blocks[0]!.x = x; });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("SyncClient", () => {
  it("debounces bursts of edits into one request", async () => {
    const { store, sent, sync } = setup();
    move(store, 0.2); move(store, 0.3); move(store, 0.4);
    expect(sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(150);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.slides[0]!.blocks[0]!.x).toBe(0.4);
    expect(store.getState().rev).toBe(2);
    expect(sync.dirty).toBe(false);
  });

  it("flush sends immediately and resolves when saved", async () => {
    const { store, sent, sync } = setup();
    move(store, 0.2);
    await sync.flush();
    expect(sent).toHaveLength(1);
    expect(sync.dirty).toBe(false);
  });

  it("does not sync during a gesture, then syncs the commit", async () => {
    const { store, sent } = setup();
    store.getState().beginGesture();
    store.getState().updateGesture((d) => { d.slides[0]!.blocks[0]!.x = 0.6; });
    await vi.advanceTimersByTimeAsync(500);
    expect(sent).toHaveLength(0);
    store.getState().commitGesture("move");
    await vi.advanceTimersByTimeAsync(150);
    expect(sent).toHaveLength(1);
  });

  it("ignores its own change markers", async () => {
    const { store, sync, deps } = setup();
    move(store, 0.2);
    await sync.flush();
    await sync.handleMarker({ version: 9, assets_version: 1, deck_rev: 2, deck_origin: "me" });
    expect(deps.fetchDeck).not.toHaveBeenCalled();
  });

  it("reloads when another window changed the deck", async () => {
    const { store, sync, server } = setup();
    server.externalEdit(0.8);
    await sync.handleMarker({ version: 9, assets_version: 1, deck_rev: server.rev, deck_origin: "other" });
    expect(store.getState().doc.slides[0]!.blocks[0]!.x).toBe(0.8);
    expect(store.getState().rev).toBe(server.rev);
    expect(store.getState().canUndo).toBe(false);
  });

  it("resolves a conflict as server-wins and tells the user", async () => {
    const { store, sync, server, deps } = setup();
    server.externalEdit(0.8);
    move(store, 0.2);
    await sync.flush();
    expect(store.getState().doc.slides[0]!.blocks[0]!.x).toBe(0.8);
    expect(deps.onNotice).toHaveBeenCalledWith(expect.stringContaining("another window"), "info");
    expect(sync.dirty).toBe(false);
  });

  it("retries after a network failure", async () => {
    const { store, sent, deps } = setup();
    const real = deps.syncDeck;
    deps.retryMs = 1000;
    (deps as any).syncDeck = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockImplementation(real);
    move(store, 0.2);
    await vi.advanceTimersByTimeAsync(150);
    expect(sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent).toHaveLength(1);
  });

  it("saves a migrated document back without an undo step", async () => {
    const { store, sync, sent, deps } = setup();
    (deps.fetchDeck as any).mockResolvedValueOnce({ deck: makeDeck(0.4), rev: 1, changed: true });
    await sync.reload();
    expect(store.getState().canUndo).toBe(false);
    await vi.advanceTimersByTimeAsync(150);
    expect(sent).toHaveLength(1);
  });
});
