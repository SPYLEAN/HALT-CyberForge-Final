// AT-1.4 (web half): the generated types carry the contract rules the UI relies on.
import { describe, expectTypeOf, it } from "vitest";

import type { GraphEdge, Meta, ResponseAction, ServerMessage } from "@/lib/api/types";

describe("generated API types", () => {
  it("marks every response as simulated", () => {
    expectTypeOf<Meta["simulated"]>().toEqualTypeOf<true>();
  });

  it("requires impact, reversibility and authorisation on every action", () => {
    expectTypeOf<ResponseAction>().toHaveProperty("impact");
    expectTypeOf<ResponseAction>().toHaveProperty("reversibility");
    expectTypeOf<ResponseAction>().toHaveProperty("authorisation");
    expectTypeOf<ResponseAction["connector"]>().toEqualTypeOf<"simulated">();
  });

  it("distinguishes edge provenance", () => {
    expectTypeOf<GraphEdge["provenance"]>().toEqualTypeOf<
      "observed" | "inferred" | "forecast" | "structural"
    >();
  });

  it("discriminates WebSocket messages by type", () => {
    expectTypeOf<ServerMessage["type"]>().toEqualTypeOf<
      "clock" | "event" | "graph_delta" | "finding" | "stage" | "gate" | "stale"
    >();
  });
});
