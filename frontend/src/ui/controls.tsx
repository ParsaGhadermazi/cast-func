/** Small form controls for the inspector. */

import { useEffect, useState, type ReactNode } from "react";

export function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="row" title={hint}>
      <span className="row-label">{label}</span>
      <div className="row-control">{children}</div>
    </div>
  );
}

const SWATCHES = ["#5b8cff", "#111827", "#ffffff", "#ef4444", "#f59e0b", "#16a34a", "#06b6d4", "#a855f7"];

/** Colour swatches, a picker, and optionally "none". `value` undefined means mixed. */
export function ColorField({ label, value, onChange, allowNone = false, accent }: {
  label: string;
  value: string | undefined;
  onChange(value: string): void;
  allowNone?: boolean;
  accent?: string;
}) {
  const none = value === "transparent" || value === "none";
  const swatches = accent && !SWATCHES.includes(accent) ? [accent, ...SWATCHES.slice(1)] : SWATCHES;
  const hex = value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  return (
    <div className="color-field">
      <div className="swatches">
        {allowNone && (
          <button type="button" className={`swatch none${none ? " on" : ""}`} aria-label={`${label}: none`} title="None" onClick={() => onChange("transparent")} />
        )}
        {swatches.map((color) => (
          <button
            key={color}
            type="button"
            className={`swatch${value?.toLowerCase() === color ? " on" : ""}`}
            style={{ background: color }}
            aria-label={`${label}: ${color}`}
            title={color}
            onClick={() => onChange(color)}
          />
        ))}
        <input type="color" aria-label={`${label}: custom colour`} value={hex} onChange={(event) => onChange(event.target.value)} />
      </div>
      {value === undefined && <span className="mixed">Mixed</span>}
    </div>
  );
}

export function RangeField({ label, value, min, max, step = 1, onChange, format = (v) => String(v) }: {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  step?: number;
  onChange(value: number): void;
  format?: (value: number) => string;
}) {
  return (
    <span className="range-field">
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value ?? min}
        onChange={(event) => onChange(Number(event.target.value))} />
      <output>{value === undefined ? "–" : format(value)}</output>
    </span>
  );
}

export function SelectField<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T | undefined;
  options: readonly (readonly [T, string])[];
  onChange(value: T): void;
}) {
  return (
    <select aria-label={label} value={value ?? ""} onChange={(event) => onChange(event.target.value as T)}>
      {value === undefined && <option value="" disabled>Mixed</option>}
      {options.map(([option, text]) => (
        <option key={option} value={option}>{text}</option>
      ))}
    </select>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T | undefined;
  options: readonly (readonly [T, ReactNode, string])[];
  onChange(value: T): void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([option, content, title]) => (
        <button key={option} type="button" role="radio" aria-checked={value === option} aria-label={title} title={title}
          className={value === option ? "on" : ""} onClick={() => onChange(option)}>
          {content}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean | undefined; onChange(value: boolean): void }) {
  return (
    <label className="toggle-field">
      <input
        type="checkbox"
        checked={!!checked}
        ref={(node) => {
          if (node) node.indeterminate = checked === undefined;
        }}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

/** Text input that commits on Enter or blur. */
export function TextField({ label, value, onCommit, placeholder }: {
  label: string; value: string; onCommit(value: string): void; placeholder?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [value]);
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <input type="text" aria-label={label} placeholder={placeholder} value={draft ?? value}
      onChange={(event) => setDraft(event.target.value)} onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") setDraft(null);
      }} />
  );
}

/** The shared value of a key across several objects, or undefined when mixed. */
export function shared<T>(values: T[]): T | undefined {
  return values.every((value) => value === values[0]) ? values[0] : undefined;
}
