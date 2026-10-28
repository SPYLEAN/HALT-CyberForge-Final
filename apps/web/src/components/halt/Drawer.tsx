"use client";

import { useEffect, type ReactNode } from "react";

import { cx } from "./cx";

export interface DrawerProps {
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

/** Non-modal: the graph and the business thread stay usable behind it. Escape closes. */
export function Drawer({ title, kicker, open, inline, height, onClose, footer, children }: DrawerProps) {
  useEffect(() => {
    if (open === false || !onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (open === false) return null;
  return (
    <aside
      className={cx("halt-drawer", !inline && "halt-drawer-fixed")}
      role="dialog"
      aria-label={title}
      aria-modal="false"
      style={height ? { height } : undefined}
    >
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
    </aside>
  );
}
