"use client";

import type { Hypotheses, ReconstructedGraph, StoryStatement } from "@/lib/ps2/api";
import { clock, gapsOf, isCausal } from "@/lib/ps2/graph";

import { pct, Ps2Chip, Ref } from "./common";
import s from "./ps2.module.css";

/** The selected path, its gaps and the business services as text: the graph's readable 2D equivalent. */
export function PathText({
  graph,
  hypotheses,
  statements,
  onSelect,
}: {
  graph: ReconstructedGraph;
  hypotheses: Hypotheses;
  statements: StoryStatement[];
  onSelect: (id: string) => void;
}) {
  const path = hypotheses.selected?.event_ids ?? [];
  const pathEdges = new Set(hypotheses.selected?.edge_ids ?? []);
  const byNode = new Map(graph.nodes.map((n) => [n.node_id, n]));
  const causal = graph.edges.filter(isCausal);
  const kept = new Set(graph.nodes.map((n) => n.node_id));
  const gaps = gapsOf(statements).filter((g) => kept.has(g.eventId));
  return (
    <div data-testid="path-text">
      {path.length ? (
        <ol className={s.pathList} aria-label="Selected path">
          {path.map((id) => {
            const n = byNode.get(id);
            const hop = causal.find((e) => e.target === id && pathEdges.has(e.edge_id));
            return (
              <li key={id} data-hop={hop?.classification ?? "root"}>
                <Ref id={id} onSelect={onSelect} label={`${clock(n?.occurred_at)} · ${n?.label ?? id}`} />
                {n?.tactic ? <span className="v2-meta">{` · ${n.tactic}`}</span> : null}
                <div className={s.hop}>
                  {hop ? (
                    <>
                      <Ps2Chip tone={hop.classification === "observed" ? "observed" : "inferred"} />{" "}
                      <Ref id={hop.edge_id} onSelect={onSelect} label={`${hop.edge_type} · ${pct(hop.confidence)}`} />
                    </>
                  ) : (
                    "root of the selected path"
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="v2-meta">No selected path.</p>
      )}
      {gaps.length ? (
        <div style={{ marginTop: "var(--space-3)" }}>
          <h3 className="v2-kicker">Missing evidence</h3>
          <ul className={s.rows}>
            {gaps.map((g) => (
              <li key={g.id} className={s.row}>
                <Ref id={g.id} onSelect={onSelect} label={g.statement.text} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div style={{ marginTop: "var(--space-3)" }}>
        <h3 className="v2-kicker">Business services</h3>
        <div className="v2-btn-row">
          {graph.nodes
            .filter((n) => n.node_kind === "business_service")
            .map((n) => (
              <Ref key={n.node_id} id={n.node_id} onSelect={onSelect} label={`${n.label}${n.criticality ? ` (${n.criticality})` : ""}`} />
            ))}
        </div>
      </div>
    </div>
  );
}
