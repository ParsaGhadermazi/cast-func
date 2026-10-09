/**
 * Formatting bar that floats above a text box while it is being edited.
 * Buttons act on the text selection; they never take focus away from the
 * text, so the selection survives every click.
 */

import {
  Bold, Code, Eraser, Heading1, Heading2, Italic, Link, List, ListOrdered, Minus, Pilcrow, Plus, Quote, Strikethrough, Underline,
} from "lucide-react";
import type { ReactNode } from "react";
import { useStore } from "zustand";

import { useSession } from "../app/SessionContext";
import type { Block } from "../model/types";
import { ColorField } from "../ui/controls";
import { Popover } from "../ui/Popover";
import { normalizeLinkUrl } from "./richText";
import { applyTextProperty } from "./textStyle";
import { restoreTextSelection, runTextCommand, textSession } from "./textSession";

function Tool({ label, active, onRun, children }: { label: string; active?: boolean; onRun(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`icon${active ? " on" : ""}`}
      aria-label={label}
      aria-pressed={active}
      title={label}
      // Keep focus (and the selection) in the text.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onRun}
    >
      {children}
    </button>
  );
}

export function TextToolbar({ block, slideId, left, top }: { block: Block; slideId: string; left: number; top: number }) {
  const session = useSession();
  const format = useStore(textSession, (state) => state.format);
  const block_ = format?.block ?? "p";
  const size = (delta: number) => {
    const range = textSession.getState().range;
    const base = range && !range.collapsed
      ? parseFloat(getComputedStyle(range.startContainer.parentElement ?? textSession.getState().rich!).fontSize)
      : Number(block.style.fontSize) || 18;
    applyTextProperty(session, slideId, block, "font-size", `${Math.max(6, Math.min(300, Math.round(base + delta)))}px`);
  };
  const link = () => {
    const range = restoreTextSelection();
    const url = normalizeLinkUrl(window.prompt("Link to (https://…, mailto:, or #slide)") ?? "");
    if (!url) return;
    restoreTextSelection();
    if (range?.collapsed) runTextCommand("insertHTML", `<a href="${url.replace(/"/g, "&quot;")}">${url.replace(/</g, "&lt;")}</a>`);
    else runTextCommand("createLink", url);
  };

  return (
    <div className="text-toolbar" data-native-pointer style={{ left, top }} role="toolbar" aria-label="Text formatting"
      onPointerDown={(event) => event.stopPropagation()}>
      <Tool label="Bold (Cmd/Ctrl+B)" active={format?.bold} onRun={() => runTextCommand("bold")}><Bold size={15} /></Tool>
      <Tool label="Italic (Cmd/Ctrl+I)" active={format?.italic} onRun={() => runTextCommand("italic")}><Italic size={15} /></Tool>
      <Tool label="Underline (Cmd/Ctrl+U)" active={format?.underline} onRun={() => runTextCommand("underline")}><Underline size={15} /></Tool>
      <Tool label="Strikethrough" active={format?.strike} onRun={() => runTextCommand("strikeThrough")}><Strikethrough size={15} /></Tool>
      <span className="divider" />
      <Tool label="Smaller text" onRun={() => size(-2)}><Minus size={15} /></Tool>
      <Tool label="Larger text" onRun={() => size(2)}><Plus size={15} /></Tool>
      <span onMouseDown={(event) => event.preventDefault()}>
        <Popover label="Text colour" buttonClassName="icon" width={236}
          button={<span className="color-dot" style={{ background: block.style.color || "currentColor" }} />}>
          {(close) => (
            <ColorField label="Text colour" value={undefined} onChange={(color) => {
              applyTextProperty(session, slideId, block, "color", color);
              close();
            }} />
          )}
        </Popover>
      </span>
      <span className="divider" />
      <Tool label="Heading 1" active={block_ === "h1"} onRun={() => runTextCommand("formatBlock", block_ === "h1" ? "<p>" : "<h1>")}><Heading1 size={15} /></Tool>
      <Tool label="Heading 2" active={block_ === "h2"} onRun={() => runTextCommand("formatBlock", block_ === "h2" ? "<p>" : "<h2>")}><Heading2 size={15} /></Tool>
      <Tool label="Paragraph" active={block_ === "p" || block_ === "div"} onRun={() => runTextCommand("formatBlock", "<p>")}><Pilcrow size={15} /></Tool>
      <Tool label="Bulleted list" active={format?.unorderedList} onRun={() => runTextCommand("insertUnorderedList")}><List size={15} /></Tool>
      <Tool label="Numbered list" active={format?.orderedList} onRun={() => runTextCommand("insertOrderedList")}><ListOrdered size={15} /></Tool>
      <Tool label="Quote" active={block_ === "blockquote"} onRun={() => runTextCommand("formatBlock", block_ === "blockquote" ? "<p>" : "<blockquote>")}><Quote size={15} /></Tool>
      <Tool label="Code block" active={block_ === "pre"} onRun={() => runTextCommand("formatBlock", block_ === "pre" ? "<p>" : "<pre>")}><Code size={15} /></Tool>
      <span className="divider" />
      <Tool label="Link" onRun={link}><Link size={15} /></Tool>
      <Tool label="Clear formatting" onRun={() => runTextCommand("removeFormat")}><Eraser size={15} /></Tool>
    </div>
  );
}
