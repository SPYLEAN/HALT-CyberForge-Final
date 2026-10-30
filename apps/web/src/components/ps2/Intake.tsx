"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  classify,
  ps2,
  type DatasetInfo,
  type IngestionResult,
  type IntakeCapabilities,
  type OrgContext,
  type Ps2Failure,
} from "@/lib/ps2/api";
import { ps2Session, usePs2Session } from "@/lib/ps2/session";
import { acceptAttribute, adaptersFor, formatOf, megabytes, suggestAdapter, toRawFiles, validate, type Selected } from "@/lib/ps2/upload";
import { ps2Vars } from "@/styles/ps2-palette";

import { FailureNote, PipelineStages, ServiceUnavailable, type PipelineStage, type StageState } from "./common";
import { IngestionReport } from "./IngestionReport";
import s from "./ps2.module.css";

type Phase = "idle" | "ingesting" | "events" | "ingested" | "reconstructing";

export function Intake() {
  const router = useRouter();
  const session = usePs2Session();
  const [caps, setCaps] = useState<IntakeCapabilities | null>(null);
  const [datasets, setDatasets] = useState<DatasetInfo[] | null>(null);
  const [loadFailure, setLoadFailure] = useState<Ps2Failure | null>(null);
  const [mode, setMode] = useState<"dataset" | "upload">("dataset");
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected[]>([]);
  const [context, setContext] = useState<{ name: string; value: OrgContext } | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [phase, setPhase] = useState<Phase>(session.ingestion ? "ingested" : "idle");
  const [failure, setFailure] = useState<{ stage: number; failure: Ps2Failure } | null>(null);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    Promise.all([ps2.intake(), ps2.datasets()])
      .then(([c, d]) => {
        if (!live) return;
        setCaps(c);
        setDatasets(d);
      })
      .catch((e: unknown) => live && setLoadFailure(classify(e)));
    return () => {
      live = false;
    };
  }, [attempt]);
  const retryLoad = () => {
    setLoadFailure(null);
    setAttempt((a) => a + 1);
  };

  const problems = useMemo(() => (caps && mode === "upload" ? validate(selected, caps) : []), [caps, mode, selected]);
  const ingestion = session.ingestion;
  const runId = ingestion ? session.runs[ingestion.batch_id] : undefined;
  const ready = mode === "dataset" ? Boolean(datasetId) : selected.length > 0 && !problems.length && !contextError;

  async function ingest() {
    if (!caps || !ready) return;
    setFailure(null);
    setPhase("ingesting");
    let result: IngestionResult;
    try {
      result =
        mode === "dataset" && datasetId ? await ps2.ingestDataset(datasetId) : await ps2.ingestFiles(await toRawFiles(selected, caps), context?.value);
    } catch (e) {
      setFailure({ stage: 2, failure: classify(e) });
      setPhase("idle");
      return;
    }
    ps2Session.set({ ingestion: result, eventsCreated: null, sourceTypes: null });
    setPhase("events");
    try {
      const evs = await ps2.events(result.batch_id);
      const sourceTypes: Record<string, number> = {};
      for (const e of evs) sourceTypes[e.source_type] = (sourceTypes[e.source_type] ?? 0) + 1;
      ps2Session.set({ eventsCreated: evs.length, sourceTypes });
      setPhase("ingested");
    } catch (e) {
      setFailure({ stage: 4, failure: classify(e) });
      setPhase("ingested");
    }
  }

  async function reconstruct() {
    if (!ingestion) return;
    if (runId) return router.push(`/reconstructions/${runId}`); // already reconstructed: never post twice
    setFailure(null);
    setPhase("reconstructing");
    try {
      const summary = await ps2.reconstruct(ingestion.batch_id);
      ps2Session.set({ runs: { ...ps2Session.get().runs, [ingestion.batch_id]: summary.run_id } });
      router.push(`/reconstructions/${summary.run_id}`);
    } catch (e) {
      setFailure({ stage: 5, failure: classify(e) });
      setPhase("ingested");
    }
  }

  function startOver() {
    ps2Session.reset();
    setFailure(null);
    setConfirmed(false);
    setPhase("idle");
  }

  async function pickContext(file: File | undefined) {
    setContext(null);
    setContextError(null);
    if (!file) return;
    try {
      const value = JSON.parse(await file.text()) as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value) || typeof (value as { organisation?: unknown }).organisation !== "string")
        throw new Error("it must be a JSON object with an \"organisation\" name");
      setContext({ name: file.name, value: value as OrgContext });
    } catch (e) {
      setContextError(`${file.name}: ${e instanceof SyntaxError ? "not valid JSON" : (e as Error).message}. The API checks the rest.`);
    }
  }

  if (loadFailure) return <ServiceUnavailable onRetry={retryLoad} />;

  const stageState = (i: number): StageState => {
    if (failure?.stage === i) return "failed";
    const done = [
      ready || Boolean(ingestion),
      Boolean(ingestion),
      Boolean(ingestion),
      session.eventsCreated != null,
      Boolean(runId),
    ][i - 1];
    if (done) return "done";
    const active = { 2: phase === "ingesting", 3: phase === "ingesting", 4: phase === "events", 5: phase === "reconstructing" }[i as 2 | 3 | 4 | 5];
    return active ? "active" : "pending";
  };
  const stages: PipelineStage[] = [
    { label: "Files selected", state: stageState(1), detail: mode === "dataset" ? (datasetId ?? undefined) : selected.length ? `${selected.length} file(s)` : undefined },
    { label: "Ingestion started", state: stageState(2), detail: failure?.stage === 2 ? failure.failure.message : undefined },
    { label: "Records parsed", state: stageState(3), detail: ingestion ? `${ingestion.accepted + ingestion.rejected} records` : undefined },
    {
      label: "Canonical events created",
      state: stageState(4),
      detail: failure?.stage === 4 ? failure.failure.message : session.eventsCreated != null ? `${session.eventsCreated} events` : undefined,
    },
    { label: "Reconstruction requested", state: stageState(5), detail: failure?.stage === 5 ? failure.failure.message : runId },
    { label: "Graph ready", state: "pending" },
    { label: "Story verified", state: "pending" },
    { label: "Receipt sealed", state: "pending" },
  ];

  return (
    <div className={s.root} style={ps2Vars}>
      <div className={s.head}>
        <div className={s.headText}>
          <p className="v2-kicker">PS2 · Raw logs to attack path</p>
          <h1 className="v2-title">Reconstruct an attack from raw logs</h1>
          <p className="v2-body" style={{ maxWidth: 720 }}>
            HALT parses each record, resolves entities, links events only where evidence supports it, and cites every claim. Choose a bundled synthetic
            dataset or upload your own JSON, JSONL or CSV logs.
          </p>
        </div>
      </div>
      <PipelineStages stages={stages} />

      {ingestion ? (
        <IngestionReport
          ingestion={ingestion}
          sourceTypes={session.sourceTypes}
          eventsCreated={session.eventsCreated}
          runId={runId}
          busy={phase === "reconstructing"}
          failure={failure && failure.stage >= 4 ? failure.failure : null}
          onReconstruct={reconstruct}
          onStartOver={startOver}
        />
      ) : !caps || !datasets ? (
        <p className="v2-meta" role="status">
          Loading intake options from the reconstruction service…
        </p>
      ) : (
        <div className={s.intake}>
          <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <legend className="v2-section" style={{ marginBottom: "var(--space-3)" }}>
              Source
            </legend>
            <div role="radiogroup" aria-label="Source" className="v2-btn-row" style={{ marginBottom: "var(--space-4)" }}>
              {(["dataset", "upload"] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} className={`halt-btn${mode === m ? " halt-btn-primary" : ""}`} onClick={() => setMode(m)}>
                  <span>{m === "dataset" ? "BUNDLED DATASET" : "UPLOAD FILES"}</span>
                </button>
              ))}
            </div>

            {mode === "dataset" ? (
              <div className={s.choice} role="radiogroup" aria-label="Bundled datasets">
                {datasets.length ? (
                  datasets.map((d) => (
                    <label key={d.dataset_id} className={s.dataset}>
                      <input type="radio" name="dataset" value={d.dataset_id} checked={datasetId === d.dataset_id} onChange={() => setDatasetId(d.dataset_id)} />
                      <span>
                        <strong style={{ display: "block" }}>{d.title}</strong>
                        <span className="v2-meta">
                          {`${d.dataset_id} · seed ${d.seed} · ${d.files.length} files (${d.adapters.join(", ")})${d.synthetic ? " · synthetic" : ""}${d.has_ground_truth ? " · has ground truth" : ""}`}
                        </span>
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="v2-meta">The reconstruction service lists no bundled datasets.</p>
                )}
              </div>
            ) : (
              <UploadForm caps={caps} selected={selected} setSelected={setSelected} context={context} contextError={contextError} onContext={pickContext} problems={problems} />
            )}
          </fieldset>

          <aside aria-label="Before you start">
            <div className={`${s.notice} ${s.noticeSynthetic}`}>
              <strong>Public demo: synthetic data only</strong>
              Do not upload real logs or credentials. Files are sent only when you press the button below, held in the reconstruction service&apos;s
              memory for this demo session, and never fetched from a URL. Secrets in previews are redacted by the service.
            </div>
            <dl className={s.kv}>
              <dt>Accepted types</dt>
              <dd>{acceptAttribute(caps)}</dd>
              <dt>Files per upload</dt>
              <dd>{`at most ${caps.limits.max_files}`}</dd>
              <dt>Size limits</dt>
              <dd>{`${megabytes(caps.limits.max_file_bytes)} per file, ${megabytes(caps.limits.max_total_bytes)} in total, ${caps.limits.max_records_per_file.toLocaleString("en-GB")} records per file`}</dd>
              <dt>Canonical schema</dt>
              <dd className={s.mono}>{caps.canonical_schema}</dd>
            </dl>
            {mode === "upload" ? (
              <label className={s.toggle} style={{ marginTop: "var(--space-4)" }}>
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                These files contain synthetic or public-demo data only.
              </label>
            ) : null}
            <div className="v2-btn-row" style={{ marginTop: "var(--space-4)" }}>
              <button
                type="button"
                className="halt-btn halt-btn-primary"
                disabled={!ready || phase !== "idle" || (mode === "upload" && !confirmed)}
                onClick={ingest}
                aria-describedby="ingest-why"
              >
                <span>{mode === "dataset" ? "INGEST DATASET" : `UPLOAD ${selected.length || ""} FILE${selected.length === 1 ? "" : "S"}`.replace("  ", " ")}</span>
                <span aria-hidden>→</span>
              </button>
            </div>
            <p id="ingest-why" className="v2-meta" style={{ marginTop: "var(--space-2)" }}>
              {phase !== "idle"
                ? "Ingesting…"
                : !ready
                  ? mode === "dataset"
                    ? "Choose a dataset first."
                    : "Choose files, a log source for each, and fix any problem listed."
                  : mode === "upload" && !confirmed
                    ? "Confirm the data is synthetic to enable the upload."
                    : "Nothing is sent until you press this button."}
            </p>
            {failure?.stage === 2 ? <FailureNote failure={failure.failure} onRetry={ingest} /> : null}
          </aside>
        </div>
      )}
      <p className="v2-meta" style={{ marginTop: "var(--space-6)" }}>
        Looking for the authored incident instead? <Link href="/incidents">Incident Rooms</Link> is separate: a reconstruction is never linked to it.
      </p>
    </div>
  );
}

function UploadForm({
  caps,
  selected,
  setSelected,
  context,
  contextError,
  onContext,
  problems,
}: {
  caps: IntakeCapabilities;
  selected: Selected[];
  setSelected: (s: Selected[]) => void;
  context: { name: string } | null;
  contextError: string | null;
  onContext: (f: File | undefined) => void;
  problems: string[];
}) {
  return (
    <div className={s.choice}>
      <label className="v2-meta" htmlFor="ps2-files">
        Log files ({acceptAttribute(caps)})
      </label>
      <input
        id="ps2-files"
        type="file"
        multiple
        accept={acceptAttribute(caps)}
        className="halt-btn"
        style={{ padding: "8px" }}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          setSelected(files.map((file) => ({ file, format: formatOf(file.name), adapter: suggestAdapter(file.name, caps) })));
        }}
      />
      {selected.length ? (
        <ul className={s.rows} aria-label="Selected files">
          {selected.map((sel, i) => (
            <li key={`${sel.file.name}-${i}`} className={s.fileRow}>
              <span className={s.mono}>{`${sel.file.name} · ${megabytes(sel.file.size)}${sel.format ? ` · ${sel.format}` : ""}`}</span>
              {sel.format ? (
                <select
                  className={s.select}
                  aria-label={`Log source for ${sel.file.name}`}
                  value={sel.adapter}
                  onChange={(e) => setSelected(selected.map((x, j) => (j === i ? { ...x, adapter: e.target.value } : x)))}
                >
                  <option value="">Choose log source…</option>
                  {adaptersFor(sel.format, caps).map((a) => (
                    <option key={a.adapter_id} value={a.adapter_id}>{`${a.description} (${a.adapter_id}@${a.version})`}</option>
                  ))}
                </select>
              ) : (
                <span className="v2-meta">unsupported type</span>
              )}
              <button type="button" className="halt-btn halt-btn-ghost" aria-label={`Remove ${sel.file.name}`} onClick={() => setSelected(selected.filter((_, j) => j !== i))}>
                <span>REMOVE</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <label className="v2-meta" htmlFor="ps2-context">
        Organisation context (optional JSON: assets, business services, internal and egress networks)
      </label>
      <input id="ps2-context" type="file" accept=".json" className="halt-btn" style={{ padding: "8px" }} onChange={(e) => onContext(e.target.files?.[0])} />
      <p className="v2-meta">
        {context
          ? `Context: ${context.name}`
          : "Without a context the service treats the organisation as unspecified: no assets, business services or known networks, so no service impact can be forecast."}
      </p>
      {problems.length || contextError ? (
        <ul className={s.problems} aria-label="Problems to fix before uploading">
          {[...problems, ...(contextError ? [contextError] : [])].map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
