import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// The Python server serves the built files from cast/static/editor/ with
// stable names, so the page template never needs a manifest.
const PY_SERVER = process.env.CAST_SERVER ?? "http://127.0.0.1:8000";
const API_ROUTES = [
  "/state", "/deck", "/events", "/render", "/render_table", "/render_html",
  "/render_image", "/slides", "/blocks", "/theme",
];

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "../cast/static/editor",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      input: { editor: "src/main.tsx" },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
  server: {
    proxy: Object.fromEntries(API_ROUTES.map((route) => [route, PY_SERVER])),
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
