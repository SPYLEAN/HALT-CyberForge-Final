"use client";

import { useState, type KeyboardEvent } from "react";

export interface TabItem {
  id: string;
  label: string;
  count?: string | number;
}

export interface TabsProps {
  items: TabItem[];
  value?: string;
  onChange?: (id: string) => void;
  label?: string;
}

export function Tabs({ items, value, onChange, label }: TabsProps) {
  const [own, setOwn] = useState(value ?? items[0]?.id);
  const current = value ?? own;

  function pick(id: string) {
    onChange?.(id);
    if (value === undefined) setOwn(id);
  }

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const n = (i + step + items.length) % items.length;
    const next = items[n];
    if (!next) return;
    pick(next.id);
    (e.currentTarget.parentElement?.children[n] as HTMLElement | undefined)?.focus();
  }

  return (
    <div className="halt-tabs" role="tablist" aria-label={label}>
      {items.map((it, i) => {
        const on = current === it.id;
        return (
          <button
            key={it.id}
            role="tab"
            type="button"
            className="halt-tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => pick(it.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <span>{it.label}</span>
            {it.count != null ? <span className="count">{it.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
