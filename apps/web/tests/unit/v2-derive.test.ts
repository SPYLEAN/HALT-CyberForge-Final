// The aperture is a pure function of API state (UI_V2_SPEC §4): no view picks it.
import { describe, expect, it } from "vitest";

import { apertureOf } from "@/components/v2/derive";
import type { OpsApi } from "@/lib/api/ops";

const ops = (o: Partial<Record<"plan" | "proof" | "execution", unknown>>) => ({ plan: null, proof: null, execution: null, ...o }) as unknown as OpsApi;

describe("apertureOf", () => {
  it("follows plan → proof → simulated execution", () => {
    expect(apertureOf(ops({}))).toBe("idle");
    expect(apertureOf(ops({ plan: { status: "infeasible" } }))).toBe("none");
    expect(apertureOf(ops({ plan: { status: "optimal" } }))).toBe("proposed");
    expect(apertureOf(ops({ plan: { status: "optimal" }, proof: {} }))).toBe("sealed");
    expect(apertureOf(ops({ plan: { status: "optimal" }, proof: {}, execution: { state: "applied" } }))).toBe("applied");
    expect(apertureOf(ops({ plan: { status: "optimal" }, proof: {}, execution: { state: "rolled" } }))).toBe("sealed");
  });
});
