"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";

import Link from "next/link";

import { firex, formatBytes, type LiveFile, type LiveFileList, type LivePreflight, type UploadState } from "@/lib/firex/api";
import { classify } from "@/lib/ps2/api";

import s from "./firex.module.css";
import { StatusBadge } from "./Verdict";

const JOURNEY = ["Add logs", "Analyse", "Investigate", "SourceTrace", "Verify", "Response Handoff", "Theatre"];
const HASH_POLL_MS = 1500;

async function chunkChecksum(blob: Blob): Promise<string | undefined> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return undefined; // the server still checks each chunk's size, and hashes the whole file
  const digest = await subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const UPLOAD_KEY = (file: File) => `halt-upload:${file.name}:${file.size}:${file.lastModified}`;

function rememberedUpload(file: File): string | null {
  try {
    return localStorage.getItem(UPLOAD_KEY(file));
  } catch {
    return null;
  }
}

function rememberUpload(file: File, id: string | null) {
  try {
    if (id) localStorage.setItem(UPLOAD_KEY(file), id);
    else localStorage.removeItem(UPLOAD_KEY(file));
  } catch {
    /* an upload still works without this: it simply cannot resume after a reload */
  }
}

/** Add data, start analysis, open results. Everything else waits under Advanced. */
export function LiveIntake({ onStarted }: { onStarted?: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<LiveFileList | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let live = true;
    firex
      .liveFiles()
      .then((d) => live && setData(d))
      .catch((e: unknown) => live && setFailure(classify(e).message));
    return () => {
      live = false;
    };
  }, [refresh]);

  if (failure) {
    return (
      <p className={s.notice} role="status">
        Adding new logs is not available right now: {failure}
      </p>
    );
  }
  if (!data) return null;
  return (
    <section className={s.card} aria-labelledby="live-intake" data-testid="live-intake">
      <ol className={s.journey} aria-label="Journey">
        {JOURNEY.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <h2 id="live-intake">Add data</h2>
      <p className={s.meta}>
        Place a log in <span className={s.mono}>{data.incoming_path}</span>, or upload a smaller one here.
      </p>
      <div className={s.actions}>
        <button type="button" className={s.btn} onClick={() => setRefresh((n) => n + 1)}>
          Check for new files
        </button>
        <Uploader data={data} onDone={(name) => { setRefresh((n) => n + 1); setSelected(name); }} />
      </div>
      {data.items.length ? (
        <ul className={s.traceList} aria-label="Files in the incoming folder">
          {data.items.map((file) => (
            <FileRow key={file.name} file={file} selected={selected === file.name} onSelect={() => setSelected(file.name)} />
          ))}
        </ul>
      ) : (
        <p className={s.meta}>No files are waiting yet.</p>
      )}
      {selected ? (
        <Preflight
          key={selected}
          name={selected}
          onStarted={(runId) => {
            onStarted?.();
            router.push(`/firex/runs/${runId}`);
          }}
        />
      ) : null}
    </section>
  );
}

function FileRow({ file, selected, onSelect }: { file: LiveFile; selected: boolean; onSelect: () => void }) {
  return (
    <li className={s.traceRow}>
      <div className={s.actions} style={{ justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <p className={s.traceLabel}>{file.name}</p>
          <p className={s.meta}>
            {formatBytes(file.size_bytes)}. {file.format_label}. Changed <span className={s.mono}>{file.modified_utc}</span>
          </p>
        </div>
        {file.selectable ? (
          <button type="button" className={selected ? s.btnPrimary : s.btn} aria-pressed={selected} onClick={onSelect}>
            Select
          </button>
        ) : null}
      </div>
      {file.problem ? <p className={s.meta}>{file.problem}</p> : null}
    </li>
  );
}

function Uploader({ data, onDone }: { data: LiveFileList; onDone: (name: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);
  const [state, setState] = useState<UploadState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);

  const send = useCallback(
    async (file: File) => {
      setError(null);
      setBusy(true);
      cancelled.current = false;
      setLastFile(file);
      try {
        const known = rememberedUpload(file);
        let upload = known ? await firex.liveUpload(known).catch(() => null) : null;
        upload ??= await firex.liveCreateUpload({ filename: file.name, size_bytes: file.size });
        rememberUpload(file, upload.upload_id);
        setState(upload);
        const have = new Set(upload.received_chunks);
        for (let index = 0; index < upload.total_chunks; index += 1) {
          if (have.has(index)) continue;
          if (cancelled.current) return;
          const blob = file.slice(index * upload.chunk_bytes, (index + 1) * upload.chunk_bytes);
          upload = await firex.liveSendChunk(upload.upload_id, index, blob, await chunkChecksum(blob));
          setState(upload);
        }
        const finished = await firex.liveCompleteUpload(upload.upload_id);
        rememberUpload(file, null);
        setState(null);
        setLastFile(null);
        onDone(finished.name);
      } catch (e) {
        const message = classify(e).message;
        setError(message);
        if (/format|adapter|empty|large/i.test(message)) {
          rememberUpload(file, null);
          setLastFile(null);
        }
      } finally {
        setBusy(false);
      }
    },
    [onDone],
  );

  const choose = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > data.max_upload_bytes) {
      setError(`This file is larger than ${formatBytes(data.max_upload_bytes)}. Place it in the incoming folder on the server.`);
      return;
    }
    void send(file);
  };
  const cancel = async () => {
    cancelled.current = true;
    if (state) await firex.liveCancelUpload(state.upload_id).catch(() => undefined);
    if (lastFile) rememberUpload(lastFile, null);
    setState(null);
    setLastFile(null);
    setBusy(false);
    setError(null);
  };
  const percent = state ? Math.floor((state.received_bytes / state.size_bytes) * 100) : 0;
  return (
    <>
      <input ref={input} type="file" className={s.fileInput} aria-label="Choose a log to upload" onChange={choose} disabled={busy} />
      <button type="button" className={s.btn} disabled={busy} onClick={() => input.current?.click()}>
        Upload a log
      </button>
      {state ? (
        <div className={s.uploadRow}>
          <div className={s.bar} role="progressbar" aria-label={`Uploading ${state.filename}`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <div className={s.barFill} style={{ width: `${percent}%` }} />
          </div>
          <span className={s.meta}>
            {formatBytes(state.received_bytes)} of {formatBytes(state.size_bytes)}
          </span>
          <button type="button" className={s.btnQuiet} onClick={() => void cancel()}>
            Cancel upload
          </button>
        </div>
      ) : null}
      {error ? (
        <div className={s.uploadRow}>
          <p className={s.alert} role="alert">
            {error}
          </p>
          {lastFile ? (
            <button type="button" className={s.btn} onClick={() => void send(lastFile)}>
              Resume upload
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function Preflight({ name, onStarted }: { name: string; onStarted: (runId: string) => void }) {
  const [data, setData] = useState<LivePreflight | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      firex
        .livePreflight(name)
        .then((d) => {
          if (!live) return;
          setData(d);
          if (!d.sha256 && !d.problems.length) timer = setTimeout(load, HASH_POLL_MS);
        })
        .catch((e: unknown) => live && setFailure(classify(e).message));
    };
    load();
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [name]);

  const start = async (confirmDuplicate: boolean) => {
    setStarting(true);
    setStartError(null);
    try {
      const run = await firex.liveStart(name, confirmDuplicate);
      onStarted(run.run_id);
    } catch (e) {
      setStartError(classify(e).message);
      setStarting(false);
    }
  };

  if (failure) {
    return (
      <p className={s.alert} role="alert">
        {failure}
      </p>
    );
  }
  if (!data) return <p role="status">Checking {name}…</p>;
  const done = data.duplicates.find((d) => d.status === "completed");
  return (
    <section className={s.preflight} aria-label={`Before analysing ${name}`} data-testid="live-preflight">
      <h3>Start analysis</h3>
      <dl className={s.facts}>
        <div>
          <dt>File</dt>
          <dd className={s.traceLabel}>{data.name}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{formatBytes(data.size_bytes)}</dd>
        </div>
        <div>
          <dt>Format</dt>
          <dd>{data.format_label}</dd>
        </div>
        <div>
          <dt>Parsing confidence</dt>
          <dd>{data.parsing_confidence}</dd>
        </div>
      </dl>
      <p className={s.meta}>
        SHA-256:{" "}
        {data.sha256 ? (
          <span className={`${s.mono} ${s.traceLabel}`}>{data.sha256}</span>
        ) : (
          <span role="status">
            calculating, {formatBytes(data.hashed_bytes)} of {formatBytes(data.size_bytes)}
          </span>
        )}
      </p>
      <p className={s.meta}>{data.time_interpretation}</p>
      <p className={s.notice}>{data.privacy_warning}</p>
      {data.problems.map((p) => (
        <p key={p.code} className={s.alert} role="alert">
          {p.message}
        </p>
      ))}
      {data.warnings.map((w) => (
        <p key={w} className={s.notice}>
          {w}
        </p>
      ))}
      {startError ? (
        <p className={s.alert} role="alert">
          {startError}
        </p>
      ) : null}
      <div className={s.actions}>
        {done ? (
          <Link className={s.btnPrimary} href={`/firex/runs/${done.run_id}`}>
            Open results
          </Link>
        ) : (
          <button type="button" className={s.btnPrimary} disabled={!data.can_start || starting} onClick={() => void start(false)}>
            {starting ? "Starting…" : "START ANALYSIS"}
          </button>
        )}
      </div>
      <details>
        <summary>Advanced</summary>
        <dl className={s.traceFields}>
          <div>
            <dt>Adapter</dt>
            <dd>{data.adapter ?? "None for this format"}</dd>
          </div>
          <div>
            <dt>Sampled</dt>
            <dd>{data.parsing_detail}</dd>
          </div>
          <div>
            <dt>Engine</dt>
            <dd>{data.engine_version}</dd>
          </div>
          <div>
            <dt>Results go to</dt>
            <dd className={s.traceLabel}>{data.expected_destination ?? "Decided once the hash is known"}</dd>
          </div>
        </dl>
        {data.sample_records.length ? (
          <div className={s.tableWrap}>
            <table className={s.table} aria-label="Sample records">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>User</th>
                  <th>Source</th>
                  <th>Destination</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.sample_records.map((r, i) => (
                  <tr key={i}>
                    <td>{r.time}</td>
                    <td>{r.kind ?? "—"}</td>
                    <td>{r.user ?? "—"}</td>
                    <td>{r.source ?? "—"}</td>
                    <td>{r.destination ?? "—"}</td>
                    <td>{r.action ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {data.duplicates.length ? (
          <>
            <ul className={s.lensList} aria-label="Earlier analyses of these bytes">
              {data.duplicates.map((d) => (
                <li key={d.run_id}>
                  <Link href={`/firex/runs/${d.run_id}`}>{d.dataset_id}</Link>: {d.status}
                </li>
              ))}
            </ul>
            <button type="button" className={s.btn} disabled={!data.sha256 || starting || data.problems.length > 0} onClick={() => void start(true)}>
              Analyse again as a separate dataset
            </button>
          </>
        ) : null}
        <StatusBadge status={data.can_start ? "Verified" : "Not measured"} />
      </details>
    </section>
  );
}
