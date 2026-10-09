import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { useEffect, useState } from "react";

import { useDoc, useSession } from "../app/SessionContext";
import { patchStyle } from "../editor/operations";
import { applyTextPropertyToBlocks } from "../editor/textStyle";
import type { Block } from "../model/types";
import { CODE_FONT } from "../render/text";
import { ColorField, RangeField, Row, Segmented, SelectField, shared, Toggle } from "../ui/controls";
import { useStyleEdit } from "./useStyleEdit";

export const FONTS: readonly (readonly [string, string])[] = [
  ["-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif", "System"],
  ["'Inter',sans-serif", "Inter"],
  ["'Poppins',sans-serif", "Poppins"],
  ["'Playfair Display',serif", "Playfair Display"],
  ["Georgia,'Times New Roman',serif", "Georgia"],
  ["'Roboto Mono',ui-monospace,monospace", "Roboto Mono"],
];

const WEIGHTS = [["normal", "Regular"], ["600", "Semibold"], ["bold", "Bold"]] as const;

/** Commit-on-Enter number input for font size. */
function SizeField({ value, onCommit }: { value: number | undefined; onCommit(size: number): void }) {
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [value]);
  const commit = () => {
    const size = Number(draft);
    if (draft !== null && Number.isFinite(size) && size >= 6 && size <= 300) onCommit(Math.round(size));
    setDraft(null);
  };
  return (
    <input type="number" aria-label="Font size" min={6} max={300} className="size-field"
      placeholder={value === undefined ? "Mixed" : undefined}
      value={draft ?? (value === undefined ? "" : String(value))}
      onChange={(event) => setDraft(event.target.value)} onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }} />
  );
}

export function TextSection({ slideId, blocks, editing }: { slideId: string; blocks: Block[]; editing: boolean }) {
  const session = useSession();
  const theme = useDoc((state) => state.doc.theme);
  const ids = blocks.map((block) => block.id);
  const edit = useStyleEdit(slideId, ids);
  const pick = (key: string) => shared(blocks.map((block) => block.style[key]));
  const code = shared(blocks.map((block) => block.style.textVariant === "code"));
  const apply = (property: Parameters<typeof applyTextPropertyToBlocks>[3], value: string) =>
    applyTextPropertyToBlocks(session, slideId, blocks, property, value);
  const fonts = theme.font && !FONTS.some(([value]) => value === theme.font) ? [[theme.font, theme.font] as const, ...FONTS] : FONTS;
  const fontValue = (pick("fontFamily") as string | undefined) ?? (code ? CODE_FONT : "");

  const setVariant = (variant: "plain" | "code") =>
    session.doc.getState().transact("Text style", (draft) =>
      patchStyle(draft, slideId, ids, variant === "code"
        ? { textVariant: "code", fontFamily: CODE_FONT, fontSize: 16, lineHeight: 1.55, color: "#e5e7eb", bg: "#111827", align: "left", weight: "normal", italic: false }
        : { textVariant: "plain", fontFamily: undefined, fontSize: 18, lineHeight: 1.45, color: undefined, bg: "transparent", weight: undefined, italic: false }));

  return (
    <section className="panel-section">
      <h3>Text</h3>
      {editing && <p className="hint scope-hint">Selected characters change; with nothing selected, the whole box does.</p>}
      <Row label="Style">
        <Segmented label="Text style" value={code === undefined ? undefined : code ? "code" : "plain"}
          options={[["plain", "Plain", "Plain text"], ["code", "Code", "Code block"]] as const} onChange={setVariant} />
      </Row>
      <Row label="Font">
        <select aria-label="Font" value={fontValue} onChange={(event) => apply("font-family", event.target.value)}>
          <option value="">Theme font</option>
          {fonts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </Row>
      <Row label="Size">
        <SizeField value={(pick("fontSize") as number | undefined) ?? (code ? 16 : 18)} onCommit={(size) => apply("font-size", `${size}px`)} />
        <SelectField label="Weight" value={(pick("weight") as typeof WEIGHTS[number][0] | undefined) ?? "normal"} options={WEIGHTS}
          onChange={(weight) => apply("font-weight", weight)} />
      </Row>
      <Row label="Colour">
        <ColorField label="Text colour" accent={theme.accent} value={(pick("color") as string | undefined) ?? theme.fg}
          onChange={(color) => apply("color", color)} />
      </Row>
      <Row label="Align">
        <Segmented label="Alignment" value={(pick("align") as "left" | "center" | "right" | undefined) ?? "left"}
          options={[["left", <AlignLeft size={15} />, "Align left"], ["center", <AlignCenter size={15} />, "Centre"], ["right", <AlignRight size={15} />, "Align right"]] as const}
          onChange={(align) => edit({ align }, "Align text")} />
        <Toggle label="Italic" checked={pick("italic") as boolean | undefined} onChange={(italic) => apply("font-style", italic ? "italic" : "normal")} />
      </Row>
      <Row label="Spacing">
        <RangeField label="Line height" min={0.8} max={3} step={0.05} value={(pick("lineHeight") as number | undefined) ?? (code ? 1.55 : 1.45)}
          format={(v) => v.toFixed(2)} onChange={(lineHeight) => edit({ lineHeight }, "Line height")} />
      </Row>
      <Row label="Fill">
        <ColorField label="Background" accent={theme.accent} allowNone value={(pick("bg") as string | undefined) ?? (code ? "#111827" : "transparent")}
          onChange={(bg) => edit({ bg }, "Text background")} />
      </Row>
    </section>
  );
}
