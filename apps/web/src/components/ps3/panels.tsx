"use client";

import { useState, type ReactNode } from "react";

import { PANEL_TITLES, type Panel } from "@/lib/ps3/atlas";
import { leafPaths, getPath } from "@/lib/ps3/engine/paths";
import type { Json, RuleResult, RuleStatus, StepStatus } from "@/lib/ps3/engine";

import type { AtlasStore } from "./hooks";

const short = (h: string) => `${h.slice(0, 12)}…`;
const pretty = (v: Json | undefined) => JSON.stringify(v ?? null, null, 2);

const STEP_TONE: Record<StepStatus, string> = { ok: "ok", failed: "fail", skipped: "", duplicate: "active" };
const STEP_TEXT: Record<StepStatus, string> = { ok: "passed", failed: "failed", skipped: "not reached", duplicate: "duplicate" };
const RULE_TONE: Record<RuleStatus, string> = {
  renamed: "ok",
  converted: "ok",
  defaulted: "ok",
  dropped: "",
  invalid: "fail",
  "unmapped-required": "fail",
  "missing-optional": "drift",
};

export const Tag = ({ tone, children }: { tone?: string; children: ReactNode }) => (
  <span className="ps3-tag" data-tone={tone || undefined}>
    {children}
  </span>
);

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="ps3-section" aria-label={title}>
    <h3>{title}</h3>
    {children}
  </section>
);

/** The drawer tabs and the open panel. */
export function Panels({ store, approval, onApprove }: { store: AtlasStore; approval: string | null; onApprove: (approverId: string) => void }) {
  const { q, set } = store;
  return (
    <>
      <div role="tablist" aria-label="Atlas panels" className="ps3-tabs">
        {(Object.keys(PANEL_TITLES) as Panel[]).map((p) => (
          <button key={p} type="button" role="tab" id={`tab-${p}`} aria-controls="ps3-panel" aria-selected={q.panel === p} onClick={() => set({ panel: p })}>
            {PANEL_TITLES[p]}
          </button>
        ))}
      </div>
      <div className="ps3-panel" id="ps3-panel" role="tabpanel" aria-labelledby={`tab-${q.panel}`} tabIndex={0}>
        <PanelBody store={store} approval={approval} onApprove={onApprove} />
      </div>
    </>
  );
}

export function PanelBody({ store, approval, onApprove }: { store: AtlasStore; approval: string | null; onApprove: (approverId: string) => void }) {
  switch (store.q.panel) {
    case "lens":
      return <SourceLens store={store} />;
    case "mapping":
      return <MappingChamber store={store} />;
    case "flight":
      return <PayloadFlight store={store} />;
    case "drift":
      return <DriftShockwave store={store} />;
    case "proof":
      return <ProofCorridor store={store} />;
    case "gate":
      return <ActivationGate store={store} approval={approval} onApprove={onApprove} />;
  }
}

function SourceLens({ store }: { store: AtlasStore }) {
  const { atlas, q } = store;
  const src = atlas.config.source;
  const t = atlas.trace;
  const rec = t.records[q.record];
  const xs = atlas.recording.exchanges;
  const okCount = xs.filter((x) => x.response.status < 400).length;
  const lastCursor = t.pages[t.pages.length - 1];
  return (
    <>
      <div>
        <p className="ps3-kicker">Source Lens · {src.kind === "webhook" ? "webhook" : "REST API"}</p>
        <h2 className="ps3-title">{src.vendor}</h2>
      </div>
      <dl className="ps3-kv">
        <dt>Authentication</dt>
        <dd>{src.auth.type.replaceAll("_", " ")}</dd>
        <dt>Secret</dt>
        <dd>
          <span className="ps3-mono">{src.auth.secret_ref}</span> <span className="ps3-meta">(reference only; the value never reaches the browser)</span>
        </dd>
        {src.auth.scopes ? (
          <>
            <dt>Scopes</dt>
            <dd className="ps3-mono">{src.auth.scopes.join(", ")}</dd>
          </>
        ) : null}
        <dt>Endpoint</dt>
        <dd className="ps3-mono">{src.endpoint}</dd>
        <dt>Pagination</dt>
        <dd>
          {src.pagination.type === "cursor"
            ? `Cursor "${src.pagination.cursor_param}", page size ${src.pagination.page_size}; ${t.pages.length} pages, final cursor ${lastCursor?.cursor_out ?? "none (end reached)"}`
            : `None (push), ${t.pages.length} deliveries`}
        </dd>
        <dt>Rate limit</dt>
        <dd>{src.rate_limit.requests_per_minute} requests/min</dd>
        <dt>Health</dt>
        <dd>
          {`${okCount} of ${xs.length} recorded exchanges succeeded`}
          {t.retries.length ? `; ${t.retries.length} rate-limited and retried` : ""} <Tag tone={t.auth.ok ? "ok" : "fail"}>{t.auth.ok ? "AUTH OK" : "AUTH FAILED"}</Tag>
        </dd>
        <dt>Recorded</dt>
        <dd className="ps3-mono">{t.captured_at}</dd>
      </dl>
      {rec ? (
        <Section title={`Sample payload ${rec.source_id} → mapped output`}>
          <div className="ps3-pair">
            <div>
              <p className="ps3-meta">Source (redacted)</p>
              <pre className="ps3-code" data-testid="lens-input">{pretty(rec.steps[0]!.after)}</pre>
            </div>
            <div>
              <p className="ps3-meta">{atlas.plan.connector.mapping.target} output</p>
              <pre className="ps3-code" data-testid="lens-output">{pretty(rec.steps.find((s) => s.stage_id === "xf.normalize")!.after)}</pre>
            </div>
          </div>
        </Section>
      ) : null}
      <details>
        <summary className="ps3-meta">Connector configuration {atlas.config.version} (JSON)</summary>
        <pre className="ps3-code">{pretty(atlas.config as unknown as Json)}</pre>
      </details>
    </>
  );
}

function MappingChamber({ store }: { store: AtlasStore }) {
  const { atlas, q } = store;
  const rec = atlas.trace.records[q.record];
  const [picked, setPicked] = useState<string | null>(null);
  if (!rec) return <p className="ps3-body">No record in this dry run.</p>;
  const input = rec.steps[0]!.after;
  const out = rec.steps.find((s) => s.stage_id === "xf.map")!.after;
  const sel: RuleResult | undefined = rec.rules.find((r) => r.rule.id === picked) ?? rec.rules.find((r) => RULE_TONE[r.status] === "fail");
  const bad = rec.rules.filter((r) => r.status === "unmapped-required" || (r.status === "invalid" && r.rule.required));
  return (
    <>
      <div>
        <p className="ps3-kicker">Mapping Chamber · {atlas.config.mapping.version} → {atlas.config.mapping.target}</p>
        <h2 className="ps3-title">{`${rec.rules.filter((r) => r.output !== undefined).length} fields mapped for ${rec.source_id}`}</h2>
      </div>
      {bad.length ? (
        <p className="ps3-notice" role="alert" style={{ borderColor: "var(--ps3-failure)" }}>
          <strong>{`${bad.length} required field${bad.length === 1 ? "" : "s"} cannot be mapped: `}</strong>
          {bad.map((r) => `${r.rule.from} → ${r.rule.to}`).join(", ")}
        </p>
      ) : null}
      <Section title="Rules: input → operation → output">
        <ul className="ps3-rules">
          {rec.rules.map((r) => (
            <li key={r.rule.id}>
              <button
                type="button"
                className="ps3-rule"
                aria-pressed={sel?.rule.id === r.rule.id}
                data-bad={RULE_TONE[r.status] === "fail"}
                onClick={() => setPicked(r.rule.id)}
                aria-label={`${r.rule.id}: ${r.rule.from ?? "constant"} to ${r.rule.to ?? "dropped"}, ${r.status.replace("-", " ")}`}
              >
                <span style={{ overflowWrap: "anywhere" }}>{r.rule.from ?? <em>constant</em>}</span>
                <Tag tone={RULE_TONE[r.status]}>{`${r.rule.op} · ${r.status === "unmapped-required" ? "UNMAPPED · REQUIRED" : r.status}`}</Tag>
                <span style={{ overflowWrap: "anywhere", textAlign: "right" }}>{r.rule.to ?? "—"}</span>
              </button>
            </li>
          ))}
        </ul>
      </Section>
      {sel ? (
        <Section title={`Rule ${sel.rule.id}: configuration and test evidence`}>
          <div className="ps3-pair">
            <pre className="ps3-code">{pretty(sel.rule as unknown as Json)}</pre>
            <dl className="ps3-kv">
              {store.atlas.trace.records.map((r) => {
                const x = r.rules.find((y) => y.rule.id === sel.rule.id)!;
                return (
                  <div key={`${r.source_id}-${r.page}`} style={{ display: "contents" }}>
                    <dt className="ps3-mono">{r.source_id}</dt>
                    <dd className="ps3-mono">{`${x.input === undefined ? "∅" : JSON.stringify(x.input)} → ${x.output === undefined ? "∅" : JSON.stringify(x.output)} (${x.status})`}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
        </Section>
      ) : null}
      <Section title="Input fields not used by any rule">
        <p className="ps3-body">{rec.ignored_fields.length ? rec.ignored_fields.join(", ") : "None"}</p>
      </Section>
      <p className="ps3-meta">{`Input ${leafPaths(input).length} fields · output ${leafPaths(out).length} fields`}</p>
    </>
  );
}

function diff(before: Json, after: Json) {
  const paths = [...new Set([...leafPaths(before), ...leafPaths(after)])];
  return paths.flatMap((p) => {
    const a = getPath(before, p);
    const b = getPath(after, p);
    if (JSON.stringify(a) === JSON.stringify(b)) return [];
    return [{ path: p, before: a, after: b }];
  });
}

function PayloadFlight({ store }: { store: AtlasStore }) {
  const { atlas, q, set } = store;
  const recs = atlas.trace.records;
  const rec = recs[q.record];
  if (!rec) return <p className="ps3-body">No record in this dry run.</p>;
  const step = rec.steps[q.t]!;
  const stage = atlas.plan.stages.find((s) => s.id === step.stage_id)!;
  const changes = diff(step.before, step.after);
  return (
    <>
      <div>
        <p className="ps3-kicker">Payload Flight · dry run {short(atlas.trace.digest)}</p>
        <h2 className="ps3-title">{`${rec.source_id} at ${stage.title}`}</h2>
      </div>
      <label className="ps3-meta" style={{ display: "grid", gap: 4 }}>
        Record
        <select value={q.record} onChange={(e) => set({ record: Number(e.target.value), t: 0 })} className="ps3-btn" style={{ textTransform: "none", fontFamily: "var(--font-display)" }}>
          {recs.map((r, i) => (
            <option key={i} value={i}>{`${r.source_id} · ${r.outcome}`}</option>
          ))}
        </select>
      </label>
      <ol className="ps3-steps" aria-label="Pipeline steps for this record">
        {rec.steps.map((s, i) => {
          const st = atlas.plan.stages.find((x) => x.id === s.stage_id)!;
          return (
            <li key={s.stage_id} aria-current={i === q.t ? "step" : undefined} data-status={s.status === "ok" ? "passed" : s.status === "failed" ? "failed" : "idle"}>
              <span className="ps3-dot" aria-hidden />
              <span>{st.title}</span>
              <Tag tone={STEP_TONE[s.status]}>{STEP_TEXT[s.status]}</Tag>
            </li>
          );
        })}
      </ol>
      <Section title="Evidence at this step">
        <ul className="ps3-body" style={{ margin: 0, paddingLeft: 18 }}>
          {step.evidence.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </Section>
      <Section title="Before → after">
        {changes.length ? (
          <ul className="ps3-mono" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }} aria-label="Field changes at this step">
            {changes.slice(0, 24).map((c) => (
              <li key={c.path}>
                {c.path}: {c.before !== undefined ? <span className="ps3-diff-del">{JSON.stringify(c.before)}</span> : null}
                {c.before !== undefined && c.after !== undefined ? " → " : " "}
                {c.after !== undefined ? <span className="ps3-diff-add">{JSON.stringify(c.after)}</span> : <em>(removed)</em>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ps3-body">No field changes at this stage; it checks or routes the record.</p>
        )}
      </Section>
      <p className="ps3-meta ps3-mono">{`step hash ${short(step.hash)}`}</p>
    </>
  );
}

function DriftShockwave({ store }: { store: AtlasStore }) {
  const { atlas, q, set, fx } = store;
  const scenarios = fx.drift.filter((s) => s.connector_id === atlas.config.id.replace(/-draft.*$/, "") || s.connector_id === q.connector);
  const a = atlas.analysis;
  const title = (id: string) => atlas.plans.flatMap((p) => p.stages).find((s) => s.id === id)?.title ?? id;
  return (
    <>
      <div>
        <p className="ps3-kicker">Drift Shockwave · controlled simulation</p>
        <h2 className="ps3-title">{a ? a.scenario.title : "What breaks if the source changes?"}</h2>
      </div>
      <div role="group" aria-label="Drift scenarios" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {scenarios.map((s) => (
          <button key={s.id} type="button" className="ps3-btn" aria-pressed={q.drift === s.id} onClick={() => set({ drift: q.drift === s.id ? null : s.id })} style={{ justifyContent: "flex-start", textTransform: "none", fontFamily: "var(--font-display)", fontSize: 13.5, letterSpacing: 0 }}>
            {s.title}
          </button>
        ))}
        {q.drift ? (
          <button type="button" className="ps3-btn" onClick={() => set({ drift: null })}>
            Clear drift
          </button>
        ) : null}
      </div>
      {a ? (
        <>
          <Section title="Affected mappings">
            {a.affected_rules.length ? (
              <ul className="ps3-rules">
                {a.affected_rules.map((r) => (
                  <li key={r.id} className="ps3-mono" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {`${r.id} ${r.from} → ${r.to}`} <Tag tone="drift">{`${r.was} → ${r.now}`}</Tag>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ps3-body">None.</p>
            )}
          </Section>
          <Section title="Stages that now fail">
            {a.failed_stages.length ? (
              <ul className="ps3-body" style={{ margin: 0, paddingLeft: 18 }}>
                {a.failed_stages.map((f) => (
                  <li key={f.stage_id}>
                    <strong>{title(f.stage_id)}</strong>: {f.evidence.join("; ")}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ps3-body">None.</p>
            )}
          </Section>
          <Section title="Destinations">
            <ul className="ps3-rules">
              {a.broken_destinations.map((d) => (
                <li key={d} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Tag tone="fail">BROKEN</Tag> {title(d)}
                </li>
              ))}
              {a.unaffected_destinations.map((d) => (
                <li key={d} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Tag>UNAFFECTED</Tag> {title(d)}
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Proposed repair (draft)">
            {a.repair ? (
              <>
                <p className="ps3-body">
                  <span className="ps3-mono">{`${a.repair.rule_id}: from "${a.repair.from}" → from "${a.repair.to}"`}</span>
                  <br />
                  {a.repair.evidence}
                </p>
                {q.repair ? (
                  <p className="ps3-notice" role="status">
                    {`Draft ${atlas.config.version} applied to this dry run only. The configuration in use (${atlas.config.version.replace(/-draft.*$/, "")}) is unchanged. Result: ${atlas.receipt.records.delivered} delivered, ${atlas.receipt.records.rejected} rejected.`}
                  </p>
                ) : (
                  <button type="button" className="ps3-btn ps3-btn-primary" onClick={() => set({ repair: true })}>
                    Review: dry-run the draft as a new version
                  </button>
                )}
                {q.repair ? (
                  <button type="button" className="ps3-btn" onClick={() => set({ repair: false })}>
                    Discard the draft
                  </button>
                ) : null}
              </>
            ) : (
              <p className="ps3-body">{a.no_repair_reason}</p>
            )}
          </Section>
        </>
      ) : (
        <p className="ps3-body">Choose a change. HALT re-runs the same configuration against the changed payload and compares every stage. Nothing is changed in the configuration.</p>
      )}
    </>
  );
}

function ProofCorridor({ store }: { store: AtlasStore }) {
  const { atlas, q } = store;
  const rec = atlas.trace.records[q.record];
  if (!rec) return <p className="ps3-body">No record in this dry run.</p>;
  const plan = atlas.plan;
  const stage = (id: string) => plan.stages.find((s) => s.id === id)!.title;
  const vals = rec.steps.filter((s) => s.stage_id.startsWith("val."));
  const dsts = rec.steps.filter((s) => s.stage_id.startsWith("dst."));
  const page = atlas.trace.pages[rec.page]!;
  return (
    <>
      <div>
        <p className="ps3-kicker">Proof Corridor · {rec.outcome}</p>
        <h2 className="ps3-title">{`Provenance of ${rec.source_id}`}</h2>
      </div>
      <dl className="ps3-kv">
        <dt>Source event</dt>
        <dd className="ps3-mono">{rec.source_id}</dd>
        <dt>Received</dt>
        <dd className="ps3-mono">{`seq ${page.seq} · ${page.at}`}</dd>
        <dt>Connector config</dt>
        <dd className="ps3-mono">{`${plan.connector.version} · sha256 ${short(plan.config_hash)}`}</dd>
        <dt>Mapping</dt>
        <dd className="ps3-mono">{`${plan.connector.mapping.version} · sha256 ${short(plan.mapping_hash)}`}</dd>
        <dt>Dry-run digest</dt>
        <dd className="ps3-mono">{short(atlas.trace.digest)}</dd>
      </dl>
      <Section title="Validation results">
        <ul className="ps3-rules">
          {vals.map((v) => (
            <li key={v.stage_id} style={{ display: "grid", gap: 2 }}>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Tag tone={STEP_TONE[v.status]}>{STEP_TEXT[v.status]}</Tag> {stage(v.stage_id)}
              </span>
              <span className="ps3-meta">{v.evidence.join("; ")}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Transformation hashes (SHA-256 of each stage's output)">
        <ol className="ps3-mono" style={{ margin: 0, paddingLeft: 22, display: "grid", gap: 2 }}>
          {rec.steps.map((s) => (
            <li key={s.stage_id}>{`${s.stage_id} ${short(s.hash)}`}</li>
          ))}
        </ol>
      </Section>
      <Section title="Destination acknowledgements (SIMULATED)">
        <ul className="ps3-rules">
          {dsts.map((d) => (
            <li key={d.stage_id} style={{ display: "grid", gap: 2 }}>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Tag tone={STEP_TONE[d.status]}>{STEP_TEXT[d.status]}</Tag> {stage(d.stage_id)}
              </span>
              <span className="ps3-meta ps3-mono">{d.evidence.join("; ") || "Not reached"}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Retry history">
        {atlas.trace.retries.length ? (
          <ul className="ps3-mono" style={{ margin: 0, paddingLeft: 18 }}>
            {atlas.trace.retries.map((r) => (
              <li key={r.seq}>{`${r.at} · HTTP ${r.status} · retry-after ${r.retry_after_s ?? "—"} s · retried as seq ${r.then ?? "—"}`}</li>
            ))}
          </ul>
        ) : (
          <p className="ps3-body">No retries recorded.</p>
        )}
      </Section>
    </>
  );
}

function ActivationGate({ store, approval, onApprove }: { store: AtlasStore; approval: string | null; onApprove: (approverId: string) => void }) {
  const { atlas, fx } = store;
  const r = atlas.receipt;
  const approver = fx.approvers.find((a) => a.role === "integration_owner");
  const approvedBy = fx.approvers.find((a) => a.id === approval);
  const blocked = atlas.blockers.length > 0;
  return (
    <>
      <div>
        <p className="ps3-kicker">Activation Gate · <span className="ps3-sim">SIMULATED</span></p>
        <h2 className="ps3-title">{`Integration Receipt ${r.id}`}</h2>
      </div>
      <dl className="ps3-kv" aria-label="Integration Receipt">
        <dt>Connector</dt>
        <dd className="ps3-mono">{`${r.connector_id} ${r.config_version}`}</dd>
        <dt>Config hash</dt>
        <dd className="ps3-mono">{short(r.config_hash)}</dd>
        <dt>Mapping</dt>
        <dd className="ps3-mono">{`${r.mapping_version} · ${short(r.mapping_hash)}`}</dd>
        <dt>Dry run</dt>
        <dd className="ps3-mono">{`${short(r.digest)} · recorded ${r.captured_at}`}</dd>
        <dt>Records</dt>
        <dd>{`${r.records.delivered} delivered · ${r.records.partial} partial · ${r.records.rejected} rejected · ${r.records.duplicate} duplicate`}</dd>
        {r.destinations.map((d) => (
          <div key={d.id} style={{ display: "contents" }}>
            <dt>{d.title}</dt>
            <dd>{`${d.accepted} accepted · ${d.rejected} rejected`}</dd>
          </div>
        ))}
        <dt>Retries</dt>
        <dd>{r.retries}</dd>
      </dl>
      {blocked ? (
        <div className="ps3-notice" role="status" style={{ borderColor: "var(--ps3-failure)" }}>
          <strong>Activation blocked.</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {atlas.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {approvedBy ? (
        <p className="ps3-notice" role="status" style={{ borderColor: "var(--ps3-verified)" }}>
          {`Approved for activation by ${approvedBy.name} (${approvedBy.title}). SIMULATED: no live connector exists for this tool, so nothing was activated.`}
        </p>
      ) : approver ? (
        <>
          <p className="ps3-body">{`Activation needs explicit approval from the ${approver.role.replaceAll("_", " ")}: ${approver.name}, ${approver.title}.`}</p>
          <button type="button" className="ps3-btn ps3-btn-primary" disabled={blocked} aria-describedby={blocked ? "gate-reason" : undefined} onClick={() => onApprove(approver.id)}>
            {`Approve activation as ${approver.name}`}
          </button>
          {blocked ? (
            <p id="gate-reason" className="ps3-meta">
              Disabled until the blockers above are resolved.
            </p>
          ) : null}
        </>
      ) : null}
    </>
  );
}
