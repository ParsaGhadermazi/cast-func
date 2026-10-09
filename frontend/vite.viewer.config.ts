import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The frozen-export viewer: one self-contained script and stylesheet that
 * `cast/export.py` inlines into the HTML file.
 *
 *   VIEWER_PLOTLY=bundled -> viewer.js       (Plotly inside; works offline)
 *   VIEWER_PLOTLY=global  -> viewer-lite.js  (expects Plotly from a CDN script)
 */
const lite = process.env.VIEWER_PLOTLY === "global";

export default defineConfig({
  plugins: [react()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  resolve: {
    alias: lite ? { "plotly.js-dist-min": fileURLToPath(new URL("./src/viewer/plotlyGlobal.ts", import.meta.url)) } : {},
  },
  build: {
    outDir: "../cast/static/viewer",
    emptyOutDir: false,
    sourcemap: false,
    chunkSizeWarningLimit: 6000,
    lib: {
      entry: "src/viewer/main.tsx",
      formats: ["iife"],
      name: "castViewer",
      fileName: () => (lite ? "viewer-lite.js" : "viewer.js"),
      cssFileName: "viewer",
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
