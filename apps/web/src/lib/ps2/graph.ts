// Graph model for the PS2 ThreadGraph: Cytoscape elements and a deterministic preset layout, computed only
// from API responses (graph, hypotheses, story, events). Nothing here knows a scenario.
import type { NodeKind } from "@/components/halt";

import type { CandidateEdge, CanonicalEvent, Hypotheses, ReconstructedGraph, StoryStatement, ThreadNode } from "./api";

export interface GraphOptions {
  alternates: boolean;
  inferred: boolean;
  rejected: boolean;
  entities: boolean;
}

export const DEFAULT_OPTIONS: GraphOptions = { alternates: true, inferred: true, rejected: false, entities: true };

export type ElementKind = "event" | "entity" | "service" | "gap" | "ghost";

export interface Ps2Element {
  group: "nodes" | "edges";
  data: Record<string, string | number | boolean | undefined> & { id: string; kind: string };
  position?: { x: number; y: number };
  classes: string;
}

export interface Ps2GraphModel {
  elements: Ps2Element[];
  pathEventIds: string[]; // the selected path in order
  pathEdgeIds: Set<string>;
  alternateEdgeIds: Set<string>;
  gaps: Array<{ id: string; eventId: string; statement: StoryStatement }>;
  summary: string;
}

/** Entity types drawn with an existing NodeGlyph silhouette; the rest use a plain shape plus their type word. */
export const GLYPH: Partial<Record<string, NodeKind>> = {
  user: "user",
  service_account: "user",
  device: "device",
  session: "session",
  token: "token",
  application: "application",
  api: "api",
  database: "database",
  cloud_service: "service",
  business_service: "process", // the brand's "Business process" silhouette
};

export const ENTITY_WORD: Record<string, string> = {
  user: "user",
  service_account: "service account",
  device: "device",
  ip: "IP address",
  session: "session",
  token: "token",
  application: "application",
  process: "process",
  api: "API",
  database: "database",
  cloud_service: "cloud service",
  business_service: "business service",
};

const COL = 135;
const LANE_OTHER = -120;
const ENTITY_ROWS = [150, 230, 310];
const ENTITY_GAP = 112;

export const isCausal = (e: CandidateEdge) => !e.edge_type.startsWith("involves:");
export const clock = (iso?: string | null) => (iso ? `${iso.slice(11, 19)}Z` : "");

/** Missing-evidence statements of the story, one gap marker per cited event. */
export function gapsOf(statements: StoryStatement[]): Ps2GraphModel["gaps"] {
  return statements
    .filter((s) => s.section === "missing_evidence")
    .flatMap((s) => s.event_ids.map((eventId) => ({ id: `gap:${s.statement_id}:${eventId}`, eventId, statement: s })));
}

export function buildModel(
  graph: ReconstructedGraph,
  hypotheses: Hypotheses,
  statements: StoryStatement[],
  events: Record<string, CanonicalEvent>,
  options: GraphOptions = DEFAULT_OPTIONS,
): Ps2GraphModel {
  const selected = hypotheses.selected;
  const pathEventIds = selected?.event_ids ?? [];
  const onPath = new Set(pathEventIds);
  const pathEdgeIds = new Set(selected?.edge_ids ?? []);
  const alternateEdgeIds = new Set(hypotheses.alternates.flatMap((a) => a.edge_ids).filter((id) => !pathEdgeIds.has(id)));
  const alternateEvents = new Set(hypotheses.alternates.flatMap((a) => a.event_ids));

  const eventNodes = graph.nodes
    .filter((n) => n.node_kind === "event")
    .sort((a, b) => (a.occurred_at ?? "").localeCompare(b.occurred_at ?? "") || a.node_id.localeCompare(b.node_id));
  const pos = new Map<string, { x: number; y: number }>();
  eventNodes.forEach((n, i) => pos.set(n.node_id, { x: i * COL, y: onPath.has(n.node_id) ? 0 : LANE_OTHER }));
  const maxX = Math.max(0, (eventNodes.length - 1) * COL);

  const elements: Ps2Element[] = [];
  for (const n of eventNodes) {
    elements.push({
      group: "nodes",
      data: { id: n.node_id, kind: "event", label: `${n.label}\n${clock(n.occurred_at)}`, eventKind: n.event_kind ?? undefined },
      position: pos.get(n.node_id),
      classes: ["event", onPath && onPath.has(n.node_id) ? "path" : "", n.seed ? "seed" : "", alternateEvents.has(n.node_id) && !onPath.has(n.node_id) ? "alt" : ""]
        .filter(Boolean)
        .join(" "),
    });
  }

  // Entities sit in rows below the events, each under the mean position of the events that involve it.
  const involves = graph.edges.filter((e) => !isCausal(e));
  const nodesById = new Map(graph.nodes.map((n) => [n.node_id, n]));
  const services = graph.nodes.filter((n) => n.node_kind === "business_service").sort((a, b) => a.node_id.localeCompare(b.node_id));
  services.forEach((n, i) => pos.set(n.node_id, { x: maxX + 190, y: (i - (services.length - 1) / 2) * 110 }));
  for (const n of services) {
    elements.push({
      group: "nodes",
      data: { id: n.node_id, kind: "service", label: `${n.label}${n.criticality ? `\n${n.criticality}` : ""}`, glyph: "process" },
      position: pos.get(n.node_id),
      classes: ["service", n.criticality === "critical" || n.criticality === "high" ? "critical" : ""].filter(Boolean).join(" "),
    });
  }
  if (options.entities) {
    const entities = graph.nodes
      .filter((n) => n.node_kind === "entity")
      .map((n) => {
        const xs = involves.filter((e) => e.target === n.node_id).map((e) => pos.get(e.source)?.x ?? 0);
        return { n, x: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0 };
      })
      .sort((a, b) => a.x - b.x || a.n.node_id.localeCompare(b.n.node_id));
    const last = ENTITY_ROWS.map(() => -Infinity);
    for (const { n, x } of entities) {
      let row = last.findIndex((l) => l + ENTITY_GAP <= x);
      if (row < 0) row = last.indexOf(Math.min(...last));
      const px = Math.max(x, last[row]! + ENTITY_GAP);
      last[row] = px;
      pos.set(n.node_id, { x: px, y: ENTITY_ROWS[row]! });
      const type = n.entity_type ?? "";
      elements.push({
        group: "nodes",
        data: { id: n.node_id, kind: "entity", label: `${shortLabel(n)}\n${ENTITY_WORD[type] ?? type}`, glyph: GLYPH[type], entityType: type },
        position: pos.get(n.node_id),
        classes: `entity type-${type}${GLYPH[type] ? ` glyph-${GLYPH[type]}` : ""}`,
      });
    }
  }

  const present = new Set(elements.map((e) => e.data.id));
  const edge = (e: CandidateEdge, classes: string) =>
    elements.push({
      group: "edges",
      data: { id: e.edge_id, kind: "edge", source: e.source, target: e.target, label: e.edge_type, confidence: e.confidence },
      classes,
    });

  for (const e of graph.edges) {
    if (!present.has(e.source) || !present.has(e.target)) continue;
    if (!isCausal(e)) {
      edge(e, nodesById.get(e.target)?.node_kind === "business_service" ? "involves service" : "involves");
      continue;
    }
    if (e.classification === "inferred" && !options.inferred) continue;
    const alt = alternateEdgeIds.has(e.edge_id);
    if (alt && !options.alternates) continue;
    edge(e, ["causal", e.classification, pathEdgeIds.has(e.edge_id) ? "path" : "", alt ? "alt" : ""].filter(Boolean).join(" "));
  }
  for (const e of graph.forecast_edges) if (present.has(e.source) && present.has(e.target)) edge(e, "forecast");

  if (options.rejected) {
    // Rejected hypotheses may end on events outside the kept graph: show those endpoints as ghosts.
    let ghost = 0;
    for (const e of hypotheses.rejected_edges) {
      for (const end of [e.source, e.target]) {
        if (present.has(end) || !events[end]) continue;
        const anchor = pos.get(end === e.source ? e.target : e.source) ?? { x: 0, y: 0 };
        ghost += 1;
        elements.push({
          group: "nodes",
          data: { id: end, kind: "ghost", label: `${events[end]!.action}\n${clock(events[end]!.occurred_at)}` },
          position: { x: anchor.x + (end === e.source ? -COL / 2 : COL / 2), y: LANE_OTHER - 90 - (ghost % 3) * 50 },
          classes: "event ghost",
        });
        present.add(end);
      }
      if (present.has(e.source) && present.has(e.target)) edge(e, "rejected");
    }
  }

  const gaps = gapsOf(statements).filter((g) => present.has(g.eventId));
  for (const g of gaps) {
    const at = pos.get(g.eventId) ?? { x: 0, y: 0 };
    elements.push({ group: "nodes", data: { id: g.id, kind: "gap", label: "missing\nevidence" }, position: { x: at.x - 80, y: at.y - 70 }, classes: "gap" });
    elements.push({ group: "edges", data: { id: `${g.id}:edge`, kind: "gap-edge", source: g.id, target: g.eventId }, classes: "gap-edge" });
  }

  const causal = graph.edges.filter(isCausal);
  const summary = selected
    ? `ThreadGraph: ${eventNodes.length} relevant events, ${graph.nodes.length - eventNodes.length - services.length} entities, ${services.length} business services, ${causal.length} selected causal edges. Selected path of ${pathEventIds.length} events; ${hypotheses.alternates.length} alternates; ${gaps.length} missing-evidence markers.`
    : `ThreadGraph: no path was selected. ${eventNodes.length} relevant events.`;
  return { elements, pathEventIds, pathEdgeIds, alternateEdgeIds, gaps, summary };
}

function shortLabel(n: ThreadNode): string {
  return n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label;
}
