import { expect, type Page } from "@playwright/test";

let initialDeck: unknown = null;

/** Put the server back to the fixture deck, then open the editor on slide 1. */
export async function openFreshEditor(page: Page): Promise<void> {
  const state = await (await page.request.get("/state")).json();
  if (!initialDeck) {
    initialDeck = { format: "cast.presentation", schema_version: 1, theme: state.theme, slides: state.slides };
  }
  const reset = await page.request.post("/deck/sync", {
    data: { base_rev: state.deck_rev, client_id: "e2e-reset", document: initialDeck },
  });
  expect(reset.ok()).toBeTruthy();
  await page.goto("/");
  await expect(page.locator(".canvas .js-plotly-plot")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Synced");
}

/** The document as the browser holds it. */
export function deck(page: Page) {
  return page.evaluate(() => (window as any).__castSession.doc.getState().doc);
}

export function selection(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as any).__castSession.ui.getState().selection);
}

export async function center(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`No box for ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
}

export const mod = process.platform === "darwin" ? "Meta" : "Control";
