"use client";

import { Children, cloneElement, useId, type ReactElement, type ReactNode } from "react";

import { cx } from "./cx";

export interface TooltipProps {
  content: ReactNode;
  title?: string;
  open?: boolean;
  /** One focusable child. Tooltips never carry essential text. */
  children: ReactElement<{ "aria-describedby"?: string }>;
}

export function Tooltip({ content, title, open, children }: TooltipProps) {
  const id = useId();
  return (
    <span className={cx("halt-tip-wrap", open && "halt-tip-open")}>
      {cloneElement(Children.only(children), { "aria-describedby": id })}
      <span role="tooltip" id={id} className="halt-tip">
        {title ? <span className="k">{title}</span> : null}
        {content}
      </span>
    </span>
  );
}
