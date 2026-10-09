import { expect, test } from "@playwright/test";

import { center, deck, drag, mod, openFreshEditor, selection } from "./helpers";

test.beforeEach(async ({ page }) => {
  await openFreshEditor(page);
});

test("clicking a chart selects it, and a drag is one undo step", async ({ page }) => {
  const chart = await center(page, '[data-hit="b3"]');
  await page.mouse.click(chart.x, chart.y);
  expect(await selection(page)).toEqual(["b3"]);
  await expect(page.getByRole("heading", { name: "Figure" })).toBeVisible();

  const before = (await deck(page)).slides[0].blocks.find((b: any) => b.id === "b3");
  await drag(page, chart, { x: chart.x - 60, y: chart.y + 40 });
  const moved = (await deck(page)).slides[0].blocks.find((b: any) => b.id === "b3");
  expect(moved.x).toBeLessThan(before.x);

  await page.keyboard.press(`${mod}+z`);
  const undone = (await deck(page)).slides[0].blocks.find((b: any) => b.id === "b3");
  expect(undone.x).toBeCloseTo(before.x, 6);
  expect(undone.y).toBeCloseTo(before.y, 6);
});

test("escape cancels a drag in progress", async ({ page }) => {
  const chart = await center(page, '[data-hit="b3"]');
  const before = (await deck(page)).slides[0].blocks.find((b: any) => b.id === "b3");
  await page.mouse.move(chart.x, chart.y);
  await page.mouse.down();
  await page.mouse.move(chart.x - 120, chart.y, { steps: 6 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  const after = (await deck(page)).slides[0].blocks.find((b: any) => b.id === "b3");
  expect(after.x).toBeCloseTo(before.x, 6);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("dragging on empty space selects with a box", async ({ page }) => {
  const canvas = await page.locator(".canvas").boundingBox();
  await drag(page, { x: canvas!.x + 6, y: canvas!.y + 6 }, { x: canvas!.x + canvas!.width * 0.33, y: canvas!.y + canvas!.height * 0.6 });
  expect((await selection(page)).sort()).toEqual(["b1", "b2", "b4"]);
  await expect(page.locator(".member-outline")).toHaveCount(3);
});

test("draws a rectangle with the shape tool, then undoes it", async ({ page }) => {
  await page.locator(".thumb-button").nth(5).click(); // a mostly empty slide
  const count = (await deck(page)).slides[5].blocks.length;
  await page.keyboard.press("r");
  const canvas = await page.locator(".canvas").boundingBox();
  await drag(page, { x: canvas!.x + canvas!.width * 0.55, y: canvas!.y + canvas!.height * 0.55 },
    { x: canvas!.x + canvas!.width * 0.75, y: canvas!.y + canvas!.height * 0.85 });
  const blocks = (await deck(page)).slides[5].blocks;
  expect(blocks).toHaveLength(count + 1);
  expect(blocks.at(-1)).toMatchObject({ type: "shape", style: { shape: "rect" } });
  expect(await selection(page)).toEqual([blocks.at(-1).id]);
  await expect(page.getByRole("button", { name: "Select", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press(`${mod}+z`);
  expect((await deck(page)).slides[5].blocks).toHaveLength(count);
});

test("edits text in place and keeps the session as one undo step", async ({ page }) => {
  const title = await center(page, '[data-hit="b1"]');
  await page.mouse.dblclick(title.x, title.y);
  const editor = page.locator(".body.text.editing .rich");
  await expect(editor).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.type(" today");
  await page.keyboard.press("Escape");
  const content = (await deck(page)).slides[0].blocks.find((b: any) => b.id === "b1").content;
  expect(content).toContain("presentation today");
  await expect(page.locator('.canvas [data-bid="b1"]')).toContainText("presentation today");
  await page.keyboard.press(`${mod}+z`);
  const restored = (await deck(page)).slides[0].blocks.find((b: any) => b.id === "b1").content;
  expect(restored).not.toContain("today");
});

test("reorders slides by dragging thumbnails and restores a deleted slide", async ({ page }) => {
  const ids = async () => (await deck(page)).slides.map((s: any) => s.id);
  const before = await ids();
  const first = await center(page, ".thumb-button >> nth=0");
  const fourth = await page.locator(".thumb-button").nth(3).boundingBox();
  await drag(page, first, { x: first.x, y: fourth!.y + 4 });
  expect((await ids()).slice(0, 4)).toEqual([before[1], before[2], before[0], before[3]]);
  await page.keyboard.press(`${mod}+z`);
  expect(await ids()).toEqual(before);

  await page.locator(".thumb").nth(2).hover();
  await page.getByRole("button", { name: "Delete slide 3" }).click();
  expect(await ids()).not.toContain(before[2]);
  await page.keyboard.press(`${mod}+z`);
  expect(await ids()).toEqual(before);
});

test("changes reach the server and survive a reload", async ({ page }) => {
  const chart = await center(page, '[data-hit="b3"]');
  await page.mouse.click(chart.x, chart.y);
  await page.keyboard.press("Shift+ArrowRight");
  await expect(page.getByRole("status")).toHaveText("Synced");
  const x = (await deck(page)).slides[0].blocks.find((b: any) => b.id === "b3").x;
  await page.reload();
  await expect(page.getByRole("status")).toHaveText("Synced");
  expect((await deck(page)).slides[0].blocks.find((b: any) => b.id === "b3").x).toBeCloseTo(x, 6);
});
