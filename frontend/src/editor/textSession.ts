/**
 * The live text-editing session: which element is being edited, the last
 * text selection inside it (kept while focus visits the inspector), and the
 * formatting at the caret for the toolbar.
 */

import { createStore } from "zustand/vanilla";

import { formatState, type FormatState } from "./richText";

interface TextSessionState {
  rich: HTMLElement | null;
  range: Range | null;
  format: FormatState | null;
  /** Push the element's current HTML into the document now. */
  commit: (() => void) | null;
}

export const textSession = createStore<TextSessionState>()(() => ({ rich: null, range: null, format: null, commit: null }));

export function beginTextSession(rich: HTMLElement, commit: () => void): void {
  textSession.setState({ rich, commit, range: null, format: formatState() });
}

export function endTextSession(rich: HTMLElement): void {
  if (textSession.getState().rich === rich) textSession.setState({ rich: null, range: null, format: null, commit: null });
}

/** Remember the selection whenever it changes inside the edited element. */
export function trackTextSelection(): () => void {
  const onChange = () => {
    const { rich } = textSession.getState();
    const selection = document.getSelection();
    if (!rich || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!rich.contains(range.commonAncestorContainer)) return;
    textSession.setState({ range: range.cloneRange(), format: formatState() });
  };
  document.addEventListener("selectionchange", onChange);
  return () => document.removeEventListener("selectionchange", onChange);
}

/** Put the remembered selection back (after a click in the inspector). */
export function restoreTextSelection(): Range | null {
  const { rich, range } = textSession.getState();
  if (!rich || !range) return null;
  rich.focus({ preventScroll: true });
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  return range;
}

/** Run an editing command against the remembered selection, then sync. */
export function runTextCommand(command: string, value?: string): void {
  if (!restoreTextSelection() && !textSession.getState().rich) return;
  document.execCommand("styleWithCSS", false, "false");
  document.execCommand(command, false, value);
  textSession.getState().commit?.();
  textSession.setState({ format: formatState() });
}
