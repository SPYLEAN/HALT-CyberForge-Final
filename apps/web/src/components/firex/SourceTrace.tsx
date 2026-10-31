"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { firex, REVIEW_DECISIONS, type ProvenanceChain, type ProvenanceQuery, type ReviewDecision, type SearchResponse, type TraceRecord } from "@/lib/firex/api";
import { presentTitle } from "@/lib/firex/wording";
import { classify } from "@/lib/ps2/api";

import s from "./firex.module.css";
import { StatusBadge } from "./Verdict";

const FIELDS: Array<[string, string]> = [
  ["", "Any field"],
  ["user", "User or account"],
  ["ip", "IP address"],
  ["host", "Host"],
  ["device", "Device"],
  ["destination", "Destination"],
  ["service", "Service"],
  ["action", "Action"],
  ["message", "Message"],
  ["event_id", "Event ID"],
  ["line", "Source line"],
  ["timestamp", "Timestamp"],
  ["incident", "Incident ID"],
  ["detection", "Detection ID"],
  ["node", "Graph node"],
  ["edge", "Graph edge"],
  ["receipt", "Receipt ID"],
];

const incidentHref = (incidentId: string, runId: string, extra = "") => `/firex/incidents/${incidentId}?run=${runId}${extra}`;

/** `Search evidence`: one search scoped to one run. It never looks in another run. */
export function SearchEvidence({ runId, runs, advanced }: { runId?: string; runs?: Array<{ run_id: string; label: string }>; advanced?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const choices = runs ?? [];
  const [chosen, setChosen] = useState<string | null>(null);
  const run = runId ?? chosen ?? choices[0]?.run_id ?? null;

  const open = () => {
    setIsOpen(true);
    const d = dialog.current;
    if (!d) return;
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
  };
  const close = () => {
    const d = dialog.current;
    if (d && typeof d.close === "function") d.close();
    else d?.removeAttribute("open");
    setIsOpen(false);
    opener.current?.focus();
  };

  if (!run && !choices.length) return null;
  return (
    <>
      <button type="button" ref={opener} className={s.btn} onClick={open}>
        Search evidence
      </button>
      <dialog ref={dialog} className={s.trace} aria-labelledby="trace-title" onClose={() => setIsOpen(false)} onCancel={() => setIsOpen(false)}>
        {isOpen && run ? (
          <div className={s.traceBody}>
            <div className={s.lensHead}>
              <h2 id="trace-title" className={s.sectionTitle}>
                Search evidence
              </h2>
              <button type="button" className={s.btnQuiet} onClick={close}>
                Close
              </button>
            </div>
            {!runId && choices.length > 1 ? (
              <label className={s.field}>
                Run
                <select value={run} onChange={(e) => setChosen(e.target.value)}>
                  {choices.map((c) => (
                    <option key={c.run_id} value={c.run_id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <TraceSearch key={run} runId={run} advanced={advanced} />
          </div>
        ) : null}
      </dialog>
    </>
  );
}

function TraceSearch({ runId, advanced }: { runId: string; advanced?: boolean }) {
  const [text, setText] = useState("");
  const [field, setField] = useState("");
  const [relationship, setRelationship] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [more, setMore] = useState<SearchResponse[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listId = useId();

  useEffect(() => {
    if (text.trim().length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      firex
        .suggest(runId, text.trim())
        .then((r) => live && setSuggestions(r.values))
        .catch(() => live && setSuggestions([]));
    }, 180);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [text, runId]);

  const run = async (query: string, cursor?: string) => {
    setBusy(true);
    setError(null);
    try {
      const found = await firex.search(runId, query, { field: field || undefined, relationship: relationship || undefined, cursor });
      if (cursor) setMore((m) => [...m, found]);
      else {
        setResult(found);
        setMore([]);
      }
    } catch (e) {
      setError(classify(e).message);
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim().length >= 2) void run(text.trim());
  };
  const pages = result ? [result, ...more] : [];
  const last = pages[pages.length - 1];

  return (
    <>
      <form role="search" className={s.traceForm} onSubmit={submit}>
        <label className={s.field} style={{ flex: "1 1 240px" }}>
          A name, address, message, line, time or id
          <input type="search" value={text} autoFocus list={listId} autoComplete="off" onChange={(e) => setText(e.target.value)} />
          <datalist id={listId}>
            {suggestions.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </label>
        <button type="submit" className={s.btnPrimary} disabled={busy || text.trim().length < 2}>
          {busy ? "Searching…" : "Search"}
        </button>
      </form>
      {advanced ? (
        <details className={s.traceFilters}>
          <summary>Filters</summary>
          <div className={s.controls}>
            <label className={s.field}>
              Field
              <select value={field} onChange={(e) => setField(e.target.value)}>
                {FIELDS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className={s.field}>
              Relationship
              <select value={relationship} onChange={(e) => setRelationship(e.target.value)}>
                <option value="">Observed and inferred</option>
                <option value="observed">Observed</option>
                <option value="inferred">Inferred</option>
              </select>
            </label>
          </div>
        </details>
      ) : null}
      {error ? (
        <p className={s.alert} role="alert">
          {error}
        </p>
      ) : null}
      <div aria-live="polite">
        {result ? <RunContext result={result} /> : null}
        {result?.not_found ? (
          <p className={s.notice} style={{ whiteSpace: "pre-line" }}>
            {result.not_found}
          </p>
        ) : null}
      </div>
      {pages.map((page, i) => (
        <Results key={i} page={page} runId={runId} first={i === 0} />
      ))}
      {last?.next_cursor ? (
        <div className={s.actions}>
          <button type="button" className={s.btn} disabled={busy} onClick={() => void run(last.query, last.next_cursor!)}>
            {last.complete ? "More results" : "Continue search"}
          </button>
          <span className={s.meta}>
            Searched {last.scanned_parts} of {last.total_parts} stored parts so far.
          </span>
        </div>
      ) : null}
    </>
  );
}

function RunContext({ result }: { result: SearchResponse }) {
  const { run } = result;
  return (
    <div className={s.traceContext}>
      <p className={s.meta}>
        Searching {run.dataset_id} only. {run.source_filename}, SHA-256 <span className={s.mono}>{run.source_sha256.slice(0, 16)}…</span>. {run.narrative}.
      </p>
      {!run.source_available ? <p className={s.notice}>SOURCE UNAVAILABLE — stored canonical evidence remains available.</p> : null}
      {result.value_note ? (
        <p>
          <strong>{result.query}</strong> is {/^[aeiou]/i.test(result.value_kind ?? "") ? "an" : "a"} {result.value_kind}. {result.value_note}
        </p>
      ) : null}
    </div>
  );
}

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (!count) return null;
  return (
    <section className={s.traceGroup} aria-label={title}>
      <h3>
        {title} <span className={s.meta}>{count}</span>
      </h3>
      <ul className={s.traceList}>{children}</ul>
    </section>
  );
}

function Results({ page, runId, first }: { page: SearchResponse; runId: string; first: boolean }) {
  return (
    <>
      <Group title="Source records" count={page.source_records.length}>
        {page.source_records.map((r, i) => (
          <SourceRow key={`${r.line}-${i}`} record={r} page={page} runId={runId} />
        ))}
      </Group>
      <Group title="Canonical events" count={page.canonical_events.length}>
        {page.canonical_events.map((r) => (
          <li key={r.evidence_id} className={s.traceRow}>
            <p className={s.meta}>
              {r.label}. <span className={s.mono}>{r.evidence_id}</span>
              {r.duplicate ? ". Duplicate of an earlier line" : ""}
              {r.bursts.length ? `. In ${r.bursts.length} stored burst(s)` : ""}
            </p>
            <FieldList fields={r.fields} />
          </li>
        ))}
      </Group>
      {first ? (
        <>
          <Group title="Detections" count={page.detections.length}>
            {page.detections.map((d) => (
              <li key={d.detection_id} className={s.traceRow}>
                <p>{d.reason}</p>
                <p className={s.meta}>
                  Rule <span className={s.mono}>{d.rule_id}</span> {d.rule_version}. Basis: {d.basis}. Status: {d.status}. <span className={s.mono}>{d.detection_id}</span>
                </p>
                <div className={s.actions}>
                  <Link className={s.btnQuiet} href={incidentHref(d.incident_id, runId)}>
                    Open incident
                  </Link>
                </div>
              </li>
            ))}
          </Group>
          <Group title="Incident steps" count={page.incident_steps.length}>
            {page.incident_steps.map((step) => (
              <li key={`${step.incident_id}-${step.node_id}`} className={s.traceRow}>
                <p>{step.label}</p>
                <p className={s.meta}>{presentTitle(step.incident_title)}. Unconfirmed.</p>
                <div className={s.actions}>
                  <WhyHere runId={runId} query={{ incident_id: step.incident_id, node_id: step.node_id }} />
                  <Link className={s.btnQuiet} href={incidentHref(step.incident_id, runId, `&tab=${encodeURIComponent("Attack World")}&select=${encodeURIComponent(step.node_id)}`)}>
                    Focus graph location
                  </Link>
                  <Link className={s.btnQuiet} href={incidentHref(step.incident_id, runId)}>
                    Open incident
                  </Link>
                </div>
              </li>
            ))}
          </Group>
          <Group title="Graph relationships" count={page.graph_relationships.length}>
            {page.graph_relationships.map((g) => (
              <li key={`${g.incident_id}-${g.element_id}`} className={s.traceRow}>
                <p className={s.traceLabel}>{g.label}</p>
                <p className={s.meta}>
                  {g.classification === "reachable" ? "Hypothetical" : g.classification === "inferred" ? "Inferred" : "Observed"}
                  {g.missing_evidence ? ". Missing evidence" : ""}
                  {g.rule ? `. ${g.rule} ${g.rule_version ?? ""}` : ""}
                </p>
                {g.kind === "edge" ? <WhyHere runId={runId} query={{ incident_id: g.incident_id, edge_id: g.element_id }} /> : <WhyHere runId={runId} query={{ incident_id: g.incident_id, node_id: g.element_id }} />}
              </li>
            ))}
          </Group>
          <Group title="Proof receipts" count={page.proof_receipts.length}>
            {page.proof_receipts.map((p) => (
              <li key={p.receipt_id} className={s.traceRow}>
                <p className={s.meta}>
                  <span className={s.mono}>{p.receipt_id}</span>. Seal {p.seal_valid ? "valid" : "does not verify"}.
                </p>
                {p.incident_id ? (
                  <Link className={s.btnQuiet} href={incidentHref(p.incident_id, runId, "&tab=Verification")}>
                    Open proof
                  </Link>
                ) : (
                  <Link className={s.btnQuiet} href={`/trust/${runId}`}>
                    Open proof
                  </Link>
                )}
              </li>
            ))}
          </Group>
        </>
      ) : null}
    </>
  );
}

function SourceRow({ record: r, page, runId }: { record: TraceRecord; page: SearchResponse; runId: string }) {
  const [copied, setCopied] = useState(false);
  const usedBy = r.incidents[0];
  const copy = async () => {
    const citation = `${page.run.dataset_id} ${page.run.run_id} ${page.run.source_filename} sha256:${page.run.source_sha256} line ${r.line} offset ${r.byte_offset} ${r.evidence_id ?? ""}`.trim();
    await navigator.clipboard?.writeText(citation);
    setCopied(true);
  };
  return (
    <li className={s.traceRow}>
      <p className={s.meta}>
        {r.line !== null ? <strong>Line {r.line.toLocaleString("en-US")}</strong> : null}
        {r.byte_offset !== null ? `, byte offset ${r.byte_offset.toLocaleString("en-US")}` : ""}
        {r.event_utc ? (
          <>
            , <span className={s.mono}>{r.event_utc}</span>
          </>
        ) : null}
      </p>
      {r.state === "quarantined" ? <p className={s.notice}>This line is quarantined ({r.quarantine_reason}). It was not parsed into an event, so no detection uses it.</p> : null}
      {r.label && r.excerpt ? (
        <div>
          <p className={s.traceBadge}>{r.label}</p>
          <pre className={s.traceRaw}>
            {r.excerpt}
            {r.truncated ? "…" : ""}
          </pre>
        </div>
      ) : null}
      {r.raw_status === "mismatch" ? <p className={s.alert}>PROVENANCE FAILED: the line at this offset does not match its stored hash.</p> : null}
      {r.incidents.length ? (
        <p className={s.meta}>
          Used by:{" "}
          {r.incidents.map((u, i) => (
            <span key={u.incident_id}>
              {i ? ", " : ""}
              <Link href={incidentHref(u.incident_id, runId)}>{presentTitle(u.title)}</Link> (unconfirmed)
            </span>
          ))}
        </p>
      ) : r.state === "canonical" ? (
        <p className={s.meta}>No incident uses this record.</p>
      ) : null}
      <div className={s.actions}>
        {r.evidence_id ? <WhyHere runId={runId} query={{ evidence_id: r.evidence_id, incident_id: usedBy?.incident_id }} /> : null}
        {r.line !== null ? (
          <button type="button" className={s.btnQuiet} onClick={() => void copy()}>
            {copied ? "Citation copied" : "Copy citation"}
          </button>
        ) : null}
        {usedBy ? (
          <Link className={s.btnQuiet} href={incidentHref(usedBy.incident_id, runId, "&tab=Evidence")}>
            Open evidence
          </Link>
        ) : null}
      </div>
    </li>
  );
}

function FieldList({ fields }: { fields: Record<string, string> }) {
  const entries = Object.entries(fields);
  if (!entries.length) return null;
  return (
    <details>
      <summary>{entries.length} canonical fields</summary>
      <dl className={s.traceFields}>
        {entries.map(([key, value]) => (
          <div key={key}>
            <dt className={s.mono}>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** Opens the provenance chain for one claim, in place. */
export function WhyHere({ runId, query, label = "Why is this here?" }: { runId: string; query: ProvenanceQuery; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={s.why}>
      <button type="button" className={s.btnQuiet} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open ? <ProvenancePanel runId={runId} query={query} /> : null}
    </div>
  );
}

const STAGE_STATE: Record<string, string> = { observed: "Observed", inferred: "Inferred", not_applicable: "Not applicable" };

function ProvenancePanel({ runId, query }: { runId: string; query: ProvenanceQuery }) {
  const [chain, setChain] = useState<ProvenanceChain | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(query);
  useEffect(() => {
    let live = true;
    firex
      .provenance(runId, JSON.parse(key) as ProvenanceQuery)
      .then((c) => live && setChain(c))
      .catch((e: unknown) => live && setError(classify(e).message));
    return () => {
      live = false;
    };
  }, [runId, key, attempt]);
  if (error) {
    return (
      <p className={s.alert} role="alert">
        The provenance could not be loaded: {error}
      </p>
    );
  }
  if (!chain) return <p role="status">Tracing this claim to its source…</p>;
  const record = chain.records[0];
  return (
    <div className={s.prov} data-testid="provenance">
      <ul className={s.provStatus} aria-label="Provenance status">
        {chain.statuses.map((status) => (
          <li key={status}>
            <StatusBadge status={status} />
          </li>
        ))}
      </ul>
      <p>{chain.plain}</p>
      {chain.failed_link ? (
        <p className={s.alert} role="alert">
          PROVENANCE FAILED at: {chain.failed_link}. This claim is excluded from verified evidence, and nothing was replaced.
        </p>
      ) : null}
      {chain.source_status === "SOURCE UNAVAILABLE" ? <p className={s.notice}>SOURCE UNAVAILABLE — stored canonical evidence remains available.</p> : null}
      {record?.label && record.excerpt ? (
        <div>
          <p className={s.traceBadge}>{record.label}</p>
          <pre className={s.traceRaw}>
            {record.excerpt}
            {record.truncated ? "…" : ""}
          </pre>
        </div>
      ) : record ? (
        <p className={s.traceBadge}>CANONICAL EVENT</p>
      ) : null}
      {chain.records.length > 1 ? (
        <details>
          <summary>
            {chain.cited_records} cited records{chain.cited_records > chain.records.length ? `, first ${chain.records.length} shown` : ""}
          </summary>
          <ul className={s.traceList}>
            {chain.records.map((r) => (
              <li key={r.evidence_id} className={s.traceRow}>
                <p className={s.meta}>
                  Line {r.line?.toLocaleString("en-US")}, <span className={s.mono}>{r.event_utc}</span>
                </p>
                <p>{r.fields.message ?? r.fields.logdesc ?? r.fields.attack ?? r.fields.action ?? "See its canonical fields."}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <ol className={s.provChain} aria-label="Provenance chain">
        {chain.stages.map((stage) => (
          <li key={stage.id} data-status={stage.status}>
            <h4>{stage.title}</h4>
            <p>{stage.plain}</p>
            <details>
              <summary>Technical details</summary>
              <dl className={s.traceFields}>
                <div>
                  <dt>Input</dt>
                  <dd>{stage.input}</dd>
                </div>
                <div>
                  <dt>Transformation</dt>
                  <dd>{stage.transformation}</dd>
                </div>
                <div>
                  <dt>Output</dt>
                  <dd className={s.traceLabel}>{stage.output}</dd>
                </div>
                {stage.rule ? (
                  <div>
                    <dt>Rule</dt>
                    <dd>
                      {stage.rule} {stage.version ?? ""}
                    </dd>
                  </div>
                ) : stage.version ? (
                  <div>
                    <dt>Version</dt>
                    <dd>{stage.version}</dd>
                  </div>
                ) : null}
                {stage.evidence_refs.length ? (
                  <div>
                    <dt>Evidence</dt>
                    <dd className={s.mono}>{stage.evidence_refs.join(", ")}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>State</dt>
                  <dd>
                    {STAGE_STATE[stage.state] ?? stage.state}. Check: {stage.status === "ok" ? "passed" : stage.status.replace("_", " ")}.
                  </dd>
                </div>
              </dl>
            </details>
          </li>
        ))}
      </ol>
      <details>
        <summary>Integrity checks</summary>
        <ul className={s.traceList} aria-label="Integrity checks">
          {chain.gate.map((check) => (
            <li key={check.id} className={s.traceRow}>
              <p>
                <StatusBadge status={check.status === "passed" ? "Verified" : check.status === "failed" ? "Failed" : check.status === "unavailable" ? "Not measured" : "Not applicable"} /> {check.label}
              </p>
              <p className={s.meta}>{check.detail}</p>
            </li>
          ))}
        </ul>
      </details>
      {chain.incident_id || chain.subject_kind === "record" ? <ReviewForm chain={chain} runId={runId} onSaved={() => setAttempt((n) => n + 1)} /> : null}
    </div>
  );
}

function ReviewForm({ chain, runId, onSaved }: { chain: ProvenanceChain; runId: string; onSaved: () => void }) {
  const [decision, setDecision] = useState<ReviewDecision>("Needs more evidence");
  const [reason, setReason] = useState("");
  const [analyst, setAnalyst] = useState("demo-analyst");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await firex.addReview(runId, {
        incident_id: chain.incident_id,
        evidence_id: chain.incident_id ? null : chain.subject_id,
        decision,
        reason: reason.trim(),
        analyst: analyst.trim(),
      });
      setReason("");
      onSaved();
    } catch (err) {
      setError(classify(err).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <details>
      <summary>Analyst review{chain.reviews.length ? ` (${chain.reviews.length})` : ""}</summary>
      <p className={s.meta}>A review is recorded apart from the sealed result. The original incident and its receipt never change.</p>
      {chain.reviews.length ? (
        <ul className={s.traceList} aria-label="Recorded reviews">
          {chain.reviews.map((r) => (
            <li key={r.audit_reference} className={s.traceRow}>
              <p>
                {r.decision}: {r.reason}
              </p>
              <p className={s.meta}>
                {r.analyst}, <span className={s.mono}>{r.at}</span>. Original conclusion: {r.original_conclusion}. Audit reference <span className={s.mono}>{r.audit_reference.slice(0, 16)}…</span>
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      <form className={s.reviewForm} onSubmit={(e) => void save(e)}>
        <label className={s.field}>
          Decision
          <select value={decision} onChange={(e) => setDecision(e.target.value as ReviewDecision)}>
            {REVIEW_DECISIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className={s.field}>
          Reason
          <textarea value={reason} rows={2} required maxLength={2000} onChange={(e) => setReason(e.target.value)} />
        </label>
        <label className={s.field}>
          Analyst
          <input value={analyst} required maxLength={120} onChange={(e) => setAnalyst(e.target.value)} />
        </label>
        {error ? (
          <p className={s.alert} role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className={s.btn} disabled={busy || !reason.trim()}>
          Record review
        </button>
      </form>
    </details>
  );
}
