// Incident store reducer, WebSocket envelope validation and env parsing.
import { describe, expect, it } from "vitest";

import { parseEnv } from "@/env";
import type { ServerMessage } from "@/lib/api/types";
import { parseServerMessage } from "@/lib/api/ws";
import { incidentReducer, initialState } from "@/lib/state/incident-store";

const node = { id: "user.m_verma", kind: "user", label: "M. Verma", provenance: "observed" } as unknown;
const event = { id: "EV-02", ts: "2026-10-27T09:42:36Z", kind: "sign_in", source: {}, attributes: {} } as unknown;

function msg(m: Record<string, unknown>): ServerMessage {
  return parseServerMessage(m);
}

describe("incident reducer", () => {
  it("accumulates replay messages and tracks the cursor", () => {
    let s = initialState("INC-2417");
    s = incidentReducer(s, { type: "server", message: msg({ type: "stage", seq: 0, t: 0, state: "new" }) });
    s = incidentReducer(s, { type: "server", message: msg({ type: "graph_delta", seq: 1, t: 0, add_nodes: [node], add_edges: [] }) });
    s = incidentReducer(s, { type: "server", message: msg({ type: "event", seq: 2, t: 84, event }) });
    expect(s.stage).toBe("new");
    expect(Object.keys(s.nodes)).toEqual(["user.m_verma"]);
    expect(s.events.map((e) => e.id)).toEqual(["EV-02"]);
    expect(s.cursor).toBe(84);
    expect(s.lastSeq).toBe(2);
  });

  it("replaces an event re-sent with ATT&CK filled instead of duplicating it", () => {
    let s = incidentReducer(initialState("INC-2417"), { type: "server", message: msg({ type: "event", seq: 0, t: 84, event }) });
    const enriched = { ...(event as object), attack: { technique_id: "T1078.004", technique_name: "Valid Accounts" } };
    s = incidentReducer(s, { type: "server", message: msg({ type: "event", seq: 1, t: 84, event: enriched }) });
    expect(s.events).toHaveLength(1);
    expect(s.events[0]?.attack?.technique_id).toBe("T1078.004");
  });

  it("clears replay-derived state on seek but keeps view and selection", () => {
    let s = initialState("INC-2417", "safecut");
    s = incidentReducer(s, { type: "select", id: "P1" });
    s = incidentReducer(s, { type: "server", message: msg({ type: "event", seq: 0, t: 84, event }) });
    s = incidentReducer(s, { type: "seek", t: 300 });
    expect(s.events).toEqual([]);
    expect(s.cursor).toBe(300);
    expect(s.view).toBe("safecut");
    expect(s.selection).toBe("P1");
  });

  it("defaults to simulated", () => {
    expect(initialState("INC-2417").simulated).toBe(true);
  });
});

describe("WebSocket envelope", () => {
  it("rejects unknown message types and bad stages", () => {
    expect(() => parseServerMessage({ type: "nope", seq: 0, t: 0 })).toThrow();
    expect(() => parseServerMessage({ type: "stage", seq: 0, t: 0, state: "hacked" })).toThrow();
    expect(() => parseServerMessage({ type: "clock", seq: -1, t: 0, playing: false, speed: 1 })).toThrow();
  });
});

describe("env", () => {
  it("defaults to local services in simulated mode", () => {
    expect(parseEnv({})).toEqual({
      NEXT_PUBLIC_API_ORIGIN: "http://localhost:8000",
      NEXT_PUBLIC_WS_ORIGIN: "ws://localhost:8000",
      NEXT_PUBLIC_DEMO_MODE: "simulated",
    });
  });

  it("refuses a WebSocket origin with a path or a non-simulated mode", () => {
    expect(() => parseEnv({ NEXT_PUBLIC_WS_ORIGIN: "ws://localhost:8000/ws" })).toThrow();
    expect(() => parseEnv({ NEXT_PUBLIC_DEMO_MODE: "live" })).toThrow();
  });
});
