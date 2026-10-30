// Integration Receipt: the dry run summarised, every count taken from the trace.
import { sha256 } from "./hash";
import type { Trace } from "./types";

export interface Receipt {
  id: string;
  connector_id: string;
  config_version: string;
  config_hash: string;
  mapping_version: string;
  mapping_hash: string;
  digest: string;
  captured_at: string;
  records: { delivered: number; partial: number; rejected: number; duplicate: number };
  destinations: { id: string; title: string; accepted: number; rejected: number }[];
  retries: number;
  compile_errors: number;
  simulated: true;
}

export function makeReceipt(t: Trace): Receipt {
  const c = t.plan.connector;
  const count = (o: string) => t.records.filter((r) => r.outcome === o).length;
  return {
    id: `IR-${sha256(t.plan.config_hash + t.digest).slice(0, 12)}`,
    connector_id: c.id,
    config_version: c.version,
    config_hash: t.plan.config_hash,
    mapping_version: c.mapping.version,
    mapping_hash: t.plan.mapping_hash,
    digest: t.digest,
    captured_at: t.captured_at,
    records: { delivered: count("delivered"), partial: count("partial"), rejected: count("rejected"), duplicate: count("duplicate") },
    destinations: c.destinations.map((d) => {
      const steps = t.records.map((r) => r.steps.find((s) => s.stage_id === d.id)).filter((s) => s && s.status !== "skipped");
      return { id: d.id, title: d.title, accepted: steps.filter((s) => s!.status === "ok").length, rejected: steps.filter((s) => s!.status === "failed").length };
    }),
    retries: t.retries.length,
    compile_errors: t.plan.errors.length,
    simulated: true,
  };
}

/** Why activation is blocked, if it is. An empty list means the receipt allows a request for approval. */
export function activationBlockers(t: Trace): string[] {
  const r = makeReceipt(t);
  const out: string[] = [];
  if (r.compile_errors) out.push(`${r.compile_errors} compile error${r.compile_errors === 1 ? "" : "s"} in the configuration`);
  if (r.records.rejected) out.push(`${r.records.rejected} record${r.records.rejected === 1 ? " was" : "s were"} rejected in the dry run`);
  r.destinations.filter((d) => d.rejected).forEach((d) => out.push(`${d.title} rejected ${d.rejected} record${d.rejected === 1 ? "" : "s"}`));
  if (!t.auth.ok) out.push("Source authentication failed");
  return out;
}
