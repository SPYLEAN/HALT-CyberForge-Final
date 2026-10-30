// Pure graph model: which elements to draw and how to classify them (3-graph.md). No rendering here,
// so the rules are unit-testable without a canvas.
import type { NodeState } from "@/components/halt";
import type { AttackPath, Execution, GraphEdge, GraphNode, Plan, ResponseAction } from "@/lib/api/types";

export type GraphMode = "observed" | "forecast" | "response" | "cut";

export interface GraphInput {
  nodes: GraphNode[];
  edges: GraphEdge[];
  paths: AttackPath[];
  plan: Plan | null;
  actions: ResponseAction[];
  execution: Execution | null;
  mode: GraphMode;
  focusPath: string | null;
  /** Business-dependency overlay; the business thread itself is always drawn. Default true. */
  showDependencies?: boolean;
}

export interface RingPlacement {
  pathId: string;
  edgeId: string; // the ring sits on this edge...
  at: number; // ...this fraction of the way from its source (0.22 = just past the cut point)
}

export interface ModelElement {
  group: "nodes" | "edges";
  data: { id: string; label?: string; source?: string; target?: string; kind?: string; state?: NodeState };
  position?: { x: number; y: number };
  classes: string[];
}

export interface GraphModel {
  elements: ModelElement[];
  rings: RingPlacement[];
  threadEdgeIds: string[];
  applied: boolean;
  mode: GraphMode;
  summary: string;
}

const RING_AT = 0.22;
const HOLDABLE = new Set(["session", "token", "device", "application"]);

/** The business thread: staff operating processes, and processes reading the ledger. Never dashed. */
export function isThread(e: GraphEdge, nodes: Map<string, GraphNode>): boolean {
  if (e.kind !== "dependency") return false;
  if (e.relation === "operates") return true;
  return nodes.get(e.source)?.kind === "process" && nodes.get(e.target)?.kind === "database";
}

export function hardCutRefs(plan: Plan | null, actions: ResponseAction[]): Set<string> {
  if (!plan || plan.status !== "optimal") return new Set();
  const selected = new Set(plan.selected_candidate_ids);
  return new Set(actions.filter((a) => selected.has(a.id)).flatMap((a) => (a.cuts ?? []).filter((c) => c.strength === "hard").map((c) => c.ref)));
}

/** Where each high-risk path is cut, and which of its edges are held (unreachable) downstream. */
export function cutLayout(paths: AttackPath[], refs: Set<string>): { rings: RingPlacement[]; held: Set<string>; blocked: Set<string> } {
  const rings: RingPlacement[] = [];
  const held = new Set<string>();
  const blocked = new Set<string>();
  for (const p of paths) {
    if (!p.high_risk) continue;
    let cutAt = -1;
    for (let i = 0; i < p.edge_ids.length; i++) {
      // node i sits before edge i on the route; a cut node blocks its outgoing edge
      if (refs.has(p.node_ids[i]!) || refs.has(p.edge_ids[i]!)) {
        cutAt = i;
        break;
      }
    }
    if (cutAt < 0 && refs.has(p.node_ids[p.node_ids.length - 1]!)) cutAt = p.edge_ids.length - 1;
    if (cutAt < 0) continue;
    blocked.add(p.id);
    rings.push({ pathId: p.id, edgeId: p.edge_ids[cutAt]!, at: RING_AT });
    // The ring sits just past the cut on edge cutAt; everything from there on is unreachable.
    p.edge_ids.slice(cutAt).forEach((id) => held.add(id));
  }
  return { rings, held, blocked };
}

function nodeState(n: GraphNode, held: boolean): NodeState {
  if (held) return "held";
  if (n.provenance === "forecast") return "forecast";
  if (n.provenance === "inferred") return "inferred";
  return "observed";
}

export function buildModel(input: GraphInput): GraphModel {
  const { mode, paths, focusPath } = input;
  const byId = new Map(input.nodes.map((n) => [n.id, n]));
  const showForecast = mode !== "observed";
  const applied = input.execution?.state === "applied";
  const refs = mode === "response" || mode === "cut" || applied ? hardCutRefs(input.plan, input.actions) : new Set<string>();
  const { rings, held, blocked } = applied ? cutLayout(paths, refs) : { rings: [], held: new Set<string>(), blocked: new Set<string>() };

  const focus = focusPath ? paths.find((p) => p.id === focusPath) : undefined;
  const focusNodes = new Set(focus?.node_ids ?? []);
  const focusEdges = new Set(focus?.edge_ids ?? []);
  const uncertainEdges = new Set(paths.filter((p) => p.uncertain).flatMap((p) => p.edge_ids));
  const heldNodes = new Set<string>();
  for (const p of paths) {
    if (!blocked.has(p.id)) continue;
    const firstHeld = p.edge_ids.findIndex((id) => held.has(id));
    // Only attacker-side entities can be held; business services keep running and are never drawn as held.
    if (firstHeld >= 0) p.node_ids.slice(firstHeld + 1).forEach((n) => HOLDABLE.has(byId.get(n)?.kind ?? "") && heldNodes.add(n));
  }

  const nodes = input.nodes.filter((n) => showForecast || n.provenance !== "forecast");
  const visible = new Set(nodes.map((n) => n.id));
  const threadEdgeIds: string[] = [];

  const elements: ModelElement[] = nodes.map((n) => {
    const state = nodeState(n, heldNodes.has(n.id));
    const classes = [`kind-${n.kind}`, `state-${state}`];
    if (n.attacker_controlled) classes.push("attacker");
    if (refs.has(n.id)) classes.push(applied ? "cut-applied" : "cut-proposed");
    if (focus && !focusNodes.has(n.id)) classes.push("dimmed");
    return { group: "nodes", data: { id: n.id, label: n.label, kind: n.kind, state }, position: { x: n.layout.x, y: n.layout.y }, classes };
  });

  for (const e of input.edges) {
    if (!visible.has(e.source) || !visible.has(e.target)) continue;
    if (!showForecast && e.provenance === "forecast") continue;
    if (input.showDependencies === false && e.kind === "dependency" && !isThread(e, byId)) continue;
    const classes: string[] = [e.kind];
    if (e.kind === "hostile") classes.push(e.provenance === "observed" ? "observed" : e.provenance === "inferred" ? "inferred" : "forecast");
    if (e.historical) classes.push("historical");
    if (uncertainEdges.has(e.id)) classes.push("uncertain");
    if (isThread(e, byId)) {
      classes.push("thread");
      threadEdgeIds.push(e.id);
    }
    if (held.has(e.id)) classes.push("held");
    if (refs.has(e.id)) classes.push(applied ? "cut-applied" : "cut-proposed");
    if (focus && !focusEdges.has(e.id)) classes.push("dimmed");
    elements.push({ group: "edges", data: { id: e.id, source: e.source, target: e.target }, classes });
  }

  const high = paths.filter((p) => p.high_risk);
  const open = paths.filter((p) => !blocked.has(p.id)).map((p) => p.id);
  // Counted over every enumerated path, so a path the policy leaves open is named, never hidden.
  const summary = applied
    ? `After containment: ${blocked.size} of ${paths.length} enumerated paths cut${
        open.length ? `; ${open.join(", ")} open as accepted residual risk` : ""
      }, business thread continuing.`
    : mode === "response" && input.plan?.status === "optimal"
      ? `Proposed response: ${input.plan.display_actions.length} actions, not yet applied. ${high.length} high-risk paths open.`
      : high.length
        ? `${high.length} high-risk paths toward ${high[0]!.target_id}; business thread running.`
        : `${nodes.length} entities observed so far; no forecast yet.`;

  return { elements, rings, threadEdgeIds, applied, mode: input.mode, summary };
}
