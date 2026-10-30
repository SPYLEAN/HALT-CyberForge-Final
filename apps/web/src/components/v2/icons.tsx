// Navigation icons on NodeGlyph's grid and stroke (24 units, 2 px): shapes from the HALT graph vocabulary,
// so the chrome speaks the same language as the graph. Decorative: callers always render a text label.
import type { ReactNode } from "react";

export type IconName =
  | "overview"
  | "graph"
  | "echolab"
  | "safecut"
  | "proofseal"
  | "timeline"
  | "policies"
  | "report"
  | "mission"
  | "rooms"
  | "architecture"
  | "theatre"
  | "forensic"
  | "reset"
  | "reconstruct";

const PATHS: Record<IconName, ReactNode> = {
  // An aperture inside a frame: the incident at a glance.
  overview: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 12h6M15 12h6" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  // Three entities on a thread.
  graph: (
    <>
      <circle cx="5" cy="17" r="2.2" />
      <circle cx="12" cy="7" r="2.2" />
      <circle cx="19" cy="15" r="2.2" />
      <path d="M6.6 15.4 10.6 8.8M14 8.2l3.6 5.2" />
    </>
  ),
  // One origin, three diverging futures: the Decision Horizon.
  echolab: (
    <>
      <circle cx="4" cy="12" r="2" />
      <path d="M6 12h14M6 11c5-1 9-4 14-6M6 13c5 1 9 4 14 6" />
    </>
  ),
  // Two jaws closing on a gap: the Containment Aperture.
  safecut: (
    <>
      <path d="M3 12h6M15 12h6" />
      <path d="M9 6v12M15 6v12" />
      <circle cx="12" cy="12" r="1.4" />
    </>
  ),
  // Proof signal: ring with a seated core.
  proofseal: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </>
  ),
  timeline: (
    <>
      <path d="M3 12h18" />
      <path d="M6 9v6M11 10v4M16 8v8" />
    </>
  ),
  // Constraint dials.
  policies: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="9" cy="7" r="1.8" fill="currentColor" />
      <circle cx="15" cy="12" r="1.8" fill="currentColor" />
      <circle cx="7" cy="17" r="1.8" fill="currentColor" />
    </>
  ),
  report: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M9 11h7M9 15h7M9 7h3" />
    </>
  ),
  // A landscape of services on one horizon.
  mission: (
    <>
      <path d="M3 17h18" />
      <path d="M5 17v-5h4v5M10 17V8h4v9M15 17v-7h4v7" />
    </>
  ),
  rooms: (
    <>
      <rect x="3" y="4" width="18" height="7" rx="1.5" />
      <rect x="3" y="13" width="18" height="7" rx="1.5" />
      <circle cx="7" cy="7.5" r="1.2" fill="currentColor" />
    </>
  ),
  architecture: (
    <>
      <path d="M12 3 21 8l-9 5-9-5z" />
      <path d="M3 12l9 5 9-5M3 16l9 5 9-5" />
    </>
  ),
  theatre: (
    <>
      <rect x="3" y="5" width="18" height="12" rx="1.5" />
      <path d="M10 9l5 2.5-5 2.5z" fill="currentColor" />
      <path d="M8 20h8" />
    </>
  ),
  forensic: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="M14.5 14.5 20 20M7 10h6M10 7v6" />
    </>
  ),
  reset: (
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4h4" />
    </>
  ),
  // Scattered records joined into one thread.
  reconstruct: (
    <>
      <path d="M4 6h3M4 12h3M4 18h3" />
      <path d="M11 6l4 6-4 6" />
      <circle cx="19" cy="12" r="2" />
    </>
  ),
};

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {PATHS[name]}
    </svg>
  );
}
