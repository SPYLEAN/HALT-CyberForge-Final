// Drift Shockwave: mutate one source field, re-run the same plan, and diff the traces. A repair is proposed
// only when the evidence supports it, and only as a draft; nothing is applied silently.
import { compile } from "./compile";
import { getPath, leafPaths, deletePath, setPath, clone } from "./paths";
import { dryRun } from "./run";
import type { ConnectorConfig, DriftScenario, Json, JsonObject, Recording, Trace } from "./types";

export interface RepairDraft {
  rule_id: string;
  from: string;
  to: string;
  evidence: string;
}

export interface DriftAnalysis {
  scenario: DriftScenario;
  before: Trace;
  after: Trace;
  affected_rules: { id: string; from: string; to: string; was: string; now: string }[];
  failed_stages: { stage_id: string; evidence: string[] }[];
  broken_destinations: string[];
  unaffected_destinations: string[];
  repair: RepairDraft | null;
  no_repair_reason: string | null;
}

function mutate(record: JsonObject, s: DriftScenario): JsonObject {
  const r = clone(record);
  const value = getPath(r, s.field);
  if (value === undefined) return r;
  deletePath(r, s.field);
  if (s.op === "rename" && s.to) setPath(r, s.to, value);
  return r;
}

/** The recording as the source would send it after the change. */
export function driftRecording(rec: Recording, config: ConnectorConfig, s: DriftScenario): Recording {
  const field = config.source.records_field;
  return {
    ...rec,
    exchanges: rec.exchanges.map((x) => {
      const where = config.source.kind === "webhook" ? x.request.body : x.response.body;
      const list = getPath(where, field);
      if (!Array.isArray(list)) return x;
      const mutated = { ...(where as JsonObject), [field]: (list as JsonObject[]).map((r) => mutate(r, s)) };
      return config.source.kind === "webhook" ? { ...x, request: { ...x.request, body: mutated } } : { ...x, response: { ...x.response, body: mutated } };
    }),
  };
}

// Both runs read the same exchanges, so records line up by index. A record that was a duplicate before the change
// is not counted as newly broken; it never reached a destination in either run.
const wasDuplicate = (before: Trace, i: number) => before.records[i]?.outcome === "duplicate";

export function analyseDrift(config: ConnectorConfig, rec: Recording, s: DriftScenario): DriftAnalysis {
  const plan = compile(config);
  const before = dryRun(plan, rec);
  const after = dryRun(plan, driftRecording(rec, config, s));

  const affected = config.mapping.rules.flatMap((rule) => {
    const was = before.records.map((r) => r.rules.find((x) => x.rule.id === rule.id)?.status);
    const now = after.records.map((r) => r.rules.find((x) => x.rule.id === rule.id)?.status);
    const changed = was.some((w, i) => w !== now[i]);
    return changed ? [{ id: rule.id, from: rule.from ?? "—", to: rule.to ?? "—", was: String(was[0]), now: String(now[0]) }] : [];
  });

  const failed = new Map<string, Set<string>>();
  after.records.forEach((r, i) =>
    r.steps.forEach((st, j) => {
      const prev = before.records[i]?.steps[j];
      if (st.status === "failed" && prev?.status !== "failed") {
        const set = failed.get(st.stage_id) ?? new Set<string>();
        st.evidence.forEach((e) => set.add(e));
        failed.set(st.stage_id, set);
      }
    }),
  );

  const dsts = config.destinations.map((d) => d.id);
  const okIn = (t: Trace, id: string) => t.records.every((r, i) => wasDuplicate(before, i) || r.steps.find((x) => x.stage_id === id)?.status === "ok");
  const broken = dsts.filter((id) => okIn(before, id) && !okIn(after, id));

  // A rename repair is evidenced only if exactly one field that did not exist before carries the old value in every record.
  let repair: RepairDraft | null = null;
  let reason: string | null = null;
  const rule = config.mapping.rules.find((r) => r.from === s.field);
  if (!rule) reason = `No mapping reads ${s.field}.`;
  else {
    const pairs = before.records.flatMap((r, i) => (wasDuplicate(before, i) ? [] : [{ old: r.steps[0]!.after, now: after.records[i]!.steps[0]!.after }]));
    const oldPaths = new Set(pairs.flatMap((p) => leafPaths(p.old)));
    const candidates = [...new Set(pairs.flatMap((p) => leafPaths(p.now)))].filter((f) => !oldPaths.has(f));
    const matching = candidates.filter((f) => pairs.every((p) => JSON.stringify(getPath(p.now, f)) === JSON.stringify(getPath(p.old as Json, s.field))));
    if (matching.length === 1) {
      repair = {
        rule_id: rule.id,
        from: s.field,
        to: matching[0]!,
        evidence: `In all ${pairs.length} records, the new field ${matching[0]} carries exactly the value ${s.field} carried before.`,
      };
    } else {
      reason = matching.length
        ? `${matching.length} new fields carry the old value (${matching.join(", ")}); HALT will not choose between them.`
        : `No field in the changed payload carries the value ${s.field} carried, so no mapping can be derived from evidence. The owner must decide.`;
    }
  }

  return {
    scenario: s,
    before,
    after,
    affected_rules: affected,
    failed_stages: [...failed].map(([stage_id, ev]) => ({ stage_id, evidence: [...ev] })),
    broken_destinations: broken,
    unaffected_destinations: dsts.filter((d) => !broken.includes(d)),
    repair,
    no_repair_reason: reason,
  };
}

/** The repaired configuration as a new draft version; the original is never modified. */
export function applyRepairDraft(config: ConnectorConfig, draft: RepairDraft): ConnectorConfig {
  return {
    ...config,
    version: `${config.version}-draft.1`,
    mapping: {
      ...config.mapping,
      version: `${config.mapping.version}-draft.1`,
      rules: config.mapping.rules.map((r) => (r.id === draft.rule_id ? { ...r, from: draft.to } : r)),
    },
  };
}
