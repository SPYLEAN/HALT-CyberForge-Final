"use client";

import { useEffect, useRef } from "react";

import { formatCount, type EvidenceEvent, type IncidentDetail, type IncidentGraph } from "@/lib/firex/api";
import { edgeMeaning, nodeMeaning } from "@/lib/firex/lens";
import { LAYER_LABEL, stageLabel } from "@/lib/firex/scene";

import s from "./firex.module.css";

const SOURCE_FIELDS: Array<[keyof EvidenceEvent, string]> = [
  ["user", "User"],
  ["src_ip", "Source"],
  ["dst_ip", "Destination"],
  ["dst_port", "Port"],
  ["service", "Service"],
  ["action", "Action"],
  ["attack", "Attack name"],
  ["virus", "Malware"],
  ["hostname", "Host name"],
  ["message", "Message"],
];

/** The conclusion first, the underlying records one expansion away. It sits beside the scene and never blocks it. */
export function EvidenceLens({
  selected,
  graph,
  detail,
  onClose,
}: {
  selected: string;
  graph: IncidentGraph;
  detail: IncidentDetail;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [selected]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const edge = selected.startsWith("edge:") ? graph.edges.find((e) => `edge:${e.edge_id}` === selected) : undefined;
  const node = edge ? undefined : graph.nodes.find((n) => n.node_id === selected);
  if (!edge && !node) return null;
  const refs = edge?.evidence_refs ?? node?.evidence_refs ?? [];
  const byId = new Map(detail.evidence.map((e) => [e.evidence_id, e]));
  const events = refs.map((r) => byId.get(r)).filter((e): e is EvidenceEvent => Boolean(e));
  const detection = node?.detection_id ? detail.detections.find((d) => d.detection_id === node.detection_id) : undefined;
  const state = edge ? edge.classification : node?.attributes.hypothetical === true ? "reachable" : "observed";
  const stateWord = state === "reachable" ? "Hypothetical" : state === "inferred" ? "Inferred" : "Observed";
  const first = edge?.first_utc ?? node?.first_utc;
  const last = edge?.last_utc ?? node?.last_utc;

  return (
    <aside className={s.lens} role="dialog" aria-modal="false" aria-labelledby="lens-title" data-testid="firex-drawer">
      <div className={s.lensHead}>
        <h3 id="lens-title" tabIndex={-1} ref={heading}>
          {edge ? `${stateWord} link` : node?.label}
        </h3>
        <button type="button" className={s.btnQuiet} onClick={onClose} aria-label="Close evidence">
          Close
        </button>
      </div>
      <p style={{ margin: 0 }}>{edge ? edgeMeaning(edge) : node ? nodeMeaning(node) : null}</p>
      <p className={s.meta}>
        {stateWord}
        {node ? `. ${LAYER_LABEL[node.layer]}. ${node.stage ? stageLabel(node.stage) : "No kill-chain stage"}` : ""}
        {node && node.count > 1 ? `. ${formatCount(node.count)} records` : ""}
      </p>
      {first ? (
        <p className={s.meta}>
          First seen <span className={s.mono}>{first}</span>
          {last && last !== first ? (
            <>
              , last seen <span className={s.mono}>{last}</span>
            </>
          ) : null}
        </p>
      ) : null}
      {detection ? <p className={s.meta}>{detection.reason}</p> : null}
      {edge?.contradictions.length ? (
        <ul className={s.lensList} aria-label="Contradictions">
          {edge.contradictions.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : null}
      {edge?.missing_evidence ? <p className={s.meta}>Missing evidence: no shared entity connects these steps.</p> : null}
      <details open={events.length <= 2}>
        <summary>
          {refs.length} source record{refs.length === 1 ? "" : "s"} cited
        </summary>
        <ul className={s.lensList}>
          {events.slice(0, 8).map((e) => (
            <li key={e.evidence_id}>
              <span className={s.mono}>{e.event_utc}</span>, line {formatCount(e.line)}
              {SOURCE_FIELDS.filter(([key]) => e[key] !== null && e[key] !== undefined).map(([key, label]) => (
                <div key={key} className={s.meta}>
                  {label}: {String(e[key])}
                </div>
              ))}
            </li>
          ))}
        </ul>
        {!events.length && refs.length ? <p className={s.meta}>These records are outside the stored evidence sample.</p> : null}
      </details>
      <details>
        <summary>How this was decided</summary>
        <ul className={s.lensList}>
          {edge ? (
            <>
              <li>Confidence {edge.confidence}</li>
              <li>
                Rule <span className={s.mono}>{edge.rule}</span>, version <span className={s.mono}>{edge.rule_version}</span>
              </li>
              {edge.components.map((c) => (
                <li key={c.name}>
                  {c.name}: {c.value} ({c.detail})
                </li>
              ))}
            </>
          ) : null}
          {detection ? (
            <>
              <li>
                Rule <span className={s.mono}>{detection.rule_id}</span>, version <span className={s.mono}>{detection.rule_version}</span>
              </li>
              <li>Confidence {detection.confidence}</li>
              <li>
                ATT&amp;CK <span className={s.mono}>{String(node?.attributes.technique ?? detection.technique_id)}</span>, {String(node?.attributes.technique_name ?? detection.technique_name)}. A mapping, not proof of success.
              </li>
            </>
          ) : null}
          {!edge && !detection ? <li>Stated directly by the cited records.</li> : null}
        </ul>
      </details>
    </aside>
  );
}
