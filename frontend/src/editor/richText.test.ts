import { describe, expect, it } from "vitest";

import { sanitizeRichHtml } from "../model/sanitize";
import { changeListIndent, normalizeLinkUrl, stripInlineStyle, styleRange } from "./richText";

function root(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  document.body.append(div);
  return div;
}

describe("list indentation", () => {
  it("indents into the previous item and outdents back, keeping order", () => {
    const el = root("<ul><li>a</li><li>b</li><li>c</li></ul>");
    const b = el.querySelectorAll("li")[1] as HTMLElement;
    expect(changeListIndent(b, false)).toBe(true);
    expect(el.innerHTML).toBe("<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>");
    expect(changeListIndent(b, true)).toBe(true);
    expect(el.innerHTML).toBe("<ul><li>a</li><li>b</li><li>c</li></ul>");
  });

  it("refuses to indent the first item", () => {
    const el = root("<ol><li>a</li></ol>");
    expect(changeListIndent(el.querySelector("li")!, false)).toBe(false);
  });
});

describe("styleRange", () => {
  it("styles only the selected characters", () => {
    const el = root("<p>hello world</p>");
    const text = el.querySelector("p")!.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 6);
    range.setEnd(text, 11);
    styleRange(range, { "font-size": "40px" });
    expect(el.innerHTML).toBe('<p>hello <span style="font-size: 40px;">world</span></p>');
    expect(sanitizeRichHtml(el.innerHTML)).toBe('<p>hello <span style="font-size:40px">world</span></p>');
  });

  it("styles across elements and reuses wrapping spans", () => {
    const el = root('<p>ab<strong>cd</strong>ef</p>');
    const p = el.querySelector("p")!;
    const range = document.createRange();
    range.setStart(p.firstChild!, 1);
    range.setEnd(p.lastChild!, 1);
    styleRange(range, { color: "red" });
    styleRange(range, { color: "blue" }); // second pass reuses the spans
    expect(el.querySelectorAll("span").length).toBe(3);
    expect(el.textContent).toBe("abcdef");
    expect([...el.querySelectorAll("span")].map((s) => s.textContent)).toEqual(["b", "cd", "e"]);
  });

  it("styles within a single text node in the middle", () => {
    const el = root("<p>abcdef</p>");
    const text = el.querySelector("p")!.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 2);
    range.setEnd(text, 4);
    styleRange(range, { "font-weight": "700" });
    expect(el.querySelector("span")!.textContent).toBe("cd");
    expect(el.textContent).toBe("abcdef");
  });
});

describe("stripInlineStyle", () => {
  it("removes overrides of the given properties and unwraps bare spans", () => {
    const html = '<p><span style="font-size:40px;color:red">a</span><span style="font-size:20px">b</span></p><ul><li style="--marker-font-size:40px">c</li></ul>';
    expect(stripInlineStyle(html, ["font-size"])).toBe('<p><span style="color: red;">a</span>b</p><ul><li>c</li></ul>');
  });
});

describe("links", () => {
  it("normalises URLs", () => {
    expect(normalizeLinkUrl("example.com/x")).toBe("https://example.com/x");
    expect(normalizeLinkUrl("mailto:a@b.c")).toBe("mailto:a@b.c");
    expect(normalizeLinkUrl("javascript:alert(1)")).toBeNull();
  });
});
