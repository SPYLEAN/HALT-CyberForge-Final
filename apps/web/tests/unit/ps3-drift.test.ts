// PS3-5, PS3-6: Drift Shockwave finds exactly what a schema change breaks, and proposes a repair only from evidence.
import { describe, expect, it } from "vitest";

import { activationBlockers, analyseDrift, applyRepairDraft, compile, dryRun, driftRecording, loadFixtures } from "@/lib/ps3/engine";

const fx = loadFixtures();
const northwind = fx.connectors.find((c) => c.id === "northwind-edr-alerts")!;
const rec = fx.recordings.find((r) => r.connector_id === "northwind-edr-alerts")!;
const scenario = (id: string) => fx.drift.find((d) => d.id === id)!;

describe("PS3-5 rename detected_at → detection_time", () => {
  const a = analyseDrift(northwind, rec, scenario("rename-detected-at"));

  it("breaks the time mapping, fails mapping for every record and breaks all destinations", () => {
    expect(a.affected_rules).toEqual([{ id: "R4", from: "detected_at", to: "time", was: "converted", now: "unmapped-required" }]);
    expect(a.failed_stages.map((f) => f.stage_id)).toEqual(["xf.map"]);
    expect(a.failed_stages[0]!.evidence).toEqual(["R4 has no input for required detected_at → time"]);
    expect(a.broken_destinations).toEqual(["dst.case-api", "dst.siem-queue", "dst.evidence-lake"]);
    // Mapping runs before deduplication, so the repeated A-1002 is rejected too: 4 rejections, 0 duplicates.
    expect(a.after.records.map((r) => r.outcome)).toEqual(["rejected", "rejected", "rejected", "rejected"]);
  });

  it("proposes the rename only because the new field carries the same values, as a draft", () => {
    expect(a.repair).toEqual({
      rule_id: "R4",
      from: "detected_at",
      to: "detection_time",
      evidence: "In all 3 records, the new field detection_time carries exactly the value detected_at carried before.",
    });
    const draft = applyRepairDraft(northwind, a.repair!);
    expect(draft.version).toBe("1.3.0-draft.1");
    expect(northwind.mapping.rules.find((r) => r.id === "R4")!.from).toBe("detected_at"); // original untouched
    const repaired = dryRun(compile(draft), driftRecording(rec, northwind, scenario("rename-detected-at")));
    expect(repaired.records.map((r) => r.outcome)).toEqual(["delivered", "delivered", "delivered", "duplicate"]);
    expect(activationBlockers(repaired)).toEqual([]);
    expect(activationBlockers(a.after)).toContain("4 records were rejected in the dry run");
  });
});

describe("PS3-6 remove host.name", () => {
  const a = analyseDrift(northwind, rec, scenario("remove-host-name"));

  it("breaks only the Case API; SIEM queue and evidence lake are unaffected", () => {
    expect(a.affected_rules.map((r) => [r.id, r.now])).toEqual([["R5", "missing-optional"]]);
    expect(a.broken_destinations).toEqual(["dst.case-api"]);
    expect(a.unaffected_destinations).toEqual(["dst.siem-queue", "dst.evidence-lake"]);
    expect(a.after.records.map((r) => r.outcome)).toEqual(["partial", "partial", "partial", "duplicate"]);
  });

  it("proposes no repair and says why", () => {
    expect(a.repair).toBeNull();
    expect(a.no_repair_reason).toBe("No field in the changed payload carries the value host.name carried, so no mapping can be derived from evidence. The owner must decide.");
  });
});
