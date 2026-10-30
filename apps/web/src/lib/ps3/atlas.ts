// Atlas state: the URL query (docs/PS3_DATA_CONTRACTS.md "URL state") and everything derived from it with the
// engine. Pure: the same query always derives the same plan, trace, drift analysis and receipt.
import {
  activationBlockers,
  analyseDrift,
  applyRepairDraft,
  compile,
  driftRecording,
  dryRun,
  makeReceipt,
  type ConnectorConfig,
  type DriftAnalysis,
  type Fixtures,
  type Plan,
  type Receipt,
  type RecordTrace,
  type Recording,
  type Trace,
} from "./engine";

export const PANELS = ["lens", "mapping", "flight", "drift", "proof", "gate"] as const;
export type Panel = (typeof PANELS)[number];
export const PANEL_TITLES: Record<Panel, string> = {
  lens: "Source Lens",
  mapping: "Mapping Chamber",
  flight: "Payload Flight",
  drift: "Drift Shockwave",
  proof: "Proof Corridor",
  gate: "Activation Gate",
};

export interface AtlasQuery {
  connector: string;
  node: string | null;
  panel: Panel;
  t: number;
  record: number;
  drift: string | null;
  repair: boolean;
}

export function defaultQuery(fx: Fixtures): AtlasQuery {
  return { connector: fx.connectors[0]!.id, node: null, panel: "lens", t: 0, record: 0, drift: null, repair: false };
}

const int = (v: string | null, fallback: number) => {
  const n = v === null ? Number.NaN : Number(v);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
};

/** Parse and validate a query; anything unknown falls back to the default rather than inventing state. */
export function parseQuery(params: URLSearchParams, fx: Fixtures): AtlasQuery {
  const d = defaultQuery(fx);
  const connector = fx.connectors.some((c) => c.id === params.get("connector")) ? params.get("connector")! : d.connector;
  const panel = (PANELS as readonly string[]).includes(params.get("panel") ?? "") ? (params.get("panel") as Panel) : d.panel;
  const drift = fx.drift.some((s) => s.id === params.get("drift") && s.connector_id === connector) ? params.get("drift") : null;
  const q: AtlasQuery = { connector, node: params.get("node"), panel, t: int(params.get("t"), 0), record: int(params.get("record"), 0), drift, repair: drift !== null && params.get("repair") === "1" };
  return clampQuery(q, deriveAtlas(fx, q));
}

export function clampQuery(q: AtlasQuery, a: Atlas): AtlasQuery {
  const record = Math.min(q.record, Math.max(0, a.trace.records.length - 1));
  const steps = reachableSteps(a.trace.records[record]);
  const t = Math.min(q.t, Math.max(0, steps - 1));
  const node = q.node && a.nodeIds.has(q.node) ? q.node : null;
  return { ...q, record, t, node };
}

export function toSearch(q: AtlasQuery, fx: Fixtures): string {
  const d = defaultQuery(fx);
  const p = new URLSearchParams();
  if (q.connector !== d.connector) p.set("connector", q.connector);
  if (q.node) p.set("node", q.node);
  if (q.panel !== d.panel) p.set("panel", q.panel);
  if (q.t) p.set("t", String(q.t));
  if (q.record) p.set("record", String(q.record));
  if (q.drift) p.set("drift", q.drift);
  if (q.repair) p.set("repair", "1");
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Steps a payload can reach: everything up to and including the stage that stopped it. */
export function reachableSteps(r: RecordTrace | undefined): number {
  if (!r) return 0;
  const i = r.steps.findIndex((s) => s.status === "skipped");
  return i === -1 ? r.steps.length : i;
}

export interface Atlas {
  config: ConnectorConfig;
  recording: Recording;
  plan: Plan;
  trace: Trace;
  analysis: DriftAnalysis | null;
  repaired: boolean;
  receipt: Receipt;
  blockers: string[];
  plans: Plan[]; // every connector, for the complete topology
  nodeIds: Set<string>;
}

export const laneNodeId = (connector: string, stage: string) => (stage.startsWith("dst.") ? stage : `${connector}/${stage}`);

export function deriveAtlas(fx: Fixtures, q: Pick<AtlasQuery, "connector" | "drift" | "repair">): Atlas {
  const base = fx.connectors.find((c) => c.id === q.connector) ?? fx.connectors[0]!;
  const original = fx.recordings.find((r) => r.connector_id === base.id)!;
  const scenario = q.drift ? fx.drift.find((s) => s.id === q.drift && s.connector_id === base.id) : undefined;
  const analysis = scenario ? analyseDrift(base, original, scenario) : null;
  const repaired = Boolean(q.repair && analysis?.repair);
  const config = repaired ? applyRepairDraft(base, analysis!.repair!) : base;
  const recording = scenario ? driftRecording(original, base, scenario) : original;
  const plan = compile(config);
  const trace = dryRun(plan, recording);
  const plans = fx.connectors.map((c) => (c.id === base.id ? plan : compile(c)));
  const nodeIds = new Set(plans.flatMap((p) => p.stages.map((s) => laneNodeId(p.connector.id, s.id))));
  return { config, recording, plan, trace, analysis, repaired, receipt: makeReceipt(trace), blockers: activationBlockers(trace), plans, nodeIds };
}
