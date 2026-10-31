// The Attack World's scene model: one incident graph turned into a pure description of objects, with no three.js in it, so it
// can be tested without WebGL. Placement is honest: X is source order, Y is kill-chain stage, Z is organisation layer. An entity
// has no stage, so it stands on the floor rather than at an invented height.
import type { GraphEdge, GraphNode, IncidentGraph } from "./api";
import { LAYERS, LAYER_LABEL, STAGE_ROWS, edgeState, isReachableNode, nodeState, stageLabel, type VisualState } from "./scene";

export const WORLD = { x: 3.2, y: 1.5, z: 3.0, floorY: 0, stageBase: 1.9 } as const;
export type EntityForm = "beacon" | "ring" | "terminal" | "portal" | "tower" | "field" | "marker" | "unknown";
export type Shot = "establish" | "approach" | "follow" | "inspect" | "reveal" | "withdraw" | "present";

export interface WorldNode {
  id: string;
  node: GraphNode;
  form: EntityForm;
  state: VisualState;
  position: { x: number; y: number; z: number };
  floor: { x: number; y: number; z: number };
  scale: number;
  raised: boolean; // floats at a stage height, with a drop line to its lane
  instanced: boolean; // drawn in one low-emphasis instanced batch
  step: number | null;
}

export interface WorldEdge {
  id: string;
  edge: GraphEdge;
  state: VisualState;
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
  arc: number;
}

export interface WorldModel {
  nodes: WorldNode[];
  edges: WorldEdge[];
  stages: Array<{ label: string; y: number }>;
  lanes: Array<{ label: string; z: number }>;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number };
  stepIds: string[];
}

export function formOf(node: GraphNode): EntityForm {
  switch (node.kind) {
    case "ip":
      return "beacon";
    case "account":
      return "ring";
    case "host":
      return "terminal";
    case "application":
    case "service":
    case "session":
      return "portal";
    case "critical_asset":
      return "tower";
    case "burst":
      return "field";
    case "event":
      return "marker";
    default:
      return "unknown";
  }
}

const stageY = (row: number) => WORLD.stageBase + row * WORLD.y;

/** Pure and deterministic for one graph. */
export function buildWorld(graph: IncidentGraph): WorldModel {
  const steps = graph.nodes.filter((n) => n.on_selected_path).sort((a, b) => a.order - b.order);
  const stepIndex = new Map(steps.map((n, i) => [n.node_id, i]));
  const rowsUsed = [...new Set(steps.map((n) => STAGE_ROWS.indexOf(n.stage as (typeof STAGE_ROWS)[number])).filter((r) => r >= 0))].sort((a, b) => a - b);
  const compact = new Map(rowsUsed.map((row, i) => [row, i])); // only stages in this incident take up height
  const layerOf = (n: GraphNode) => Math.max(0, LAYERS.indexOf(n.layer as (typeof LAYERS)[number]));
  const lanesUsed = [...new Set(graph.nodes.map(layerOf))].sort((a, b) => a - b);
  const laneZ = new Map(lanesUsed.map((layer, i) => [layer, i * WORLD.z]));

  const linkedStep = new Map<string, number>();
  for (const e of graph.edges) {
    for (const [a, b] of [
      [e.source, e.target],
      [e.target, e.source],
    ] as const) {
      const step = stepIndex.get(a);
      if (step !== undefined && !linkedStep.has(b)) linkedStep.set(b, step);
    }
  }

  const taken = new Map<string, number>();
  const stepCount = Math.max(1, steps.length);
  const contextX = stepCount * WORLD.x;
  let contextIndex = 0;
  const contextPerLane = new Map<number, number>();
  const nodes: WorldNode[] = [];
  for (const node of [...graph.nodes].sort((a, b) => a.order - b.order || (a.node_id < b.node_id ? -1 : 1))) {
    const layer = layerOf(node);
    const z = laneZ.get(layer) ?? 0;
    const step = stepIndex.get(node.node_id) ?? null;
    const isSide = node.is_context || isReachableNode(node);
    let x: number;
    let y: number = WORLD.floorY;
    let finalZ = z;
    if (step !== null) {
      x = step * WORLD.x;
      const row = STAGE_ROWS.indexOf(node.stage as (typeof STAGE_ROWS)[number]);
      y = stageY(row >= 0 ? (compact.get(row) ?? 0) : 0);
    } else if (isSide) {
      // Context and hypothetical systems have no place in the attack's order: a compact block after the path, in their own lane.
      const n = contextPerLane.get(layer) ?? 0;
      contextPerLane.set(layer, n + 1);
      const columns = 6;
      x = contextX + (n % columns) * 0.62;
      finalZ = z + (Math.floor(n / columns) % 4) * 0.62 - 0.9;
      contextIndex += 1;
    } else {
      // An entity stands beside the step it first appears with, offset so entities on one lane do not collide.
      const at = linkedStep.get(node.node_id) ?? 0;
      const key = `${at}:${layer}`;
      const used = taken.get(key) ?? 0;
      taken.set(key, used + 1);
      x = at * WORLD.x + used * 0.95 - (used ? 0.45 : 0);
    }
    const form = formOf(node);
    nodes.push({
      id: node.node_id,
      node,
      form,
      state: nodeState(node),
      position: { x, y, z: finalZ },
      floor: { x, y: WORLD.floorY, z: finalZ },
      scale: step !== null ? 0.42 + Math.min(0.34, Math.log10(Math.max(1, node.count)) * 0.11) : form === "tower" ? 0.68 : 0.58,
      raised: step !== null,
      instanced: node.is_context,
      step,
    });
  }
  void contextIndex;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: WorldEdge[] = [];
  for (const edge of graph.edges) {
    const a = byId.get(edge.source);
    const b = byId.get(edge.target);
    if (!a || !b) continue;
    edges.push({ id: edge.edge_id, edge, state: edgeState(edge), from: a.position, to: b.position, arc: edge.on_selected_path ? 0.35 : 0.12 });
  }

  const all = nodes.map((n) => n.position);
  const xs = all.map((p) => p.x);
  const zs = all.map((p) => p.z);
  return {
    nodes,
    edges,
    stages: rowsUsed.map((row) => ({ label: stageLabel(STAGE_ROWS[row]), y: stageY(compact.get(row) ?? 0) })),
    lanes: lanesUsed.map((layer) => ({ label: LAYER_LABEL[LAYERS[layer]!], z: laneZ.get(layer) ?? 0 })),
    bounds: {
      minX: Math.min(0, ...xs) - 1.6,
      maxX: Math.max(0, ...xs) + 1.6,
      minZ: Math.min(0, ...zs) - 1.4,
      maxZ: Math.max(0, ...zs) + 1.4,
      maxY: Math.max(stageY(Math.max(0, rowsUsed.length - 1)), 2.2),
    },
    stepIds: steps.map((n) => n.node_id),
  };
}
