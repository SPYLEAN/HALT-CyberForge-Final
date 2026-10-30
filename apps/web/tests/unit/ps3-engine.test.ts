// PS3-1..4, PS3-12 (engine side), PS3-13: the config engine is deterministic, honest about retries and duplicates,
// and every receipt count is the trace's count.
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { activationBlockers, canonical, compile, dryRun, loadFixtures, makeReceipt, sha256, type ConnectorConfig } from "@/lib/ps3/engine";

const fx = loadFixtures();
const northwind = fx.connectors.find((c) => c.id === "northwind-edr-alerts")!;
const lumen = fx.connectors.find((c) => c.id === "lumen-idp-signins")!;
const rec = (id: string) => fx.recordings.find((r) => r.connector_id === id)!;

describe("hashing", () => {
  it("sha256 matches node:crypto, including multi-block and non-ASCII input", () => {
    for (const s of ["", "abc", "a".repeat(200), "Größe · 測試 · ✓"]) {
      expect(sha256(s)).toBe(createHash("sha256").update(s, "utf8").digest("hex"));
    }
  });
  it("canonical JSON ignores key order", () => {
    expect(canonical({ b: 1, a: { d: [2, { y: 1, x: 2 }], c: null } })).toBe(canonical({ a: { c: null, d: [2, { x: 2, y: 1 }] }, b: 1 }));
  });
});

describe("PS3-1 compile", () => {
  it("accepts both fixture connectors and orders the stages through the five zones", () => {
    for (const c of fx.connectors) expect(compile(c).errors).toEqual([]);
    const plan = compile(northwind);
    expect(plan.stages.map((s) => s.id)).toEqual([
      "source.fetch", "acq.auth", "acq.paginate", "acq.retry", "xf.map", "xf.normalize", "val.schema", "val.policy", "val.dedupe",
      "dst.case-api", "dst.siem-queue", "dst.evidence-lake",
    ]);
  });

  it("rejects invalid configurations with the reason", () => {
    const broken: ConnectorConfig = {
      ...northwind,
      mapping: { ...northwind.mapping, rules: [{ id: "X1", from: "a", to: "not.a.field", op: "rename" }, { id: "X2", from: "b", op: "explode" as never }] },
    };
    const errs = compile(broken).errors.map((e) => `${e.where}: ${e.message}`);
    expect(errs).toContain("mapping.rules.X1: not.a.field is not a field of OCSF Detection Finding (2004)");
    expect(errs).toContain('mapping.rules.X2: Unknown operation "explode"');
    expect(errs).toContain("validation.required: finding_info.uid is required but no rule writes it");
    expect(errs).toContain("destinations.dst.case-api: Case API requires device.hostname, which no rule writes");
  });
});

describe("PS3-2..4 dry run", () => {
  const trace = dryRun(compile(northwind), rec("northwind-edr-alerts"));

  it("is deterministic and hashes every step's canonical output", () => {
    expect(dryRun(compile(northwind), rec("northwind-edr-alerts")).digest).toBe(trace.digest);
    for (const r of trace.records) for (const s of r.steps) expect(s.hash).toBe(sha256(canonical(s.after)));
  });

  it("follows the cursor to the last page and records the one 429 retry", () => {
    expect(trace.pages.map((p) => [p.cursor_in, p.cursor_out, p.records])).toEqual([[null, "c_7f2a", 2], ["c_7f2a", null, 2]]);
    expect(trace.retries).toEqual([{ seq: 2, at: "2026-10-29T09:58:00.410Z", status: 429, retry_after_s: 1, then: 3 }]);
    expect(trace.records[0]!.steps.find((s) => s.stage_id === "acq.retry")!.evidence[0]).toBe("HTTP 429 at seq 2, retry-after 1 s; retried as seq 3 (attempt 2 of 3)");
  });

  it("maps, normalises and delivers; the repeated A-1002 is a duplicate, not a second delivery", () => {
    expect(trace.records.map((r) => [r.source_id, r.outcome])).toEqual([["A-1001", "delivered"], ["A-1002", "delivered"], ["A-1003", "delivered"], ["A-1002", "duplicate"]]);
    const out = trace.records[0]!.steps.find((s) => s.stage_id === "xf.normalize")!.after;
    expect(out).toMatchObject({ class_uid: 2004, severity_id: 4, time: Date.parse("2026-10-29T09:41:12Z"), device: { hostname: "fin-ws-014" }, actor: { user: { name: "m.verma" } } });
    expect(trace.records[0]!.ignored_fields).toEqual(["tactic"]);
    expect(trace.records[0]!.rules.filter((r) => r.status === "dropped").map((r) => r.rule.id)).toEqual(["R9", "R10"]);
  });

  it("handles a webhook source: signature checked at capture, no pagination", () => {
    const t = dryRun(compile(lumen), rec("lumen-idp-signins"));
    expect(t.auth.ok).toBe(true);
    expect(t.records.map((r) => [r.source_id, r.outcome])).toEqual([["LI-55120", "delivered"], ["LI-55141", "delivered"]]);
  });

  it("PS3-13 every receipt count is the trace's count", () => {
    const r = makeReceipt(trace);
    expect(r.records).toEqual({ delivered: 3, partial: 0, rejected: 0, duplicate: 1 });
    expect(r.destinations.map((d) => [d.id, d.accepted, d.rejected])).toEqual([["dst.case-api", 3, 0], ["dst.siem-queue", 3, 0], ["dst.evidence-lake", 3, 0]]);
    expect(r.retries).toBe(trace.retries.length);
    expect(r.id).toBe(`IR-${sha256(trace.plan.config_hash + trace.digest).slice(0, 12)}`);
    expect(activationBlockers(trace)).toEqual([]);
  });

  it("PS3-12 the recorded credentials never survive loading", () => {
    expect(JSON.stringify(fx)).not.toContain("CANARY");
    expect(JSON.stringify(trace)).not.toContain("CANARY");
  });
});
