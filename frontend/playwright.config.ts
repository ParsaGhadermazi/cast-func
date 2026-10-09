import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests drive the built editor served by the Python fixture
 * (examples/_editor_fixture.py), which holds a deck with every block type.
 * Run `npm run build` first; set PYTHON to choose the interpreter.
 */
const PORT = 8072;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `${process.env.PYTHON ?? "python"} examples/_editor_fixture.py ${PORT}`,
    cwd: "..",
    env: { PYTHONPATH: "." },
    url: `http://127.0.0.1:${PORT}/state`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
