"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { firex, type DatasetHealth, type TrustReport } from "@/lib/firex/api";
import { classify } from "@/lib/ps2/api";
import { ps2Vars } from "@/styles/ps2-palette";

import s from "./firex.module.css";
import { TimeRegionMap } from "./QualityCaseView";
import { HealthVerdict, StatusBadge } from "./Verdict";

/** The first view is a verdict for each run. Hashes are one expansion away. */
export function TrustIndex() {
  const [items, setItems] = useState<DatasetHealth[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    firex
      .runs()
      .then((runs) => Promise.all(runs.filter((r) => r.status === "completed").map((r) => firex.health(r.run_id))))
      .then((h) => live && setItems(h))
      .catch((e: unknown) => live && setError(classify(e).message));
    return () => {
      live = false;
    };
  }, []);
  return (
    <div className={s.root} style={ps2Vars} data-testid="trust-index">
      <header>
        <h1 className={s.title}>Trust Centre</h1>
        <p className={s.lede}>Can this result be relied on? Four separate questions, answered for every run. A verified file is not a verified conclusion.</p>
      </header>
      {error ? (
        <p className={s.alert} role="alert">
          The analysis service could not be reached: {error}
        </p>
      ) : !items ? (
        <p role="status">Loading…</p>
      ) : !items.length ? (
        <p className={s.notice}>No completed run exists yet. Start one from <Link href="/firex">Log analysis</Link>.</p>
      ) : (
        <ul className={s.incidentList}>
          {items.map((h) => (
            <li key={h.run_id} className={s.incidentRow}>
              <div>
                <h2 className={s.sectionTitle}>{h.dataset_id}{h.is_sample ? " (sample)" : ""}</h2>
                <p className={s.meta}>{h.headline}</p>
              </div>
              <div className={s.actions}>
                <StatusBadge status={h.state} />
                <Link className={s.btn} href={`/trust/${h.run_id}`} aria-label={`Open trust report for ${h.dataset_id} ${h.run_id}`}>
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TrustRun({ runId }: { runId: string }) {
  const [data, setData] = useState<TrustReport | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    firex
      .trust(runId)
      .then((d) => live && setData(d))
      .catch((e: unknown) => live && setFailure(classify(e).message));
    return () => {
      live = false;
    };
  }, [runId]);

  if (failure) {
    return (
      <div className={s.root} style={ps2Vars}>
        <p className={s.alert} role="alert">
          {failure}
        </p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={s.root} style={ps2Vars}>
        <p role="status">Loading the trust report…</p>
      </div>
    );
  }
  const { health } = data;
  return (
    <div className={s.root} style={ps2Vars} data-testid="trust-run">
      <header>
        <p className={s.crumbs}>
          <Link href="/trust">Trust Centre</Link> / {health.dataset_id} / <Link href={`/firex/runs/${health.run_id}`}>Open result</Link>
        </p>
      </header>
      <HealthVerdict health={health} titleLevel={1} trustLink={false} />
      <p className={s.notice}>Verified means the file and the processing check out. It does not mean an incident is true.</p>

      <section className={s.grid} aria-label="Trust dimensions in detail">
        {health.dimensions.map((d) => (
          <article key={d.id} className={s.card} aria-label={d.title}>
            <div className={s.actions} style={{ justifyContent: "space-between" }}>
              <h2>{d.title}</h2>
              <StatusBadge status={d.status} />
            </div>
            <p>{d.verdict}</p>
            <details>
              <summary>Details</summary>
              <dl className={s.lensList}>
                {d.items.map((item) => (
                  <div key={item.label} style={{ borderTop: "var(--border-hairline) solid var(--v2-border)", paddingTop: "var(--space-2)" }}>
                    <dt className={s.meta}>{item.label}</dt>
                    <dd style={{ margin: 0 }} className={item.is_hash ? s.mono : undefined}>
                      {item.value} {item.status && item.status !== item.value ? <StatusBadge status={item.status} /> : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          </article>
        ))}
      </section>

      {health.time_quality ? (
        <section className={s.card} aria-labelledby="trust-scope">
          <h2 id="trust-scope">Time scope</h2>
          <p>{data.scope_note}</p>
          <TimeRegionMap time={health.time_quality} />
          <p className={s.meta}>
            Time range <span className={s.mono}>{health.time_quality.earliest_utc}</span> to <span className={s.mono}>{health.time_quality.latest_utc}</span>. The collapsed region is lines{" "}
            {health.time_quality.collapsed_first_line.toLocaleString("en-US")} to {health.time_quality.collapsed_last_line.toLocaleString("en-US")}. A time-zone conflict affects {health.time_quality.timezone_conflict_records.toLocaleString("en-US")} records.
          </p>
          {data.incident_scopes.length ? (
            <div className={s.tableWrap}>
              <table className={s.table} aria-label="What each incident rests on">
                <thead>
                  <tr>
                    <th>Incident</th>
                    <th>Rests on</th>
                    <th>Cited records in the collapsed region</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.incident_scopes.map((i) => (
                    <tr key={i.incident_id}>
                      <td>
                        <Link href={`/firex/incidents/${i.incident_id}?run=${health.run_id}`}>{i.title}</Link>
                      </td>
                      <td>{i.scope_label}</td>
                      <td>
                        {i.cited_in_collapsed} of {i.cited_records}
                      </td>
                      <td>Unconfirmed</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className={s.card} aria-labelledby="trust-proof">
        <div className={s.actions} style={{ justifyContent: "space-between" }}>
          <h2 id="trust-proof">Proof</h2>
          <StatusBadge status={data.benchmark_seal_valid ? "Verified" : "Failed"} />
        </div>
        <p>
          The benchmark receipt seal {data.benchmark_seal_valid ? "is valid" : "does not verify"}.{" "}
          {data.proofs.length ? `${data.proofs.filter((p) => p.seal_valid).length} of ${data.proofs.length} incident proof receipts are valid.` : "No incident proof exists, because no incident was reconstructed."} A seal shows that a
          receipt has not changed. It is not a legal digital signature and does not show that a conclusion is true.
        </p>
        <details>
          <summary>Receipts and hashes</summary>
          <p className={s.meta}>
            Algorithm: <span className={s.mono}>{data.seal_algorithm ?? "Not measured"}</span>
          </p>
          <p className={`${s.meta} ${s.mono}`}>{data.benchmark_seal}</p>
          {data.proofs.length ? (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>Incident</th>
                    <th>Seal</th>
                    <th>Coverage</th>
                    <th>Unsupported claims</th>
                  </tr>
                </thead>
                <tbody>
                  {data.proofs.map((p) => (
                    <tr key={p.incident_id}>
                      <td>
                        <Link href={`/firex/incidents/${p.incident_id}?run=${health.run_id}`}>{p.title}</Link>
                      </td>
                      <td>{p.seal_valid ? "Valid" : "Failed"}</td>
                      <td>{Math.round(p.evidence_coverage * 100)}%</td>
                      <td>{p.unsupported_claims}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <ul className={s.lensList} aria-label="Artifact hashes">
            {Object.entries(data.artifact_hashes).map(([name, hash]) => (
              <li key={name}>
                {name}: <span className={s.mono}>{hash}</span>
              </li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  );
}
