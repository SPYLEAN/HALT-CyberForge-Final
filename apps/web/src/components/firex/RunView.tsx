"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  ACTIVE_STATUSES,
  RESUMABLE_STATUSES,
  STAGES,
  firex,
  formatBytes,
  formatCount,
  percentOf,
  stageState,
  type DatasetHealth,
  type DatasetRun,
  type IncidentList,
  type QuarantineSegment,
} from "@/lib/firex/api";
import { classify } from "@/lib/ps2/api";
import { ps2Vars } from "@/styles/ps2-palette";

import { CaseBuilder } from "./CaseBuilder";
import s from "./firex.module.css";
import { HealthVerdict, StatusBadge } from "./Verdict";

const POLL_MS = 1500;
const STATUS_TEXT: Record<DatasetRun["status"], string> = {
  queued: "Starting",
  running: "Reading the log",
  cancelling: "Stopping",
  cancelled: "Stopped",
  interrupted: "Interrupted",
  failed: "Failed",
  completed: "Completed",
};

/** Progress comes from the run's stored state, so a refresh or an API restart simply reconnects. */
export function RunView({ runId }: { runId: string }) {
  const [run, setRun] = useState<DatasetRun | null>(null);
  const [incidents, setIncidents] = useState<IncidentList | null>(null);
  const [health, setHealth] = useState<DatasetHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const status = run?.status;

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const next = await firex.run(runId);
        if (!live) return;
        setRun(next);
        setError(null);
        if (ACTIVE_STATUSES.includes(next.status)) timer = setTimeout(tick, POLL_MS);
      } catch (e) {
        if (!live) return;
        const failure = classify(e);
        if (failure.kind === "expired") setExpired(true);
        else {
          setError(failure.message);
          timer = setTimeout(tick, POLL_MS * 3);
        }
      }
    };
    void tick();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [runId, status]);

  useEffect(() => {
    if (status !== "completed") return;
    let live = true;
    Promise.all([firex.incidents(runId), firex.health(runId)])
      .then(([list, verdict]) => {
        if (!live) return;
        setIncidents(list);
        setHealth(verdict);
      })
      .catch((e: unknown) => live && setError(classify(e).message));
    return () => {
      live = false;
    };
  }, [runId, status]);

  async function act(action: "cancel" | "resume") {
    try {
      setRun(await firex[action](runId));
    } catch (e) {
      setError(classify(e).message);
    }
  }

  if (expired) {
    return (
      <div className={s.root} style={ps2Vars}>
        <div className={s.alert} role="alert">
          <p>This run was not found on the server.</p>
          <Link href="/firex">Back to datasets</Link>
        </div>
      </div>
    );
  }
  if (!run) {
    return (
      <div className={s.root} style={ps2Vars}>
        {error ? (
          <p className={s.alert} role="alert">
            The analysis service could not be reached: {error}. Retrying.
          </p>
        ) : (
          <p role="status">Loading the run…</p>
        )}
      </div>
    );
  }

  const finished = run.status === "completed";
  return (
    <div className={s.root} style={ps2Vars} data-testid="firex-run">
      <header>
        <p className={s.crumbs}>
          <Link href="/firex">Log analysis</Link> / {run.dataset_id}
        </p>
        {finished && health ? null : <h1 className={s.title}>{STATUS_TEXT[run.status]}</h1>}
        {finished && health ? <span className={s.meta}>Result for {run.dataset_id}</span> : null}
        {!finished && run.detail !== STATUS_TEXT[run.status] ? (
          <p className={s.lede} role="status">
            {run.detail}
          </p>
        ) : null}
      </header>

      {error ? (
        <p className={s.alert} role="alert">
          Connection problem: {error}. Showing the last known state and retrying.
        </p>
      ) : null}
      {run.error ? (
        <p className={s.alert} role="alert">
          {run.error}
        </p>
      ) : null}
      {run.recovered ? (
        <p className={s.notice}>This run stopped unexpectedly and was recovered from its stored progress. Finished work is kept.</p>
      ) : null}

      {finished && health ? <HealthVerdict health={health} titleLevel={1} /> : null}
      {!finished ? <Progress run={run} onAct={act} /> : null}
      {finished && health?.reconstruction === "withheld" ? <QualityFinding runId={run.run_id} health={health} /> : null}
      {finished && incidents && health?.reconstruction !== "withheld" ? <Incidents list={incidents} /> : null}
      {finished ? <CaseBuilder runId={run.run_id} /> : null}
      {finished ? <RunDetails run={run} list={incidents} /> : null}
    </div>
  );
}

function Progress({ run, onAct }: { run: DatasetRun; onAct: (action: "cancel" | "resume") => void }) {
  const m = run.metrics;
  return (
    <>
      <ol className={s.stages} aria-label="Analysis stages">
        {STAGES.map((stage) => (
          <li key={stage.id} className={s.stage} data-state={stageState(run, stage.id)}>
            <strong>{stage.label}</strong>
            {stage.description}
          </li>
        ))}
      </ol>
      <section className={s.card} aria-label="Progress">
        <div className={s.bar} role="progressbar" aria-valuenow={percentOf(run)} aria-valuemin={0} aria-valuemax={100} aria-label="Bytes read">
          <div className={s.barFill} style={{ width: `${percentOf(run)}%` }} />
        </div>
        <Metrics run={run} />
        <div className={s.actions}>
          {ACTIVE_STATUSES.includes(run.status) && run.status !== "cancelling" ? (
            <button type="button" className={s.btn} onClick={() => onAct("cancel")}>
              Stop
            </button>
          ) : null}
          {RESUMABLE_STATUSES.includes(run.status) ? (
            <button type="button" className={s.btnPrimary} onClick={() => onAct("resume")}>
              Resume
            </button>
          ) : null}
        </div>
        <p className={s.meta}>Read {formatBytes(m.bytes_processed)} of {formatBytes(m.bytes_total)}. Figures come from the run&apos;s own progress.</p>
      </section>
    </>
  );
}

function Metrics({ run }: { run: DatasetRun }) {
  const m = run.metrics;
  return (
    <dl className={s.facts}>
      <Fact label="Records" value={formatCount(m.records_processed)} />
      <Fact label="Throughput" value={`${m.mb_per_second} MB/s`} />
      <Fact label="Peak memory" value={m.peak_memory_mb === null ? "Measured at the end" : `${formatCount(m.peak_memory_mb)} MB (upper bound)`} />
      <Fact label="Rejected" value={`${formatCount(m.rejected_records)} in ${formatCount(m.quarantine_segments)} segment(s)`} />
      <Fact label="Exact duplicates" value={formatCount(m.exact_duplicates)} />
      <Fact label="Candidates" value={formatCount(m.detections)} />
      <Fact label="Elapsed" value={`${m.duration_s} s`} />
      <Fact label="Recovery" value={run.resume_count ? `Resumed ${run.resume_count} time(s)` : "Not needed"} />
    </dl>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function QualityFinding({ runId, health }: { runId: string; health: DatasetHealth }) {
  return (
    <section className={s.card} aria-labelledby="quality-finding">
      <h2 id="quality-finding">Quality finding</h2>
      <p className={s.statement2}>HALT refused to invent a story from this source.</p>
      <p>{health.reconstruction_reason}</p>
      <div className={s.actions}>
        <Link className={s.btnPrimary} href={`/firex/runs/${runId}/quality`}>
          Open the Quality Case
        </Link>
      </div>
    </section>
  );
}

function Incidents({ list }: { list: IncidentList }) {
  if (!list.items.length) {
    return (
      <section className={s.card} aria-label="Incidents">
        <h2>No incidents</h2>
        <p>No rule found a supported pattern in the data read. Isolated alerts are not reported as incidents, and this is not proof that the data is clean.</p>
      </section>
    );
  }
  return (
    <section className={s.section} aria-labelledby="firex-incidents">
      <h2 id="firex-incidents" className={s.sectionTitle}>
        Incidents
      </h2>
      <ul className={s.incidentList}>
        {list.items.map((i) => (
          <li key={i.incident_id} className={s.incidentRow}>
            <div>
              <h3>{i.title}</h3>
              <ul className={s.incidentFacts}>
                <li>
                  Begins at <span className={s.mono}>{i.entry_point}</span>
                </li>
                {i.affected_identity ? <li>Identity {i.affected_identity}</li> : null}
                {i.critical_target ? (
                  <li>
                    Target <span className={s.mono}>{i.critical_target}</span>
                  </li>
                ) : null}
                <li>{formatCount(i.merged_events)} records</li>
                <li>Risk {i.risk}</li>
              </ul>
            </div>
            <div className={s.actions}>
              <StatusBadge status="Unconfirmed" />
              <Link className={s.btnPrimary} href={`/firex/incidents/${i.incident_id}?run=${list.run_id}`} aria-label={`Open incident ${i.incident_id}`}>
                Open incident
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function RunDetails({ run, list }: { run: DatasetRun; list: IncidentList | null }) {
  const [open, setOpen] = useState(false);
  const [segments, setSegments] = useState<QuarantineSegment[] | null>(null);
  const q = list?.quality;

  useEffect(() => {
    if (!open) return;
    let live = true;
    firex
      .quarantine(run.run_id)
      .then((r) => live && setSegments(r.items))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open, run.run_id]);

  return (
    <details className={s.card} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Processing details</summary>
      <Metrics run={run} />
      <dl className={s.facts}>
        <Fact label="Run" value={run.run_id} />
        <Fact label="Chunks" value={`${run.chunks_done} of ${run.chunks_total}`} />
        <Fact label="Output" value={formatBytes(run.metrics.output_bytes)} />
        {q ? <Fact label="Earliest to latest (UTC)" value={`${q.earliest_utc ?? "—"} to ${q.latest_utc ?? "—"}`} /> : null}
        {q ? <Fact label="Records with a collapsed time" value={formatCount(q.records_in_collapsed_timestamps)} /> : null}
      </dl>
      {segments?.length ? (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <caption className={s.meta} style={{ textAlign: "left" }}>
              Quarantine segments
            </caption>
            <thead>
              <tr>
                <th>Reason</th>
                <th>Bytes</th>
                <th>Rejected lines</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((g) => (
                <tr key={g.segment_id}>
                  <td>{g.reason}</td>
                  <td className={s.mono}>
                    {g.start_offset} to {g.end_offset}
                  </td>
                  <td>{formatCount(g.rejected_records)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </details>
  );
}
