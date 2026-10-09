/**
 * Rich-text sanitising, ported rule-for-rule from the legacy editor's
 * `sanitizeRichHtml`. Every text block's `content` passes through here when a
 * deck is loaded, not only on paste, so a shared `.cast.json` cannot inject
 * script into the editor or into frozen exports.
 */

const ALLOWED = new Set([
  "P", "BR", "H1", "H2", "H3", "UL", "OL", "LI", "BLOCKQUOTE", "STRONG", "EM",
  "U", "S", "A", "CODE", "PRE", "HR", "SUB", "SUP", "SPAN",
]);
/** Removed together with their content. */
const DROPPED = new Set([
  "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "FORM", "INPUT", "BUTTON", "SVG", "MATH",
]);
const RENAMED: Record<string, string> = { DIV: "P", B: "STRONG", I: "EM" };

const WEIGHT_RE = /^(normal|bold|bolder|lighter|[1-9]00)$/;
const FONT_STYLE_RE = /^(normal|italic)$/;
const DECORATION_RE = /^(none|underline|line-through|underline line-through|line-through underline)$/;
const FONT_SIZE_RE = /^(?:[6-9]|[1-9]\d|[12]\d\d|300)px$/;
const UNSAFE_CSS_RE = /[;{}<>]/;
const SAFE_HREF_RE = /^(https?:|mailto:|#)/i;

const safeFamily = (value: string) => !!value && value.length <= 160 && !UNSAFE_CSS_RE.test(value);
const safeColor = (value: string) => !!value && value.length <= 80 && !UNSAFE_CSS_RE.test(value);

function spanStyle(style: CSSStyleDeclaration): string[] {
  const safe: string[] = [];
  const weight = style.fontWeight.toLowerCase();
  const fontStyle = style.fontStyle.toLowerCase();
  const decoration = style.textDecorationLine.toLowerCase();
  const family = style.fontFamily.trim();
  const size = style.fontSize.trim().toLowerCase();
  const color = style.color.trim().toLowerCase();
  if (WEIGHT_RE.test(weight)) safe.push(`font-weight:${weight}`);
  if (FONT_STYLE_RE.test(fontStyle)) safe.push(`font-style:${fontStyle}`);
  if (DECORATION_RE.test(decoration)) safe.push(`text-decoration-line:${decoration}`);
  if (safeFamily(family)) safe.push(`font-family:${family}`);
  if (FONT_SIZE_RE.test(size)) safe.push(`font-size:${size}`);
  if (safeColor(color)) safe.push(`color:${color}`);
  return safe;
}

function listItemStyle(style: CSSStyleDeclaration): string[] {
  const safe: string[] = [];
  const prop = (name: string) => style.getPropertyValue(name).trim();
  const family = prop("--marker-font-family");
  const size = prop("--marker-font-size").toLowerCase();
  const weight = prop("--marker-font-weight").toLowerCase();
  const fontStyle = prop("--marker-font-style").toLowerCase();
  const color = prop("--marker-color").toLowerCase();
  if (safeFamily(family)) safe.push(`--marker-font-family:${family}`);
  if (FONT_SIZE_RE.test(size)) safe.push(`--marker-font-size:${size}`);
  if (WEIGHT_RE.test(weight)) safe.push(`--marker-font-weight:${weight}`);
  if (FONT_STYLE_RE.test(fontStyle)) safe.push(`--marker-font-style:${fontStyle}`);
  if (safeColor(color)) safe.push(`--marker-color:${color}`);
  return safe;
}

function copyChildren(source: Node, target: Node, doc: Document): void {
  for (const child of Array.from(source.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = (child.textContent ?? "").replace(/​/g, "");
      if (text) target.appendChild(doc.createTextNode(text));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const element = child as HTMLElement;
    let tag = element.tagName.toUpperCase();
    if (DROPPED.has(tag)) continue;
    tag = RENAMED[tag] ?? tag;
    if (!ALLOWED.has(tag)) {
      copyChildren(element, target, doc);
      continue;
    }
    const clean = doc.createElement(tag.toLowerCase());
    if (tag === "A") {
      const href = element.getAttribute("href") ?? "";
      if (SAFE_HREF_RE.test(href)) {
        clean.setAttribute("href", href);
        if (/^https?:/i.test(href)) clean.setAttribute("target", "_blank");
        clean.setAttribute("rel", "noopener noreferrer");
      }
    }
    if (tag === "SPAN") {
      const safe = spanStyle(element.style);
      if (safe.length) clean.setAttribute("style", safe.join(";"));
    }
    if (tag === "LI") {
      const safe = listItemStyle(element.style);
      if (safe.length) clean.setAttribute("style", safe.join(";"));
    }
    copyChildren(element, clean, doc);
    if (tag === "SPAN" && !clean.hasChildNodes()) continue;
    target.appendChild(clean);
  }
}

export function sanitizeRichHtml(input: string | null | undefined): string {
  if (!input) return "";
  const parsed = new DOMParser().parseFromString(`<body>${input}</body>`, "text/html");
  // Build the output in the inert parsed document so nothing touches the live page.
  const output = parsed.createElement("div");
  copyChildren(parsed.body, output, parsed);
  return output.innerHTML;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Blank lines separate paragraphs; single newlines become `<br>`. */
export function plainTextToHtml(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function plainTextFromHtml(html: string | null | undefined): string {
  if (!html) return "";
  return (new DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body.textContent ?? "").trim();
}
