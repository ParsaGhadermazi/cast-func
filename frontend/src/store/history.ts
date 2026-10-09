/**
 * Undo/redo built on Immer patches.
 *
 * Each entry holds the forward patches and their inverse. Consecutive entries
 * with the same `mergeKey` inside `mergeWindowMs` fold into one step, which is
 * how a text-editing session or a burst of arrow-key nudges undoes at once.
 */

import { applyPatches, type Patch } from "immer";

import type { Deck } from "../model/types";

export interface HistoryEntry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
  mergeKey?: string;
  at: number;
}

export interface RecordOptions {
  mergeKey?: string;
  /** How long after the previous step a merge is still allowed. */
  mergeWindowMs?: number;
}

export const HISTORY_LIMIT = 200;

export class History {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];

  constructor(private readonly now: () => number = () => Date.now()) {}

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get size(): number {
    return this.past.length;
  }

  record(label: string, patches: Patch[], inverse: Patch[], options: RecordOptions = {}): void {
    if (!patches.length) return;
    const at = this.now();
    const last = this.past.at(-1);
    const window = options.mergeWindowMs ?? Number.POSITIVE_INFINITY;
    if (options.mergeKey && last?.mergeKey === options.mergeKey && at - last.at <= window) {
      last.patches = [...last.patches, ...patches];
      last.inverse = [...inverse, ...last.inverse];
      last.at = at;
    } else {
      this.past.push({ label, patches, inverse, mergeKey: options.mergeKey, at });
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
    }
    this.future = [];
  }

  /** Stop the latest entry from absorbing later steps with the same key. */
  seal(): void {
    const last = this.past.at(-1);
    if (last) last.mergeKey = undefined;
  }

  undo(doc: Deck): { doc: Deck; entry: HistoryEntry } | null {
    const entry = this.past.pop();
    if (!entry) return null;
    this.future.push(entry);
    return { doc: applyPatches(doc, entry.inverse), entry };
  }

  redo(doc: Deck): { doc: Deck; entry: HistoryEntry } | null {
    const entry = this.future.pop();
    if (!entry) return null;
    entry.mergeKey = undefined;
    this.past.push(entry);
    return { doc: applyPatches(doc, entry.patches), entry };
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
