// HALT's proprietary motifs (docs/UI_V2_SPEC.md §4). Pure SVG, palette tokens only, end-state first: every
// animation is a CSS class that `prefers-reduced-motion` removes, leaving the finished form.
import type { CSSProperties, ReactNode } from "react";

/**
 * Containment Aperture: two jaws from the HALT mark's crossbar closing on a gap.
 *   proposed  = jaws in, gap open, dashed (a plan exists, nothing applied)
 *   sealed    = jaws in, proof signal seated in the gap (the plan is proven)
 *   applied   = jaws closed on the hostile line, proof signal seated
 *   none      = jaws apart, dashed: there is no safe cut (infeasible)
 */
export type ApertureState = "idle" | "proposed" | "sealed" | "applied" | "none";

export function Aperture({ state, size = 160, label }: { state: ApertureState; size?: number; label: string }) {
  const gap = state === "applied" ? 10 : state === "none" ? 44 : 24;
  const dashed = state === "proposed" || state === "none" || state === "idle";
  const jaw = (x: number) => (
    <rect x={x} y={20} width={14} height={120} rx={2} fill="none" stroke="var(--v2-text)" strokeWidth={3} strokeDasharray={dashed ? "8 6" : undefined} />
  );
  return (
    <svg
      viewBox="0 0 160 160"
      width={size}
      height={size}
      className={`v2-aperture v2-aperture-${state}`}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      <g className="v2-aperture-jaws" style={{ "--gap": `${gap}px` } as CSSProperties}>
        {jaw(80 - gap / 2 - 14)}
        {jaw(80 + gap / 2)}
      </g>
      {state === "sealed" || state === "applied" ? <ProofSignal cx={80} cy={80} r={state === "applied" ? 7 : 10} /> : null}
    </svg>
  );
}

/** Proof Signal: Bone ring, Verdigris core. Only ever rendered for a verified claim or a sealed cut. */
export function ProofSignal({ cx, cy, r = 9, enter = true }: { cx: number; cy: number; r?: number; enter?: boolean }) {
  return (
    <g className={enter ? "proof-ring proof-ring-enter" : "proof-ring"}>
      <circle className="ring-gap" cx={cx} cy={cy} r={r + 1.5} fill="var(--v2-page)" />
      <circle className="ring-stroke" cx={cx} cy={cy} r={r} fill="none" stroke="var(--v2-proof-ring)" strokeWidth={Math.max(2, r / 3.5)} pathLength={1} />
      <circle className="ring-core" cx={cx} cy={cy} r={r * 0.36} fill="var(--v2-proof-core)" />
    </g>
  );
}

/** A standalone proof signal glyph for text flow (claims, report). */
export function ProofGlyph({ verified, size = 22, title }: { verified: boolean; size?: number; title: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={title}>
      {verified ? (
        <>
          <circle cx="12" cy="12" r="8.5" fill="none" stroke="var(--v2-proof-ring)" strokeWidth="2.5" />
          <circle cx="12" cy="12" r="3.2" fill="var(--v2-proof-core)" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="8.5" fill="none" stroke="var(--v2-text-2)" strokeWidth="2" strokeDasharray="3 3" />
          <path d="M8 8l8 8M16 8l-8 8" stroke="var(--v2-text)" strokeWidth="2" />
        </>
      )}
    </svg>
  );
}

/** Continuity Pulse: an unbroken 8 px Verdigris thread with a travelling dash. */
export function ContinuityPath({ d, live = true }: { d: string; live?: boolean }) {
  return (
    <g>
      <path d={d} fill="none" stroke="var(--v2-continuity)" strokeWidth={8} strokeOpacity={0.55} strokeLinecap="round" />
      {live ? <path className="halt-edge-pulse" d={d} fill="none" stroke="var(--v2-continuity)" strokeWidth={8} strokeLinecap="round" strokeDasharray="24 96" /> : null}
    </g>
  );
}

/** A hostile pathway in its three forms: observed (solid), forecast (dotted, marching), and held (cut). */
export function ThreatPath({ d, form, cutAt }: { d: string; form: "observed" | "forecast" | "inferred" | "held"; cutAt?: number }) {
  const common = { fill: "none", strokeLinecap: "round" as const };
  if (form === "inferred") return <path d={d} {...common} stroke="var(--v2-uncertain)" strokeWidth={1.5} strokeDasharray="6 4" />;
  if (form === "held") return <path d={d} {...common} stroke="var(--threat-held)" strokeWidth={3} />;
  return (
    <path
      d={d}
      {...common}
      className={form === "forecast" ? "v2-march" : undefined}
      stroke="var(--v2-threat)"
      strokeWidth={form === "observed" ? 3 : 2}
      strokeDasharray={form === "forecast" ? "2 6" : cutAt ? undefined : undefined}
    />
  );
}

/** Safe Envelope: the hairline boundary around what stays operational after containment. */
export function SafeEnvelope({ x, y, w, h, label }: { x: number; y: number; w: number; h: number; label?: string }) {
  return (
    <g className="v2-envelope">
      <rect x={x} y={y} width={w} height={h} rx={10} fill="var(--v2-continuity-wash)" stroke="var(--v2-continuity)" strokeWidth={1.25} strokeDasharray="1 0" />
      {label ? (
        <text x={x + 12} y={y + 20} fill="var(--v2-continuity-text)" fontSize={12.5} fontFamily="var(--font-display)" letterSpacing="0.06em">
          {label.toUpperCase()}
        </text>
      ) : null}
    </g>
  );
}

/** Thread Lattice backdrop: a faint 1 px lattice in `line`, the environmental texture of every focal canvas. */
export function Lattice({ id = "lattice" }: { id?: string }) {
  return (
    <svg aria-hidden className="v2-lattice" width="100%" height="100%" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <defs>
        <pattern id={id} width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M48 0H0V48" fill="none" stroke="var(--v2-border)" strokeWidth="1" opacity="0.55" />
          <circle cx="0" cy="0" r="1.2" fill="var(--v2-border-strong)" opacity="0.35" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

/** A labelled stage surface with the focal light falloff and lattice. */
export function Stage({ children, label, minHeight, style }: { children: ReactNode; label: string; minHeight?: number | string; style?: CSSProperties }) {
  return (
    <section className="v2-stage" aria-label={label} style={{ minHeight, ...style }}>
      <Lattice id={`lattice-${label.replace(/\W+/g, "-").toLowerCase()}`} />
      <div style={{ position: "relative" }}>{children}</div>
    </section>
  );
}
