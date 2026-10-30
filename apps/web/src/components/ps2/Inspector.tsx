"use client";

import type { ReactNode } from "react";

import type { CandidateEdge, CanonicalEvent, Entity, ReconstructedGraph, StageAssignment, StoryStatement, ThreadNode } from "@/lib/ps2/api";
import { ENTITY_WORD, clock, gapsOf } from "@/lib/ps2/graph";

import { num, pct, Ps2Chip, Ref, statusTone, TableScroll } from "./common";
import s from "./ps2.module.css";

/** Entity-bearing fields of a canonical event, in reading order. Only fields the API returned are shown. */
const EVENT_FIELDS: Array<[keyof CanonicalEvent, string]> = [
  ["action", "Action"],
  ["outcome", "Outcome"],
  ["severity", "Severity"],
  ["actor_user", "Actor"],
  ["actor_kind", "Actor kind"],
  ["actor_alias", "Actor alias"],
  ["target_user", "Target user"],
  ["src_ip", "Source IP"],
  ["dst_ip", "Destination IP"],
  ["asn", "ASN"],
  ["user_agent", "User agent"],
  ["device", "Device"],
  ["device_id", "Device id"],
  ["host", "Host"],
  ["session", "Session"],
  ["token", "Token presented"],
  ["token_issued", "Token issued"],
  ["application", "Application"],
  ["application_name", "Application name"],
  ["process", "Process"],
  ["process_id", "Process id"],
  ["parent_process", "Parent process"],
  ["parent_process_id", "Parent process id"],
  ["resource", "Resource"],
  ["resource_type", "Resource type"],
  ["business_service", "Business service"],
  ["request_count", "Requests"],
  ["window_s", "Window (s)"],
  ["scopes", "Scopes"],
  ["publisher_verified", "Publisher verified"],
  ["app_age_days", "App age (days)"],
  ["credential_type", "Credential type"],
  ["interactive", "Interactive"],
  ["link_type", "Link type"],
  ["sender_domain", "Sender domain"],
  ["sender_domain_age_days", "Sender domain age (days)"],
  ["role", "Role"],
  ["permission", "Permission"],
];

function present(v: unknown): boolean {
  return v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
}

function show(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

export interface InspectorData {
  graph: ReconstructedGraph;
  events: Record<string, CanonicalEvent>;
  entities: Record<string, Entity>;
  edges: Record<string, CandidateEdge>; // causal, entity, forecast and rejected edges
  stages: Record<string, StageAssignment>;
  statements: StoryStatement[];
  pathEdgeIds: Set<string>;
  alternateEdgeIds: Set<string>;
}

export function Inspector({ id, data, onSelect, headingId }: { id: string | null; data: InspectorData; onSelect: (id: string) => void; headingId?: string }) {
  const node = id ? data.graph.nodes.find((n) => n.node_id === id) : undefined;
  let title = "Evidence";
  let body: ReactNode = (
    <p className="v2-meta">Select a node, an edge, a story reference or a missing-evidence marker to see the evidence the API returned for it.</p>
  );
  const gap = id?.startsWith("gap:") ? gapsOf(data.statements).find((g) => g.id === id) : undefined;
  if (gap) {
    title = "Missing evidence";
    body = <GapView statement={gap.statement} onSelect={onSelect} />;
  } else if (id && data.edges[id]) {
    title = "Edge evidence";
    body = <EdgeView edge={data.edges[id]!} data={data} onSelect={onSelect} />;
  } else if (id && data.events[id]) {
    title = "Event evidence";
    body = <EventView event={data.events[id]!} node={node} stage={data.stages[id]} onSelect={onSelect} />;
  } else if (id && data.entities[id]) {
    title = node?.node_kind === "business_service" ? "Business service" : "Entity evidence";
    body = <EntityView entity={data.entities[id]!} node={node} data={data} onSelect={onSelect} />;
  } else if (id) {
    body = <p className="v2-meta">{`No evidence for ${id} is in the API responses for this run.`}</p>;
  }
  return (
    <section aria-labelledby={headingId ?? "inspector-head"} data-testid="inspector">
      <p className="v2-kicker">Evidence inspector</p>
      <h2 id={headingId ?? "inspector-head"} className="v2-section" tabIndex={-1} style={{ margin: "4px 0 var(--space-3)" }}>
        {title}
      </h2>
      {body}
    </section>
  );
}

interface Row {
  k: string;
  v: ReactNode;
}
const row = (k: string, v: ReactNode): Row => ({ k, v });

function KV({ rows }: { rows: Array<Row | null | false | undefined> }) {
  return (
    <dl className={s.kv}>
      {rows
        .filter((r): r is Row => Boolean(r))
        .map((r) => (
          <div key={r.k} style={{ display: "contents" }}>
            <dt>{r.k}</dt>
            <dd>{r.v}</dd>
          </div>
        ))}
    </dl>
  );
}

function EventView({ event: e, node, stage, onSelect }: { event: CanonicalEvent; node?: ThreadNode; stage?: StageAssignment; onSelect: (id: string) => void }) {
  void onSelect;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <KV
        rows={[
          row("Event id", <span className={s.mono}>{e.event_id}</span>),
          row("Event kind", e.event_kind),
          row("Timestamp", <span className={s.mono}>{e.occurred_at}</span>),
          row("Source type", e.source_type),
          row("Source record", <span className={s.mono}>{`${e.evidence.source_name} · ${e.evidence.source_record_id}${e.evidence.line != null ? ` · line ${e.evidence.line}` : ""}`}</span>),
          row("Parser", <span className={s.mono}>{e.evidence.parser}</span>),
          row("Raw-record hash", <span className={s.mono}>{e.evidence.raw_sha256}</span>),
          row("Status", <Ps2Chip tone="observed">OBSERVED RECORD</Ps2Chip>),
          node ? row("Suspicion", `${num(node.suspicion)}${node.seed ? " · seed" : ""}`) : row("In graph", "no (outside the reduced graph)"),
          e.anomaly_score != null && row("HALT-R1 anomaly", num(e.anomaly_score)),
        ]}
      />
      <div>
        <h3 className="v2-kicker">Entity fields</h3>
        <KV rows={EVENT_FIELDS.filter(([k]) => present(e[k])).map(([k, label]) => row(label, <span className={s.mono}>{show(e[k])}</span>))} />
      </div>
      {stage?.primary ? (
        <div>
          <h3 className="v2-kicker">ATT&amp;CK mapping</h3>
          <p style={{ margin: 0 }}>
            {`${stage.primary.tactic} · ${stage.primary.technique_id} ${stage.primary.technique_name} · `}
            <BasisWord basis={stage.primary.basis} />
          </p>
          <p className="v2-meta" style={{ margin: "4px 0 0" }}>{stage.primary.rule}</p>
        </div>
      ) : null}
    </div>
  );
}

export function BasisWord({ basis }: { basis: string }) {
  if (basis === "observed") return <Ps2Chip tone="observed">DIRECT · OBSERVED</Ps2Chip>;
  if (basis === "rule_inferred") return <Ps2Chip tone="inferred">RULE-INFERRED</Ps2Chip>;
  return <Ps2Chip tone="missing">UNCERTAIN CANDIDATE</Ps2Chip>;
}

function EdgeView({ edge: e, data, onSelect }: { edge: CandidateEdge; data: InspectorData; onSelect: (id: string) => void }) {
  const role = data.pathEdgeIds.has(e.edge_id) ? "selected" : data.alternateEdgeIds.has(e.edge_id) ? "alternate" : null;
  const contradiction = e.components.find((c) => c.name === "contradiction");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div className="v2-btn-row">
        <Ps2Chip tone={e.classification === "forecast" ? "forecast" : statusTone(e.classification === "context" ? "observed" : e.classification)}>
          {e.classification.toUpperCase()}
        </Ps2Chip>
        {role ? <Ps2Chip tone={role} /> : null}
        {e.rejection_reason ? <Ps2Chip tone="neutral">REJECTED HYPOTHESIS</Ps2Chip> : null}
      </div>
      <KV
        rows={[
          row("Edge id", <span className={s.mono}>{e.edge_id}</span>),
          row("Relation", e.edge_type),
          row("From", <Ref id={e.source} onSelect={onSelect} />),
          row("To", <Ref id={e.target} onSelect={onSelect} />),
          row("Confidence", pct(e.confidence)),
          row("Rule version", <span className={s.mono}>{e.rule_version}</span>),
          e.first_observed ? row("First observed", <span className={s.mono}>{e.first_observed}</span>) : null,
          e.last_observed ? row("Last observed", <span className={s.mono}>{e.last_observed}</span>) : null,
          row("Evidence fields", e.evidence_fields.length ? <span className={s.mono}>{e.evidence_fields.join(", ")}</span> : "none recorded"),
          e.rejection_reason ? row("Rejected because", e.rejection_reason) : null,
          row("Contradictions", contradiction ? contradiction.detail : "none recorded on the shared entity"),
        ]}
      />
      <div>
        <h3 className="v2-kicker">Evidence events</h3>
        <div className="v2-btn-row">
          {e.evidence_event_ids.map((x) => (
            <Ref key={x} id={x} onSelect={onSelect} />
          ))}
        </div>
      </div>
      <TableScroll label="Confidence components table">
        <table className={s.table}>
          <caption className="v2-kicker" style={{ textAlign: "left", paddingBottom: 4 }}>
            Confidence components
          </caption>
          <thead>
            <tr>
              <th scope="col">Component</th>
              <th scope="col" className={s.num}>
                Value
              </th>
              <th scope="col" className={s.num}>
                Weight
              </th>
            </tr>
          </thead>
          <tbody>
            {e.components.map((c) => (
              <tr key={c.name}>
                <th scope="row" style={{ fontWeight: 400 }}>
                  <span className={s.mono}>{c.name}</span>
                  <span className="v2-meta" style={{ display: "block" }}>
                    {c.detail}
                  </span>
                </th>
                <td className={s.num}>{num(c.value)}</td>
                <td className={s.num}>{num(c.weight)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </div>
  );
}

function EntityView({ entity: x, node, data, onSelect }: { entity: Entity; node?: ThreadNode; data: InspectorData; onSelect: (id: string) => void }) {
  const kept = new Set(data.graph.nodes.map((n) => n.node_id));
  const forecasts = data.graph.forecast_edges.filter((f) => f.target === x.entity_id);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <KV
        rows={[
          row("Entity id", <span className={s.mono}>{x.entity_id}</span>),
          row("Type", ENTITY_WORD[x.entity_type] ?? x.entity_type),
          row("Label", <span className={s.mono}>{x.label}</span>),
          node?.criticality ? row("Criticality", node.criticality) : null,
          row("Resolution", `${x.method} · confidence ${pct(x.confidence)}`),
          row("Matching fields", <span className={s.mono}>{x.matching_fields.join(", ")}</span>),
          row("Resolution version", <span className={s.mono}>{x.resolution_version}</span>),
        ]}
      />
      {forecasts.length ? (
        <div>
          <h3 className="v2-kicker">Forecast reach</h3>
          {forecasts.map((f) => (
            <p key={f.edge_id} style={{ margin: 0 }}>
              <Ps2Chip tone="forecast" /> <Ref id={f.edge_id} onSelect={onSelect} label={`${f.edge_type} · ${pct(f.confidence)}`} />
            </p>
          ))}
        </div>
      ) : null}
      <div>
        <h3 className="v2-kicker">Aliases</h3>
        {x.aliases.length ? (
          <ul className={s.rows}>
            {x.aliases.map((a) => (
              <li key={`${a.field}:${a.value}`} className={s.row}>
                <span className={s.mono}>{`${a.field}: ${a.value}`}</span>
                <span className="v2-btn-row">
                  {a.event_ids.map((e) => (
                    <Ref key={e} id={e} onSelect={onSelect} />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="v2-meta">None recorded.</p>
        )}
      </div>
      <div>
        <h3 className="v2-kicker">Contradictions</h3>
        {x.contradictions.length ? (
          <ul className={s.rows}>
            {x.contradictions.map((c) => (
              <li key={c.field} className={s.row}>
                <span>{`${c.field}: ${c.values.join(" vs ")}`}</span>
                <span className="v2-btn-row">
                  {c.event_ids.map((e) => (
                    <Ref key={e} id={e} onSelect={onSelect} />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="v2-meta">None recorded.</p>
        )}
      </div>
      <div>
        <h3 className="v2-kicker">{`Seen in ${x.source_event_ids.length} events`}</h3>
        <div className="v2-btn-row">
          {x.source_event_ids.filter((e) => kept.has(e)).map((e) => (
            <Ref key={e} id={e} onSelect={onSelect} label={`${e} · ${clock(data.events[e]?.occurred_at)}`} />
          ))}
        </div>
        {x.source_event_ids.some((e) => !kept.has(e)) ? (
          <p className="v2-meta">{`${x.source_event_ids.filter((e) => !kept.has(e)).length} more outside the reduced graph.`}</p>
        ) : null}
      </div>
    </div>
  );
}

function GapView({ statement, onSelect }: { statement: StoryStatement; onSelect: (id: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <Ps2Chip tone="missing" />
      <p className={s.statement}>{statement.text}</p>
      <div className="v2-btn-row">
        {statement.event_ids.map((e) => (
          <Ref key={e} id={e} onSelect={onSelect} />
        ))}
      </div>
      <p className="v2-meta">{`Statement ${statement.statement_id} · confidence ${pct(statement.confidence)}`}</p>
    </div>
  );
}
