/**
 * The browser-owned presentation document.
 *
 * Every edit goes through one of two paths:
 *
 * - `transact(label, recipe)` for discrete edits (insert, delete, a style
 *   change). It records one undo step and marks the document for sync.
 * - `beginGesture` / `updateGesture` / `commitGesture` for continuous edits
 *   (drag, resize, rotate, point drag). Each update re-applies the recipe to
 *   the document as it was when the gesture began, so nothing accumulates,
 *   nothing is synced mid-gesture, and the commit is a single undo step.
 *   `cancelGesture` (Escape) restores the starting document.
 *
 * `changeSeq` increases on every change that should reach the server; the
 * sync client watches it.
 */

import { enablePatches, produce, produceWithPatches, type Draft } from "immer";
import { createStore, type StoreApi } from "zustand/vanilla";

import { emptyDeck, type Deck } from "../model/types";
import { History, type RecordOptions } from "./history";

enablePatches();

export type Recipe = (draft: Draft<Deck>) => void;

export interface DocState {
  doc: Deck;
  /** Server `deck_rev` that `doc` was last synced to (or loaded from). */
  rev: number;
  /** Increments on every local change that must be synced. */
  changeSeq: number;
  canUndo: boolean;
  canRedo: boolean;
  gestureActive: boolean;

  transact(label: string, recipe: Recipe, options?: RecordOptions): void;
  undo(): boolean;
  redo(): boolean;
  /** Prevent the latest undo step from merging with later ones. */
  sealHistory(): void;

  beginGesture(): void;
  updateGesture(recipe: Recipe): void;
  commitGesture(label: string, options?: RecordOptions): void;
  cancelGesture(): void;

  /**
   * Replace the document with one from the server (initial load, another tab,
   * or Python). Clears undo history. `needsSync` is set when the document was
   * rewritten on load (legacy migration) and the result should be saved back.
   */
  replaceFromServer(doc: Deck, rev: number, needsSync?: boolean): void;
  setRev(rev: number): void;
}

export type DocStore = StoreApi<DocState>;

export function createDocStore(initial: Deck = emptyDeck(), now?: () => number): DocStore {
  const history = new History(now);
  let gestureBase: Deck | null = null;
  let gestureRecipe: Recipe | null = null;
  let pendingRemote: { doc: Deck; rev: number; needsSync: boolean } | null = null;

  return createStore<DocState>()((set, get) => {
    const historyFlags = () => ({ canUndo: history.canUndo, canRedo: history.canRedo });

    const applyRemote = (doc: Deck, rev: number, needsSync: boolean) => {
      history.clear();
      set((state) => ({
        doc,
        rev,
        changeSeq: needsSync ? state.changeSeq + 1 : state.changeSeq,
        ...historyFlags(),
      }));
    };

    const endGesture = () => {
      gestureBase = null;
      gestureRecipe = null;
      set({ gestureActive: false });
      if (pendingRemote) {
        const { doc, rev, needsSync } = pendingRemote;
        pendingRemote = null;
        applyRemote(doc, rev, needsSync);
      }
    };

    return {
      doc: initial,
      rev: 0,
      changeSeq: 0,
      canUndo: false,
      canRedo: false,
      gestureActive: false,

      transact(label, recipe, options) {
        if (gestureBase) throw new Error(`transact("${label}") during a gesture`);
        const [next, patches, inverse] = produceWithPatches(get().doc, recipe);
        if (!patches.length) return;
        history.record(label, patches, inverse, options);
        set((state) => ({ doc: next, changeSeq: state.changeSeq + 1, ...historyFlags() }));
      },

      undo() {
        if (gestureBase) return false;
        const result = history.undo(get().doc);
        if (!result) return false;
        history.seal();
        set((state) => ({ doc: result.doc, changeSeq: state.changeSeq + 1, ...historyFlags() }));
        return true;
      },

      redo() {
        if (gestureBase) return false;
        const result = history.redo(get().doc);
        if (!result) return false;
        set((state) => ({ doc: result.doc, changeSeq: state.changeSeq + 1, ...historyFlags() }));
        return true;
      },

      sealHistory() {
        history.seal();
      },

      beginGesture() {
        if (gestureBase) return;
        gestureBase = get().doc;
        gestureRecipe = null;
        set({ gestureActive: true });
      },

      updateGesture(recipe) {
        if (!gestureBase) return;
        gestureRecipe = recipe;
        set({ doc: produce(gestureBase, recipe) });
      },

      commitGesture(label, options) {
        if (!gestureBase) return;
        const base = gestureBase;
        const recipe = gestureRecipe;
        if (recipe) {
          const [next, patches, inverse] = produceWithPatches(base, recipe);
          if (patches.length) {
            history.record(label, patches, inverse, options);
            set((state) => ({ doc: next, changeSeq: state.changeSeq + 1, ...historyFlags() }));
          } else {
            set({ doc: base });
          }
        }
        endGesture();
      },

      cancelGesture() {
        if (!gestureBase) return;
        set({ doc: gestureBase });
        endGesture();
      },

      replaceFromServer(doc, rev, needsSync = false) {
        if (gestureBase) {
          pendingRemote = { doc, rev, needsSync };
          return;
        }
        applyRemote(doc, rev, needsSync);
      },

      setRev(rev) {
        set({ rev });
      },
    };
  });
}
