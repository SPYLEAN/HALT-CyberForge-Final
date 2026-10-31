"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { classify } from "@/lib/ps2/api";
import {
  ACTIVE_STATUSES,
  RESUMABLE_STATUSES,
  STAGES,
  firex,
  formatBytes,
  formatCount,
  percentOf,
  stageState,
  type BenchmarkView,
  type DatasetRun,
  type IncidentList,
  type QuarantineSegment,
} from "@/lib/firex/api";
import { ps2Vars } from "@/styles/ps2-palette";

import s from "./firex.module.css";

const POLL_MS = 1500;
const STATUS_TEXT: Record<DatasetRun["status"], string> = {
  queued: "Starting",
  running: "Running",
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
    firex
      .incidents(runId)
      .then((list) => live && setIncidents(list))
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

  const m = run.metrics;
  return (
    <div className={s.root} style={ps2Vars} data-testid="firex-run">
      <header className={s.head}>
        <div>
          <p className={s.meta}>
            <Link href="/firex">Datasets</Link> / {run.dataset_id}
          </p>
          <h1>{STATUS_TEXT[run.status]}</h1>
          {run.detail !== STATUS_TEXT[run.status] ? (
            <p className={s.lede} role="status">
              {run.detail}
            </p>
          ) : null}
        </div>
        <div className={s.actions}>
          {ACTIVE_STATUSES.includes(run.status) && run.status !== "cancelling" ? (
            <button type="button" className="halt-btn" onClick={() => act("cancel")}>
              <span>STOP</span>
            </button>
          ) : null}
          {RESUMABLE_STATUSES.includes(run.status) ? (
            <button type="button" className="halt-btn halt-btn-primary" onClick={() => act("resume")}>
              <span>RESUME</span>
            </button>
          ) : null}
          {run.status === "completed" && incidents?.items.length ? (
            <Link className="halt-btn" href={`/firex/runs/${run.run_id}/theatre`}>
              <span>THEATRE</span>
            </Link>
          ) : null}
        </div>
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

      <ol className={s.stages} aria-label="Analysis stages">
        {STAGES.map((stage) => (
          <li key={stage.id} className={s.stage} data-state={stageState(run, stage.id)}>
            <strong>{stage.label}</strong>
            {stage.description}
          </li>
        ))}
      </ol>

      <section className={s.card} aria-label="Progress">
        <div
          className={s.bar}
          role="progressbar"
          aria-valuenow={percentOf(run)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Bytes read"
        >
          <div className={s.barFill} style={{ width: `${percentOf(run)}%` }} />
        </div>
        <dl className={s.facts}>
          <Fact label="Read" value={`${percentOf(run)}% · ${formatBytes(m.bytes_processed)} of ${formatBytes(m.bytes_total)}`} />
          <Fact label="Records" value={formatCount(m.records_processed)} />
          <Fact label="Throughput" value={`${formatCount(Math.round(m.records_per_second))} records/s · ${m.mb_per_second} MB/s`} />
          <Fact label="Peak memory" value={m.peak_memory_mb === null ? "Measured at the end" : `${formatCount(m.peak_memory_mb)} MB (upper bound)`} />
          <Fact label="Rejected" value={`${formatCount(m.rejected_records)} in ${formatCount(m.quarantine_segments)} segment(s)`} />
          <Fact label="Exact duplicates" value={formatCount(m.exact_duplicates)} />
          <Fact label="Suspicious candidates" value={formatCount(m.detections)} />
          <Fact label="Incidents" value={formatCount(m.incidents)} />
          <Fact label="Elapsed" value={`${m.duration_s} s`} />
          <Fact label="Recovery" value={run.resume_count ? `Resumed ${run.resume_count} time(s)` : "Not needed"} />
        </dl>
      </section>

      {run.status === "completed" && incidents ? <Incidents list={incidents} /> : null}
      <AnalystDetails run={run} list={incidents} />
    </div>
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

function Incidents({ list }: { list: IncidentList }) {
  if (!list.items.length) {
    return (
      <section className={s.card} aria-label="Incidents">
        <h2>No incidents</h2>
        <p>No rule found a supported attack pattern in the data read. Isolated alerts are not reported as incidents.</p>
      </section>
    );
  }
  return (
    <section className={s.card} aria-labelledby="firex-incidents">
      <h2 id="firex-incidents">Incidents ({list.items.length})</h2>
      <p className={s.meta}>Candidates from rules. None is confirmed.</p>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th>Incident</th>
              <th>Time range (UTC)</th>
              <th>Entry point</th>
              <th>Identity or device</th>
              <th>Target</th>
              <th>Evidence</th>
              <th>Confidence</th>
              <th>Risk</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.items.map((i) => (
              <tr key={i.incident_id}>
                <td>
                  <strong>{i.title}</strong>
                  <div className={`${s.mono} ${s.meta}`}>{i.incident_id}</div>
                </td>
                <td className={s.mono}>
                  <div className={s.nowrap}>{i.first_utc}</div>
                  <div className={s.nowrap}>{i.last_utc}</div>
                  {i.timestamp_quality === "collapsed" ? <div className={s.meta}>Some times are collapsed</div> : null}
                </td>
                <td className={`${s.mono} ${s.nowrap}`}>{i.entry_point}</td>
                <td>{i.affected_identity ?? i.affected_devices[0] ?? "—"}</td>
                <td className={`${s.mono} ${s.nowrap}`}>{i.critical_target ?? "—"}</td>
                <td>{formatCount(i.merged_events)}</td>
                <td>{i.confidence}</td>
                <td>{i.risk}</td>
                <td>
                  <span className={`${s.chip} ${s.chipUnconfirmed}`}>{i.status}</span>
                </td>
                <td>
                  <Link
                    className={`halt-btn halt-btn-primary ${s.nowrap}`}
                    href={`/firex/incidents/${i.incident_id}?run=${list.run_id}`}
                    aria-label={`Open incident ${i.incident_id}`}
                  >
                    <span>OPEN INCIDENT</span>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AnalystDetails({ run, list }: { run: DatasetRun; list: IncidentList | null }) {
  const [open, setOpen] = useState(false);
  const [segments, setSegments] = useState<QuarantineSegment[] | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkView | null>(null);
  const q = list?.quality;

  useEffect(() => {
    if (!open || run.status !== "completed") return;
    let live = true;
    firex.quarantine(run.run_id).then((r) => live && setSegments(r.items)).catch(() => undefined);
    firex.benchmark(run.run_id).then((r) => live && setBenchmark(r)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open, run.run_id, run.status]);

  return (
    <details className={s.card} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Analyst details</summary>
      <dl className={s.facts}>
        <Fact label="Run" value={run.run_id} />
        <Fact label="Internal stage" value={run.stage} />
        <Fact label="Chunks" value={`${run.chunks_done} of ${run.chunks_total}`} />
        <Fact label="Byte range" value={run.byte_range ? `${run.byte_range[0]} to ${run.byte_range[1]}` : "—"} />
        <Fact label="Output" value={formatBytes(run.metrics.output_bytes)} />
        <Fact label="Compression" value={run.metrics.compression_ratio ? `${run.metrics.compression_ratio}×` : "—"} />
      </dl>
      {q ? (
        <>
          <h3>Data quality</h3>
          <dl className={s.facts}>
            <Fact label="Every byte accounted for" value={q.bytes_accounted ? "Yes" : "No"} />
            <Fact label="Valid bytes" value={formatBytes(q.bytes_valid)} />
            <Fact label="Quarantined bytes" value={formatBytes(q.bytes_quarantined)} />
            <Fact label="Earliest to latest (UTC)" value={`${q.earliest_utc ?? "—"} to ${q.latest_utc ?? "—"}`} />
            <Fact label="Records with a collapsed time" value={formatCount(q.records_in_collapsed_timestamps)} />
          </dl>
          {q.timezone_conflict ? (
            <p className={s.notice}>
              Time zone conflict on {formatCount(q.timezone_conflict.affected_records)} records. {q.timezone_conflict.interpretation}
            </p>
          ) : null}
        </>
      ) : null}
      {segments?.length ? (
        <>
          <h3>Quarantine segments</h3>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Reason</th>
                  <th>Bytes</th>
                  <th>Lines</th>
                  <th>Rejected</th>
                </tr>
              </thead>
              <tbody>
                {segments.map((g) => (
                  <tr key={g.segment_id}>
                    <td>{g.reason}</td>
                    <td className={s.mono}>
                      {g.start_offset} to {g.end_offset}
                    </td>
                    <td className={s.mono}>
                      {g.start_line} to {g.end_line}
                    </td>
                    <td>{formatCount(g.rejected_records)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      {benchmark ? (
        <>
          <h3>Benchmark receipt</h3>
          <p className={s.meta}>
            Seal {benchmark.verification.valid ? "valid" : "INVALID"}: a SHA-256 seal over this receipt, not a legal digital signature.{" "}
            {benchmark.receipt.source_sha256_verified ? "Whole-file hash verified." : "Sample only: the whole-file hash was not re-verified."}
          </p>
          <pre className={s.pre}>{JSON.stringify(benchmark.receipt, null, 1)}</pre>
        </>
      ) : null}
    </details>
  );
}
