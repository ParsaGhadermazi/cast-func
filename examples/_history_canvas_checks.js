// Run against _editor_fixture.py with playwright-cli run-code --filename=... .
async function checkHistoryCanvas(page) {
  const base = await page.evaluate(() => location.origin);
  const deck = async () => (await page.request.get(base + "/deck")).json();
  const check = (condition, message) => { if (!condition) throw new Error(message); };

  await page.setViewportSize({width:1280, height:800});
  await page.reload();
  await page.locator("#blk-b4").waitFor();
  const originalCount = (await deck()).slides[0].blocks.length;
  await page.locator("#shape-menu-btn").click();
  await page.locator("#shape-palette button[title='Rectangle']").click();
  await page.locator("#add-shape-btn").click();
  await page.waitForFunction(count=>document.querySelectorAll("#canvas > .block").length === count+1, originalCount);
  const added = (await deck()).slides[0].blocks.at(-1);
  check(await page.locator("#undo-btn").isEnabled(), "Undo was not enabled after inserting a shape");

  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForFunction(count=>document.querySelectorAll("#canvas > .block").length === count, originalCount);
  check(await page.locator("#redo-btn").isEnabled(), "Redo was not enabled after undo");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await page.locator(`#blk-${added.id}`).waitFor();
  check((await deck()).slides[0].blocks.at(-1).id === added.id, "Redo changed the restored object ID");

  await page.locator(`#blk-${added.id} .body.shape`).click();
  await page.getByRole("button", {name:"Edit points"}).click();
  const vertex = page.locator(`#blk-${added.id} .point-editor button:not(.add)`).first();
  const box = await vertex.boundingBox();
  await page.mouse.move(box.x+box.width/2, box.y+box.height/2);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+20, box.y+box.height/2+12, {steps:5});
  await page.mouse.up();
  await page.waitForFunction(async id => (await (await fetch("./deck")).json())
    .slides[0].blocks.find(b=>b.id===id).style.points?.[0]?.[0] > 1, added.id);
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForFunction(async id => !(await (await fetch("./deck")).json())
    .slides[0].blocks.find(b=>b.id===id).style.points, added.id);
  await page.locator(`#blk-${added.id} .body.shape rect`).waitFor();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await page.waitForFunction(async id => (await (await fetch("./deck")).json())
    .slides[0].blocks.find(b=>b.id===id).style.points?.[0]?.[0] > 1, added.id);

  await page.getByRole("button", {name:"Done editing points"}).click();
  await page.getByRole("tab", {name:"Layers", exact:true}).click();
  await page.locator(`.layer-item[data-focus-key="${added.id}"]`).click();
  await page.locator('.layer-item[data-focus-key="b4"]').click({modifiers:["Shift"]});
  const before = (await deck()).slides[0].blocks.filter(b=>[added.id,"b4"].includes(b.id));
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(async ({ids, x}) => {
    const blocks = (await (await fetch("./deck")).json()).slides[0].blocks.filter(b=>ids.includes(b.id));
    return blocks.every((b,i)=>b.x > x[i]);
  }, {ids:[added.id,"b4"], x:before.map(b=>b.x)});
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForFunction(async ({ids, x}) => {
    const blocks = (await (await fetch("./deck")).json()).slides[0].blocks.filter(b=>ids.includes(b.id));
    return blocks.every((b,i)=>b.x === x[i]);
  }, {ids:[added.id,"b4"], x:before.map(b=>b.x)});
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await page.waitForFunction(async ({ids, x}) => {
    const blocks = (await (await fetch("./deck")).json()).slides[0].blocks.filter(b=>ids.includes(b.id));
    return blocks.every((b,i)=>b.x > x[i]);
  }, {ids:[added.id,"b4"], x:before.map(b=>b.x)});

  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForFunction(async ({ids, x}) => {
    const blocks = (await (await fetch("./deck")).json()).slides[0].blocks.filter(b=>ids.includes(b.id));
    return blocks.every((b,i)=>b.x === x[i]);
  }, {ids:[added.id,"b4"], x:before.map(b=>b.x)});
  await page.getByRole("tab", {name:"Properties", exact:true}).click();
  await page.locator("#add-text-btn").click();
  await page.waitForFunction(count=>document.querySelectorAll("#canvas > .block").length === count+2, originalCount);
  check(await page.locator("#redo-btn").isDisabled(), "A new edit did not clear redo");
  await page.locator("#undo-btn").click();
  await page.waitForFunction(count=>document.querySelectorAll("#canvas > .block").length === count+1, originalCount);
  await page.locator("#redo-btn").click();
  await page.waitForFunction(count=>document.querySelectorAll("#canvas > .block").length === count+2, originalCount);

  const originalText = (await deck()).slides[0].blocks.find(b=>b.id==="b1").content;
  await page.locator("#blk-b1 .rich").dblclick();
  const rich = page.locator('#blk-b1 .rich[contenteditable="true"]');
  await rich.waitFor();
  await rich.evaluate(node=>{
    const range = document.createRange();
    range.selectNodeContents(node); range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    node.focus();
  });
  await page.keyboard.type("U");
  await page.waitForTimeout(300);
  await page.keyboard.type("V");
  await page.waitForTimeout(300);
  await page.getByRole("tab", {name:"Layers", exact:true}).click();
  await page.waitForFunction(async () => (await (await fetch("./deck")).json())
    .slides[0].blocks.find(b=>b.id==="b1").content.includes("UV"));
  await page.keyboard.press("ControlOrMeta+z");
  await page.waitForFunction(async expected => (await (await fetch("./deck")).json())
    .slides[0].blocks.find(b=>b.id==="b1").content === expected, originalText);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await page.waitForFunction(async () => (await (await fetch("./deck")).json())
    .slides[0].blocks.find(b=>b.id==="b1").content.includes("UV"));

  return "HISTORY_CANVAS_OK";
}
