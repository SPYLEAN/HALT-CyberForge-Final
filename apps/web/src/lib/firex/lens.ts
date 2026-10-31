// Plain-language wording for the Evidence Lens. It only describes what the graph already records and decides nothing.
import type { GraphEdge, GraphNode, IncidentGraph } from "./api";

const NODE_MEANING: Record<GraphNode["kind"], string> = {
  event: "One recorded step in this incident.",
  burst: "Repeated activity, grouped so that it reads as one thing. Its count says how many records it stands for.",
  account: "An account named in the evidence.",
  host: "A machine inside the network, named in the evidence.",
  ip: "An address outside the network, named in the evidence.",
  session: "A session named in the evidence.",
  application: "An application named in the evidence.",
  service: "A service named in the evidence.",
  critical_asset: "A system that this activity targeted. Changes to it matter most.",
};

export function nodeMeaning(node: GraphNode): string {
  if (node.attributes.hypothetical === true) {
    return "A system that could be reached next. This is hypothetical: the log shows a network path, not attacker activity.";
  }
  if (node.is_context) return "Other activity recorded from the same source. It is context, not part of the selected path.";
  return NODE_MEANING[node.kind];
}

export function edgeMeaning(edge: GraphEdge): string {
  if (edge.classification === "reachable") return "A possible next move. This is hypothetical, not something that was observed.";
  if (edge.missing_evidence) return "These steps sit next to each other, but no shared entity supports the link. Treat it as a gap.";
  if (edge.classification === "inferred") return "A rule linked these two records. No single record states this link.";
  return "A record states this relationship directly.";
}

/** The first graph node citing any of these evidence ids. Path steps come first, so a citation lands on the story. */
export function nodeForEvidence(graph: IncidentGraph, ids: readonly string[]): string | null {
  const wanted = new Set(ids);
  const ordered = [...graph.nodes].sort((a, b) => Number(b.on_selected_path) - Number(a.on_selected_path) || a.order - b.order);
  return ordered.find((n) => n.evidence_refs.some((r) => wanted.has(r)))?.node_id ?? null;
}

/** A sentence a screen reader can use in place of the scene. */
export function graphSummary(graph: IncidentGraph): string {
  const steps = graph.nodes.filter((n) => n.on_selected_path).length;
  const reachable = graph.nodes.filter((n) => n.attributes.hypothetical === true).length;
  const context = graph.nodes.filter((n) => n.is_context).length;
  const gaps = graph.edges.filter((e) => e.missing_evidence).length;
  return (
    `Attack World: ${steps} step${steps === 1 ? "" : "s"} on the selected path, ${context} context item${context === 1 ? "" : "s"}, ` +
    `${reachable} hypothetical reachable system${reachable === 1 ? "" : "s"}, ${gaps} missing-evidence link${gaps === 1 ? "" : "s"}. ` +
    "The list of steps beside the scene has the same content."
  );
}
