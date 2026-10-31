"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { classify } from "@/lib/ps2/api";
import {
  firex,
  formatCount,
  type AttackHypothesis,
  type AttackStory,
  type EvidenceEvent,
  type Hypotheses,
  type IncidentDetail,
  type IncidentGraph,
  type NarrativeResult,
  type ProofView,
  type ReachabilityResult,
} from "@/lib/firex/api";
import {
  ALL_ON,
  CAMERA_PRESETS,
  LAYER_LABEL,
  layoutGraph,
  pathSteps,
  presetNodes,
  stageLabel,
  type CameraPreset,
  type Toggles,
} from "@/lib/firex/scene";
import { ps2Vars } from "@/styles/ps2-palette";

import s from "./firex.module.css";
import { Graph2D } from "./Graph2D";

// WebGL has no server rendering, and the library is only downloaded when an incident's 3D view opens.
const AttackGraph3D = dynamic(() => import("./AttackGraph3D"), { ssr: false, loading: () => <p role="status">Loading the 3D view…</p> });

interface Loaded {
  detail: IncidentDetail;
  graph: IncidentGraph;
  story: AttackStory;
  hypotheses: Hypotheses;
  reach: ReachabilityResult;
  proof: ProofView;
}

const PRIMARY = ["Summary", "3D Attack Path", "Timeline", "Evidence", "Reachable Next"] as const;
const ANALYST = ["ATT&CK", "Kill Chain", "Hypotheses", "Confidence", "Raw Fields", "Proof", "Evaluation"] as const;
type Tab = (typeof PRIMARY)[number] | (typeof ANALYST)[number];

function useMedia(query: string): boolean {
  const [hit, setHit] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const m = window.matchMedia(query);
    const on = () => setHit(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return hit;
}

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
    ])
      .then(([detail, graph, story, hypotheses, reach, proof]) => {
        if (!live) return;
        setData({ detail, graph, story, hypotheses, reach, proof });
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
            <button type="button" className="halt-btn" onClick={() => setAttempt((n) => n + 1)}>
              <span>TRY AGAIN</span>
            </button>
            <Link className="halt-btn" href="/firex">
              <span>DATASETS</span>
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
  return <Loaded data={data} incidentId={incidentId} runId={runId} />;
}

function Loaded({ data, incidentId, runId }: { data: Loaded; incidentId: string; runId?: string }) {
  const { detail, graph, story, hypotheses, reach, proof } = data;
  const summary = detail.summary;
  const [tab, setTab] = useState<Tab>("Summary");
  const [analyst, setAnalyst] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const evidenceById = useMemo(() => new Map(detail.evidence.map((e) => [e.evidence_id, e])), [detail.evidence]);

  const tabs: readonly Tab[] = analyst ? [...PRIMARY, ...ANALYST] : PRIMARY;
  return (
    <div className={s.root} style={ps2Vars} data-testid="firex-incident">
      <header className={s.head}>
        <div>
          <p className={s.meta}>
            <Link href="/firex">Datasets</Link>
            {" / "}
            <Link href={`/firex/runs/${summary.run_id}`}>{summary.run_id}</Link>
          </p>
          <h1>{summary.title}</h1>
          <p className={s.meta}>
            <span className={s.mono}>{incidentId}</span> · {summary.first_utc} to {summary.last_utc} UTC
          </p>
        </div>
        <div className={s.actions}>
          <span className={`${s.chip} ${s.chipUnconfirmed}`}>UNCONFIRMED</span>
          <span className={`${s.chip} ${s.chipThreat}`}>RISK {summary.risk}</span>
          <span className={s.chip}>CONFIDENCE {summary.confidence}</span>
          <label className={s.toggle}>
            <input
              type="checkbox"
              checked={analyst}
              onChange={(e) => {
                setAnalyst(e.target.checked);
                if (!e.target.checked && (ANALYST as readonly string[]).includes(tab)) setTab("Summary");
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
        {tab === "Summary" ? <SummaryView story={story} incidentId={incidentId} runId={runId} evidenceById={evidenceById} /> : null}
        {tab === "3D Attack Path" ? (
          <AttackPath graph={graph} hypotheses={hypotheses} selected={selected} onSelect={setSelected} detail={detail} evidenceById={evidenceById} />
        ) : null}
        {tab === "Timeline" ? <TimelineView detail={detail} /> : null}
        {tab === "Evidence" ? <EvidenceView detail={detail} /> : null}
        {tab === "Reachable Next" ? <ReachableView reach={reach} detail={detail} onReplay={() => setTab("3D Attack Path")} /> : null}
        {tab === "ATT&CK" ? <AttackView detail={detail} /> : null}
        {tab === "Kill Chain" ? <KillChainView detail={detail} /> : null}
        {tab === "Hypotheses" ? <HypothesesView hypotheses={hypotheses} /> : null}
        {tab === "Confidence" ? <ConfidenceView graph={graph} /> : null}
        {tab === "Raw Fields" ? <RawView detail={detail} /> : null}
        {tab === "Proof" ? <ProofPanel proof={proof} /> : null}
        {tab === "Evaluation" ? <EvaluationView /> : null}
      </div>
    </div>
  );
}

function SummaryView({
  story,
  incidentId,
  runId,
  evidenceById,
}: {
  story: AttackStory;
  incidentId: string;
  runId?: string;
  evidenceById: Map<string, EvidenceEvent>;
}) {
  const rows: Array<[string, string]> = [
    ["What happened?", story.what_happened],
    ["Where did it start?", story.where_started],
    ["Who or what was compromised?", story.who_compromised],
    ["Which systems were affected?", story.systems_affected],
    ["What is the strongest evidence?", story.strongest_evidence],
    ["What is uncertain?", story.uncertain],
    ["What could be reached next?", story.reachable_next],
  ];
  return (
    <div className={s.root}>
      <section className={s.qa} aria-label="Summary">
        {rows.map(([q, a]) => (
          <article key={q} className={s.card}>
            <h3>{q}</h3>
            <p>{a}</p>
          </article>
        ))}
      </section>
      <section className={s.card} aria-labelledby="story-heading">
        <h2 id="story-heading">Attack story</h2>
        <p className={s.meta}>
          {story.checked_statements} statements checked, {story.unsupported_claims} without evidence.
        </p>
        <ol>
          {story.statements.map((st) => (
            <li key={st.statement_id}>
              {st.text}{" "}
              <span className={`${s.meta}`}>
                {st.kind}, {st.evidence_ids.filter((id) => evidenceById.has(id)).length} citation(s)
              </span>
            </li>
          ))}
        </ol>
      </section>
      <NarrativePanel incidentId={incidentId} runId={runId} />
    </div>
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
    <section className={s.card} aria-labelledby="narrative-heading">
      <h2 id="narrative-heading">Explanation</h2>
      <div className={s.actions}>
        <button type="button" className="halt-btn" disabled={busy} onClick={() => ask("analyst")}>
          <span>EXPLAIN FOR AN ANALYST</span>
        </button>
        <button type="button" className="halt-btn" disabled={busy} onClick={() => ask("executive")}>
          <span>EXPLAIN FOR AN EXECUTIVE</span>
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {busy ? <p role="status">Preparing the explanation…</p> : null}
      {result ? (
        <div data-testid="narrative">
          <p className={`${s.chip} ${result.fallback_used ? "" : s.chipProof}`}>{result.label}</p>
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
    </section>
  );
}

function AttackPath({
  graph,
  hypotheses,
  selected,
  onSelect,
  detail,
  evidenceById,
}: {
  graph: IncidentGraph;
  hypotheses: Hypotheses;
  selected: string | null;
  onSelect: (id: string | null) => void;
  detail: IncidentDetail;
  evidenceById: Map<string, EvidenceEvent>;
}) {
  const positions = useMemo(() => layoutGraph(graph), [graph]);
  const steps = useMemo(() => pathSteps(graph), [graph]);
  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)");
  const phone = useMedia("(max-width: 639px)");
  const [unavailable, setUnavailable] = useState(false);
  const [mode, setMode] = useState<"3D" | "2D">("3D");
  const [toggles, setToggles] = useState<Toggles>(ALL_ON);
  const [replay, setReplay] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [focus, setFocus] = useState<{ ids: string[] | null; key: number }>({ ids: null, key: 0 });
  const alternate: AttackHypothesis | null = hypotheses.alternates[0] ?? null;
  const [hypothesis, setHypothesis] = useState<string>(hypotheses.selected.hypothesis_id);

  useEffect(() => {
    if (!playing || replay === null) return;
    if (replay >= steps.length - 1) {
      const stop = setTimeout(() => setPlaying(false), 0);
      return () => clearTimeout(stop);
    }
    const t = setTimeout(() => setReplay((r) => (r === null ? 0 : r + 1)), 1400 / speed);
    return () => clearTimeout(t);
  }, [playing, replay, speed, steps.length]);

  const stepNode = replay === null ? null : steps[replay];
  const lastStepId = useRef<string | null>(null);
  useEffect(() => {
    if (stepNode && stepNode.node_id !== lastStepId.current) {
      lastStepId.current = stepNode.node_id;
      onSelect(stepNode.node_id);
    }
    if (!stepNode) lastStepId.current = null;
  }, [stepNode, onSelect]);

  const show3D = mode === "3D" && !unavailable && !phone;
  const compare = hypothesis === hypotheses.selected.hypothesis_id ? hypotheses.selected : hypotheses.alternates.find((a) => a.hypothesis_id === hypothesis);
  const applyPreset = useCallback(
    (preset: CameraPreset) => setFocus((f) => ({ ids: presetNodes(graph, preset, alternate), key: f.key + 1 })),
    [graph, alternate],
  );

  return (
    <div className={s.root}>
      {unavailable ? <p className={s.notice}>3D is not available in this browser, so the 2D view is shown. It has the same content.</p> : null}
      {phone ? <p className={s.notice}>Guided view for small screens: step through the attack path below.</p> : null}
      <section className={s.controls} aria-label="Graph controls">
        {!phone && !unavailable ? (
          <div className={s.actions} role="group" aria-label="View">
            <button type="button" className="halt-btn" aria-pressed={mode === "3D"} onClick={() => setMode("3D")}>
              <span>3D</span>
            </button>
            <button type="button" className="halt-btn" aria-pressed={mode === "2D"} onClick={() => setMode("2D")}>
              <span>2D</span>
            </button>
          </div>
        ) : null}
        {(["observed", "inferred", "reachable"] as const).map((key) => (
          <label key={key} className={s.toggle}>
            <input type="checkbox" checked={toggles[key]} onChange={(e) => setToggles({ ...toggles, [key]: e.target.checked })} />
            {key === "reachable" ? "Reachable (hypothetical)" : key === "observed" ? "Observed" : "Inferred"}
          </label>
        ))}
      </section>

      {show3D ? (
        <section className={s.controls} aria-label="Camera">
          <button type="button" className="halt-btn" onClick={() => applyPreset("Full Incident")}>
            <span>RESET CAMERA</span>
          </button>
          <button type="button" className="halt-btn" onClick={() => setFocus((f) => ({ ids: steps.map((n) => n.node_id), key: f.key + 1 }))}>
            <span>FOCUS PATH</span>
          </button>
          <label className={s.field}>
            Camera preset
            <select defaultValue="" onChange={(e) => e.target.value && applyPreset(e.target.value as CameraPreset)}>
              <option value="">Choose…</option>
              {CAMERA_PRESETS.map((preset) => (
                <option key={preset} value={preset} disabled={!presetNodes(graph, preset, alternate).length}>
                  {preset}
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : null}

      <section className={s.controls} aria-label="Replay attack">
        <strong>Replay attack</strong>
        <button
          type="button"
          className="halt-btn"
          onClick={() => {
            if (replay === null || replay >= steps.length - 1) setReplay(0);
            setPlaying((p) => !p);
          }}
        >
          <span>{playing ? "PAUSE" : "PLAY"}</span>
        </button>
        <button type="button" className="halt-btn" disabled={replay === null || replay === 0} onClick={() => setReplay((r) => Math.max(0, (r ?? 0) - 1))}>
          <span>PREVIOUS</span>
        </button>
        <button type="button" className="halt-btn" disabled={replay !== null && replay >= steps.length - 1} onClick={() => setReplay((r) => (r === null ? 0 : r + 1))}>
          <span>NEXT</span>
        </button>
        <button
          type="button"
          className="halt-btn"
          disabled={replay === null}
          onClick={() => {
            setReplay(null);
            setPlaying(false);
          }}
        >
          <span>SHOW ALL</span>
        </button>
        <label className={s.field}>
          Speed
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {[0.5, 1, 2, 4].map((v) => (
              <option key={v} value={v}>
                {v}×
              </option>
            ))}
          </select>
        </label>
        <span role="status" className={s.meta}>
          {stepNode ? `Step ${(replay ?? 0) + 1} of ${steps.length}: ${stepNode.label}` : `${steps.length} evidence-supported steps`}
        </span>
      </section>

      <ul className={s.legend} aria-label="Legend">
        <li>
          <span className={`${s.swatch} ${s.swatchThreat}`} /> Selected path
        </li>
        <li>
          <span className={`${s.swatch} ${s.swatchProof}`} /> Observed evidence
        </li>
        <li>
          <span className={`${s.swatch} ${s.swatchInferred}`} /> Inferred link
        </li>
        <li>
          <span className={`${s.swatch} ${s.swatchReach}`} /> Reachable next (hypothetical)
        </li>
        <li>
          <span className={`${s.swatch} ${s.swatchContext}`} /> Context
        </li>
        <li>
          <span className={`${s.swatch} ${s.swatchMissing}`} /> Missing evidence
        </li>
      </ul>

      <div className={s.split}>
        <div>
          {show3D ? (
            <AttackGraph3D
              graph={graph}
              positions={positions}
              selected={selected}
              onSelect={onSelect}
              toggles={toggles}
              replayStep={replay}
              focusIds={focus.ids}
              focusKey={focus.key}
              reducedMotion={reducedMotion}
              onUnavailable={() => setUnavailable(true)}
            />
          ) : (
            <Graph2D graph={graph} positions={positions} selected={selected} onSelect={onSelect} toggles={toggles} replayStep={replay} />
          )}
          {graph.truncated ? <p className={s.meta}>This graph reached its limit of {graph.node_cap} nodes, so some context is not drawn.</p> : null}
        </div>
        <aside className={s.card} aria-label="Selection">
          <SelectionDrawer selected={selected} graph={graph} evidenceById={evidenceById} detail={detail} />
          <h3>Attack path steps</h3>
          <ol className={s.nodeList} aria-label="Attack path steps">
            {steps.map((n, i) => (
              <li key={n.node_id}>
                <button type="button" className={s.linkButton} aria-pressed={selected === n.node_id} onClick={() => onSelect(n.node_id)}>
                  {i + 1}. {n.label}
                </button>
              </li>
            ))}
          </ol>
          <details>
            <summary>All nodes and links</summary>
            <ul className={s.nodeList}>
              {graph.nodes
                .filter((n) => !n.on_selected_path)
                .map((n) => (
                  <li key={n.node_id}>
                    <button type="button" className={s.linkButton} aria-pressed={selected === n.node_id} onClick={() => onSelect(n.node_id)}>
                      {n.attributes.hypothetical ? "Hypothetical: " : ""}
                      {n.label}
                    </button>
                  </li>
                ))}
              {graph.edges
                .filter((e) => e.classification !== "observed")
                .map((e) => (
                  <li key={e.edge_id}>
                    <button type="button" className={s.linkButton} aria-pressed={selected === `edge:${e.edge_id}`} onClick={() => onSelect(`edge:${e.edge_id}`)}>
                      {e.classification} link: {e.relation}
                    </button>
                  </li>
                ))}
            </ul>
          </details>
          <label className={s.field}>
            Compare hypothesis
            <select value={hypothesis} onChange={(e) => setHypothesis(e.target.value)}>
              <option value={hypotheses.selected.hypothesis_id}>{hypotheses.selected.title}</option>
              {hypotheses.alternates.map((a) => (
                <option key={a.hypothesis_id} value={a.hypothesis_id}>
                  {a.title}
                </option>
              ))}
            </select>
          </label>
          {compare ? (
            <p className={s.meta}>
              Score {compare.score}. {compare.description}
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function SelectionDrawer({
  selected,
  graph,
  evidenceById,
  detail,
}: {
  selected: string | null;
  graph: IncidentGraph;
  evidenceById: Map<string, EvidenceEvent>;
  detail: IncidentDetail;
}) {
  if (!selected) return <p className={s.meta}>Select a step, node or link to see its evidence.</p>;
  const edge = selected.startsWith("edge:") ? graph.edges.find((e) => `edge:${e.edge_id}` === selected) : undefined;
  const node = graph.nodes.find((n) => n.node_id === selected);
  const refs = edge?.evidence_refs ?? node?.evidence_refs ?? [];
  const events = refs.map((r) => evidenceById.get(r)).filter((e): e is EvidenceEvent => Boolean(e));
  const detection = node?.detection_id ? detail.detections.find((d) => d.detection_id === node.detection_id) : undefined;
  return (
    <div data-testid="firex-drawer">
      <h3>{edge ? `${edge.classification} link: ${edge.relation}` : node?.label}</h3>
      {node ? (
        <p className={s.meta}>
          {LAYER_LABEL[node.layer]} · {stageLabel(node.stage)}
          {node.count > 1 ? ` · ${formatCount(node.count)} records` : ""}
          {node.attributes.hypothetical ? " · Hypothetical, not observed" : ""}
        </p>
      ) : null}
      {edge ? (
        <>
          <p className={s.meta}>
            Confidence {edge.confidence} · {edge.rule}
          </p>
          {edge.contradictions.map((c) => (
            <p key={c} className={s.meta}>
              {c}
            </p>
          ))}
        </>
      ) : null}
      {detection ? <p className={s.meta}>{detection.reason}</p> : null}
      <p className={s.meta}>{refs.length ? `${refs.length} citation(s)` : "No cited evidence"}</p>
      <ul className={s.nodeList}>
        {events.slice(0, 5).map((e) => (
          <li key={e.evidence_id} className={s.mono}>
            {e.event_utc} {e.action ?? e.subtype} {e.src_ip ?? ""}
            {e.dst_ip ? ` to ${e.dst_ip}` : ""} (line {formatCount(e.line)})
          </li>
        ))}
      </ul>
    </div>
  );
}

function TimelineView({ detail }: { detail: IncidentDetail }) {
  return (
    <ol className={s.timeline} aria-label="Timeline">
      {detail.timeline.map((t) => (
        <li key={`${t.order}`}>
          <span className={s.mono}>
            {t.utc}
            {t.timestamp_quality === "collapsed" ? <span className={s.meta}> (ordered by file position)</span> : null}
          </span>
          <span>
            <strong>{t.title}</strong>
            <div className={s.meta}>
              {stageLabel(t.stage)} · {t.basis} · {t.detail}
            </div>
          </span>
        </li>
      ))}
    </ol>
  );
}

function EvidenceView({ detail }: { detail: IncidentDetail }) {
  return (
    <section className={s.card} aria-label="Evidence">
      <p className={s.meta}>
        {detail.evidence.length} cited records standing in for {formatCount(detail.alert_merge_count)} merged events.
      </p>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Time (UTC)</th>
              <th>Type</th>
              <th>Action</th>
              <th>From</th>
              <th>To</th>
              <th>Detail</th>
              <th>Line</th>
            </tr>
          </thead>
          <tbody>
            {detail.evidence.map((e) => (
              <tr key={e.evidence_id}>
                <td className={s.mono}>{e.event_utc}</td>
                <td>
                  {e.event_type}/{e.subtype}
                </td>
                <td>{e.action ?? "—"}</td>
                <td className={s.mono}>{e.user ?? e.src_ip ?? "—"}</td>
                <td className={s.mono}>
                  {e.dst_ip ?? "—"}
                  {e.dst_port ? `:${e.dst_port}` : ""}
                </td>
                <td>{e.attack ?? e.virus ?? e.message ?? e.hostname ?? "—"}</td>
                <td className={s.mono}>{formatCount(e.line)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReachableView({ reach, detail, onReplay }: { reach: ReachabilityResult; detail: IncidentDetail; onReplay: () => void }) {
  const response = detail.response_simulation;
  return (
    <div className={s.grid}>
      <section className={s.card} aria-labelledby="replay-heading">
        <h2 id="replay-heading">Replay attack</h2>
        <p>Replays the evidence-supported events that occurred, in order.</p>
        <button type="button" className="halt-btn" onClick={onReplay}>
          <span>OPEN REPLAY</span>
        </button>
      </section>
      <section className={s.card} aria-labelledby="reach-heading">
        <h2 id="reach-heading">Explore reachability</h2>
        <p className={s.notice}>{reach.label}</p>
        {reach.targets.length ? (
          <ul className={s.nodeList} aria-label="Reachable systems">
            {reach.targets.map((t) => (
              <li key={t.target}>
                <strong className={s.mono}>{t.target}</strong> <span className={s.meta}>via {t.via}, confidence {t.confidence}. {t.basis}</span>
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
      <section className={s.card} aria-labelledby="simulate-heading">
        <h2 id="simulate-heading">Simulate response</h2>
        <p className={s.simulated}>{response.label}</p>
        {response.available ? null : (
          <>
            <button type="button" className="halt-btn" disabled>
              <span>NOT AVAILABLE</span>
            </button>
            <p>This incident needs context that the log does not contain:</p>
            <ul>
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

function AttackView({ detail }: { detail: IncidentDetail }) {
  const rows = detail.detections.flatMap((d) => d.steps.map((step) => ({ ...step, tactic: d.tactic, detection: d.detection_id })));
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>Technique</th>
            <th>Name</th>
            <th>Step</th>
            <th>Stage</th>
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
      <p className={s.meta}>Labels come from the configured rules. They are mappings, not proof that the technique succeeded.</p>
    </div>
  );
}

function KillChainView({ detail }: { detail: IncidentDetail }) {
  return (
    <ol className={s.timeline} aria-label="Kill chain">
      {detail.timeline.map((t) => (
        <li key={t.order}>
          <span className={s.chip}>{stageLabel(t.stage)}</span>
          <span>{t.title}</span>
        </li>
      ))}
    </ol>
  );
}

function HypothesesView({ hypotheses }: { hypotheses: Hypotheses }) {
  return (
    <div className={s.root}>
      <p>
        Margin between the selected hypothesis and the best alternate: <strong>{hypotheses.uncertainty_margin}</strong>
      </p>
      <div className={s.grid}>
        {[hypotheses.selected, ...hypotheses.alternates].map((h) => (
          <article key={h.hypothesis_id} className={s.card}>
            <span className={s.chip}>{h.status}</span>
            <h3>{h.title}</h3>
            <p>{h.description}</p>
            <p className={s.meta}>Score {h.score}</p>
            <ul>
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

function ProofPanel({ proof }: { proof: ProofView }) {
  const r = proof.receipt;
  return (
    <section className={s.card} aria-label="Proof">
      <p>
        <span className={`${s.chip} ${proof.verification.valid ? s.chipProof : s.chipThreat}`}>SEAL {proof.verification.valid ? "VALID" : "INVALID"}</span>
      </p>
      <p className={s.meta}>A SHA-256 seal over this receipt shows it has not changed. It is not a legal digital signature.</p>
      <dl className={s.facts}>
        <div>
          <dt>Evidence coverage</dt>
          <dd>{r.evidence_coverage}</dd>
        </div>
        <div>
          <dt>Unsupported claims</dt>
          <dd>{r.unsupported_claims}</dd>
        </div>
        <div>
          <dt>Uncertainty margin</dt>
          <dd>{r.uncertainty_margin}</dd>
        </div>
        <div>
          <dt>Cited evidence</dt>
          <dd>{r.cited_evidence.length}</dd>
        </div>
      </dl>
      <pre className={s.pre}>{JSON.stringify(r, null, 1)}</pre>
    </section>
  );
}

function EvaluationView() {
  return (
    <p className={s.notice}>
      Accuracy is measured by a separate validator, outside this product, so the engine never sees expected answers. No accuracy
      figure is shown here, because no organiser ground truth has been provided.
    </p>
  );
}
