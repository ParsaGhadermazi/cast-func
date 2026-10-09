import { Copy, Trash2 } from "lucide-react";

import { useDoc, useSession } from "../app/SessionContext";
import { deleteSlideCommand, duplicateSlideCommand } from "../editor/commands";
import { setSlideBackground } from "../editor/slides";
import type { Slide, Theme } from "../model/types";
import { ColorField, Row } from "../ui/controls";
import { FONTS } from "./TextSection";

export const THEME_PRESETS: readonly [string, Theme][] = [
  ["Studio", { accent: "#5b8cff", bg: "#ffffff", fg: "#1a1d24", font: "'Inter',sans-serif" }],
  ["Paper", { accent: "#0f766e", bg: "#fbfaf7", fg: "#22201c", font: "Georgia,'Times New Roman',serif" }],
  ["Night", { accent: "#f59e0b", bg: "#111827", fg: "#f8fafc", font: "'Poppins',sans-serif" }],
  ["Mint", { accent: "#16a34a", bg: "#f3fff8", fg: "#14342b", font: "'Inter',sans-serif" }],
];

export function ThemeEditor() {
  const session = useSession();
  const theme = useDoc((state) => state.doc.theme);
  const set = (patch: Partial<Theme>, label = "Edit theme") =>
    session.doc.getState().transact(label, (draft) => Object.assign(draft.theme, patch), {
      mergeKey: `theme:${Object.keys(patch).join(",")}`,
      mergeWindowMs: 800,
    });
  const fonts = theme.font && !FONTS.some(([value]) => value === theme.font) ? [[theme.font, theme.font] as const, ...FONTS] : FONTS;
  return (
    <div className="theme-editor">
      <div className="theme-presets">
        {THEME_PRESETS.map(([name, preset]) => {
          const active = (Object.keys(preset) as (keyof Theme)[]).every((key) => theme[key] === preset[key]);
          return (
            <button key={name} type="button" className={`theme-card${active ? " on" : ""}`} aria-pressed={active}
              style={{ background: preset.bg, color: preset.fg, fontFamily: preset.font }}
              onClick={() => session.doc.getState().transact(`Theme: ${name}`, (draft) => { draft.theme = { ...preset }; })}>
              <span className="theme-bar" style={{ background: preset.accent }} />
              <span>{name}</span>
            </button>
          );
        })}
      </div>
      <Row label="Accent"><ColorField label="Accent colour" value={theme.accent} onChange={(accent) => set({ accent })} /></Row>
      <Row label="Background"><ColorField label="Slide background" value={theme.bg} onChange={(bg) => set({ bg })} /></Row>
      <Row label="Text"><ColorField label="Text colour" value={theme.fg} onChange={(fg) => set({ fg })} /></Row>
      <Row label="Font">
        <select aria-label="Theme font" value={theme.font} onChange={(event) => set({ font: event.target.value }, "Theme font")}>
          {fonts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </Row>
    </div>
  );
}

export function SlidePanel({ slide, index }: { slide: Slide; index: number }) {
  const session = useSession();
  const theme = useDoc((state) => state.doc.theme);
  return (
    <>
      <section className="panel-section">
        <h3>Slide {index + 1}</h3>
        <Row label="Background">
          <ColorField label="Slide background" accent={theme.accent} value={slide.background ?? theme.bg}
            onChange={(color) => session.doc.getState().transact("Slide background", (draft) => setSlideBackground(draft, slide.id, color), {
              mergeKey: `slide-bg:${slide.id}`, mergeWindowMs: 800,
            })} />
        </Row>
        {slide.background && (
          <button type="button" className="link-button" onClick={() =>
            session.doc.getState().transact("Slide background", (draft) => setSlideBackground(draft, slide.id, null))}>
            Use the theme background
          </button>
        )}
        <div className="button-row">
          <button type="button" onClick={() => duplicateSlideCommand(session, slide.id)}><Copy size={14} /> Duplicate slide</button>
          <button type="button" onClick={() => deleteSlideCommand(session, slide.id)}><Trash2 size={14} /> Delete</button>
        </div>
        <p className="hint">
          {slide.blocks.length} object{slide.blocks.length === 1 ? "" : "s"}. Click to select, drag on empty space to select
          several, Tab to step through them. Press ? for all shortcuts.
        </p>
      </section>
      <section className="panel-section">
        <h3>Presentation theme</h3>
        <ThemeEditor />
      </section>
    </>
  );
}
