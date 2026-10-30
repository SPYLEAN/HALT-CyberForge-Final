"use client";

import { useState } from "react";

import type {
  AttackStory,
  CanonicalEvent,
  EvaluationReport,
  Hypotheses,
  PathHypothesis,
  ReconstructionReceipt,
  StageAssignment,
} from "@/lib/ps2/api";
import { clock } from "@/lib/ps2/graph";

import { num, pct, Ps2Chip, Ref, statusTone, TableScroll } from "./common";
import { BasisWord } from "./Inspector";
import s from "./ps2.module.css";

/** Presentation constant: a score margin below this reads as ambiguous (docs/PS2_FRONTEND_INTEGRATION_MAP.md). */
export const NEAR_TIE = 0.01;

const SECTION_TITLE: Record<string, string> = {
  observed: "Confirmed observations",
  inferred: "Inferred relationships",
  missing_evidence: "Missing evidence",
  forecast: "Forecasts",
};

export function StoryPanel({ story, onSelect }: { story: AttackStory; onSelect: (id: string) => void }) {
  return (
    <section aria-label="Attack story">
      <p className="v2-meta" style={{ marginBottom: "var(--space-3)" }}>
        {`Deterministic story, built from templates and checked fact by fact against the cited events: ${story.checked_statements} statements checked, `}
        <strong>{`${story.unsupported_claims} unsupported`}</strong>
        {". No language model is used."}
      </p>
      <ol className={s.rows}>
        {story.statements.map((st) => (
          <li key={st.statement_id} className={s.row} data-section={st.section} data-testid="story-statement">
            <span className={s.rowMeta}>
              <Ps2Chip tone={statusTone(st.section === "missing_evidence" ? "missing" : st.status)} />
              <span>{SECTION_TITLE[st.section]}</span>
              <span>{`confidence ${pct(st.confidence)}`}</span>
            </span>
            <p className={s.statement}>{st.text}</p>
            <span className={s.rowMeta}>
              <span>Events:</span>
              {st.event_ids.length ? st.event_ids.map((e) => <Ref key={e} id={e} onSelect={onSelect} />) : <span>none cited</span>}
              <span>Edges:</span>
              {st.edge_ids.length ? st.edge_ids.map((e) => <Ref key={e} id={e} onSelect={onSelect} />) : <span>none cited</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function AttackPanel({
  stages,
  events,
  pathEventIds,
  onSelect,
}: {
  stages: StageAssignment[];
  events: Record<string, CanonicalEvent>;
  pathEventIds: string[];
  onSelect: (id: string) => void;
}) {
  const onPath = new Set(pathEventIds);
  return (
    <section aria-label="ATT&CK progression">
      <p className="v2-meta" style={{ marginBottom: "var(--space-3)" }}>
        Tactics and techniques as the reconstruction mapped them, in time order. A rule-inferred or uncertain mapping is a candidate, not a finding.
      </p>
      <TableScroll label="ATT&CK progression table">
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Tactic</th>
              <th scope="col">Technique</th>
              <th scope="col">Basis</th>
              <th scope="col">Supporting event</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((st) => {
              const e = events[st.event_id];
              const p = st.primary;
              return (
                <tr key={st.event_id} data-testid="attack-row">
                  <td className={s.mono}>{clock(e?.occurred_at)}</td>
                  <td>{st.tactic ?? "unmapped"}</td>
                  <td>
                    {p ? (
                      <>
                        <span className={s.mono}>{p.technique_id}</span> {p.technique_name}
                        {st.candidates.length > 1 ? (
                          <details className="v2-details" style={{ borderTop: 0 }}>
                            <summary>{`${st.candidates.length - 1} other candidate${st.candidates.length > 2 ? "s" : ""}`}</summary>
                            <ul style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
                              {st.candidates
                                .filter((c) => c !== p && c.technique_id !== p.technique_id)
                                .map((c) => (
                                  <li key={c.technique_id}>{`${c.technique_id} ${c.technique_name} · ${c.tactic} · ${c.basis.replace("_", "-")}`}</li>
                                ))}
                            </ul>
                          </details>
                        ) : null}
                      </>
                    ) : (
                      "no technique mapped"
                    )}
                  </td>
                  <td>{p ? <BasisWord basis={p.basis} /> : "—"}</td>
                  <td>
                    <Ref id={st.event_id} onSelect={onSelect} label={`${e?.event_kind ?? st.event_id}${onPath.has(st.event_id) ? " · on selected path" : ""}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
    </section>
  );
}

const share = (a: string[], b: string[]) => a.filter((x) => !b.includes(x));

export function HypothesesPanel({ hyp, receipt, onSelect }: { hyp: Hypotheses; receipt: ReconstructionReceipt; onSelect: (id: string) => void }) {
  const [showRejected, setShowRejected] = useState(false);
  const sel = hyp.selected;
  const margin = receipt.uncertainty.score_margin;
  const ambiguous = Boolean(sel && hyp.alternates.length && margin < NEAR_TIE);
  const paths: PathHypothesis[] = [...(sel ? [sel] : []), ...hyp.alternates];
  const names = sel ? sel.components.map((c) => c.name) : [];
  return (
    <section aria-label="Hypothesis comparison">
      {!sel ? (
        <p className="v2-meta">No path reached selection, so there is nothing to compare.</p>
      ) : ambiguous ? (
        <div className={s.notice} role="note" data-testid="ambiguity">
          <strong>{`Ambiguous: the selected path leads the next alternate by ${num(margin, 4)} (below ${NEAR_TIE})`}</strong>
          Treat the selected and alternate paths as competing explanations. The evidence that differs between them, below, is what an analyst should check.
        </div>
      ) : (
        <p className="v2-meta" style={{ marginBottom: "var(--space-3)" }}>
          {hyp.alternates.length ? `The selected path leads the next alternate by ${num(margin, 4)}.` : "No alternate path was ranked."}
        </p>
      )}
      {sel ? (
        <TableScroll label="Score components table">
          <table className={s.table}>
            <caption className="v2-kicker" style={{ textAlign: "left", paddingBottom: 4 }}>
              Score components
            </caption>
            <thead>
              <tr>
                <th scope="col">Component</th>
                {paths.map((p) => (
                  <th key={p.path_id} scope="col" className={s.num}>
                    {p.status === "selected" ? "Selected" : `Alt ${p.rank - 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Score</th>
                {paths.map((p) => (
                  <td key={p.path_id} className={s.num}>
                    <strong>{num(p.score, 4)}</strong>
                  </td>
                ))}
              </tr>
              {names.map((n) => (
                <tr key={n}>
                  <th scope="row" style={{ fontWeight: 400 }}>
                    <span className={s.mono}>{n}</span>
                  </th>
                  {paths.map((p) => {
                    const c = p.components.find((x) => x.name === n);
                    return (
                      <td key={p.path_id} className={s.num}>
                        {c ? `${num(c.value)} × ${num(c.weight, 2)}` : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      ) : null}
      <ol className={s.rows} style={{ marginTop: "var(--space-4)" }}>
        {paths.map((p) => (
          <li key={p.path_id} className={s.row} data-testid="hypothesis">
            <span className={s.rowMeta}>
              <Ps2Chip tone={p.status === "selected" ? "selected" : "alternate"} />
              <span className={s.mono}>{p.path_id}</span>
              <span>{`${p.event_ids.length} events · score ${num(p.score, 4)}`}</span>
            </span>
            {p.status !== "selected" && sel ? (
              <span>
                <span className="v2-meta">Differs from the selected path: </span>
                {share(p.event_ids, sel.event_ids).map((e) => <Ref key={e} id={e} onSelect={onSelect} label={`+ ${e}`} />)}
                {share(sel.event_ids, p.event_ids).map((e) => <Ref key={e} id={e} onSelect={onSelect} label={`− ${e}`} />)}
                {!share(p.event_ids, sel.event_ids).length && !share(sel.event_ids, p.event_ids).length ? <span className="v2-meta">same events, different edges</span> : null}
              </span>
            ) : null}
            {p.rejection_reason ? <span className="v2-meta">{`Not selected: ${p.rejection_reason}`}</span> : null}
            {p.missing_evidence.length ? (
              <span>
                <span className="v2-meta">Evidence gaps: </span>
                {p.missing_evidence.join("; ")}
              </span>
            ) : (
              <span className="v2-meta">No evidence gap recorded for this path.</span>
            )}
          </li>
        ))}
      </ol>
      <details className="v2-details" open={showRejected} onToggle={(e) => setShowRejected((e.target as HTMLDetailsElement).open)}>
        <summary>{`${hyp.rejected_paths.length} rejected paths, ${hyp.rejected_edges.length} rejected edges`}</summary>
        <ul className={s.rows}>
          {hyp.rejected_edges.map((e) => (
            <li key={e.edge_id} className={s.row}>
              <span className={s.rowMeta}>
                <Ref id={e.edge_id} onSelect={onSelect} />
                <span>{`${e.edge_type} · ${pct(e.confidence)}`}</span>
              </span>
              <span>{e.rejection_reason}</span>
            </li>
          ))}
          {hyp.rejected_paths.map((p) => (
            <li key={p.path_id} className={s.row}>
              <span className={s.rowMeta}>
                <span className={s.mono}>{p.path_id}</span>
                <span>{`${p.event_ids.length} events · score ${num(p.score, 4)}`}</span>
              </span>
              <span>{p.rejection_reason ?? "ranked below the alternates"}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

export function ReceiptPanel({ receipt }: { receipt: ReconstructionReceipt }) {
  const [copied, setCopied] = useState<string | null>(null);
  const json = JSON.stringify(receipt, null, 2);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied("Receipt copied.");
    } catch {
      setCopied("Copy is not available here; use Download.");
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${receipt.receipt_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const u = receipt.uncertainty;
  return (
    <section aria-labelledby="receipt-head">
      <h2 id="receipt-head" className="v2-section">
        Reconstruction proof
      </h2>
      <p className="v2-meta" style={{ margin: "4px 0 var(--space-3)" }}>
        Content hashes that let anyone replay this reconstruction and compare. The receipt is not cryptographically signed.
      </p>
      <dl className={s.kv}>
        <dt>Receipt id</dt>
        <dd className={s.mono}>{receipt.receipt_id}</dd>
        <dt>Replay id</dt>
        <dd className={s.mono}>{receipt.replay_id}</dd>
        <dt>Engine version</dt>
        <dd className={s.mono}>{receipt.engine_version}</dd>
        <dt>Canonical schema</dt>
        <dd className={s.mono}>{receipt.canonical_schema}</dd>
        <dt>Configuration hash</dt>
        <dd className={s.mono}>{receipt.config_sha256}</dd>
        <dt>Graph hash</dt>
        <dd className={s.mono}>{receipt.graph_hash}</dd>
        <dt>Context hash</dt>
        <dd className={s.mono}>{receipt.context_sha256}</dd>
        <dt>Selected path</dt>
        <dd className={s.mono}>{receipt.selected_path_id ?? "none"}</dd>
        <dt>Evidence coverage</dt>
        <dd>{`${pct(receipt.evidence_coverage)} of selected-path hops observed (exact identifier)`}</dd>
        <dt>Story citation coverage</dt>
        <dd>{pct(receipt.story_citation_coverage)}</dd>
        <dt>Uncertainty</dt>
        <dd>{`score margin ${num(u.score_margin, 4)} · weakest edge ${pct(u.min_edge_confidence)} · ${u.inferred_hops} inferred hop${u.inferred_hops === 1 ? "" : "s"}`}</dd>
        <dt>Processing</dt>
        <dd>{`${num(receipt.processing_ms, 1)} ms (excluded from the hashes)`}</dd>
      </dl>
      {u.coverage_gaps.length ? (
        <ul style={{ margin: "var(--space-3) 0 0", paddingLeft: "var(--space-5)" }} aria-label="Coverage gaps">
          {u.coverage_gaps.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      ) : null}
      <TableScroll label="Inputs and adapters table" style={{ marginTop: "var(--space-4)" }}>
        <table className={s.table}>
          <caption className="v2-kicker" style={{ textAlign: "left", paddingBottom: 4 }}>
            Inputs and adapters
          </caption>
          <tbody>
            {Object.entries(receipt.input_hashes).map(([f, h]) => (
              <tr key={f}>
                <th scope="row" className={s.mono}>
                  {f}
                </th>
                <td className={s.mono}>{h}</td>
              </tr>
            ))}
            {Object.entries(receipt.adapter_versions).map(([a, v]) => (
              <tr key={a}>
                <th scope="row" className={s.mono}>
                  {a}
                </th>
                <td className={s.mono}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      <div className="v2-btn-row" style={{ marginTop: "var(--space-4)" }}>
        <button type="button" className="halt-btn" onClick={copy}>
          <span>COPY RECEIPT JSON</span>
        </button>
        <button type="button" className="halt-btn" onClick={download}>
          <span>DOWNLOAD RECEIPT</span>
          <span aria-hidden>↓</span>
        </button>
        <span role="status" className="v2-meta">
          {copied ?? ""}
        </span>
      </div>
    </section>
  );
}

const METRIC_LABEL: Record<string, string> = {
  relevant_event_precision: "Relevant-event precision",
  relevant_event_recall: "Relevant-event recall",
  edge_precision: "Edge precision",
  false_link_rate: "False-link rate",
  edge_recall: "Edge recall",
  path_node_precision: "Path precision",
  path_node_recall: "Path recall",
  stage_mapping_accuracy: "Stage accuracy",
  root_cause_top3: "Root cause in Top-3",
  evidence_coverage: "Evidence coverage",
  unsupported_story_claims: "Unsupported story claims",
  deterministic_replay: "Deterministic replay",
  reconstruction_latency_ms: "Latency (ms)",
};

export function EvaluationPanel({ report }: { report: EvaluationReport | null | "failed" | undefined }) {
  if (report === undefined) return <p className="v2-meta" role="status">Loading the measured evaluation…</p>;
  if (report === "failed") return <p className="v2-meta">The evaluation could not be loaded, so no metric is shown.</p>;
  if (report === null)
    return <p className="v2-meta">No ground truth exists for this input (uploads never have one), so there is no evaluation. Nothing is estimated in its place.</p>;
  return (
    <section aria-labelledby="eval-head">
      <div className={`${s.notice} ${s.noticeSynthetic}`} data-testid="synthetic-disclosure">
        <strong id="eval-head">Synthetic evaluation — demonstrates pipeline behaviour, not real-world accuracy.</strong>
        Measured against the generator&apos;s own ground truth for {report.dataset_id}. Development targets are shown in their own column and are never results.
      </div>
      <TableScroll label="Evaluation metrics table">
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col" className={s.num}>
                Measured
              </th>
              <th scope="col" className={s.num}>
                Count
              </th>
              <th scope="col" className={s.num}>
                Development target
              </th>
              <th scope="col">Met</th>
            </tr>
          </thead>
          <tbody>
            {report.metrics.map((m) => (
              <tr key={m.name} data-testid="metric-row">
                <th scope="row" style={{ fontWeight: 400 }}>
                  {METRIC_LABEL[m.name] ?? m.name}
                  {m.note ? (
                    <span className="v2-meta" style={{ display: "block" }}>
                      {m.note}
                    </span>
                  ) : null}
                </th>
                <td className={s.num}>{m.status === "measured" && m.value != null ? num(m.value, 3) : "unavailable"}</td>
                <td className={s.num}>{m.numerator != null && m.denominator != null ? `${m.numerator}/${m.denominator}` : "—"}</td>
                <td className={s.num}>{m.target != null ? num(m.target, 3) : "—"}</td>
                <td>{m.target_met == null ? "—" : m.target_met ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      <p className="v2-meta" style={{ marginTop: "var(--space-3)" }}>{`Ground truth ${report.ground_truth_sha256.slice(0, 16)}… · replay ${report.replay_id.slice(0, 16)}…`}</p>
    </section>
  );
}
