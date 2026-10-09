import { describe, expect, it } from "vitest";

import { plainTextToHtml, sanitizeRichHtml } from "./sanitize";

describe("sanitizeRichHtml", () => {
  it("keeps allowed structure", () => {
    const html = "<h2>Title</h2><p>Some <strong>bold</strong> and <em>italic</em></p><ul><li>one</li></ul>";
    expect(sanitizeRichHtml(html)).toBe(html);
  });

  it("drops script, event handlers and dangerous elements with their content", () => {
    const out = sanitizeRichHtml(
      '<p onclick="x()">hi<script>alert(1)</script></p><img src=x onerror="alert(1)"><iframe src="evil"></iframe><svg><g/></svg>',
    );
    expect(out).toBe("<p>hi</p>");
  });

  it("renames div, b and i", () => {
    expect(sanitizeRichHtml("<div><b>x</b><i>y</i></div>")).toBe("<p><strong>x</strong><em>y</em></p>");
  });

  it("unwraps unknown elements but keeps their text", () => {
    expect(sanitizeRichHtml("<p><font color=red>kept</font></p>")).toBe("<p>kept</p>");
  });

  it("only keeps safe links and hardens them", () => {
    expect(sanitizeRichHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeRichHtml('<a href="https://example.com">x</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">x</a>',
    );
    expect(sanitizeRichHtml('<a href="#s2">x</a>')).toBe('<a href="#s2" rel="noopener noreferrer">x</a>');
  });

  it("allow-lists span styles", () => {
    const out = sanitizeRichHtml(
      '<span style="font-weight:bold;font-size:16px;color:red;position:fixed;background:url(x)">t</span>',
    );
    expect(out).toBe('<span style="font-weight:bold;font-size:16px;color:red">t</span>');
    expect(sanitizeRichHtml('<span style="font-size:400px">t</span>')).toBe("<span>t</span>");
  });

  it("keeps list marker variables only", () => {
    const out = sanitizeRichHtml('<ul><li style="--marker-font-size:26px;--marker-color:red;color:blue">a</li></ul>');
    expect(out).toBe('<ul><li style="--marker-font-size:26px;--marker-color:red">a</li></ul>');
  });

  it("removes empty spans and zero-width spaces", () => {
    expect(sanitizeRichHtml('<p>a<span style="color:red">​</span>b</p>')).toBe("<p>ab</p>");
  });

  it("is idempotent", () => {
    const once = sanitizeRichHtml(
      '<ol><li style="--marker-font-size:20px">x <span style="font-family:Inter, sans-serif;font-style:italic">y</span></li></ol><pre><code>a\n  b</code></pre>',
    );
    expect(sanitizeRichHtml(once)).toBe(once);
  });
});

describe("plainTextToHtml", () => {
  it("splits paragraphs and escapes", () => {
    expect(plainTextToHtml("a <b>\nc\n\nd")).toBe("<p>a &lt;b&gt;<br>c</p><p>d</p>");
  });
});
