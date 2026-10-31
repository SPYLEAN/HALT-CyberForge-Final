"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  firex,
  formatCount,
  type AttackStory,
  type DatasetHealth,
  type EvidenceEvent,
  type Hypotheses,
  type IncidentGuide,
  type IncidentDetail,
  type IncidentGraph,
  type NarrativeResult,
  type ProofView,
  type ReachabilityResult,
} from "@/lib/firex/api";
import { nodeForEvidence } from "@/lib/firex/lens";
import { stageLabel } from "@/lib/firex/scene";
import { classify } from "@/lib/ps2/api";
import { ps2Vars } from "@/styles/ps2-palette";

import { AttackWorldView } from "./AttackWorldView";
import { EvidenceLens } from "./EvidenceLens";
import s from "./firex.module.css";
import { StatusBadge } from "./Verdict";

interface Loaded {
  detail: IncidentDetail;
  graph: IncidentGraph;
  story: AttackStory;
  hypotheses: Hypotheses;
  reach: ReachabilityResult;
  proof: ProofView;
  health: DatasetHealth | null;
  guide: IncidentGuide;
}

const PRIMARY = ["Overview", "Attack World", "Timeline", "Evidence", "Reachable Next", "Verification", "Theatre"] as const;
const ANALYST = ["ATT&CK", "Hypotheses", "Confidence", "Raw Fields"] as const;
type Tab = (typeof PRIMARY)[number] | (typeof ANALYST)[number];

export function IncidentWorkspace({ incidentId, runId }: { incidentId: string; runId?: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<{ kind: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    Promise.all([
      firex.incident(incidentId, runId),
      firex.graph(incidentId, runId),
      firex.story(incidentId, runId),
      firex.hypotheses(incidentId, runId),
      firex.reachability(incidentId, runId),
      firex.proof(incidentId, runId),
      firex.guide(incidentId, runId),
    ])
      .then(async ([detail, graph, story, hypotheses, reach, proof, guide]) => {
        const health = await firex.health(detail.summary.run_id).catch(() => null);
        if (!live) return;
        setData({ detail, graph, story, hypotheses, reach, proof, health, guide });
        setFailure(null);
      })
      .catch((e: unknown) => live && setFailure(classify(e)));
    return () => {
      live = false;
    };
  }, [incidentId, runId, attempt]);

  if (failure) {
    return (
      <div className={s.root} style={ps2Vars}>
        <div className={s.alert} role="alert">
          <p>{failure.kind === "expired" ? "This incident was not found on the server." : `The incident could not be loaded: ${failure.message}`}</p>
          <div className={s.actions}>
            <button type="button" className={s.btn} onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
            <Link className={s.btn} href="/firex">
              Log analysis
            </Link>
          </div>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={s.root} style={ps2Vars}>
        <p role="status">Loading the incident…</p>
      </div>
    );
  }
  return <Workspace data={data} incidentId={incidentId} runId={runId} />;
}

function Workspace({ data, incidentId, runId }: { data: Loaded; incidentId: string; runId?: string }) {
  const { detail, graph, story, hypotheses, reach, proof, health, guide } = data;
  const summary = detail.summary;
  const [tab, setTab] = useState<Tab>("Overview");
  const [analyst, setAnalyst] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  /** Remembers what opened the Lens, so that closing it returns focus there. */
  const openLens = (id: string | null) => {
    if (id) opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : opener.current;
    setSelected(id);
  };
  const closeLens = () => {
    setSelected(null);
    const target = opener.current;
    if (target?.isConnected) target.focus();
  };

  const tabs: readonly Tab[] = analyst ? [...PRIMARY, ...ANALYST] : PRIMARY;
  const lensBeside = tab !== "Attack World";
  return (
    <div className={s.root} style={ps2Vars} data-testid="firex-incident">
      <header className={s.head}>
        <div>
          <p className={s.crumbs}>
            <Link href="/firex">Log analysis</Link> / <Link href={`/firex/runs/${summary.run_id}`}>{health?.dataset_id ?? "Run"}</Link>
          </p>
          <h1>{summary.title}</h1>
          <p className={s.meta} style={{ marginTop: "var(--space-2)" }}>
            <span className={s.mono}>{summary.first_utc}</span> to <span className={s.mono}>{summary.last_utc}</span> UTC
          </p>
        </div>
        <div className={s.actions}>
          <StatusBadge status="Unconfirmed" large />
          <label className={s.toggle}>
            <input
              type="checkbox"
              checked={analyst}
              onChange={(e) => {
                setAnalyst(e.target.checked);
                if (!e.target.checked && (ANALYST as readonly string[]).includes(tab)) setTab("Overview");
              }}
            />
            Analyst mode
          </label>
        </div>
      </header>

      <div className={s.tabs} role="tablist" aria-label="Incident views">
        {tabs.map((name) => (
          <button key={name} type="button" role="tab" className={s.tab} aria-selected={tab === name} onClick={() => setTab(name)}>
            {name}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={tab}>
        {tab === "Overview" ? <Overview data={data} incidentId={incidentId} runId={runId} onCite={openLens} /> : null}
        {tab === "Attack World" ? (
          <AttackWorldView
            graph={graph}
            detail={detail}
            hypotheses={hypotheses}
            guide={guide}
            health={health}
            selected={selected}
            onSelect={openLens}
            onClose={closeLens}
            analyst={analyst}
            onPresent={() => setTab("Theatre")}
          />
        ) : null}
        {tab === "Timeline" ? <TimelineView detail={detail} graph={graph} onSelect={openLens} /> : null}
        {tab === "Evidence" ? <EvidenceView detail={detail} graph={graph} onSelect={openLens} /> : null}
        {tab === "Reachable Next" ? <ReachableView reach={reach} detail={detail} onReplay={() => setTab("Attack World")} /> : null}
        {tab === "Verification" ? <VerificationView proof={proof} health={health} /> : null}
        {tab === "Theatre" ? <TheatreTab runId={summary.run_id} incidentId={incidentId} /> : null}
        {tab === "ATT&CK" ? <AttackView detail={detail} /> : null}
        {tab === "Hypotheses" ? <HypothesesView hypotheses={hypotheses} /> : null}
        {tab === "Confidence" ? <ConfidenceView graph={graph} /> : null}
        {tab === "Raw Fields" ? <RawView detail={detail} /> : null}
      </div>
      {lensBeside && selected ? <EvidenceLens selected={selected} graph={graph} detail={detail} onClose={closeLens} /> : null}
      <p className={s.meta}>{story.checked_statements} statements checked against evidence. {proof.receipt.unsupported_claims} unsupported.</p>
    </div>
  );
}

function Overview({ data, incidentId, runId, onCite }: { data: Loaded; incidentId: string; runId?: string; onCite: (id: string) => void }) {
  const { story, graph, health, proof } = data;
  const rows: Array<[string, string]> = [
    ["Where did it begin?", story.where_started],
    ["Who or what was involved?", `${story.who_compromised} ${story.systems_affected}`],
    ["What is the evidence?", story.strongest_evidence],
    ["What is uncertain?", story.uncertain],
    ["What could be reached next?", story.reachable_next],
    [
      "Can this be verified?",
      `Receipt seal ${proof.verification.valid ? "valid" : "failed"}. ${health ? `Source: ${health.dimensions[0]?.status}. Processing: ${health.dimensions[1]?.status}.` : ""} Ground truth: not measured, so this incident stays unconfirmed.`,
    ],
  ];
  return (
    <div className={s.root}>
      <section aria-labelledby="what-happened" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <h2 id="what-happened" className={s.meta} style={{ fontWeight: 500 }}>
          What happened?
        </h2>
        <p className={s.conclusion}>{story.what_happened}</p>
      </section>
      <section className={s.qa} aria-label="Answers">
        {rows.map(([q, a]) => (
          <article key={q}>
            <h3>{q}</h3>
            <p>{a}</p>
          </article>
        ))}
      </section>
      <section className={s.section} aria-labelledby="story-heading">
        <h2 id="story-heading" className={s.sectionTitle}>
          The evidence, step by step
        </h2>
        <ol className={s.statements}>
          {story.statements.map((st) => {
            const node = nodeForEvidence(graph, st.evidence_ids);
            return (
              <li key={st.statement_id}>
                <button type="button" className={s.statement} onClick={() => node && onCite(node)} disabled={!node}>
                  {st.text} <span className={s.meta}>{st.kind}, {st.evidence_ids.length} citation(s)</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>
      <section className={s.section} aria-labelledby="next-checks">
        <h2 id="next-checks" className={s.sectionTitle}>
          Next checks
        </h2>
        <NextChecks guide={data.guide} />
      </section>
      <NarrativePanel incidentId={incidentId} runId={runId} />
    </div>
  );
}

function NextChecks({ guide }: { guide: IncidentGuide }) {
  return (
    <>
      <ul className={s.checks}>
        {guide.next_checks.map((c) => (
          <li key={c.kind}>
            <strong>{c.action}</strong>
            <span className={s.meta}>{c.reason}</span>
          </li>
        ))}
      </ul>
      <p className={s.meta}>{guide.note}</p>
    </>
  );
}

function NarrativePanel({ incidentId, runId }: { incidentId: string; runId?: string }) {
  const [result, setResult] = useState<NarrativeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function ask(audience: "analyst" | "executive") {
    setBusy(true);
    setError(null);
    try {
      setResult(await firex.narrative(incidentId, audience, runId));
    } catch (e) {
      setError(classify(e).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className={s.card}>
      <summary>Explain this in other words</summary>
      <div className={s.actions}>
        <button type="button" className={s.btn} disabled={busy} onClick={() => ask("analyst")}>
          For an analyst
        </button>
        <button type="button" className={s.btn} disabled={busy} onClick={() => ask("executive")}>
          For an executive
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {busy ? <p role="status">Preparing the explanation…</p> : null}
      {result ? (
        <div data-testid="narrative" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <p className={s.meta}>{result.label}</p>
          {result.fallback_reason ? <p className={s.meta}>{result.fallback_reason}</p> : null}
          <p>{result.summary}</p>
          <ul>
            {result.statements.map((st) => (
              <li key={st.text}>
                {st.text} <span className={s.meta}>{st.evidence_ids.length} citation(s)</span>
              </li>
            ))}
          </ul>
          {result.uncertainty_notes.map((n) => (
            <p key={n} className={s.meta}>
              {n}
            </p>
          ))}
          {result.rejected_statements ? <p className={s.meta}>{result.rejected_statements} unsupported statement(s) were removed.</p> : null}
        </div>
      ) : null}
    </details>
  );
}

function TimelineView({ detail, graph, onSelect }: { detail: IncidentDetail; graph: IncidentGraph; onSelect: (id: string) => void }) {
  return (
    <ol className={s.timeline} aria-label="Timeline">
      {detail.timeline.map((t) => {
        const node = nodeForEvidence(graph, t.evidence_refs);
        return (
          <li key={`${t.order}`}>
            <span className={s.mono}>
              {t.utc}
              {t.timestamp_quality === "collapsed" ? <span className={s.meta}> (ordered by file position)</span> : null}
            </span>
            <span>
              <button type="button" className={s.statement} style={{ padding: 0 }} onClick={() => node && onSelect(node)} disabled={!node}>
                <strong>{t.title}</strong>
              </button>
              <div className={s.meta}>
                {stageLabel(t.stage)}. {t.basis === "observed" ? "Observed" : "Inferred"}. {t.detail}.
              </div>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function EvidenceView({ detail, graph, onSelect }: { detail: IncidentDetail; graph: IncidentGraph; onSelect: (id: string) => void }) {
  return (
    <section className={s.section} aria-label="Evidence">
      <p className={s.meta}>
        {detail.evidence.length} cited records standing in for {formatCount(detail.alert_merge_count)} merged events. Select a record to see where it fits.
      </p>
      <ul className={s.statements}>
        {detail.evidence.slice(0, 60).map((e: EvidenceEvent) => {
          const node = nodeForEvidence(graph, [e.evidence_id]);
          return (
            <li key={e.evidence_id}>
              <button type="button" className={s.statement} onClick={() => node && onSelect(node)} disabled={!node}>
                <span className={s.mono}>{e.event_utc}</span> {e.attack ?? e.virus ?? e.message ?? e.hostname ?? `${e.event_type}/${e.subtype}`}{" "}
                <span className={s.meta}>
                  {e.user ?? e.src_ip ?? ""}
                  {e.dst_ip ? ` to ${e.dst_ip}` : ""}, line {formatCount(e.line)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ReachableView({ reach, detail, onReplay }: { reach: ReachabilityResult; detail: IncidentDetail; onReplay: () => void }) {
  const response = detail.response_simulation;
  return (
    <div className={s.grid}>
      <section className={s.card} aria-labelledby="reach-heading">
        <h2 id="reach-heading">Explore reachability</h2>
        <p className={s.notice}>{reach.label}</p>
        {reach.targets.length ? (
          <ul className={s.lensList} aria-label="Reachable systems">
            {reach.targets.map((t) => (
              <li key={t.target}>
                <strong className={s.mono}>{t.target}</strong> <span className={s.meta}>via {t.via}. {t.basis}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>No reachable next system could be established from these logs.</p>
        )}
        {reach.limitations.map((l) => (
          <p key={l} className={s.meta}>
            {l}
          </p>
        ))}
      </section>
      <section className={s.card} aria-labelledby="replay-heading">
        <h2 id="replay-heading">Replay attack</h2>
        <p>Replays the evidence-supported events that occurred, in order.</p>
        <div>
          <button type="button" className={s.btn} onClick={onReplay}>
            Open replay
          </button>
        </div>
      </section>
      <section className={s.card} aria-labelledby="simulate-heading">
        <h2 id="simulate-heading">Simulate response</h2>
        <p className={s.simulated}>{response.label}</p>
        {response.available ? null : (
          <>
            <div>
              <button type="button" className={s.btn} disabled>
                Not available
              </button>
            </div>
            <p>This incident needs context that the log does not contain:</p>
            <ul style={{ margin: 0 }}>
              {response.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function VerificationView({ proof, health }: { proof: ProofView; health: DatasetHealth | null }) {
  const r = proof.receipt;
  return (
    <div className={s.root}>
      <section className={s.verdict} data-state={proof.verification.valid ? "Unconfirmed" : "Failed"} aria-label="Verification">
        <div className={s.actions}>
          <StatusBadge status={proof.verification.valid ? "Verified" : "Failed"} large />
          <span className={s.meta}>Receipt seal</span>
        </div>
        <h2>{proof.verification.valid ? "This result has not changed since it was sealed." : "This receipt does not verify."}</h2>
        <p>A seal is tamper evidence. It is not a legal digital signature, and it does not show that the conclusion is true. This incident stays unconfirmed.</p>
        <dl className={s.facts}>
          <div>
            <dt>Evidence coverage</dt>
            <dd>{Math.round(r.evidence_coverage * 100)}%</dd>
          </div>
          <div>
            <dt>Unsupported claims</dt>
            <dd>{r.unsupported_claims}</dd>
          </div>
          <div>
            <dt>Margin over the best alternative</dt>
            <dd>{r.uncertainty_margin}</dd>
          </div>
          <div>
            <dt>Accuracy</dt>
            <dd>Not measured</dd>
          </div>
        </dl>
        {health ? (
          <p>
            <Link href={`/trust/${health.run_id}`}>Open the Trust Centre for this run</Link>
          </p>
        ) : null}
      </section>
      <details className={s.card}>
        <summary>Receipt and hashes</summary>
        <pre className={s.pre}>{JSON.stringify(r, null, 1)}</pre>
      </details>
    </div>
  );
}

function TheatreTab({ runId, incidentId }: { runId: string; incidentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function present() {
    setBusy(true);
    try {
      const manifest = await firex.createCase(runId, incidentId);
      router.push(`/theatre/${manifest.case_id}`);
    } catch (e) {
      setError(classify(e).message);
      setBusy(false);
    }
  }
  return (
    <section className={s.card} aria-labelledby="theatre-heading">
      <h2 id="theatre-heading">Present this incident</h2>
      <p>Eight chapters, built from this stored evidence, in full screen. The incident itself does not change.</p>
      {error ? (
        <p className={s.alert} role="alert">
          {error}
        </p>
      ) : null}
      <div>
        <button type="button" className={s.btnPrimary} disabled={busy} onClick={present}>
          {busy ? "Building…" : "Open Theatre"}
        </button>
      </div>
    </section>
  );
}

function AttackView({ detail }: { detail: IncidentDetail }) {
  const rows = detail.detections.flatMap((d) => d.steps.map((step) => ({ ...step, detection: d.detection_id })));
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>Technique</th>
            <th>Name</th>
            <th>Step</th>
            <th>Kill-chain stage</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.detection}${i}`}>
              <td className={s.mono}>{r.technique_id}</td>
              <td>{r.technique_name}</td>
              <td>{r.label}</td>
              <td>{stageLabel(r.stage)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={s.meta}>Labels come from the configured rules. They are mappings, not proof that a technique succeeded.</p>
    </div>
  );
}

function HypothesesView({ hypotheses }: { hypotheses: Hypotheses }) {
  return (
    <div className={s.root}>
      <p>
        Margin between the selected hypothesis and the best alternate: <strong>{hypotheses.uncertainty_margin}</strong>. These scores rank explanations. They are not
        probabilities.
      </p>
      <div className={s.grid}>
        {[hypotheses.selected, ...hypotheses.alternates].map((h) => (
          <article key={h.hypothesis_id} className={s.card}>
            <p className={s.meta}>{h.status === "selected" ? "Selected" : "Alternate"}, score {h.score}</p>
            <h3>{h.title}</h3>
            <p>{h.description}</p>
            <ul style={{ margin: 0 }}>
              {h.evidence_gaps.map((g) => (
                <li key={g} className={s.meta}>
                  {g}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}

function ConfidenceView({ graph }: { graph: IncidentGraph }) {
  const links = graph.edges.filter((e) => e.classification === "inferred");
  if (!links.length) return <p>This incident has no inferred links: each step comes from one rule on observed records.</p>;
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>Link</th>
            <th>Confidence</th>
            <th>Components</th>
            <th>Contradictions</th>
          </tr>
        </thead>
        <tbody>
          {links.map((e) => (
            <tr key={e.edge_id}>
              <td>
                {e.relation} <span className={s.meta}>({e.rule})</span>
              </td>
              <td>{e.confidence}</td>
              <td>
                {e.components.map((c) => (
                  <div key={c.name} className={s.meta}>
                    {c.name}: {c.value} ({c.detail})
                  </div>
                ))}
              </td>
              <td>{e.contradictions.join(" ") || "None"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RawView({ detail }: { detail: IncidentDetail }) {
  return (
    <section className={s.card} aria-label="Raw fields">
      <p className={s.meta}>Canonical fields of cited records. Missing source fields stay null.</p>
      <pre className={s.pre}>{JSON.stringify(detail.evidence.slice(0, 30), null, 1)}</pre>
    </section>
  );
}
