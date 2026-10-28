import type { ReactNode } from "react";

import { HaltMark } from "./HaltMark";

export interface NavItem {
  id: string;
  label: string;
  index?: string;
  href?: string;
}

export interface NavProps {
  items: NavItem[];
  active?: string;
  onSelect?: (id: string) => void;
  footer?: ReactNode;
  label?: string;
  height?: number | string;
}

export function Nav({ items, active, onSelect, footer, label = "HALT systems", height }: NavProps) {
  return (
    <nav className="halt-nav" aria-label={label} style={height ? { height } : undefined}>
      <div className="halt-nav-brand">
        <HaltMark size={28} decorative />
        <b>HALT</b>
      </div>
      {items.map((it, i) => (
        <a
          key={it.id}
          href={it.href ?? "#"}
          className="halt-nav-item"
          aria-current={active === it.id ? "page" : undefined}
          onClick={
            onSelect
              ? (e) => {
                  e.preventDefault();
                  onSelect(it.id);
                }
              : undefined
          }
        >
          <span className="idx label" style={{ color: "inherit" }}>
            {it.index ?? String(i + 1).padStart(2, "0")}
          </span>
          <span>{it.label}</span>
        </a>
      ))}
      {footer ? <div className="halt-nav-foot">{footer}</div> : null}
    </nav>
  );
}
