/**
 * Typed wrappers for the Python server (`cast/server.py`).
 *
 * URLs are relative ("./state") so the editor also works behind a notebook
 * proxy that serves it under a sub-path.
 */

import type { Deck, Theme } from "../model/types";

export interface AssetRef {
  name: string;
  title: string;
  version: number;
}

export interface ImageAssetRef extends AssetRef {
  alt: string;
}

export interface Assets {
  version: number;
  assets_version: number;
  figures: AssetRef[];
  tables: AssetRef[];
  htmls: AssetRef[];
  images: ImageAssetRef[];
  workspace: { configured: boolean; filename: string | null };
}

export interface ServerState extends Assets {
  deck_rev: number;
  deck_origin: string | null;
  theme: Theme;
  slides: Deck["slides"];
}

export interface ChangeMarker {
  version: number;
  assets_version: number;
  deck_rev: number;
  deck_origin: string | null;
}

export type SyncResult =
  | { status: "ok"; rev: number }
  | { status: "conflict"; rev: number }
  | { status: "invalid"; error: string };

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.error === "string" ? body.error : `${response.status} ${response.statusText}`;
    throw new ApiError(message, response.status);
  }
  return body as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function stateToRawDeck(state: ServerState): unknown {
  return {
    format: "cast.presentation",
    schema_version: 1,
    theme: state.theme,
    slides: state.slides,
  };
}

export const api = {
  state: () => request<ServerState>("./state"),
  assets: () => request<Assets>("./state?deck=false"),

  async syncDeck(baseRev: number, clientId: string, document: Deck): Promise<SyncResult> {
    const response = await fetch("./deck/sync", json("POST", { base_rev: baseRev, client_id: clientId, document }));
    const body = await response.json().catch(() => ({}));
    if (response.ok) return { status: "ok", rev: body.rev };
    if (response.status === 409) return { status: "conflict", rev: body.rev };
    if (response.status === 400) return { status: "invalid", error: String(body.error ?? "Invalid document.") };
    throw new ApiError(String(body.error ?? response.statusText), response.status);
  },

  saveWorkspace: () => request<{ ok: true; filename: string }>("./deck/save", { method: "POST" }),

  renderFigure: (figure: string, table: string | null) => {
    const params = new URLSearchParams({ figure });
    if (table) params.set("table", table);
    return request<{ ok: boolean; plotly?: string; error?: string }>(`./render?${params}`);
  },

  renderTable: (table: string, limit: number) =>
    request<{
      ok: boolean;
      title?: string;
      columns?: { name: string; dtype: string; numeric: boolean }[];
      rows?: string[][];
      truncated?: boolean;
      error?: string;
    }>(`./render_table?${new URLSearchParams({ table, limit: String(limit) })}`),

  renderHtml: (html: string) =>
    request<{ ok: boolean; html?: string; error?: string }>(`./render_html?${new URLSearchParams({ html })}`),

  imageUrl: (image: string, version: number) =>
    `./render_image?${new URLSearchParams({ image, v: String(version) })}`,
};
