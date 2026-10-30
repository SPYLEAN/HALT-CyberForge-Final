// Scene model: Atlas state → positioned nodes, edges, packet and proof markers. Pure and deterministic; the 3D
// canvas, the 2D flow and the object list all render this one model, so they cannot disagree.
import { laneNodeId, type Atlas, type AtlasQuery } from "./atlas";
import { ZONES, type Stage, type Zone } from "./engine";

export type NodeStatus = "idle" | "passed" | "active" | "failed" | "drift" | "receded";
export const STATUS_TEXT: Record<NodeStatus, string> = {
  idle: "not reached",
  passed: "passed",
  active: "payload here",
  failed: "failed",
  drift: "affected by drift",
  receded: "unaffected",
};

export interface SceneNode {
  id: string;
  connector: string | null; // null for shared destinations
  stage: Stage;
  zone: Zone;
  label: string;
  status: NodeStatus;
  position: [number, number, number];
  proof: boolean; // validation passed here for the followed record
}

export interface SceneEdge {
  id: string;
  from: string;
  to: string;
  status: NodeStatus;
}

export interface SceneModel {
  nodes: SceneNode[];
  edges: SceneEdge[];
  packet: { node: string; status: "active" | "failed" | "duplicate" } | null;
  zones: { zone: Zone; x: number; width: number }[];
}

export const ZONE_TITLES: Record<Zone, string> = {
  source: "Source systems",
  acquisition: "Acquisition",
  transformation: "Transformation",
  validation: "Validation",
  destination: "Destinations",
};

// Zone centres along x; stages spread inside their zone.
const ZONE_X: Record<Zone, number> = { source: -10, acquisition: -5, transformation: 0, validation: 5, destination: 10 };
const SPREAD = 1.6;

function stageX(zone: Zone, index: number, count: number): number {
  return ZONE_X[zone] + (index - (count - 1) / 2) * SPREAD;
}

export function toScene(a: Atlas, q: Pick<AtlasQuery, "connector" | "t" | "record">): SceneModel {
  const lanes = a.plans;
  const record = a.trace.records[q.record];
  const steps = record?.steps ?? [];
  const drift = a.analysis && !a.repaired ? a.analysis : null;
  const failedStages = new Set(drift?.failed_stages.map((f) => f.stage_id) ?? []);
  const broken = new Set(drift?.broken_destinations ?? []);
  const affectedRules = drift?.affected_rules.length ?? 0;

  // Destinations are shared across lanes; order of first appearance.
  const dsts: Stage[] = [];
  lanes.forEach((p) => p.stages.filter((s) => s.zone === "destination").forEach((s) => dsts.some((d) => d.id === s.id) || dsts.push(s)));

  const statusFor = (connector: string | null, stage: Stage): { status: NodeStatus; proof: boolean } => {
    const own = connector === null ? a.plan.stages.some((s) => s.id === stage.id) : connector === q.connector;
    if (!own) return { status: drift ? "receded" : "idle", proof: false };
    if (drift) {
      if (stage.zone === "destination") return { status: broken.has(stage.id) ? "failed" : "receded", proof: false };
      if (stage.id === "source.fetch" || failedStages.has(stage.id) || (stage.id === "xf.map" && affectedRules)) return { status: "drift", proof: false };
      return { status: "receded", proof: false };
    }
    const i = steps.findIndex((s) => s.stage_id === stage.id);
    const step = steps[i];
    if (!step || step.status === "skipped" || i > q.t) return { status: "idle", proof: false };
    if (step.status === "failed") return { status: "failed", proof: false };
    if (i === q.t) return { status: "active", proof: false };
    return { status: "passed", proof: stage.zone === "validation" || stage.zone === "destination" };
  };

  const nodes: SceneNode[] = [];
  lanes.forEach((p, li) => {
    const y = ((lanes.length - 1) / 2 - li) * 2.6;
    ZONES.filter((z) => z !== "destination").forEach((zone) => {
      const inZone = p.stages.filter((s) => s.zone === zone);
      inZone.forEach((stage, si) => {
        const s = statusFor(p.connector.id, stage);
        nodes.push({
          id: laneNodeId(p.connector.id, stage.id),
          connector: p.connector.id,
          stage,
          zone,
          label: zone === "source" ? p.connector.title : stage.title,
          status: s.status,
          position: [stageX(zone, si, inZone.length), y, 0],
          proof: s.proof,
        });
      });
    });
  });
  dsts.forEach((stage, i) => {
    const s = statusFor(null, stage);
    nodes.push({ id: stage.id, connector: null, stage, zone: "destination", label: stage.title, status: s.status, position: [ZONE_X.destination, ((dsts.length - 1) / 2 - i) * 2.6, 0], proof: s.proof });
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: SceneEdge[] = [];
  lanes.forEach((p) => {
    const ids = p.stages.map((s) => laneNodeId(p.connector.id, s.id));
    const last = ids.findIndex((id) => id.startsWith("dst."));
    const chain = ids.slice(0, last);
    chain.slice(1).forEach((to, i) => edges.push({ id: `${chain[i]}->${to}`, from: chain[i]!, to, status: edgeStatus(byId.get(chain[i]!)!, byId.get(to)!) }));
    ids.slice(last).forEach((to) => edges.push({ id: `${chain[chain.length - 1]}->${to}`, from: chain[chain.length - 1]!, to, status: edgeStatus(byId.get(chain[chain.length - 1]!)!, byId.get(to)!, p.connector.id !== q.connector) }));
  });

  let packet: SceneModel["packet"] = null;
  const step = steps[q.t];
  if (step && !drift) {
    packet = { node: laneNodeId(q.connector, step.stage_id), status: step.status === "failed" ? "failed" : step.status === "duplicate" ? "duplicate" : "active" };
  }
  const zones = ZONES.map((zone) => ({ zone, x: ZONE_X[zone], width: zone === "source" || zone === "destination" ? 3 : zone === "transformation" ? 3.6 : 4.8 }));
  return { nodes, edges, packet, zones };
}

function edgeStatus(from: SceneNode, to: SceneNode, otherLane = false): NodeStatus {
  if (otherLane) return from.status === "receded" ? "receded" : "idle";
  if (to.status === "failed") return "failed";
  if (from.status === "drift" || to.status === "drift") return "drift";
  if (to.status === "receded" || from.status === "receded") return "receded";
  if (to.status === "passed" || to.status === "active") return "passed";
  return "idle";
}

/** The node ids in pipeline order for the selected connector: what `[` and `]` step through. */
export function pipelineOrder(a: Atlas): string[] {
  return a.plan.stages.map((s) => laneNodeId(a.plan.connector.id, s.id));
}

/** Camera transition policy: reduced motion makes every move immediate. */
export const cameraTransition = (reducedMotion: boolean) => !reducedMotion;
