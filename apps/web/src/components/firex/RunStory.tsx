"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { classify } from "@/lib/ps2/api";
import { ACTIVE_STATUSES, firex, type DatasetRun, type IncidentDetail, type IncidentGraph, type IncidentList, type ReachabilityResult } from "@/lib/firex/api";
import { ALL_ON, layoutGraph } from "@/lib/firex/scene";
import { buildBeats } from "@/lib/firex/story";
import { ps2Vars } from "@/styles/ps2-palette";

import s from "./firex.module.css";
import { Graph2D } from "./Graph2D";

interface Loaded {
  run: DatasetRun;
  list: IncidentList;
  top: IncidentDetail | null;
  graph: IncidentGraph | null;
  reach: ReachabilityResult | null;
}

async function load(runId: string): Promise<Loaded> {
  const [run, list] = await Promise.all([firex.run(runId), firex.incidents(runId)]);
  const first = list.items[0];
  if (!first) return { run, list, top: null, graph: null, reach: null };
  const [top, graph, reach] = await Promise.all([
    firex.incident(first.incident_id, runId),
    firex.graph(first.incident_id, runId),
    firex.reachability(first.incident_id, runId),
  ]);
  return { run, list, top, graph, reach };
}

/** One real run told as a story. `theatre` shows one beat at a time; otherwise the beats scroll. */
export function RunStory({ runId, theatre }: { runId?: string; theatre: boolean }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      let id = runId;
      if (!id) {
        const runs = await firex.runs();
        // A full-file run first; a sample only when no full run has completed.
        const done = runs.filter((r) => r.status === "completed" && (r.metrics.incidents ?? 0) > 0);
        id = (done.find((r) => r.metrics.bytes_processed === r.metrics.bytes_total && r.byte_range) ?? done[0])?.run_id;
        if (!id) {
          if (live) setMessage(runs.some((r) => ACTIVE_STATUSES.includes(r.status)) ? "A run is still in progress." : "No completed run with incidents exists yet.");
          return;
        }
      }
      const loaded = await load(id);
      if (live) setData(loaded);
    })().catch((e: unknown) => live && setMessage(`The analysis service could not be reached: ${classify(e).message}`));
    return () => {
      live = false;
    };
  }, [runId]);

  if (message) {
    return (
      <div className={s.root} style={ps2Vars}>
        <p className={s.notice} role="status">
          {message}
        </p>
        <Link className="halt-btn" href="/firex">
          <span>DATASETS</span>
        </Link>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={s.root} style={ps2Vars}>
        <p role="status">Loading the run…</p>
      </div>
    );
  }
  return <Beats data={data} theatre={theatre} />;
}

function Beats({ data, theatre }: { data: Loaded; theatre: boolean }) {
  const { run, list, top, graph, reach } = data;
  const beats = useMemo(() => buildBeats(run, list, top, reach), [run, list, top, reach]);
  const positions = useMemo(() => (graph ? layoutGraph(graph) : null), [graph]);
  const [index, setIndex] = useState(0);
  const openHref = top ? `/firex/incidents/${top.summary.incident_id}?run=${run.run_id}` : `/firex/runs/${run.run_id}`;

  useEffect(() => {
    if (!theatre) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") setIndex((i) => Math.min(beats.length - 1, i + 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [theatre, beats.length]);

  const shown = theatre ? beats.slice(index, index + 1) : beats;
  return (
    <div className={s.root} style={ps2Vars} data-testid="firex-story">
      <header className={s.head}>
        <div>
          <h1>Proof-carrying kill chain intelligence</h1>
          <p className={s.lede}>
            From raw logs to an evidence-backed attack story. Every figure below was measured on run <span className={s.mono}>{run.run_id}</span> of{" "}
            {run.dataset_id}.
          </p>
        </div>
        <Link className="halt-btn halt-btn-primary" href={openHref}>
          <span>{top ? "OPEN INCIDENT" : "OPEN RUN"}</span>
        </Link>
      </header>
      {shown.map((beat) => (
        <section key={beat.id} className={s.beat} aria-labelledby={`beat-${beat.id}`}>
          <p className={s.beatKicker}>{beat.kicker}</p>
          <h2 id={`beat-${beat.id}`}>{beat.title}</h2>
          <p className={s.beatFigure}>{beat.figure}</p>
          <p className={s.lede}>{beat.body}</p>
          {beat.showGraph && graph && positions ? (
            <Graph2D graph={graph} positions={positions} selected={null} onSelect={() => undefined} toggles={ALL_ON} replayStep={null} />
          ) : null}
        </section>
      ))}
      {theatre ? (
        <nav className={s.actions} aria-label="Theatre controls">
          <button type="button" className="halt-btn" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
            <span>PREVIOUS</span>
          </button>
          <button type="button" className="halt-btn" disabled={index === beats.length - 1} onClick={() => setIndex((i) => i + 1)}>
            <span>NEXT</span>
          </button>
          <span className={s.meta} role="status">
            {index + 1} of {beats.length}
          </span>
        </nav>
      ) : null}
    </div>
  );
}
