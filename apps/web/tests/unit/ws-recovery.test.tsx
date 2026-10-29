// WebSocket recovery: the replay socket reconnects with backoff after a drop, re-seeks to where the client
// was, never retries a final close, and stops for good when closed by the page.
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RETRY_BASE_MS, RETRY_MAX_MS, ReplaySocket } from "@/lib/api/ws";
import { IncidentProvider, useIncident } from "@/lib/state/incident-store";

class FakeSocket {
  static OPEN = 1;
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
  // test helpers
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

const latest = () => FakeSocket.all[FakeSocket.all.length - 1]!;

beforeEach(() => {
  FakeSocket.all = [];
  vi.useFakeTimers();
  vi.stubGlobal("WebSocket", FakeSocket);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ReplaySocket recovery", () => {
  it("reconnects with exponential backoff and reports the reconnection", () => {
    const onReconnect = vi.fn();
    const statuses: string[] = [];
    const s = new ReplaySocket("INC-2417", { onMessage: vi.fn(), onStatus: (x) => statuses.push(x), onReconnect }, "ws://api");
    s.connect();
    latest().open();
    expect(onReconnect).not.toHaveBeenCalled(); // first open is not a reconnection

    latest().drop();
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(RETRY_BASE_MS);
    expect(FakeSocket.all).toHaveLength(2);
    latest().drop(1013); // database unavailable: try again later, with a longer wait
    vi.advanceTimersByTime(RETRY_BASE_MS);
    expect(FakeSocket.all).toHaveLength(2);
    vi.advanceTimersByTime(RETRY_BASE_MS);
    expect(FakeSocket.all).toHaveLength(3);
    latest().open();
    expect(onReconnect).toHaveBeenCalledTimes(1);
    expect(statuses).toContain("closed");
    expect(statuses[statuses.length - 1]).toBe("open");
  });

  it("caps the backoff", () => {
    const s = new ReplaySocket("INC-2417", { onMessage: vi.fn(), onStatus: vi.fn() }, "ws://api");
    s.connect();
    for (let i = 0; i < 8; i++) {
      latest().drop();
      vi.advanceTimersByTime(RETRY_MAX_MS);
    }
    expect(FakeSocket.all).toHaveLength(9);
  });

  it("does not retry a final close (unknown incident) or after the page closes it", () => {
    const s = new ReplaySocket("INC-0000", { onMessage: vi.fn(), onStatus: vi.fn() }, "ws://api");
    s.connect();
    latest().drop(4404);
    vi.advanceTimersByTime(RETRY_MAX_MS * 2);
    expect(FakeSocket.all).toHaveLength(1);

    const t = new ReplaySocket("INC-2417", { onMessage: vi.fn(), onStatus: vi.fn() }, "ws://api");
    t.connect();
    latest().open();
    t.close();
    latest().drop();
    vi.advanceTimersByTime(RETRY_MAX_MS * 2);
    expect(FakeSocket.all).toHaveLength(2);
  });

  it("drops commands queued while down and lets the caller seek again", () => {
    const s = new ReplaySocket("INC-2417", { onMessage: vi.fn(), onStatus: vi.fn(), onReconnect: () => s.send({ type: "seek", t: 300 }) }, "ws://api");
    s.connect();
    s.send({ type: "subscribe" });
    latest().open();
    expect(latest().sent).toEqual([{ type: "subscribe" }]);
    latest().drop();
    s.send({ type: "seek", t: 10 }); // stale by the time the socket is back
    vi.advanceTimersByTime(RETRY_BASE_MS);
    latest().open();
    expect(latest().sent).toEqual([{ type: "seek", t: 300 }]);
  });
});

describe("the incident store after a reconnect", () => {
  it("seeks back to the client's cursor and counts the reconnection", () => {
    let api: ReturnType<typeof useIncident> | null = null;
    function Probe() {
      api = useIncident();
      return null;
    }
    render(
      <IncidentProvider incidentId="INC-2417">
        <Probe />
      </IncidentProvider>,
    );
    act(() => latest().open());
    act(() => api!.seek(420));
    act(() => latest().drop());
    act(() => {
      vi.advanceTimersByTime(RETRY_BASE_MS);
    });
    act(() => latest().open());
    expect(latest().sent).toEqual([{ type: "seek", t: 420 }]);
    expect(api!.state.cursor).toBe(420);
    expect(api!.state.reconnects).toBe(1);
  });
});
