/**
 * DOM helpers for editing slide rich text in place.
 *
 * Text is edited in a contenteditable element; formatting uses the
 * browser's editing commands where they produce markup the sanitiser keeps,
 * and these helpers where they do not (list indentation, inline font sizes
 * and families, removing per-character overrides).
 */

// ---------------------------------------------------------------- lists

function directChildList(item: Element, tagName: string): Element | null {
  return Array.from(item.children).find((child) => child.tagName === tagName) ?? null;
}

/** Indent a list item into its previous sibling, or outdent it one level. */
export function changeListIndent(item: HTMLElement, outdent: boolean): boolean {
  const list = item.parentElement;
  if (!list || !["UL", "OL"].includes(list.tagName)) return false;
  const doc = item.ownerDocument;

  if (!outdent) {
    const previous = item.previousElementSibling;
    if (!previous || previous.tagName !== "LI") return false;
    let nested = directChildList(previous, list.tagName);
    if (!nested) {
      nested = doc.createElement(list.tagName.toLowerCase());
      previous.append(nested);
    }
    nested.append(item);
    return true;
  }

  const parentItem = list.parentElement;
  if (parentItem?.tagName !== "LI") return false;
  const outerList = parentItem.parentElement;
  if (!outerList || !["UL", "OL"].includes(outerList.tagName)) return false;
  // Items after this one become its children, so their order is kept.
  const following: Element[] = [];
  for (let sibling = item.nextElementSibling; sibling; sibling = sibling.nextElementSibling) following.push(sibling);
  outerList.insertBefore(item, parentItem.nextElementSibling);
  if (following.length) {
    let nested = directChildList(item, list.tagName);
    if (!nested) {
      nested = doc.createElement(list.tagName.toLowerCase());
      item.append(nested);
    }
    nested.append(...following);
  }
  if (!list.querySelector(":scope > li")) list.remove();
  return true;
}

export function listItemAtSelection(root: HTMLElement): HTMLElement | null {
  const anchor = root.ownerDocument.getSelection()?.anchorNode ?? null;
  const element = anchor?.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor?.parentElement;
  const item = element?.closest("li");
  return item && root.contains(item) ? (item as HTMLElement) : null;
}

// ------------------------------------------------- inline character style

export type InlineStyle = Partial<Record<"font-size" | "font-family" | "color" | "font-weight" | "font-style", string>>;

function textNodesIn(range: Range): Text[] {
  const root = range.commonAncestorContainer;
  if (root.nodeType === Node.TEXT_NODE) return [root as Text];
  const walker = root.ownerDocument!.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (range.intersectsNode(node) && node.data.length) nodes.push(node);
  }
  return nodes;
}

/**
 * Apply CSS properties to exactly the selected characters, splitting text
 * nodes at the selection edges. Returns a range covering the styled text.
 */
export function styleRange(range: Range, style: InlineStyle): Range | null {
  if (range.collapsed) return null;
  const doc = range.startContainer.ownerDocument!;
  let { startContainer, startOffset, endContainer, endOffset } = range;

  // Split the end first, so the start offset stays valid when both are the same node.
  if (endContainer.nodeType === Node.TEXT_NODE && endOffset < (endContainer as Text).length) {
    (endContainer as Text).splitText(endOffset);
  }
  if (startContainer.nodeType === Node.TEXT_NODE && startOffset > 0) {
    const tail = (startContainer as Text).splitText(startOffset);
    if (endContainer === startContainer) {
      endContainer = tail;
      endOffset -= startOffset;
    }
    startContainer = tail;
    startOffset = 0;
  }
  const exact = doc.createRange();
  exact.setStart(startContainer, startOffset);
  exact.setEnd(endContainer, endOffset);

  const nodes = textNodesIn(exact);
  if (!nodes.length) return null;
  for (const node of nodes) {
    const parent = node.parentElement;
    let span: HTMLElement;
    if (parent && parent.tagName === "SPAN" && parent.childNodes.length === 1) span = parent;
    else {
      span = doc.createElement("span");
      node.replaceWith(span);
      span.append(node);
    }
    for (const [property, value] of Object.entries(style)) span.style.setProperty(property, value ?? "");
  }
  const result = doc.createRange();
  result.setStart(nodes[0]!, 0);
  result.setEnd(nodes[nodes.length - 1]!, nodes[nodes.length - 1]!.length);
  return result;
}

const MARKER_FOR: Record<string, string> = {
  "font-size": "--marker-font-size",
  "font-family": "--marker-font-family",
  color: "--marker-color",
  "font-weight": "--marker-font-weight",
  "font-style": "--marker-font-style",
};

/**
 * Remove per-character overrides of the given properties, so a style set on
 * the whole text box takes effect everywhere. Spans left without any style
 * are unwrapped.
 */
export function stripInlineStyle(html: string, properties: (keyof InlineStyle)[]): string {
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  for (const element of Array.from(parsed.body.querySelectorAll<HTMLElement>("span, li"))) {
    for (const property of properties) {
      element.style.removeProperty(property);
      element.style.removeProperty(MARKER_FOR[property]!);
    }
    if (!element.getAttribute("style")?.trim()) element.removeAttribute("style");
    if (element.tagName === "SPAN" && !element.attributes.length) element.replaceWith(...Array.from(element.childNodes));
  }
  return parsed.body.innerHTML;
}

// ------------------------------------------------------------------ links

/** Accept http(s), mailto and in-deck anchors; bare domains get https://. */
export function normalizeLinkUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (/^(https?:|mailto:|#)/i.test(value)) return value;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(value)) return `https://${value}`;
  return null;
}

// ------------------------------------------------------------------ state

export interface FormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  block: string;
  unorderedList: boolean;
  orderedList: boolean;
}

/** The formatting at the caret, for highlighting toolbar buttons. */
export function formatState(): FormatState {
  const query = (command: string) => {
    try {
      return document.queryCommandState(command);
    } catch {
      return false;
    }
  };
  let block = "p";
  try {
    block = String(document.queryCommandValue("formatBlock") || "p").toLowerCase();
  } catch {
    // keep the default
  }
  return {
    bold: query("bold"),
    italic: query("italic"),
    underline: query("underline"),
    strike: query("strikeThrough"),
    block,
    unorderedList: query("insertUnorderedList"),
    orderedList: query("insertOrderedList"),
  };
}
