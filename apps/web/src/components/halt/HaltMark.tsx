// The approved icon geometry (01-brand-assets/paths.json "full", copied by scripts/copy-brand.mjs),
// drawn in currentColor. Never recoloured.
import paths from "./mark-paths.json";

export const MIN_MARK_SIZE = 24;

export interface HaltMarkProps {
  size?: number;
  decorative?: boolean;
  color?: string;
}

export function HaltMark({ size = 32, decorative, color }: HaltMarkProps) {
  const height = Math.max(size, MIN_MARK_SIZE); // brand rule: never under 24px
  return (
    <svg
      width={(height * 64) / 84}
      height={height}
      viewBox="16 6 64 84"
      role="img"
      aria-label={decorative ? undefined : "HALT"}
      aria-hidden={decorative ? true : undefined}
      style={{ display: "block", flex: "none", color: color ?? "currentColor" }}
    >
      <path fill="currentColor" fillRule="evenodd" d={paths.full} />
    </svg>
  );
}
