// PS2 extension palette (docs/PS2_LANDING_MATERIAL_LIGHTING_SPEC.md §2), a token source beside tokens.ts:
// the single place these values live (components hold no colour literals, AT-7.2).
// Applied as CSS variables on the PS2 workspace root only and passed to Cytoscape as literals (the canvas
// cannot read CSS variables). Ember and Bone are the brand tokens; cyan, violet and gold are the PS2 extension.
import type { CSSProperties } from "react";

import { color } from "@/styles/tokens";

export const ps2Palette = {
  proof: "#4CC9D6",
  forecast: "#9B87F5",
  continuity: "#D8A73B",
  threat: color.dark["threat-observed"],
  bone: color.dark.text,
  inferred: "rgba(241, 240, 234, 0.6)",
  neutral: color.dark["border-strong"],
  faint: color.dark.line,
  bg: color.dark.bg,
  text2: color.dark["text-secondary"],
} as const;

export const ps2Vars: CSSProperties = {
  ["--ps2-proof" as string]: ps2Palette.proof,
  ["--ps2-forecast" as string]: ps2Palette.forecast,
  ["--ps2-continuity" as string]: ps2Palette.continuity,
  ["--ps2-threat" as string]: ps2Palette.threat,
  ["--ps2-inferred" as string]: ps2Palette.inferred,
};
