"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AttackHypothesis, DatasetHealth, Hypotheses, IncidentDetail, IncidentGraph, IncidentGuide } from "@/lib/firex/api";
import { graphSummary } from "@/lib/firex/lens";
import { ALL_ON, CAMERA_PRESETS, layoutGraph, pathSteps, presetNodes, type CameraPreset, type Toggles } from "@/lib/firex/scene";
import { buildWorld, type Shot } from "@/lib/firex/world";

import { EvidenceLens } from "./EvidenceLens";
import s from "./firex.module.css";
import { Graph2D } from "./Graph2D";
import { WhyHere } from "./SourceTrace";

// WebGL has no server rendering, and three.js is only downloaded when an Attack World opens.
const AttackWorld = dynamic(() => import("./AttackWorld"), { ssr: false, loading: () => <p role="status">Loading the Attack World…</p> });

export function useMedia(query: string): boolean {
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

export function AttackWorldView({
  graph,
  detail,
  hypotheses,
  guide,
  health,
  selected,
  onSelect,
  onClose,
  analyst,
  onPresent,
}: {
  graph: IncidentGraph;
  detail: IncidentDetail;
  hypotheses: Hypotheses;
  guide: IncidentGuide;
  health: DatasetHealth | null;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
  analyst: boolean;
  onPresent: () => void;
}) {
  const world = useMemo(() => buildWorld(graph), [graph]);
  const positions = useMemo(() => layoutGraph(graph), [graph]);
  const steps = useMemo(() => pathSteps(graph), [graph]);
  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)");
  const phone = useMedia("(max-width: 639px)");
  const [unavailable, setUnavailable] = useState(false);
  const [flat, setFlat] = useState(false);
  const [toggles, setToggles] = useState<Toggles>(ALL_ON);
  const [hideContext, setHideContext] = useState(false);
  const [replay, setReplay] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [shot, setShot] = useState<{ shot: Shot; ids: string[] | null; key: number }>({ shot: "establish", ids: null, key: 0 });
  const alternate: AttackHypothesis | null = hypotheses.alternates[0] ?? null;
  const [hypothesis, setHypothesis] = useState<string>(hypotheses.selected.hypothesis_id);
  const direct = useCallback((next: Shot, ids: string[] | null) => setShot((c) => ({ shot: next, ids, key: c.key + 1 })), []);

  // The story ends by withdrawing to the whole world, where the reachable systems emerge and verification is stated.
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    if (!playing || replay === null) return;
    const atEnd = replay >= steps.length - 1;
    const t = setTimeout(
      () => {
        if (atEnd) {
          setPlaying(false);
          setReplay(null);
          setFinished(true);
          direct("withdraw", null);
        } else setReplay((r) => (r === null ? 0 : r + 1));
      },
      (reducedMotion ? 4200 : 3200) / speed,
    );
    return () => clearTimeout(t);
  }, [playing, replay, speed, steps.length, direct, reducedMotion]);

  const stepNode = replay === null ? null : steps[replay];
  const lastStep = useRef<string | null>(null);
  useEffect(() => {
    if (stepNode && stepNode.node_id !== lastStep.current) {
      lastStep.current = stepNode.node_id;
      direct("follow", [stepNode.node_id]);
    }
    if (!stepNode) lastStep.current = null;
  }, [stepNode, direct]);

  const selectFromScene = useCallback(
    (id: string | null) => {
      onSelect(id);
      if (id && !id.startsWith("edge:")) direct("inspect", [id]);
    },
    [onSelect, direct],
  );

  const show3D = !flat && !unavailable && !phone;
  const stepGuide = stepNode ? guide.steps.find((g) => g.node_id === stepNode.node_id) : undefined;
  const stepRecord = stepGuide ? detail.evidence.find((e) => stepGuide.evidence_refs.includes(e.evidence_id)) : undefined;
  const compare = hypothesis === hypotheses.selected.hypothesis_id ? hypotheses.selected : hypotheses.alternates.find((a) => a.hypothesis_id === hypothesis);
  const shownToggles = toggles;
  void positions;

  return (
    <div className={s.root} style={{ gap: "var(--space-4)" }}>
      {unavailable ? <p className={s.notice}>3D is not available in this browser, so the flat view is shown. It has the same content.</p> : null}
      {phone ? <p className={s.notice}>Guided view for small screens: step through the attack below.</p> : null}

      <div className={s.split}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", minWidth: 0 }}>
          {show3D ? (
            <AttackWorld
              world={world}
              selected={selected}
              onSelect={selectFromScene}
              toggles={shownToggles}
              hideContext={hideContext}
              replayStep={replay}
              shot={shot}
              reducedMotion={reducedMotion}
              onUnavailable={() => setUnavailable(true)}
              onStep={(delta) => setReplay((r) => Math.min(steps.length - 1, Math.max(0, (r ?? (delta > 0 ? -1 : 1)) + delta)))}
            />
          ) : phone ? null : (
            <Graph2D graph={graph} positions={positions} selected={selected} onSelect={onSelect} toggles={shownToggles} replayStep={replay} />
          )}
          <p className={s.meta} id="world-summary">
            {graphSummary(graph)}
          </p>
          <section className={s.controls} aria-label="Replay">
            <button
              type="button"
              className={s.btnPrimary}
              onClick={() => {
                setFinished(false);
                if (replay === null) setReplay(0);
                setPlaying((p) => !p);
              }}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button type="button" className={s.btn} disabled={replay === null || replay === 0} onClick={() => setReplay((r) => Math.max(0, (r ?? 0) - 1))}>
              Previous
            </button>
            <button type="button" className={s.btn} disabled={replay !== null && replay >= steps.length - 1} onClick={() => setReplay((r) => (r === null ? 0 : r + 1))}>
              Next
            </button>
            {show3D ? (
              <button type="button" className={s.btn} onClick={() => direct("approach", steps.map((n) => n.node_id))}>
                Focus path
              </button>
            ) : null}
            <button type="button" className={s.btn} disabled={!steps.length} onClick={() => onSelect((stepNode ?? steps[0])?.node_id ?? null)}>
              Inspect evidence
            </button>
            <button type="button" className={s.btn} onClick={onPresent}>
              Present
            </button>
            {replay !== null ? (
              <button
                type="button"
                className={s.btnQuiet}
                onClick={() => {
                  setReplay(null);
                  setPlaying(false);
                  direct("withdraw", null);
                }}
              >
                Show all
              </button>
            ) : null}
            <span role="status" className={s.meta}>
              {stepNode ? `Step ${(replay ?? 0) + 1} of ${steps.length}: ${stepNode.label}` : ""}
            </span>
          </section>

          {analyst ? (
            <section className={s.card} aria-label="Analyst controls">
              <div className={s.controls}>
                {(["observed", "inferred", "reachable"] as const).map((key) => (
                  <label key={key} className={s.toggle}>
                    <input type="checkbox" checked={toggles[key]} onChange={(e) => setToggles({ ...toggles, [key]: e.target.checked })} />
                    {key === "reachable" ? "Reachable (hypothetical)" : key === "observed" ? "Observed" : "Inferred"}
                  </label>
                ))}
                <label className={s.toggle}>
                  <input type="checkbox" checked={hideContext} onChange={(e) => setHideContext(e.target.checked)} />
                  Hide context
                </label>
                {!phone && !unavailable ? (
                  <label className={s.toggle}>
                    <input type="checkbox" checked={flat} onChange={(e) => setFlat(e.target.checked)} />
                    Flat 2D layout
                  </label>
                ) : null}
              </div>
              <div className={s.controls}>
                {show3D ? (
                  <label className={s.field}>
                    Camera preset
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const preset = e.target.value as CameraPreset;
                        if (preset) direct(preset === "Full Incident" ? "establish" : "reveal", presetNodes(graph, preset, alternate));
                      }}
                    >
                      <option value="">Choose…</option>
                      {CAMERA_PRESETS.map((preset) => (
                        <option key={preset} value={preset} disabled={!presetNodes(graph, preset, alternate).length}>
                          {preset}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className={s.field}>
                  Replay speed
                  <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                    {[0.5, 1, 2, 4].map((v) => (
                      <option key={v} value={v}>
                        {v}×
                      </option>
                    ))}
                  </select>
                </label>
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
              </div>
              {compare ? (
                <p className={s.meta}>
                  Score {compare.score}. {compare.description}
                </p>
              ) : null}
              <ul className={s.legend} aria-label="Legend">
                <li>
                  <span className={`${s.swatch} ${s.swatchThreat}`} /> Selected path
                </li>
                <li>
                  <span className={`${s.swatch} ${s.swatchProof}`} /> Observed
                </li>
                <li>
                  <span className={`${s.swatch} ${s.swatchInferred}`} /> Inferred
                </li>
                <li>
                  <span className={`${s.swatch} ${s.swatchReach}`} /> Reachable (hypothetical)
                </li>
                <li>
                  <span className={`${s.swatch} ${s.swatchContext}`} /> Context
                </li>
                <li>
                  <span className={`${s.swatch} ${s.swatchMissing}`} /> Missing evidence
                </li>
              </ul>
            </section>
          ) : null}
          {graph.truncated ? <p className={s.meta}>This graph reached its limit of {graph.node_cap} nodes, so some context is not drawn.</p> : null}
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", minWidth: 0 }} aria-label="Evidence">
          {stepGuide ? (
            <section className={s.guide} aria-live="polite" aria-label="What this step means">
              <p className={s.meta}>
                Step {(replay ?? 0) + 1} of {steps.length}
              </p>
              <p className={s.guideLead}>{stepGuide.what_happened}</p>
              <dl className={s.guideGrid}>
                <div>
                  <dt>Who</dt>
                  <dd>{stepGuide.who}</dd>
                </div>
                <div>
                  <dt>What proves it</dt>
                  <dd>
                    {stepGuide.evidence}
                    {stepRecord ? (
                      <>
                        {" "}
                        First record: line {stepRecord.line.toLocaleString("en-US")}, <span className={s.mono}>{stepRecord.event_utc}</span>.
                      </>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt>Why it matters</dt>
                  <dd>{stepGuide.why_it_matters}</dd>
                </div>
                <div>
                  <dt>What is uncertain</dt>
                  <dd>{stepGuide.uncertain}</dd>
                </div>
                <div>
                  <dt>Check next</dt>
                  <dd>{stepGuide.check_next}</dd>
                </div>
              </dl>
              <WhyHere runId={detail.summary.run_id} query={{ incident_id: detail.summary.incident_id, node_id: stepGuide.node_id }} />
            </section>
          ) : finished ? (
            <section className={s.guide} aria-live="polite" aria-label="The complete story">
              <p className={s.guideLead}>That is the complete story, and it is still unconfirmed.</p>
              <p className={s.meta}>
                {health ? `Source: ${health.dimensions[0]?.status}. Processing: ${health.dimensions[1]?.status}. ` : ""}Ground truth: not measured. Gold systems could be reached next; that is hypothetical, not
                observed.
              </p>
            </section>
          ) : null}

          {selected ? <EvidenceLens selected={selected} graph={graph} detail={detail} onClose={onClose} /> : stepGuide || finished ? null : <p className={s.notice}>Press Play to walk through the attack, or select a step to see its evidence.</p>}
          <section className={s.card}>
            <h3>Attack steps</h3>
            <ol className={s.nodeList} aria-label="Attack path steps">
              {steps.map((n, i) => (
                <li key={n.node_id}>
                  <button
                    type="button"
                    className={s.linkButton}
                    aria-pressed={selected === n.node_id}
                    onClick={() => {
                      onSelect(n.node_id);
                      direct("inspect", [n.node_id]);
                    }}
                  >
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
                        {e.classification === "reachable" ? "Hypothetical" : "Inferred"} link: {e.relation.replace(/_/g, " ")}
                      </button>
                    </li>
                  ))}
              </ul>
            </details>
          </section>
        </aside>
      </div>
    </div>
  );
}
