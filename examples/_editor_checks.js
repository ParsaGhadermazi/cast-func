// Run against _editor_fixture.py with playwright-cli run-code --filename=... .
async function checkEditor(page) {
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const base = await page.evaluate(() => location.origin);
  const deck = async () => (await page.request.get(base + "/deck")).json();
  const state = async () => (await page.request.get(base + "/state")).json();
  const errors = [];
  try {
    await page.evaluate(() => delete window.__editorQA);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.reload();
    await page.locator("#blk-b3 .js-plotly-plot").waitFor();
    const baseline = await deck();
    check(
      baseline.schema_version === 1 && baseline.slides.length === 18,
      "Expected the isolated version-1 fixture",
    );
    check(
      baseline.slides[1].blocks[0].content.includes("<h2>"),
      "Legacy Markdown was not migrated",
    );
    check(
      baseline.slides[2].blocks[0].content.includes("48px"),
      "Legacy rich spans were lost",
    );
    check(
      await page
        .locator("#rail")
        .evaluate((node) => node.scrollHeight > node.clientHeight),
      "Slide rail must scroll",
    );
    const preview = await page
      .locator("#rail .thumb")
      .first()
      .evaluate((thumb) => {
        const span = thumb.querySelector(".mini-text li span");
        return {
          scale: thumb.clientWidth / 1040,
          zoom: Number(
            getComputedStyle(span.closest(".mini-text").firstElementChild).zoom,
          ),
          font: getComputedStyle(span).fontSize,
        };
      });
    check(
      Math.abs(preview.scale - preview.zoom) < 0.001 && preview.font === "20px",
      "Thumbnails must scale inline text with the slide",
    );

    await page.getByRole("tab", { name: "Layers", exact: true }).click();
    await page.locator(".layer-item").filter({ hasText: "Rectangle" }).click();
    check(
      await page
        .locator("#blk-b4")
        .evaluate((node) => node.classList.contains("selected")),
      "Covered shape should select on the first layer click",
    );
    const shapeBox = await page.locator("#blk-b4").boundingBox();
    await page.mouse.move(
      shapeBox.x + shapeBox.width / 2,
      shapeBox.y + shapeBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      shapeBox.x + shapeBox.width / 2 + 25,
      shapeBox.y + shapeBox.height / 2 + 10,
      { steps: 8 },
    );
    await page.mouse.up();
    await page.waitForFunction(
      async () =>
        (await (await fetch("./deck")).json()).slides[0].blocks.find(
          (b) => b.id === "b4",
        ).x > 0.05,
    );
    check(
      (await deck()).slides[0].blocks.find((b) => b.id === "b4").z === 0,
      "Moving an object unexpectedly changed its layer",
    );
    await page
      .getByRole("button", { name: "Bring to front", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelector(".layer-item")?.dataset.focusKey === "b4",
    );
    await page
      .getByRole("button", { name: "Send to back", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll(".layer-item")].at(-1)?.dataset
          .focusKey === "b4",
    );
    const stacked = (await deck()).slides[0].blocks;
    check(
      new Set(stacked.map((b) => b.z)).size === stacked.length,
      "Legacy tied layer values were not normalized",
    );

    await page
      .locator(".layer-item")
      .filter({ hasText: "Value over time" })
      .click();
    await page.getByRole("button", { name: "Insert", exact: true }).click();
    await page.locator("#figure-data").selectOption("daily");
    await page.locator("#add-table").selectOption("daily");
    check(
      (await deck()).slides[0].blocks.find((b) => b.id === "b3").table ===
        "monthly",
      "Insertion controls silently rebound an existing figure",
    );
    await page.keyboard.press("Escape");
    check(
      await page.locator("#insert-menu").isHidden(),
      "Escape should close the insertion menu",
    );

    await page
      .locator(".layer-item")
      .filter({ hasText: "From notebook to presentation" })
      .click();
    await page.keyboard.press("ControlOrMeta+d");
    await page.waitForFunction(
      () => document.querySelectorAll("#canvas > .block").length === 6,
    );
    const duplicate = (await deck()).slides[0].blocks.find(
      (b) => !baseline.slides[0].blocks.some((old) => old.id === b.id),
    );
    check(
      duplicate.content ===
        baseline.slides[0].blocks.find((b) => b.id === "b1").content,
      "Object duplication changed text",
    );
    await page.keyboard.press("Delete");
    await page.waitForFunction(
      () => document.querySelectorAll("#canvas > .block").length === 5,
    );

    await page.getByRole("tab", { name: "Properties", exact: true }).click();
    await page.locator("#blk-b2 .rich").dblclick();
    await page.locator("#blk-b2 .rich[contenteditable=true]").waitFor();
    await page
      .locator("#blk-b2 .rich li span")
      .first()
      .evaluate((span) => {
        const range = document.createRange();
        range.selectNodeContents(span);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      });
    const size = page.locator('[data-character-property="font-size"]');
    await size.fill("16");
    await size.press("Tab");
    await page.locator("#stage").click({ position: { x: 12, y: 12 } });
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector("#blk-b2 .rich li span"))
          .fontSize === "16px",
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForFunction(() =>
      document.querySelector("#status").textContent.startsWith("saved"),
    );
    await page.reload();
    await page.locator("#blk-b2 .rich li span").waitFor();
    const fonts = await page.locator("#blk-b2 .rich").evaluate((rich) => ({
      selected: getComputedStyle(rich.querySelector("li span")).fontSize,
      marker: getComputedStyle(rich.querySelector("li"), "::marker").fontSize,
      other: getComputedStyle(rich.querySelectorAll("li")[1]).fontSize,
    }));
    check(
      fonts.selected === "16px" &&
        fonts.marker === "16px" &&
        fonts.other === "26px",
      "Character/bullet formatting did not survive blur and reload",
    );

    const order = (await deck()).slides.map((s) => s.id);
    await page.request.patch(base + "/slides/order", {
      data: { order: order.slice(1).concat(order[0]) },
    });
    await page.waitForFunction(
      () => document.querySelector("#slide-number").value === "18",
    );
    check(
      await page.locator("#blk-b1").isVisible(),
      "External reordering changed the active slide",
    );
    await page.request.patch(base + "/slides/order", { data: { order } });
    await page.waitForFunction(
      () => document.querySelector("#slide-number").value === "1",
    );

    // Native HTML5 drag cancellation and successful drop, not a direct reorder call.
    const first = page.locator("#rail .thumb").nth(0),
      second = page.locator("#rail .thumb").nth(1);
    await first.scrollIntoViewIfNeeded();
    const a = await first.boundingBox(),
      b = await second.boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.8, {
      steps: 15,
    });
    check(
      (await page.locator(".slide-dragging").count()) === 1,
      "Cancellation test did not start a real drag",
    );
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await page.waitForFunction(
      () => !document.querySelector(".slide-dragging"),
    );
    check(
      JSON.stringify((await deck()).slides.map((s) => s.id)) ===
        JSON.stringify(order),
      "Cancelled drag changed saved slide order",
    );
    await page
      .locator("#rail .thumb")
      .nth(0)
      .dragTo(page.locator("#rail .thumb").nth(1), {
        targetPosition: { x: 40, y: 75 },
      });
    await page.waitForFunction(
      () => document.querySelector("#rail .thumb")?.dataset.slideId === "s2",
    );
    await page.waitForFunction(
      async () => (await (await fetch("./deck")).json()).slides[1].id === "s1",
    );
    check(
      (await deck()).slides[1].id === "s1",
      "Dropped slide order did not reach the server",
    );

    await page.locator("#slide-number").fill("1");
    await page.locator("#slide-number").press("Enter");
    await page.locator("#blk-b6").waitFor();
    check(
      (await page
        .locator("#canvas")
        .evaluate((node) => getComputedStyle(node).backgroundColor)) ===
        "rgb(234, 244, 239)",
      "Legacy per-slide background missing in edit mode",
    );
    await page.getByRole("button", { name: "Present", exact: true }).click();
    await page.locator("#present-overlay:not([hidden])").waitFor();
    const presentation = await page
      .locator("#present-canvas")
      .evaluate((node) => ({
        bg: getComputedStyle(node).backgroundColor,
        width: node.clientWidth,
        height: node.clientHeight,
        top:
          document
            .elementFromPoint(innerWidth / 2, innerHeight / 2)
            .closest("#present-overlay") !== null,
      }));
    check(
      presentation.bg === "rgb(234, 244, 239)" &&
        presentation.width === 1040 &&
        presentation.height === 585 &&
        presentation.top,
      "Presentation background, logical size, or overlay stacking is wrong",
    );
    await page.keyboard.press("Escape");

    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download editable copy", exact: true })
      .click();
    const download = await downloadEvent;
    const stream = await download.createReadStream();
    let json = "";
    for await (const chunk of stream) json += chunk.toString();
    const exported = JSON.parse(json);
    check(
      exported.schema_version === 1 && exported.slides.length === 18,
      "Editable download changed file format",
    );
    const beforeOpen = await deck();
    page.once("dialog", (dialog) => dialog.accept());
    const upload = await (await page.request.get(base + "/deck")).body();
    await page
      .locator("#open-deck-file")
      .setInputFiles({
        name: "roundtrip.cast.json",
        mimeType: "application/json",
        buffer: upload,
      });
    await page.waitForFunction(
      () => document.querySelector("#status").textContent === "opened",
    );
    check(
      JSON.stringify((await deck()).slides) ===
        JSON.stringify(beforeOpen.slides),
      "Opening the downloaded copy changed slide contents",
    );
    check(
      (await state()).workspace.filename === "editor-qa.cast.json",
      "Download/open changed the active workspace",
    );

    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 900, height: 700 },
      { width: 390, height: 844 },
      { width: 320, height: 700 },
    ]) {
      await page.setViewportSize(viewport);
      await page.getByRole("button", { name: "Fit", exact: true }).click();
      for (const id of [
        "save-deck-btn",
        "present-btn",
        "viewbar",
        "toolsbar",
        "zoom-in",
        "zoom-out",
        "slide-next",
        "theme-menu-btn",
        "inspector-toggle",
        "rail-toggle",
      ]) {
        const rect = await page.locator("#" + id).boundingBox();
        check(
          rect &&
            rect.x >= 0 &&
            rect.x + rect.width <= viewport.width + 1 &&
            rect.y + rect.height <= viewport.height + 1,
          `${id} is offscreen at ${viewport.width}px`,
        );
      }
      await page.getByRole("button", { name: "Insert", exact: true }).click();
      const menu = await page.locator("#insert-menu").boundingBox();
      check(
        menu.x >= 0 && menu.x + menu.width <= viewport.width + 1,
        "Insertion menu overflows the viewport",
      );
      await page.keyboard.press("Escape");
      // WebKit rounds clientWidth after CSS zoom, even when the layout is fixed.
      check(
        await page.locator("#canvas").evaluate((node) => {
          const css = getComputedStyle(node);
          return (
            Math.abs(parseFloat(css.width) - 1040) < 0.25 &&
            Math.abs(parseFloat(css.height) - 585) < 0.25
          );
        }),
        "Responsive layout changed the logical slide size",
      );
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    check(errors.length === 0, "Browser errors: " + errors.join("; "));
    await page.evaluate(() => {
      window.__editorQA = "passed";
    });
    return "EDITOR_CHECKS_OK: legacy load/save, layers, insertion, duplicate, rich text, drag/cancel, presentation, download/open, responsive layout";
  } catch (error) {
    await page.evaluate((message) => {
      window.__editorQA = { error: message };
    }, error.message);
    throw error;
  }
}
