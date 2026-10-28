import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cx } from "./cx";

type Base = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> & {
  variant?: "primary" | "secondary" | "quiet" | "ghost" | "done";
  trailing?: ReactNode;
  block?: boolean;
};

// A disabled control always states why (README: "Disabled always states why").
export type ButtonProps = Base & ({ disabled?: false; reason?: string } | { disabled: true; reason: string });

export function Button({ variant = "secondary", trailing, block, reason, className, children, disabled, ...rest }: ButtonProps) {
  const button = (
    <button
      type="button"
      {...rest}
      disabled={disabled}
      aria-describedby={disabled && reason ? rest.id && `${rest.id}-reason` : undefined}
      className={cx(
        "halt-btn",
        variant === "primary" && "halt-btn-primary",
        variant === "quiet" && "halt-btn-quiet",
        variant === "ghost" && "halt-btn-ghost",
        variant === "done" && "halt-btn-done",
        block && "halt-btn-block",
        className,
      )}
    >
      <span>{children}</span>
      {trailing ? <span aria-hidden>{trailing}</span> : null}
    </button>
  );
  if (!disabled || !reason) return button;
  return (
    <div>
      {button}
      <div className="halt-reason" id={rest.id ? `${rest.id}-reason` : undefined}>
        {reason}
      </div>
    </div>
  );
}
