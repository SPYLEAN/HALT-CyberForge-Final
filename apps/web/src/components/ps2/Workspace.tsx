"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  classify,
  ps2,
  type AttackStory,
  type CandidateEdge,
  type CanonicalEvent,
  type Entity,
  type EvaluationReport,
  type Hypotheses,
  type Ps2Failure,
  type ReconstructedGraph,
  type ReconstructionReceipt,
  type ReconstructionSummary,
  type StageAssignment,
} from "@/lib/ps2/api";
import { isCausal } from "@/lib/ps2/graph";
import { ps2Vars } from "@/styles/ps2-palette";

import { PipelineStages, Ps2Tabs, RunExpired, ServiceUnavailable, SessionNote, useMedia, type PipelineStage } from "./common";
import { GraphPanel } from "./GraphPanel";
import { PathText } from "./GraphText";
import { Inspector, type InspectorData } from "./Inspector";
import { AttackPanel, EvaluationPanel, HypothesesPanel, ReceiptPanel, StoryPanel } from "./Panels";
import s from "./ps2.module.css";

interface Core {
  summary: ReconstructionSummary;
  hypotheses: Hypotheses;
  entities: Entity[];
  stages: StageAssignment[];
  events: Record<string, CanonicalEvent>;
}

type Load = { state: "loading" } | { state: "failed"; failure: Ps2Failure } | { state: "ready" };

/** Loads one run. Each stage turns done only when its own request answers. */
function useRun(runId: string) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [core, setCore] = useState<Core | null>(null);
  const [graph, setGraph] = useState<ReconstructedGraph | null>(null);
  const [story, setStory] = useState<AttackStory | null>(null);
  const [receipt, setReceipt] = useState<ReconstructionReceipt | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationReport | null | "failed" | undefined>(undefined);

  useEffect(() => {
    let live = true;
    (async () => {
      const summary = await ps2.summary(runId);
      const rest = Promise.all([ps2.hypotheses(runId), ps2.entities(runId), ps2.stages(runId), ps2.events(summary.batch_id)]);
      const g = await ps2.graph(runId);
      if (live) setGraph(g);
      const st = await ps2.story(runId);
      if (live) setStory(st);
      const rc = await ps2.receipt(runId);
      if (live) setReceipt(rc);
      const [hypotheses, entities, stages, evs] = await rest;
      if (!live) return;
      setCore({ summary, hypotheses, entities, stages, events: Object.fromEntries(evs.map((e) => [e.event_id, e])) });
      setLoad({ state: "ready" });
      ps2
        .evaluation(runId)
        .then((r) => live && setEvaluation(r))
        .catch(() => live && setEvaluation("failed"));
    })().catch((e: unknown) => live && setLoad({ state: "failed", failure: classify(e) }));
    return () => {
      live = false;
    };
  }, [runId]);

  return { load, core, graph, story, receipt, evaluation };
}

type Step = "overview" | "story" | "path" | "evidence" | "receipt";
const STEPS: Array<[Step, string]> = [
  ["overview", "Overview"],
  ["story", "Story"],
  ["path", "Path"],
  ["evidence", "Evidence"],
  ["receipt", "Receipt"],
];

/** A retry remounts the run view, so every request and stage starts again from nothing. */
export function Workspace({ runId }: { runId: string }) {
  const [attempt, setAttempt] = useState(0);
  return <RunWorkspace key={`${runId}:${attempt}`} runId={runId} onRetry={() => setAttempt((a) => a + 1)} />;
}

function RunWorkspace({ runId, onRetry }: { runId: string; onRetry: () => void }) {
  const { load, core, graph, story, receipt, evaluation } = useRun(runId);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState("story");
  const [step, setStep] = useState<Step>("overview");
  const phone = useMedia("(max-width: 639px)");
  const narrow = useMedia("(max-width: 1279px)");
  const returnFocus = useRef<HTMLElement | null>(null);

  const select = useCallback(
    (id: string | null) => {
      if (id && narrow && !phone) returnFocus.current = document.activeElement as HTMLElement | null;
      setSelected(id);
      if (id && phone) setStep("evidence");
    },
    [narrow, phone],
  );

  // Tablet drawer: focus moves into it when it opens; Escape closes it and focus returns.
  useEffect(() => {
    if (!(narrow && !phone && selected)) return;
    document.getElementById("drawer-head")?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelected(null);
        returnFocus.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [narrow, phone, selected]);

  const inspectorData = useMemo<InspectorData | null>(() => {
    if (!core || !graph || !story) return null;
    const edges: Record<string, CandidateEdge> = {};
    for (const e of [...graph.edges, ...graph.forecast_edges, ...core.hypotheses.rejected_edges]) edges[e.edge_id] = e;
    const sel = core.hypotheses.selected;
    const pathEdgeIds = new Set(sel?.edge_ids ?? []);
    return {
      graph,
      events: core.events,
      entities: Object.fromEntries(core.entities.map((x) => [x.entity_id, x])),
      edges,
      stages: Object.fromEntries(core.stages.map((x) => [x.event_id, x])),
      statements: story.statements,
      pathEdgeIds,
      alternateEdgeIds: new Set(core.hypotheses.alternates.flatMap((a) => a.edge_ids).filter((id) => !pathEdgeIds.has(id))),
    };
  }, [core, graph, story]);

  if (load.state === "failed") {
    if (load.failure.kind === "expired") return <RunExpired runId={runId} />;
    return <ServiceUnavailable onRetry={onRetry} detail={load.failure.kind === "rejected" ? load.failure.message : undefined} />;
  }

  const stages: PipelineStage[] = [
    ...["Files selected", "Ingestion started", "Records parsed", "Canonical events created"].map((label) => ({ label, state: "done" as const, detail: label === "Records parsed" && core ? core.summary.batch_id : undefined })),
    { label: "Reconstruction requested", state: "done", detail: runId },
    { label: "Graph ready", state: graph ? "done" : "active", detail: graph ? `${graph.nodes.length} nodes` : undefined },
    {
      label: "Story verified",
      state: story ? (story.unsupported_claims === 0 ? "done" : "failed") : graph ? "active" : "pending",
      detail: story ? `${story.checked_statements} checked, ${story.unsupported_claims} unsupported` : undefined,
    },
    { label: "Receipt sealed", state: receipt ? "done" : story ? "active" : "pending", detail: receipt ? receipt.receipt_id : undefined },
  ];

  const summary = core?.summary;
  const header = (
    <div className={s.head}>
      <div className={s.headText}>
        <p className="v2-kicker">{summary?.dataset_id ? `Reconstruction · bundled dataset ${summary.dataset_id}` : "Reconstruction · uploaded logs"}</p>
        <h1 className="v2-title">{summary?.affected_services.length ? `Attack path toward ${summary.affected_services.join(", ")}` : "Reconstructed attack path"}</h1>
        <SessionNote />
      </div>
      {summary ? (
        <dl className={s.facts} aria-label="Run facts">
          <div>
            <dt>Run</dt>
            <dd className={s.mono}>{summary.run_id}</dd>
          </div>
          <div>
            <dt>Events</dt>
            <dd>{summary.event_count}</dd>
          </div>
          <div>
            <dt>Entities</dt>
            <dd>{summary.entity_count}</dd>
          </div>
          <div>
            <dt>Seeds</dt>
            <dd>{summary.seeds}</dd>
          </div>
          <div>
            <dt>Selected edges</dt>
            <dd>{`${summary.selected_edges} of ${summary.candidate_edges}`}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );

  const ready = load.state === "ready" && core && graph && story && receipt && inspectorData;
  if (!ready) {
    return (
      <div className={s.root} style={ps2Vars} aria-busy="true">
        {header}
        <PipelineStages stages={stages} />
        <p className="v2-meta" role="status">
          Loading the reconstruction from the service…
        </p>
      </div>
    );
  }

  const pathEventIds = core.hypotheses.selected?.event_ids ?? [];
  const inspector = <Inspector id={selected} data={inspectorData} onSelect={select} />;
  const panels = {
    story: <StoryPanel story={story} onSelect={select} />,
    attack: <AttackPanel stages={core.stages} events={core.events} pathEventIds={pathEventIds} onSelect={select} />,
    hypotheses: <HypothesesPanel hyp={core.hypotheses} receipt={receipt} onSelect={select} />,
    receipt: <ReceiptPanel receipt={receipt} />,
    evaluation: <EvaluationPanel report={evaluation} />,
  };

  if (phone) {
    const i = STEPS.findIndex(([k]) => k === step);
    const causal = graph.edges.filter(isCausal);
    return (
      <div className={s.root} style={ps2Vars}>
        {header}
        <nav aria-label="Reconstruction sequence">
          <ol className={s.steps}>
            {STEPS.map(([k, label]) => (
              <li key={k}>
                <button type="button" aria-current={step === k ? "step" : undefined} onClick={() => setStep(k)}>
                  {label}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <div data-testid={`step-${step}`}>
          {step === "overview" ? (
            <>
              <PipelineStages stages={stages} />
              <p className="v2-decision">{`${pathEventIds.length} events on the selected path, ${core.hypotheses.alternates.length} alternates, ${causal.length} selected causal edges.`}</p>
              {panels.attack}
            </>
          ) : step === "story" ? (
            panels.story
          ) : step === "path" ? (
            <>
              <h2 className="v2-section" style={{ marginBottom: "var(--space-3)" }}>
                Selected path
              </h2>
              <PathText graph={graph} hypotheses={core.hypotheses} statements={story.statements} onSelect={select} />
              <div className={s.panel}>{panels.hypotheses}</div>
            </>
          ) : step === "evidence" ? (
            inspector
          ) : (
            <>
              {panels.receipt}
              <div className={s.panel}>{panels.evaluation}</div>
            </>
          )}
        </div>
        <div className={s.stepNav}>
          <button type="button" className="halt-btn" disabled={i <= 0} onClick={() => setStep(STEPS[i - 1]![0])}>
            <span aria-hidden>←</span>
            <span>{i > 0 ? STEPS[i - 1]![1] : "Start"}</span>
          </button>
          <button type="button" className="halt-btn halt-btn-primary" disabled={i >= STEPS.length - 1} onClick={() => setStep(STEPS[i + 1]![0])}>
            <span>{i < STEPS.length - 1 ? STEPS[i + 1]![1] : "End"}</span>
            <span aria-hidden>→</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={s.root} style={ps2Vars}>
      {header}
      <PipelineStages stages={stages} />
      <div className={s.grid}>
        <div className={s.focal}>
          <GraphPanel graph={graph} hypotheses={core.hypotheses} statements={story.statements} events={core.events} selectedId={selected} onSelect={select} />
          <div className={s.panel}>
            <Ps2Tabs
              label="Reconstruction detail"
              value={tab}
              onChange={setTab}
              tabs={[
                { id: "story", label: "ATTACK STORY", content: panels.story },
                { id: "attack", label: "ATT&CK", content: panels.attack },
                { id: "hypotheses", label: "HYPOTHESES", content: panels.hypotheses },
                { id: "receipt", label: "PROOF", content: panels.receipt },
                { id: "evaluation", label: "EVALUATION", content: panels.evaluation },
              ]}
            />
          </div>
        </div>
        {!narrow ? (
          <aside className={s.rail} aria-label="Evidence inspector">
            {inspector}
          </aside>
        ) : selected ? (
          <aside className={s.drawer} role="dialog" aria-modal="false" aria-labelledby="drawer-head">
            <div className={s.drawerHead}>
              <h2 id="drawer-head" className="v2-kicker" tabIndex={-1}>
                Evidence inspector
              </h2>
              <button
                type="button"
                className="halt-x"
                aria-label="Close evidence inspector"
                onClick={() => {
                  setSelected(null);
                  returnFocus.current?.focus();
                }}
              >
                ×
              </button>
            </div>
            <Inspector id={selected} data={inspectorData} onSelect={select} headingId="drawer-inspector-head" />
          </aside>
        ) : null}
      </div>
      <p className="v2-meta" style={{ marginTop: "var(--space-6)" }}>
        <Link href="/reconstruct">Start another reconstruction</Link>
      </p>
    </div>
  );
}
