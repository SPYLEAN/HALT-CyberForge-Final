"use client";

import { useEffect, useState } from "react";

import { firex, type ResponseHandoff } from "@/lib/firex/api";
import { classify } from "@/lib/ps2/api";

import s from "./firex.module.css";
import { StatusBadge } from "./Verdict";

function Items({ items, empty }: { items: ResponseHandoff["investigation_actions"]; empty: string }) {
  if (!items.length) return <p className={s.meta}>{empty}</p>;
  return (
    <ul className={s.traceList}>
      {items.map((item) => (
        <li key={item.action} className={s.traceRow}>
          <p>{item.action}</p>
          <p className={s.meta}>
            {item.reason}
            {item.evidence_refs.length ? ` ${item.evidence_refs.length} cited record(s).` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** What this incident gives the people who can act. It has no control that acts: nothing here executes or simulates. */
export function HandoffView({ incidentId, runId }: { incidentId: string; runId: string }) {
  const [data, setData] = useState<ResponseHandoff | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    firex
      .handoff(incidentId, runId)
      .then((d) => live && setData(d))
      .catch((e: unknown) => live && setFailure(classify(e).message));
    return () => {
      live = false;
    };
  }, [incidentId, runId]);
  if (failure) {
    return (
      <p className={s.alert} role="alert">
        The handoff could not be loaded: {failure}
      </p>
    );
  }
  if (!data) return <p role="status">Loading the handoff…</p>;
  const validate = [...data.identities_to_validate, ...data.assets_to_validate];
  return (
    <div className={s.handoff} data-testid="response-handoff">
      <section className={s.verdict} data-state="Unconfirmed" aria-label="Response state">
        <div className={s.actions}>
          <StatusBadge status={data.execution_state} large />
          <StatusBadge status="Unconfirmed" />
        </div>
        <h2>Response Handoff</h2>
        <p>{data.statement}</p>
      </section>
      <section className={s.section} aria-labelledby="handoff-actions">
        <h3 id="handoff-actions" className={s.sectionTitle}>
          Investigation actions
        </h3>
        <Items items={data.investigation_actions} empty="No investigation action is recorded for this incident." />
      </section>
      <section className={s.section} aria-labelledby="handoff-missing">
        <h3 id="handoff-missing" className={s.sectionTitle}>
          Missing evidence to collect
        </h3>
        <Items items={data.missing_evidence} empty="This incident records no evidence gap." />
      </section>
      <section className={s.section} aria-labelledby="handoff-validate">
        <h3 id="handoff-validate" className={s.sectionTitle}>
          Identities and assets to validate
        </h3>
        <Items items={validate} empty="This evidence names no identity or asset to validate." />
      </section>
      <section className={s.section} aria-labelledby="handoff-reach">
        <h3 id="handoff-reach" className={s.sectionTitle}>
          Reachable systems to monitor
        </h3>
        <Items items={data.reachable_to_monitor} empty="No reachable next system could be established from these logs." />
      </section>
      <section className={s.section} aria-labelledby="handoff-containment">
        <h3 id="handoff-containment" className={s.sectionTitle}>
          Possible containment considerations
        </h3>
        {data.containment_considerations.length ? (
          <>
            <p className={s.notice}>{data.containment_note}</p>
            <ul className={s.traceList}>
              {data.containment_considerations.map((c) => (
                <li key={c.consideration} className={s.traceRow}>
                  <p>{c.consideration}</p>
                  <p className={s.meta}>Supported by {c.supported_by}</p>
                  <p className={s.meta}>Requires: {c.requires}. Not executed.</p>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className={s.meta}>This evidence supports no containment consideration.</p>
        )}
      </section>
      <section className={s.section} aria-labelledby="handoff-approvals">
        <h3 id="handoff-approvals" className={s.sectionTitle}>
          Approval requirements
        </h3>
        <dl className={s.traceFields}>
          {data.approvals.map((a) => (
            <div key={a.requirement}>
              <dt>{a.requirement}</dt>
              <dd>{a.state}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className={s.card} aria-labelledby="handoff-boundary">
        <h3 id="handoff-boundary" style={{ margin: 0 }}>
          Response system boundary
        </h3>
        <p>{data.integration_boundary}</p>
        {data.missing_response_context.length ? (
          <>
            <p className={s.meta}>A connection would also need context this log does not contain:</p>
            <ul className={s.lensList}>
              {data.missing_response_context.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </div>
  );
}
