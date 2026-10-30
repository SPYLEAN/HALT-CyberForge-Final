// Atlas state as a pure reducer. Every update is computed from the latest state (never a stale closure), and
// the synchronisation rules live here, in one place:
//   selecting a stage  → opens the panel that explains it and moves the payload to that stage
//   moving the payload → selects the stage it is at, and shows its evidence (Payload Flight)
//   selecting another connector's stage → switches connector first
// The URL mirrors this state (see components/ps3/hooks.ts); it is not the source of truth during interaction.
import { clampQuery, deriveAtlas, laneNodeId, reachableSteps, type Atlas, type AtlasQuery, type Panel } from "./atlas";
import type { Fixtures, Zone } from "./engine";
import { pipelineOrder } from "./scene";

export type Patch = Partial<AtlasQuery> | ((q: AtlasQuery, atlas: Atlas) => Partial<AtlasQuery>);
export type HistoryMode = "push" | "replace" | "none";

export interface AtlasStoreState {
  q: AtlasQuery;
  atlas: Atlas;
  mode: HistoryMode; // how the last change should reach browser history
  focus: { node: string | null; seq: number }; // explicit selections ask the camera to frame the object
}

export type AtlasAction =
  | { type: "patch"; patch: Patch; mode?: HistoryMode; focus?: boolean }
  | { type: "load"; q: AtlasQuery };

export const PANEL_FOR: Record<Zone, Panel> = { source: "lens", acquisition: "flight", transformation: "mapping", validation: "flight", destination: "proof" };

export function initialState(fx: Fixtures, q: AtlasQuery): AtlasStoreState {
  return { q, atlas: deriveAtlas(fx, q), mode: "none", focus: { node: null, seq: 0 } };
}

/** Which connector lane a node id belongs to (shared destinations belong to whichever lane is selected). */
function connectorOf(fx: Fixtures, node: string): string | null {
  const slash = node.indexOf("/");
  if (slash === -1) return null;
  const c = node.slice(0, slash);
  return fx.connectors.some((x) => x.id === c) ? c : null;
}

function stepIndex(atlas: Atlas, q: AtlasQuery, node: string): number | null {
  const rec = atlas.trace.records[q.record];
  if (!rec) return null;
  const stage = node.includes("/") ? node.slice(node.indexOf("/") + 1) : node;
  const i = rec.steps.findIndex((s) => s.stage_id === stage);
  return i === -1 ? null : i;
}

export function applyPatch(fx: Fixtures, s: AtlasStoreState, raw: Patch): { q: AtlasQuery; atlas: Atlas } {
  const patch = typeof raw === "function" ? raw(s.q, s.atlas) : raw;
  const q0 = s.q;
  let merged: AtlasQuery = { ...q0, ...patch };

  // A node on another connector's lane switches connector (and resets that connector's run state).
  const owner = patch.node ? connectorOf(fx, patch.node) : null;
  if (owner && owner !== q0.connector && patch.connector === undefined) merged.connector = owner;
  if (merged.connector !== q0.connector) merged = { ...merged, drift: patch.drift ?? null, repair: false, t: patch.t ?? 0, record: patch.record ?? 0, node: patch.node ?? null };
  if (merged.drift !== q0.drift) merged = { ...merged, repair: patch.repair ?? false, t: patch.t ?? 0 };

  const changed = merged.connector !== q0.connector || merged.drift !== q0.drift || merged.repair !== q0.repair;
  const atlas = changed ? deriveAtlas(fx, merged) : s.atlas;
  const rec = atlas.trace.records[merged.record];
  const last = Math.max(0, reachableSteps(rec) - 1);

  if (patch.node !== undefined && patch.node !== null) {
    // Selecting a stage: open its panel and bring the payload there (as far as the record actually got).
    const stage = atlas.plan.stages.find((st) => laneNodeId(atlas.plan.connector.id, st.id) === patch.node);
    if (stage && patch.panel === undefined) merged.panel = PANEL_FOR[stage.zone];
    const i = stepIndex(atlas, merged, patch.node);
    if (i !== null && patch.t === undefined) merged.t = Math.min(i, last);
  } else if (patch.t !== undefined && patch.node === undefined) {
    // Moving the payload selects the stage it is at; the timeline is Payload Flight's control, so it shows that panel.
    const step = rec?.steps[Math.min(Math.max(0, patch.t), last)];
    if (step) merged.node = laneNodeId(atlas.plan.connector.id, step.stage_id);
    if (patch.panel === undefined) merged.panel = "flight";
  }
  return { q: clampQuery(merged, atlas), atlas };
}

export function reduceAtlas(fx: Fixtures, s: AtlasStoreState, a: AtlasAction): AtlasStoreState {
  if (a.type === "load") return { ...s, q: a.q, atlas: deriveAtlas(fx, a.q), mode: "none" };
  const { q, atlas } = applyPatch(fx, s, a.patch);
  const focus = a.focus && q.node ? { node: q.node, seq: s.focus.seq + 1 } : s.focus;
  return { q, atlas, mode: a.mode ?? "push", focus };
}

/** Neighbouring stage along the selected connector's pipeline (for `[` and `]`). */
export function stepNode(q: AtlasQuery, atlas: Atlas, dir: 1 | -1): string {
  const order = pipelineOrder(atlas);
  const i = q.node ? order.indexOf(q.node) : -1;
  const next = i === -1 ? (dir === 1 ? 0 : order.length - 1) : Math.min(order.length - 1, Math.max(0, i + dir));
  return order[next]!;
}
