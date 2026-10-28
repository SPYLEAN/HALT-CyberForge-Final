"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

import { cx } from "./cx";

export interface DialogProps {
  title: string;
  kicker?: string;
  open?: boolean;
  inline?: boolean;
  height?: number | string;
  onClose?: () => void;
  footer?: ReactNode;
  children?: ReactNode;
}

const headline = { margin: "4px 0 0", fontFamily: "var(--font-display)", fontSize: 20, lineHeight: "26px" };
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/** Modal: traps focus, Escape closes. The scrim dims the graph but never hides it. */
export function Dialog({ title, kicker, open, inline, height, onClose, footer, children }: DialogProps) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === false) return;
    const previous = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => previous?.focus?.();
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      onClose?.();
      return;
    }
    if (e.key !== "Tab" || !box.current) return;
    const items = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (open === false) return null;
  return (
    <div className={cx("halt-scrim", !inline && "halt-scrim-fixed")} style={height ? { height } : undefined}>
      <div ref={box} className="halt-dialog" role="alertdialog" aria-modal="true" aria-label={title} onKeyDown={onKeyDown}>
        <header>
          <div>
            {kicker ? <div className="label">{kicker}</div> : null}
            <h2 className="section-headline" style={headline}>
              {title}
            </h2>
          </div>
          <button type="button" className="halt-x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </div>
    </div>
  );
}
