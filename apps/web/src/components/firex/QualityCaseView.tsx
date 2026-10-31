"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { firex, formatBytes, formatCount, type QualityCase } from "@/lib/firex/api";
import { classify } from "@/lib/ps2/api";
import { ps2Vars } from "@/styles/ps2-palette";

import { CaseBuilder } from "./CaseBuilder";
import s from "./firex.module.css";
import { StatusBadge } from "./Verdict";

export function ByteMap({ data }: { data: QualityCase }) {
  const valid = data.valid_fraction * 100;
  return (
    <figure style={{ margin: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <div className={s.byteMap} role="img" aria-label={`${(data.valid_fraction * 100).toFixed(2)}% of the source is valid log records and ${(data.quarantined_fraction * 100).toFixed(2)}% is quarantined`}>
        <div className={s.byteValid} style={{ width: `${valid}%` }} />
        <div className={s.byteQuarantined} style={{ width: `${100 - valid}%` }} />
      </div>
      <figcaption className={s.byteLegend}>
        <span>
          <strong>{(data.valid_fraction * 100).toFixed(2)}%</strong> valid log records ({formatBytes(data.bytes_valid)})
        </span>
        <span>
          <strong>{(data.quarantined_fraction * 100).toFixed(2)}%</strong> quarantined ({formatBytes(data.bytes_quarantined)})
        </span>
      </figcaption>
    </figure>
  );
}

/** Why a source cannot support reconstruction. It deliberately draws no attack graph. */
export function QualityCaseView({ runId }: { runId: string }) {
  const [data, setData] = useState<QualityCase | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    firex
      .qualityCase(runId)
      .then((d) => live && setData(d))
      .catch((e: unknown) => {
        if (!live) return;
        const f = classify(e);
        setFailure(f.kind === "expired" ? "This run has no Quality Case: reconstruction was not withheld." : f.message);
      });
    return () => {
      live = false;
    };
  }, [runId]);

  if (failure) {
    return (
      <div className={s.root} style={ps2Vars}>
        <div className={s.alert} role="alert">
          <p>{failure}</p>
          <Link href={`/firex/runs/${runId}`}>Back to the run</Link>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={s.root} style={ps2Vars}>
        <p role="status">Loading the Quality Case…</p>
      </div>
    );
  }
  return (
    <div className={s.root} style={ps2Vars} data-testid="quality-case">
      <header>
        <p className={s.crumbs}>
          <a href="/firex">Log analysis</a> / <Link href={`/firex/runs/${runId}`}>{data.dataset_id}</Link> / Quality Case
        </p>
        <div className={s.actions} style={{ marginBottom: "var(--space-3)" }}>
          <StatusBadge status="Degraded" large />
          <span className={s.meta}>Reconstruction withheld</span>
        </div>
        <h1 className={s.title}>{data.withheld_statement}</h1>
        <p className={s.lede}>{data.zero_statement}</p>
      </header>

      <section className={s.section} aria-labelledby="q-bytes">
        <h2 id="q-bytes" className={s.sectionTitle}>
          {data.bytes_accounted ? "Every byte is accounted for" : "Not every byte is accounted for"}
        </h2>
        <ByteMap data={data} />
        <p className={s.meta}>
          {formatBytes(data.source_bytes)} received. Source hash {data.source_hash_verified ? "verified" : "not verified"}. {data.segments.length} quarantine
          segment(s).
        </p>
      </section>

      <section className={s.section} aria-labelledby="q-time">
        <h2 id="q-time" className={s.sectionTitle}>
          {data.collapsed_records === data.canonical_records ? "Every valid record shares one timestamp" : `${formatCount(data.collapsed_records)} records share one timestamp`}
        </h2>
        <p className={s.keyNumber}>{formatCount(data.collapsed_records)}</p>
        <p>
          records at <span className={s.mono}>{data.collapsed_utc}</span>. With no time between events, nothing can be ordered, timed or connected into a
          sequence.
        </p>
        {data.declared_tz.length ? (
          <p className={s.notice}>
            The source declares <span className={s.mono}>{data.declared_tz.join(", ")}</span>, but its date and time fields behave as UTC. The original values are
            preserved and the conflict is recorded.
          </p>
        ) : null}
      </section>

      <section className={s.section} aria-labelledby="q-why">
        <h2 id="q-why" className={s.sectionTitle}>
          What HALT did, and did not do
        </h2>
        <p style={{ maxWidth: "72ch", margin: 0 }}>{data.reason}</p>
        <dl className={s.facts}>
          <div>
            <dt>Valid records</dt>
            <dd>{formatCount(data.canonical_records)}</dd>
          </div>
          <div>
            <dt>Exact duplicates</dt>
            <dd>{formatCount(data.exact_duplicates)}</dd>
          </div>
          <div>
            <dt>Incidents</dt>
            <dd>0, withheld</dd>
          </div>
          <div>
            <dt>Incident-open latency</dt>
            <dd>{data.incident_open_latency_label}</dd>
          </div>
          <div>
            <dt>Receipt seal</dt>
            <dd>{data.benchmark_seal_valid ? "Valid" : "Failed"}</dd>
          </div>
        </dl>
      </section>

      <section className={s.card} aria-labelledby="q-next">
        <h2 id="q-next">What to do next</h2>
        <p>Ask for a corrected source with a usable time axis. More analysis of this file cannot create the missing evidence.</p>
        <div className={s.actions}>
          <Link className={s.btn} href={`/trust/${runId}`}>
            Verify in the Trust Centre
          </Link>
        </div>
      </section>

      <CaseBuilder runId={runId} />

      <details className={s.card}>
        <summary>Quarantine segments</summary>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Reason</th>
                <th>Size</th>
                <th>Byte range</th>
              </tr>
            </thead>
            <tbody>
              {data.segments.map((g) => (
                <tr key={g.segment_id}>
                  <td>{g.reason}</td>
                  <td>{formatBytes(g.bytes)}</td>
                  <td className={s.mono}>
                    {g.start_offset} to {g.end_offset}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
