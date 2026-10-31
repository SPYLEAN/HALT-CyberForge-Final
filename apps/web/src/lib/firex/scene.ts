// Semantic layout of one IncidentGraph, shared by the 2D and 3D views. Position carries meaning and nothing is random:
// x = source order, y = kill-chain stage, z = organisation layer. Pure, so it is tested without WebGL.
import type { AttackHypothesis, GraphEdge, GraphNode, IncidentGraph } from "./api";

export const STAGE_ROWS = [
  "reconnaissance",
  "credential_access",
  "delivery",
  "exploitation",
  "installation",
  "defense_evasion",
  "command_and_control",
  "lateral_movement",
  "actions_on_objectives",
  "impact",
] as const;
export const LAYERS = ["external", "network_edge", "endpoint", "identity", "application", "critical_asset"] as const;

export const LAYER_LABEL: Record<(typeof LAYERS)[number], string> = {
  external: "External",
  network_edge: "Network edge",
  endpoint: "Endpoint",
  identity: "Identity",
  application: "Application or service",
  critical_asset: "Critical asset",
};

export function stageLabel(stage: string | null | undefined): string {
  return stage ? stage.replace(/_/g, " ") : "No stage";
}

export interface Position {
  x: number;
  y: number;
  z: number;
}

export const SPACING = { x: 3, y: 1.6, z: 2.4 } as const;
const SIDE_ROWS = 6;

export interface Toggles {
  observed: boolean;
  inferred: boolean;
  reachable: boolean;
}
export const ALL_ON: Toggles = { observed: true, inferred: true, reachable: true };

export type VisualState = "selected_path" | "observed" | "inferred" | "reachable" | "context" | "missing";

export function isReachableNode(node: GraphNode): boolean {
  return node.attributes.hypothetical === true;
}

export function nodeState(node: GraphNode): VisualState {
  if (isReachableNode(node)) return "reachable";
  if (node.on_selected_path) return "selected_path";
  if (node.is_context) return "context";
  return "observed";
}

export function edgeState(edge: GraphEdge): VisualState {
  if (edge.classification === "reachable") return "reachable";
  if (edge.missing_evidence) return "missing";
  if (edge.on_selected_path) return "selected_path";
  return edge.classification === "inferred" ? "inferred" : "observed";
}

/** Nodes without a stage sit at the stage of the path step they connect to, so they stay beside their evidence. */
export function layoutGraph(graph: IncidentGraph): Map<string, Position> {
  const nodes = new Map(graph.nodes.map((n) => [n.node_id, n]));
  const stageOf = new Map<string, number>();
  for (const node of graph.nodes) {
    const row = node.stage ? STAGE_ROWS.indexOf(node.stage as (typeof STAGE_ROWS)[number]) : -1;
    if (row >= 0) stageOf.set(node.node_id, row);
  }
  for (const edge of graph.edges) {
    for (const [from, to] of [
      [edge.source, edge.target],
      [edge.target, edge.source],
    ] as const) {
      if (!stageOf.has(to) && stageOf.has(from)) stageOf.set(to, stageOf.get(from)!);
    }
  }
  const taken = new Map<string, number>();
  const positions = new Map<string, Position>();
  const ordered = [...nodes.values()].sort((a, b) => a.order - b.order || (a.node_id < b.node_id ? -1 : 1));
  const lastStep = Math.max(0, ...ordered.filter((n) => n.on_selected_path).map((n) => n.order));
  let side = 0;
  for (const node of ordered) {
    const row = stageOf.get(node.node_id) ?? 0;
    const layer = Math.max(0, LAYERS.indexOf(node.layer as (typeof LAYERS)[number]));
    if (node.is_context || isReachableNode(node)) {
      // Context and hypothetical systems have no place in the attack's order: they form a block after the path,
      // so they cannot stretch the time axis. They keep their own layer.
      const column = Math.floor(side / SIDE_ROWS);
      positions.set(node.node_id, {
        x: (lastStep + 1 + column * 0.5) * SPACING.x,
        y: (side % SIDE_ROWS) * SPACING.y * 0.5,
        z: layer * SPACING.z,
      });
      side += 1;
      continue;
    }
    const key = `${node.order}:${row}:${layer}`;
    const used = taken.get(key) ?? 0;
    taken.set(key, used + 1);
    // Identical coordinates fan out along x by a fixed step, so the layout stays deterministic.
    positions.set(node.node_id, { x: (node.order + used * 0.3) * SPACING.x, y: row * SPACING.y, z: layer * SPACING.z });
  }
  return positions;
}

export function visibleNode(node: GraphNode, toggles: Toggles): boolean {
  if (isReachableNode(node)) return toggles.reachable;
  if (node.is_context) return toggles.observed;
  return true;
}

export function visibleEdge(edge: GraphEdge, toggles: Toggles): boolean {
  if (edge.classification === "reachable") return toggles.reachable;
  if (edge.classification === "inferred") return toggles.inferred;
  return toggles.observed;
}

/** Selected-path step nodes in chronological order: what Replay Attack walks through. */
export function pathSteps(graph: IncidentGraph): GraphNode[] {
  return graph.nodes.filter((n) => n.on_selected_path).sort((a, b) => a.order - b.order);
}

/** During replay nothing after the current step shows, and hypothetical nodes never appear as replayed activity. */
export function replayedNode(node: GraphNode, step: number | null, steps: GraphNode[]): boolean {
  if (step === null) return true;
  if (isReachableNode(node)) return false;
  const limit = steps[step]?.order ?? 0;
  return node.on_selected_path ? node.order <= limit : !node.is_context && node.order <= limit;
}

export type CameraPreset =
  | "Full Incident"
  | "Entry Point"
  | "Persistence"
  | "Lateral Movement"
  | "Critical Asset"
  | "Reachable Next"
  | "Alternate Hypothesis";

export const CAMERA_PRESETS: CameraPreset[] = [
  "Full Incident",
  "Entry Point",
  "Persistence",
  "Lateral Movement",
  "Critical Asset",
  "Reachable Next",
  "Alternate Hypothesis",
];

/** The nodes a preset frames. An empty result means the incident has nothing there, so the control is disabled. */
export function presetNodes(graph: IncidentGraph, preset: CameraPreset, alternate: AttackHypothesis | null): string[] {
  const ids = (test: (node: GraphNode) => boolean) => graph.nodes.filter(test).map((n) => n.node_id);
  switch (preset) {
    case "Full Incident":
      return graph.nodes.map((n) => n.node_id);
    case "Entry Point":
      return pathSteps(graph)
        .slice(0, 1)
        .map((n) => n.node_id);
    case "Persistence":
      return ids((n) => n.stage === "installation" || n.stage === "defense_evasion");
    case "Lateral Movement":
      return ids((n) => n.stage === "lateral_movement");
    case "Critical Asset":
      return ids((n) => n.layer === "critical_asset");
    case "Reachable Next":
      return ids(isReachableNode);
    case "Alternate Hypothesis":
      return alternate?.node_ids ?? [];
  }
}

export interface Frame {
  center: Position;
  radius: number;
}

export function frameOf(ids: string[], positions: Map<string, Position>): Frame {
  const points = ids.map((id) => positions.get(id)).filter((p): p is Position => Boolean(p));
  if (!points.length) return { center: { x: 0, y: 0, z: 0 }, radius: 6 };
  const mean = (pick: (p: Position) => number) => points.reduce((sum, p) => sum + pick(p), 0) / points.length;
  const center = { x: mean((p) => p.x), y: mean((p) => p.y), z: mean((p) => p.z) };
  const radius = Math.max(
    4,
    ...points.map((p) => Math.hypot(p.x - center.x, p.y - center.y, p.z - center.z)),
  );
  return { center, radius };
}
