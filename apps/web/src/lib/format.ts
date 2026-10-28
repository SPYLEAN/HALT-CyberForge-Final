import type { Derivation } from "./api/types";

/** Replay offset as T+mm:ss. */
export function replayTime(t: number): string {
  const s = Math.max(0, Math.round(t));
  return `T+${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Wall-clock UTC for a replay offset, e.g. "09:47:03Z". */
export function utcAt(t0: string, t: number): string {
  const d = new Date(new Date(t0).getTime() + t * 1000);
  return `${d.toISOString().slice(11, 19)}Z`;
}

export function utcTime(iso: string): string {
  return `${new Date(iso).toISOString().slice(11, 19)}Z`;
}

/** "4,335 of 6,000" style counts: never a bare percentage. */
export function count(d: Derivation): string {
  const n = d.numerator ?? 0;
  return d.denominator != null ? `${n.toLocaleString("en-GB")} of ${d.denominator.toLocaleString("en-GB")}` : n.toLocaleString("en-GB");
}
