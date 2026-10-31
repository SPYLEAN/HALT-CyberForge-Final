"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { firex, formatBytes, type DatasetDescriptor, type DatasetHealth, type DatasetRun } from "@/lib/firex/api";
import { classify } from "@/lib/ps2/api";
import { ps2Vars } from "@/styles/ps2-palette";

import s from "./firex.module.css";
import { SearchEvidence } from "./SourceTrace";
import { StatusBadge } from "./Verdict";

const RANGES: Array<{ label: string; value: number | null }> = [
  { label: "Whole file", value: null },
  { label: "First 100 MB (sample)", value: 100_000_000 },
  { label: "First 1 GB (sample)", value: 1_000_000_000 },
];

/** Log Analysis: the registered logs, each with its verdict. Every figure comes from the API. */
export function Datasets() {
  const [datasets, setDatasets] = useState<DatasetDescriptor[] | null>(null);
  const [runs, setRuns] = useState<DatasetRun[]>([]);
  const [health, setHealth] = useState<Record<string, DatasetHealth>>({});
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([firex.datasets(), firex.runs()])
      .then(async ([d, r]) => {
        if (!live) return;
        setDatasets(d);
        setRuns(r);
        setError(null);
        const latest = d.map((x) => x.latest_run_id).filter((id): id is string => Boolean(id));
        const verdicts = await Promise.all(latest.map((id) => firex.health(id).catch(() => null)));
        if (live) setHealth(Object.fromEntries(verdicts.filter((v): v is DatasetHealth => Boolean(v)).map((v) => [v.run_id, v])));
      })
      .catch((e: unknown) => live && setError(classify(e).message));
    return () => {
      live = false;
    };
  }, [retry]);

  const samples = runs.filter((r) => !datasets?.some((d) => d.latest_run_id === r.run_id));
  return (
    <div className={s.root} style={ps2Vars} data-testid="firex-datasets">
      <header style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", alignItems: "flex-start" }}>
        <h1 className={s.title}>Log analysis</h1>
        <p className={s.lede}>
          Read a large security log, connect what it shows into attack paths backed by evidence, and see plainly when the evidence cannot
          support a story.
        </p>
        {Object.keys(health).length ? <SearchEvidence advanced runs={Object.values(health).map((h) => ({ run_id: h.run_id, label: `${h.dataset_id} (${h.run_id})` }))} /> : null}
      </header>
      {error ? (
        <div className={s.alert} role="alert">
          <p>The analysis service could not be reached: {error}</p>
          <button type="button" className={s.btn} onClick={() => setRetry((n) => n + 1)}>
            Try again
          </button>
        </div>
      ) : !datasets ? (
        <p role="status">Loading datasets…</p>
      ) : (
        <>
          <section className={s.grid} aria-label="Datasets">
            {datasets.map((d) => (
              <DatasetCard key={d.dataset_id} dataset={d} health={d.latest_run_id ? health[d.latest_run_id] : undefined} onError={setError} />
            ))}
          </section>
          {samples.length ? (
            <details className={s.card}>
              <summary>Other runs ({samples.length})</summary>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Run</th>
                      <th>Dataset</th>
                      <th>Status</th>
                      <th>Incidents</th>
                    </tr>
                  </thead>
                  <tbody>
                    {samples.map((r) => (
                      <tr key={r.run_id}>
                        <td className={s.mono}>
                          <Link href={`/firex/runs/${r.run_id}`}>{r.run_id}</Link>
                        </td>
                        <td>{r.dataset_id}</td>
                        <td>{r.status}</td>
                        <td>{r.metrics.incidents ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
          <p className={s.meta}>
            Small uploads and the bundled scenarios are in <Link href="/reconstruct">Reconstruct</Link>.
          </p>
        </>
      )}
    </div>
  );
}

function DatasetCard({ dataset, health, onError }: { dataset: DatasetDescriptor; health?: DatasetHealth; onError: (message: string) => void }) {
  const router = useRouter();
  const [range, setRange] = useState("");
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const run = await firex.start(dataset.dataset_id, range ? Number(range) : null);
      router.push(`/firex/runs/${run.run_id}`);
    } catch (e) {
      onError(classify(e).message);
      setBusy(false);
    }
  }

  return (
    <article className={s.card} aria-label={dataset.title}>
      <div className={s.actions} style={{ justifyContent: "space-between" }}>
        <h2>{dataset.title}</h2>
        {health ? <StatusBadge status={health.state} /> : null}
      </div>
      <p className={s.meta}>{dataset.available ? formatBytes(dataset.size_bytes) : "Not on this server"}</p>
      {health ? (
        <>
          <p>{health.headline}</p>
          <dl className={s.facts} aria-label="Measured on the recorded run">
            <div>
              <dt>Records</dt>
              <dd>{health.canonical_records?.toLocaleString("en-US") ?? "Not measured"}</dd>
            </div>
            <div>
              <dt>Duplicates</dt>
              <dd>{health.exact_duplicates?.toLocaleString("en-US") ?? "Not measured"}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{health.duration_s !== null && health.duration_s !== undefined ? `${health.duration_s.toLocaleString("en-US")} s` : "Not measured"}</dd>
            </div>
            <div>
              <dt>Throughput</dt>
              <dd>{health.mb_per_second !== null && health.mb_per_second !== undefined ? `${health.mb_per_second} MB/s` : "Not measured"}</dd>
            </div>
            <div>
              <dt>Peak memory</dt>
              <dd>{health.peak_memory_mb !== null && health.peak_memory_mb !== undefined ? `${health.peak_memory_mb.toLocaleString("en-US")} MB` : "Not measured"}</dd>
            </div>
            {health.time_quality ? (
              <div>
                <dt>Usable time order</dt>
                <dd>{(health.time_quality.usable_fraction * 100).toFixed(2)}% of records</dd>
              </div>
            ) : null}
          </dl>
          <div className={s.actions}>
            <Link className={s.btnPrimary} href={`/firex/runs/${health.run_id}`}>
              Open result
            </Link>
            <Link className={s.btn} href={`/trust/${health.run_id}`}>
              Verify
            </Link>
          </div>
        </>
      ) : dataset.available ? (
        <>
          <label className={s.field}>
            How much to read
            <select value={range} onChange={(e) => setRange(e.target.value)}>
              {RANGES.map((r) => (
                <option key={r.label} value={r.value ?? ""}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <div className={s.actions}>
            <button type="button" className={s.btnPrimary} disabled={busy} onClick={start}>
              {busy ? "Starting…" : "Start analysis"}
            </button>
          </div>
        </>
      ) : (
        <p className={s.meta}>Place this log on the server to analyse it.</p>
      )}
    </article>
  );
}
