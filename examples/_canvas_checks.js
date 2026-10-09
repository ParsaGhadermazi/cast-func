// Run against _editor_fixture.py with playwright-cli run-code --filename=... .
async function checkCanvas(page) {
  const base = await page.evaluate(() => location.origin);
  const deck = async () => (await page.request.get(base + "/deck")).json();
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  await page.setViewportSize({width:1280, height:800});
  await page.reload();
  await page.locator("#blk-b4").waitFor();
  const shapeCount = await page.locator("#canvas > .block.shape").count();
  await page.locator("#shape-menu-btn").click();
  await page.locator("#shape-palette button[title='Ellipse']").click();
  await page.locator("#add-shape-btn").click();
  await page.waitForFunction(count => document.querySelectorAll("#canvas > .block.shape").length === count+1, shapeCount);
  const inserted = (await deck()).slides[0].blocks.at(-1);
  check(inserted.style.shape === "ellipse" && inserted.w < .15 && inserted.h < .25,
    "New shapes should have compact shape-specific dimensions");

  await page.getByRole("button", {name:"Edit points"}).click();
  check(await page.locator(`#blk-${inserted.id} .point-editor button:not(.add)`).count() === 12,
    "Point editing should expose the ellipse outline");
  const vertex = page.locator(`#blk-${inserted.id} .point-editor button:not(.add)`).first();
  const pointBox = await vertex.boundingBox();
  await page.mouse.move(pointBox.x + pointBox.width/2, pointBox.y + pointBox.height/2);
  await page.mouse.down();
  await page.mouse.move(pointBox.x + pointBox.width/2 + 25, pointBox.y + pointBox.height/2 + 10, {steps:5});
  await page.mouse.up();
  await page.waitForFunction(async id => {
    const block = (await (await fetch("./deck")).json()).slides[0].blocks.find(b=>b.id===id);
    return block.style.points?.length === 12 && block.style.points[0][0] > 50;
  }, inserted.id);
  check(await page.locator(`#blk-${inserted.id} .body.shape polygon`).count() === 1,
    "Edited ellipse did not render its custom outline");
  await page.locator(`#blk-${inserted.id}`).hover();
  await page.locator(`#blk-${inserted.id} .point-editor button.add`).nth(6).click();
  await page.waitForFunction(async id => (await (await fetch("./deck")).json())
    .slides[0].blocks.find(b=>b.id===id).style.points.length === 13, inserted.id);
  await page.keyboard.press("Delete");
  await page.waitForFunction(async id => (await (await fetch("./deck")).json())
    .slides[0].blocks.find(b=>b.id===id).style.points.length === 12, inserted.id);
  await page.getByRole("button", {name:"Add point", exact:true}).click();
  await page.waitForFunction(async id => (await (await fetch("./deck")).json())
    .slides[0].blocks.find(b=>b.id===id).style.points.length === 13, inserted.id);
  await page.getByRole("button", {name:"Remove point", exact:true}).click();
  await page.waitForFunction(async id => (await (await fetch("./deck")).json())
    .slides[0].blocks.find(b=>b.id===id).style.points.length === 12, inserted.id);
  const beforeNudge = (await deck()).slides[0].blocks.find(b=>b.id===inserted.id);
  await page.locator(`#blk-${inserted.id} .point-editor button:not(.add)`).nth(6).click();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(async ({id, x}) => (await (await fetch("./deck")).json())
    .slides[0].blocks.find(b=>b.id===id).style.points[6][0] > x, {id:inserted.id, x:beforeNudge.style.points[6][0]});
  check((await deck()).slides[0].blocks.find(b=>b.id===inserted.id).x === beforeNudge.x,
    "Point nudge moved the entire block");
  check((await deck()).slides[0].blocks.find(b=>b.id===inserted.id).style.points.length === 12,
    "Point nudge changed the vertex count");
  await page.locator('#inspector .row:has-text("Smooth outline") input').check();
  check(await page.locator(`#blk-${inserted.id} .body.shape path`).count() === 1,
    "Smooth outline did not render a curve");
  await page.waitForFunction(async id => (await (await fetch("./deck")).json())
    .slides[0].blocks.find(b=>b.id===id).style.smooth === true, inserted.id);
  check((await deck()).slides[0].blocks.find(b=>b.id===inserted.id).style.points.length === 12,
    "Smoothing changed the vertex count");
  const beforeFlip = (await deck()).slides[0].blocks.find(b=>b.id===inserted.id).style.points[0][0];
  await page.getByRole("button", {name:"Flip horizontal"}).click();
  await page.waitForFunction(async ({id, expected}) => {
    const point = (await (await fetch("./deck")).json()).slides[0].blocks.find(b=>b.id===id).style.points[0][0];
    return Math.abs(point-(100-expected)) < .001;
  }, {id:inserted.id, expected:beforeFlip});
  check((await deck()).slides[0].blocks.find(b=>b.id===inserted.id).style.points.length === 12,
    "Flip changed the vertex count");
  await page.reload();
  await page.locator(`#blk-${inserted.id}`).click();
  await page.getByRole("button", {name:"Edit points"}).click();
  check(await page.locator(`#blk-${inserted.id} .point-editor button:not(.add)`).count() === 12,
    "Edited points did not survive reload");
  await page.getByRole("button", {name:"Reset outline"}).click();
  await page.waitForFunction(async id => (await (await fetch("./deck")).json())
    .slides[0].blocks.find(b=>b.id===id).style.points === null, inserted.id);
  check(await page.locator(`#blk-${inserted.id} .body.shape ellipse`).count() === 1,
    "Reset outline did not restore the original shape");
  await page.getByRole("button", {name:"Done editing points"}).click();

  const edge = page.locator(`#blk-${inserted.id} .handle.e`);
  const edgeBox = await edge.boundingBox();
  await page.mouse.move(edgeBox.x + edgeBox.width/2, edgeBox.y + edgeBox.height/2);
  await page.mouse.down();
  await page.mouse.move(edgeBox.x + edgeBox.width/2 + 35, edgeBox.y + edgeBox.height/2, {steps:6});
  await page.mouse.up();
  await page.waitForFunction(async id =>
    (await (await fetch("./deck")).json()).slides[0].blocks.find(b=>b.id===id).w > .15, inserted.id);

  await page.getByRole("tab", {name:"Layers", exact:true}).click();
  await page.locator(`.layer-item[data-focus-key="${inserted.id}"]`).click();
  await page.locator('.layer-item[data-focus-key="b4"]').click({modifiers:["Shift"]});
  check(await page.locator("#canvas > .block.selected").count() === 2, "Shift-click did not select two blocks");
  const before = (await deck()).slides[0].blocks.filter(b=>[inserted.id, "b4"].includes(b.id));
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(600);
  const after = (await deck()).slides[0].blocks.filter(b=>[inserted.id, "b4"].includes(b.id));
  check(after.every((b,i)=>b.x > before[i].x), "Nudge did not move the entire selection");
  const shapeBody = await page.locator(`#blk-${inserted.id} .body.shape`).boundingBox();
  const px = shapeBody.x+shapeBody.width/2, py = shapeBody.y+shapeBody.height/2;
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.mouse.move(px+24, py+12, {steps:6});
  await page.mouse.up();
  await page.waitForTimeout(350);
  const dragged = (await deck()).slides[0].blocks.filter(b=>[inserted.id, "b4"].includes(b.id));
  check(dragged.every((b,i)=>b.x > after[i].x), "Dragging one selected object did not move the group");
  await page.locator(`.layer-item[data-focus-key="${inserted.id}"]`).click();
  check(await page.locator("#canvas > .block.selected").count() === 1,
    "Plain layer click did not return to one selected object");
  await page.locator('.layer-item[data-focus-key="b4"]').click({modifiers:["Shift"]});

  const copiedCount = (await deck()).slides[0].blocks.length;
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  await page.waitForFunction(count => document.querySelectorAll("#canvas > .block").length === count+2, copiedCount);
  check(await page.locator("#canvas > .block.selected").count() === 2, "Paste did not select the two copies");
  await page.keyboard.press("ControlOrMeta+x");
  await page.waitForFunction(count => document.querySelectorAll("#canvas > .block").length === count, copiedCount);

  await page.locator("#rail .thumb").nth(3).click();
  await page.locator("#blk-b9").waitFor();
  await page.getByRole("tab", {name:"Properties", exact:true}).click();
  await page.locator("#blk-b9 .body.image").click();
  const cropLeft = page.locator('[aria-label="Crop left"]');
  await cropLeft.fill("20");
  await cropLeft.dispatchEvent("input");
  await page.waitForFunction(async () => {
    const doc = await (await fetch("./deck")).json();
    return doc.slides[3].blocks.find(b=>b.id==="b9").style.crop?.left === .2;
  });
  const rendering = await page.locator("#blk-b9 .body.image").evaluate(body=>({
    cropped:body.classList.contains("cropped"),
    positioned:body.querySelector("img").style.position === "absolute",
    width:parseFloat(body.querySelector("img").style.width),
  }));
  check(rendering.cropped && rendering.positioned && Number.isFinite(rendering.width),
    "Crop does not render in the editor");
  await page.locator("#rail .thumb").nth(1).click();
  const otherCount = (await deck()).slides[1].blocks.length;
  await page.keyboard.press("ControlOrMeta+v");
  await page.waitForFunction(count => document.querySelectorAll("#canvas > .block").length === count+2, otherCount);
  check((await deck()).slides[1].blocks.length === otherCount+2,
    "Copied objects could not be pasted onto another slide");
  await page.reload();
  await page.locator("#rail .thumb").nth(3).click();
  check(await page.locator("#blk-b9 .body.image.cropped").count() === 1,
    "Crop did not persist after reload");
  return "CANVAS_CHECKS_OK";
}
