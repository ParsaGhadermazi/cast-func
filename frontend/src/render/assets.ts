/**
 * Where block renderers get notebook-backed content.
 *
 * The live editor loads figures, tables and HTML from the Python server and
 * re-renders a block when its asset's version changes. A frozen export (M7)
 * supplies the same interface from data embedded in the HTML file.
 */

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import type { StoreApi } from "zustand/vanilla";

import { api, type Assets } from "../api/client";

export type AssetKind = "figure" | "table" | "html" | "image";

export type Loaded<T> = { ok: true; value: T } | { ok: false; error: string };

export interface FigureSpec {
  data: unknown[];
  layout: Record<string, unknown>;
}

export interface TableColumn {
  name: string;
  dtype: string;
  numeric: boolean;
}

export interface TableSpec {
  title: string;
  columns: TableColumn[];
  rows: string[][];
  truncated: boolean;
}

export interface AssetSource {
  /** Subscribe to version changes; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Current version of an asset (0 when unknown). Must be cheap and stable. */
  version(kind: AssetKind, name: string): number;
  title(kind: AssetKind, name: string): string | undefined;
  imageAlt(name: string): string | undefined;
  loadFigure(figure: string, table: string | null): Promise<Loaded<FigureSpec>>;
  loadTable(table: string, limit: number): Promise<Loaded<TableSpec>>;
  loadHtml(html: string): Promise<Loaded<string>>;
  imageSrc(image: string): string | null;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const listOf = (assets: Assets, kind: AssetKind) =>
  kind === "figure" ? assets.figures : kind === "table" ? assets.tables : kind === "html" ? assets.htmls : assets.images;

export function liveAssetSource(store: StoreApi<Assets>): AssetSource {
  const find = (kind: AssetKind, name: string) => listOf(store.getState(), kind).find((asset) => asset.name === name);
  return {
    subscribe: (listener) => store.subscribe(listener),
    version: (kind, name) => find(kind, name)?.version ?? 0,
    title: (kind, name) => find(kind, name)?.title,
    imageAlt: (name) => store.getState().images.find((image) => image.name === name)?.alt,

    async loadFigure(figure, table) {
      try {
        const result = await api.renderFigure(figure, table);
        if (!result.ok || !result.plotly) return { ok: false, error: result.error ?? "Unable to render figure." };
        const parsed = JSON.parse(result.plotly) as Partial<FigureSpec>;
        return { ok: true, value: { data: parsed.data ?? [], layout: parsed.layout ?? {} } };
      } catch (error) {
        return { ok: false, error: errorText(error) };
      }
    },

    async loadTable(table, limit) {
      try {
        const result = await api.renderTable(table, limit);
        if (!result.ok) return { ok: false, error: result.error ?? "Unable to render table." };
        return {
          ok: true,
          value: {
            title: result.title ?? table,
            columns: result.columns ?? [],
            rows: result.rows ?? [],
            truncated: !!result.truncated,
          },
        };
      } catch (error) {
        return { ok: false, error: errorText(error) };
      }
    },

    async loadHtml(html) {
      try {
        const result = await api.renderHtml(html);
        if (!result.ok) return { ok: false, error: result.error ?? "Unable to render HTML." };
        return { ok: true, value: result.html ?? "" };
      } catch (error) {
        return { ok: false, error: errorText(error) };
      }
    },

    imageSrc(image) {
      const asset = find("image", image);
      return asset ? api.imageUrl(asset.name, asset.version) : null;
    },
  };
}

export const AssetSourceContext = createContext<AssetSource | null>(null);

export function useAssetSource(): AssetSource {
  const source = useContext(AssetSourceContext);
  if (!source) throw new Error("useAssetSource outside AssetSourceContext");
  return source;
}

/** Re-render when the named asset's version changes. */
export function useAssetVersion(kind: AssetKind, name: string | null): number {
  const source = useAssetSource();
  return useSyncExternalStore(source.subscribe, () => (name ? source.version(kind, name) : 0));
}

/** Re-render when an asset's title changes (thumbnail labels, iframe titles). */
export function useAssetTitle(kind: AssetKind, name: string | null): string | undefined {
  const source = useAssetSource();
  return useSyncExternalStore(source.subscribe, () => (name ? source.title(kind, name) : undefined));
}

/**
 * Shared cache of loads, keyed by request. Only the newest version of each
 * request is kept, so the canvas, the present view and repeated renders share
 * one request, and refreshed data replaces the old entry.
 */
const cache = new Map<string, { version: string; promise: Promise<unknown> }>();

export function cachedLoad<T>(request: string, version: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(request);
  if (hit && hit.version === version) return hit.promise as Promise<T>;
  const promise = load();
  cache.set(request, { version, promise });
  return promise;
}

export function clearAssetCache(): void {
  cache.clear();
}

export type LoadState<T> = { status: "loading" } | { status: "done"; result: Loaded<T> };

/**
 * Load content for a block. `request` identifies what is loaded, `version`
 * when it must be reloaded. Stale responses never overwrite newer ones.
 */
export function useLoaded<T>(request: string | null, version: string, load: () => Promise<Loaded<T>>): LoadState<T> {
  const [state, setState] = useState<{ key: string; value: LoadState<T> }>({ key: "", value: { status: "loading" } });
  const key = request === null ? "" : `${request}@${version}`;
  useEffect(() => {
    if (request === null) return;
    let live = true;
    cachedLoad(request, version, load).then((result) => {
      if (live) setState({ key, value: { status: "done", result } });
    });
    return () => {
      live = false;
    };
    // `load` is recreated each render; the request and version identify it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, version]);
  // Show the previous result while a newer version loads, to avoid flicker.
  return state.key === key || state.value.status === "done" ? state.value : { status: "loading" };
}
