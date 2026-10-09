/** Asset source for frozen exports: everything was rendered in Python and embedded. */

import type { AssetKind, AssetSource, FigureSpec, Loaded, TableSpec } from "../render/assets";

export interface FrozenAssets {
  titles?: Partial<Record<AssetKind, Record<string, string>>>;
  alts?: Record<string, string>;
  /** Keyed by `figure\u0000table`. */
  figures?: Record<string, Loaded<FigureSpec>>;
  /** Keyed by `table\u0000limit`. */
  tables?: Record<string, Loaded<TableSpec>>;
  htmls?: Record<string, Loaded<string>>;
  /** Data URIs. */
  images?: Record<string, string>;
}

const missing = (what: string): Loaded<never> => ({ ok: false, error: `${what} was not included in this export.` });

export function frozenAssetSource(assets: FrozenAssets): AssetSource {
  return {
    subscribe: () => () => undefined,
    version: () => 0,
    title: (kind, name) => assets.titles?.[kind]?.[name],
    imageAlt: (name) => assets.alts?.[name],
    loadFigure: async (figure, table) => assets.figures?.[`${figure}\u0000${table ?? ""}`] ?? missing(`Figure '${figure}'`),
    loadTable: async (table, limit) => assets.tables?.[`${table}\u0000${limit}`] ?? missing(`Table '${table}'`),
    loadHtml: async (html) => assets.htmls?.[html] ?? missing(`HTML '${html}'`),
    imageSrc: (image) => assets.images?.[image] ?? null,
  };
}
