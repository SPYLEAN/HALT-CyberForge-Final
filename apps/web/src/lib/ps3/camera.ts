// Camera framing derived from scene bounds (no per-viewport constants). Pure: the same bounds, canvas size and
// padding always give the same camera, so Home, Reset and the initial view are one canonical view.
import type { SceneModel, SceneNode } from "./scene";

export type Vec3 = [number, number, number];
export interface Box {
  min: Vec3;
  max: Vec3;
}
export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export interface View {
  position: Vec3;
  target: Vec3;
}
export interface Viewport {
  width: number;
  height: number;
  fov: number; // vertical, degrees
  pad: Padding;
}

/** The canonical viewing direction (target → camera): slightly above, straight down the pipeline's front. */
export const CANONICAL_DIR: Vec3 = normalize([0, 0.32, 1]);
const UP: Vec3 = [0, 1, 0];
const ZONE_HEIGHT = 7.4;
const ZONE_DEPTH = 3.2;
const LABEL_TOP = ZONE_HEIGHT * 0.56 + 0.45; // zone labels sit just above each zone

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
}
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Every zone volume plus its label: the complete journey, Source to Destinations. */
export function sceneBounds(model: SceneModel): Box {
  const xs = model.zones.flatMap((z) => [z.x - z.width / 2, z.x + z.width / 2]);
  return { min: [Math.min(...xs), -ZONE_HEIGHT / 2, -ZONE_DEPTH / 2], max: [Math.max(...xs), LABEL_TOP, ZONE_DEPTH / 2] };
}

/** A box around specific nodes (e.g. everything drift affects), with room for their blocks and markers. */
export function nodesBounds(nodes: SceneNode[], margin = 1.4): Box | null {
  if (!nodes.length) return null;
  const xs = nodes.map((n) => n.position[0]);
  const ys = nodes.map((n) => n.position[1]);
  return { min: [Math.min(...xs) - margin, Math.min(...ys) - margin, -1], max: [Math.max(...xs) + margin, Math.max(...ys) + 2.2 + margin, 1] };
}

export function corners(b: Box): Vec3[] {
  const out: Vec3[] = [];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) out.push([x, y, z]);
  return out;
}

/** Project a world point to canvas pixels for a camera at `position` looking at `target`. */
export function project(p: Vec3, view: View, vp: Viewport): { x: number; y: number; behind: boolean } {
  const f = normalize(sub(view.target, view.position));
  const r = normalize(cross(f, UP));
  const u = cross(r, f);
  const v = sub(p, view.position);
  const z = dot(v, f);
  const t = Math.tan((vp.fov * Math.PI) / 360);
  const aspect = vp.width / vp.height;
  const xn = dot(v, r) / (z * t * aspect);
  const yn = dot(v, u) / (z * t);
  return { x: ((xn + 1) / 2) * vp.width, y: ((1 - yn) / 2) * vp.height, behind: z <= 0 };
}

export function fits(box: Box, view: View, vp: Viewport, slack = 0.5): boolean {
  return corners(box).every((c) => {
    const p = project(c, view, vp);
    return !p.behind && p.x >= vp.pad.left - slack && p.x <= vp.width - vp.pad.right + slack && p.y >= vp.pad.top - slack && p.y <= vp.height - vp.pad.bottom + slack;
  });
}

function extents(box: Box, view: View, vp: Viewport) {
  const ps = corners(box).map((c) => project(c, view, vp));
  const xs = ps.map((p) => p.x);
  const ys = ps.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/**
 * The closest camera on `dir` from the box centre at which the whole box lies inside the padded viewport,
 * shifted so the box sits in the middle of the padded area (padding may be asymmetric: overlays, minimap).
 */
export function frameBox(box: Box, vp: Viewport, dir: Vec3 = CANONICAL_DIR): View {
  const centre: Vec3 = scale(add(box.min, box.max), 0.5);
  const availW = vp.width - vp.pad.left - vp.pad.right;
  const availH = vp.height - vp.pad.top - vp.pad.bottom;
  const at = (d: number): View => ({ position: add(centre, scale(dir, d)), target: centre });
  const spanFits = (d: number) => {
    const e = extents(box, at(d), vp);
    return e.maxX - e.minX <= availW && e.maxY - e.minY <= availH;
  };
  let lo = 0.5;
  let hi = 400;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (spanFits(mid)) hi = mid;
    else lo = mid;
  }
  let d = hi;
  for (let attempt = 0; attempt < 40; attempt++) {
    const base = at(d);
    const e = extents(box, base, vp);
    const wpp = (2 * d * Math.tan((vp.fov * Math.PI) / 360)) / vp.height; // world units per pixel at the centre's depth
    const f = normalize(sub(base.target, base.position));
    const r = normalize(cross(f, UP));
    const u = cross(r, f);
    const dx = ((e.minX + e.maxX) / 2 - (vp.pad.left + availW / 2)) * wpp;
    const dy = ((e.minY + e.maxY) / 2 - (vp.pad.top + availH / 2)) * wpp;
    const shift = add(scale(r, dx), scale(u, -dy));
    const view: View = { position: add(base.position, shift), target: add(base.target, shift) };
    if (fits(box, view, vp)) return view;
    d *= 1.03;
  }
  return at(d);
}

/** Overlay space the canvas must keep clear: camera buttons on top, the minimap bottom-left. */
export function overlayPadding(width: number, height: number, minimap: boolean): Padding {
  const edge = Math.max(16, Math.round(width * 0.03));
  return { top: 64, right: edge, bottom: minimap ? Math.min(140, Math.round(height * 0.2)) : edge, left: edge };
}
