"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { classify } from "@/lib/ps2/api";
import { firex, formatBytes, type DatasetDescriptor, type DatasetRun } from "@/lib/firex/api";
import { ps2Vars } from "@/styles/ps2-palette";

import s from "./firex.module.css";

const RANGES: Array<{ label: string; value: number | null }> = [
  { label: "Whole file", value: null },
  { label: "First 100 MB (sample)", value: 100_000_000 },
  { label: "First 1 GB (sample)", value: 1_000_000_000 },
];

/** Registered logs and their runs. Every figure here comes from the API. */
export function Datasets() {
  const [datasets, setDatasets] = useState<DatasetDescriptor[] | null>(null);
  const [runs, setRuns] = useState<DatasetRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([firex.datasets(), firex.runs()])
      .then(([d, r]) => {
        if (!live) return;
        setDatasets(d);
        setRuns(r);
        setError(null);
      })
      .catch((e: unknown) => live && setError(classify(e).message));
    return () => {
      live = false;
    };
  }, [retry]);

  return (
    <div className={s.root} style={ps2Vars} data-testid="firex-datasets">
      <header className={s.head}>
        <div>
          <h1>Log analysis</h1>
          <p className={s.lede}>
            Read a security log, find suspicious activity, and connect it into attack paths backed by evidence. Each result stays
            unconfirmed until someone validates it.
          </p>
        </div>
      </header>
      {error ? (
        <div className={s.alert} role="alert">
          <p>The analysis service could not be reached: {error}</p>
          <button type="button" className="halt-btn" onClick={() => setRetry((n) => n + 1)}>
            <span>TRY AGAIN</span>
          </button>
        </div>
      ) : !datasets ? (
        <p role="status">Loading datasets…</p>
      ) : (
        <>
          <section className={s.grid} aria-label="Datasets">
            {datasets.map((d) => (
              <DatasetCard key={d.dataset_id} dataset={d} runs={runs.filter((r) => r.dataset_id === d.dataset_id)} onError={setError} />
            ))}
          </section>
          {runs.length ? (
            <section className={s.card} aria-labelledby="firex-runs">
              <h2 id="firex-runs">Runs</h2>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Run</th>
                      <th>Dataset</th>
                      <th>Status</th>
                      <th>Incidents</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.run_id}>
                        <td className={s.mono}>
                          <Link href={`/firex/runs/${r.run_id}`}>{r.run_id}</Link>
                        </td>
                        <td>{r.dataset_id}</td>
                        <td>{r.status}</td>
                        <td>{r.metrics.incidents ?? "—"}</td>
                        <td className={s.mono}>{r.updated_at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function DatasetCard({ dataset, runs, onError }: { dataset: DatasetDescriptor; runs: DatasetRun[]; onError: (message: string) => void }) {
  const router = useRouter();
  const [range, setRange] = useState("");
  const [busy, setBusy] = useState(false);
  const latest = runs.find((r) => r.run_id === dataset.latest_run_id) ?? runs[0];

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
      <h2>{dataset.title}</h2>
      <dl className={s.facts}>
        <div>
          <dt>Size</dt>
          <dd>{formatBytes(dataset.size_bytes)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{dataset.available ? "Available" : "Not on this server"}</dd>
        </div>
      </dl>
      {dataset.available ? (
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
            <button type="button" className="halt-btn halt-btn-primary" disabled={busy} onClick={start}>
              <span>{busy ? "STARTING…" : "START ANALYSIS"}</span>
            </button>
            {latest ? (
              <Link className="halt-btn" href={`/firex/runs/${latest.run_id}`}>
                <span>LATEST RUN</span>
              </Link>
            ) : null}
          </div>
        </>
      ) : (
        <p className={s.meta}>Place this log on the server to analyse it.</p>
      )}
    </article>
  );
}
