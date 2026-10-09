/**
 * In-place rich text editing on the slide.
 *
 * The editable element is the same box model as the rendered text, so
 * nothing shifts between viewing and editing. React never rewrites its DOM
 * while editing (that would move the caret); instead the HTML is sanitised
 * and written to the document shortly after each change. The whole session
 * is one undo step, and the box grows to fit what you type.
 */

import { useCallback, useLayoutEffect, useMemo, useRef } from "react";

import { useSession } from "../app/SessionContext";
import { plainTextFromHtml, plainTextToHtml, sanitizeRichHtml } from "../model/sanitize";
import { SLIDE_HEIGHT, type Block } from "../model/types";
import { isCodeText, richStyle, syncListMarkers, textBackground } from "../render/text";
import { deleteBlocks, slideById } from "./operations";
import { changeListIndent, listItemAtSelection } from "./richText";
import { beginTextSession, endTextSession, textSession } from "./textSession";

function placeCaret(rich: HTMLElement, caret?: { x: number; y: number }, selectAll?: boolean): void {
  const selection = document.getSelection();
  if (!selection) return;
  let range: Range | null = null;
  if (caret && !selectAll) {
    const doc = document as Document & { caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null };
    if (doc.caretRangeFromPoint) range = doc.caretRangeFromPoint(caret.x, caret.y);
    else if (doc.caretPositionFromPoint) {
      const position = doc.caretPositionFromPoint(caret.x, caret.y);
      if (position) {
        range = document.createRange();
        range.setStart(position.offsetNode, position.offset);
      }
    }
    if (range && !rich.contains(range.startContainer)) range = null;
  }
  if (!range) {
    range = document.createRange();
    range.selectNodeContents(rich);
    if (!selectAll) range.collapse(false);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

export function TextEditor({ block, slideId, caret, selectAll }: {
  block: Block;
  slideId: string;
  caret?: { x: number; y: number };
  selectAll?: boolean;
}) {
  const session = useSession();
  const rich = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(block);
  latest.current = block;
  // One merge key per editing session: everything typed is one undo step.
  const mergeKey = useMemo(() => `text:${block.id}:${Math.random().toString(36).slice(2)}`, [block.id]);

  const commit = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const element = rich.current;
    const frame = body.current;
    if (!element || !frame) return;
    const current = latest.current;
    const content = sanitizeRichHtml(element.innerHTML);
    // Grow the box to fit the text (never shrink it automatically).
    const scale = (current.h * SLIDE_HEIGHT) / Math.max(frame.offsetHeight, 1);
    const padding = frame.offsetHeight - frame.clientHeight + parseFloat(getComputedStyle(frame).paddingTop) + parseFloat(getComputedStyle(frame).paddingBottom);
    const needed = ((element.scrollHeight + padding) * scale) / SLIDE_HEIGHT;
    const grow = !isCodeText(current.style) && needed > current.h + 0.002 ? Math.min(needed, 1) : null;
    if (content === current.content && grow === null) return;
    session.doc.getState().transact(
      "Edit text",
      (draft) => {
        const target = slideById(draft, slideId)?.blocks.find((candidate) => candidate.id === current.id);
        if (!target) return;
        target.content = content;
        if (grow !== null) {
          target.h = grow;
          target.y = Math.min(target.y, 1 - grow);
        }
      },
      { mergeKey },
    );
  }, [session, slideId, mergeKey]);

  const scheduleCommit = () => {
    if (rich.current) syncListMarkers(rich.current);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(commit, 250);
  };

  useLayoutEffect(() => {
    const element = rich.current!;
    element.innerHTML = latest.current.content ?? "";
    syncListMarkers(element);
    element.focus({ preventScroll: true });
    placeCaret(element, caret, selectAll);
    beginTextSession(element, commit);
    return () => {
      commit();
      endTextSession(element);
      const doc = session.doc.getState();
      doc.sealHistory();
      // Leaving a text box with nothing in it removes it, as in Keynote.
      const current = slideById(doc.doc, slideId)?.blocks.find((candidate) => candidate.id === latest.current.id);
      if (current && !plainTextFromHtml(current.content) && !/<(li|hr)\b/i.test(current.content ?? "")) {
        doc.transact("Delete empty text", (draft) => deleteBlocks(draft, slideId, [current.id]));
      }
    };
    // Mount once per editing session; later renders must not touch the DOM.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={body} className={`body text editing${isCodeText(block.style) ? " code-text" : ""}`} style={{ background: textBackground(block.style) }}>
      <div
        ref={rich}
        className="rich"
        data-native-pointer
        contentEditable
        suppressContentEditableWarning
        spellCheck
        role="textbox"
        aria-multiline="true"
        aria-label="Text"
        style={richStyle(block.style)}
        onInput={scheduleCommit}
        onBlur={(event) => {
          // Moving focus into the inspector or format bar keeps the session.
          const next = event.relatedTarget as Element | null;
          if (next?.closest(".sidebar, .text-toolbar, .popover")) return;
          if (session.ui.getState().editing?.kind === "text") session.ui.getState().stopEditing();
        }}
        onKeyDown={(event) => {
          if (event.key === "Tab" && !event.metaKey && !event.ctrlKey && !event.altKey) {
            const item = listItemAtSelection(rich.current!);
            event.preventDefault();
            if (item && changeListIndent(item, event.shiftKey)) {
              const range = document.createRange();
              range.selectNodeContents(item.firstChild ?? item);
              range.collapse(false);
              document.getSelection()?.removeAllRanges();
              document.getSelection()?.addRange(range);
              scheduleCommit();
            }
          }
        }}
        onPaste={(event) => {
          // Keep only markup the slide format supports.
          event.preventDefault();
          const html = event.clipboardData.getData("text/html");
          const text = event.clipboardData.getData("text/plain");
          document.execCommand("insertHTML", false, sanitizeRichHtml(html || plainTextToHtml(text)));
          scheduleCommit();
        }}
      />
    </div>
  );
}

/** Force any pending text into the document (before undo, save, etc.). */
export function flushTextEditing(): void {
  textSession.getState().commit?.();
}
