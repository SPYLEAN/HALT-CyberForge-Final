"use client";

import type { IngestionResult, Ps2Failure } from "@/lib/ps2/api";

import { FailureNote, TableScroll } from "./common";
import s from "./ps2.module.css";

/** What the ingestion returned. Previews are the service's redacted, truncated previews; nothing else is shown. */
export function IngestionReport({
  ingestion,
  sourceTypes,
  eventsCreated,
  runId,
  busy,
  failure,
  onReconstruct,
  onStartOver,
}: {
  ingestion: IngestionResult;
  sourceTypes: Record<string, number> | null;
  eventsCreated: number | null;
  runId: string | undefined;
  busy: boolean;
  failure: Ps2Failure | null;
  onReconstruct: () => void;
  onStartOver: () => void;
}) {
  const total = ingestion.accepted + ingestion.rejected;
  const adapters = [...new Set(ingestion.files.map((f) => f.adapter))].sort();
  return (
    <section aria-labelledby="ingestion-head">
      <h2 id="ingestion-head" className="v2-section" style={{ marginBottom: "var(--space-3)" }}>
        Ingestion result
      </h2>
      <dl className={s.facts} style={{ marginBottom: "var(--space-4)" }} aria-label="Ingestion totals">
        <div>
          <dt>Total records</dt>
          <dd className="v2-num">{total.toLocaleString("en-GB")}</dd>
        </div>
        <div>
          <dt>Accepted</dt>
          <dd className="v2-num">{ingestion.accepted.toLocaleString("en-GB")}</dd>
        </div>
        <div>
          <dt>Rejected</dt>
          <dd className="v2-num">{ingestion.rejected.toLocaleString("en-GB")}</dd>
        </div>
        <div>
          <dt>Warnings</dt>
          <dd className="v2-num">{ingestion.warnings.toLocaleString("en-GB")}</dd>
        </div>
        <div>
          <dt>Canonical events</dt>
          <dd className="v2-num">{eventsCreated != null ? eventsCreated.toLocaleString("en-GB") : "—"}</dd>
        </div>
      </dl>
      <dl className={s.kv} style={{ maxWidth: 880 }}>
        <dt>Ingestion id</dt>
        <dd className={s.mono}>{ingestion.batch_id}</dd>
        <dt>Canonical schema</dt>
        <dd className={s.mono}>{ingestion.canonical_schema}</dd>
        <dt>Adapters used</dt>
        <dd className={s.mono}>{adapters.join(", ")}</dd>
        <dt>Source types</dt>
        <dd>
          {sourceTypes
            ? Object.entries(sourceTypes)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([t, n]) => `${t} (${n})`)
                .join(", ")
            : "unavailable until the canonical events load"}
        </dd>
        {ingestion.dataset_id ? (
          <>
            <dt>Dataset</dt>
            <dd className={s.mono}>{ingestion.dataset_id}</dd>
          </>
        ) : null}
      </dl>

      <TableScroll label="Per-file ingestion table" style={{ marginTop: "var(--space-5)" }}>
        <table className={s.table}>
          <caption className="v2-kicker" style={{ textAlign: "left", paddingBottom: "var(--space-2)" }}>
            Per file
          </caption>
          <thead>
            <tr>
              <th scope="col">File</th>
              <th scope="col">Adapter</th>
              <th scope="col" className={s.num}>
                Accepted
              </th>
              <th scope="col" className={s.num}>
                Rejected
              </th>
              <th scope="col" className={s.num}>
                Warnings
              </th>
            </tr>
          </thead>
          <tbody>
            {ingestion.files.map((f) => (
              <tr key={f.filename}>
                <th scope="row" className={s.mono}>
                  {f.filename}
                </th>
                <td className={s.mono}>{f.adapter}</td>
                <td className={s.num}>{f.accepted}</td>
                <td className={s.num}>{f.rejected}</td>
                <td className={s.num}>{f.warnings}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>

      {ingestion.files.some((f) => f.rejected || f.warnings) ? (
        <div style={{ marginTop: "var(--space-4)" }}>
          {ingestion.files
            .filter((f) => f.rejected || f.warnings)
            .map((f) => (
              <details key={f.filename} className="v2-details">
                <summary>
                  <span>{`${f.filename}: ${f.rejected} rejected, ${f.warnings} with warnings`}</span>
                </summary>
                <ul className={s.rows}>
                  {f.records
                    .filter((r) => r.status !== "normalised")
                    .map((r) => (
                      <li key={`${r.raw_sha256}-${r.line}`} className={s.row}>
                        <span className={s.rowMeta}>
                          <span>{r.status === "rejected" ? "Rejected" : "Accepted with warnings"}</span>
                          <span>{`line ${r.line ?? "—"}`}</span>
                          <span className={s.mono}>{r.source_record_id}</span>
                        </span>
                        <ul style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
                          {r.issues.map((i, k) => (
                            <li key={k}>
                              <span className={s.mono}>{i.code}</span>
                              {`: ${i.message}${i.field ? ` (${i.field})` : ""}`}
                            </li>
                          ))}
                        </ul>
                        {r.preview ? (
                          <span className={s.mono} style={{ color: "var(--v2-text-2)" }}>
                            {`Redacted preview: ${r.preview}`}
                          </span>
                        ) : null}
                      </li>
                    ))}
                </ul>
              </details>
            ))}
        </div>
      ) : null}

      {failure ? <FailureNote failure={failure} onRetry={onReconstruct} /> : null}
      <div className="v2-btn-row" style={{ marginTop: "var(--space-5)" }}>
        <button type="button" className="halt-btn halt-btn-primary" onClick={onReconstruct} disabled={busy || !ingestion.accepted}>
          <span>{runId ? "OPEN RECONSTRUCTION" : busy ? "RECONSTRUCTING…" : "RECONSTRUCT ATTACK PATH"}</span>
          <span aria-hidden>→</span>
        </button>
        <button type="button" className="halt-btn" onClick={onStartOver} disabled={busy}>
          <span>START OVER</span>
        </button>
      </div>
      {!ingestion.accepted ? <p className="v2-meta">No record was accepted, so there is nothing to reconstruct.</p> : null}
    </section>
  );
}
