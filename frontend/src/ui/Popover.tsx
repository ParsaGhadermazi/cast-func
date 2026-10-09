/**
 * A button that opens a floating panel. The panel is fixed-positioned (so
 * toolbars with overflow cannot clip it), kept inside the viewport, closed
 * by Escape or a click outside, and returns focus to its button.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface PopoverProps {
  label: string;
  button: ReactNode;
  children: (close: () => void) => ReactNode;
  className?: string;
  buttonClassName?: string;
  title?: string;
  disabled?: boolean;
  width?: number;
}

export function Popover({ label, button, children, className, buttonClassName, title, disabled, width = 280 }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) anchor.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const rect = anchor.current.getBoundingClientRect();
    const panelWidth = Math.min(width, window.innerWidth - 24);
    setPosition({
      top: rect.bottom + 6,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - panelWidth - 12)),
    });
    panel.current?.querySelector<HTMLElement>("button, select, input")?.focus();
  }, [open, width]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !anchor.current?.contains(target)) close(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    const onResize = () => close(false);
    document.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={buttonClassName}
        aria-label={label}
        title={title ?? label}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        {button}
      </button>
      {open && (
        <div
          ref={panel}
          role="dialog"
          aria-label={label}
          className={`popover${className ? ` ${className}` : ""}`}
          style={{ ...position, width }}
        >
          {children(() => close())}
        </div>
      )}
    </>
  );
}
