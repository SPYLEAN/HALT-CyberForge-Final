// FINALIZATION_AUDIT F-02, F-03, F-06: landing copy states only what the API says, attributed to the right system.
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommandHandoff, EchoSection, IncidentSection, SafeCutSection } from "@/components/landing/sections";
import type { SecurityEvent } from "@/lib/api/types";

import { Providers, useStage } from "./support/api-stub";

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

const event = (id: string, ts: string, kind: string) =>
  ({ id, ts, kind, source: { system: "idp", record_id: `rec-${id}` }, attributes: {} }) as unknown as SecurityEvent;

describe("landing copy is derived, not written in", () => {
  it("counts the incident events instead of stating a number", () => {
    useStage("new");
    const { rerender } = render(<Providers><IncidentSection allEvents={[]} /></Providers>);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Every event has a source.");
    rerender(
      <Providers>
        <IncidentSection allEvents={[event("EV-01", "2026-10-27T09:41:12Z", "mail_delivered"), event("EV-02", "2026-10-27T09:42:36Z", "sign_in")]} />
      </Providers>,
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("2 events. Every one has a source.");
  });

  it("credits the enumeration to ProofSeal, not SafeCut", async () => {
    useStage("sealed");
    render(<Providers><SafeCutSection end={666} /></Providers>);
    expect(await screen.findByText(/ProofSeal then checked all 4,096 combinations independently: no other set does as well\./)).toBeInTheDocument();
    expect(screen.queryByText(/SafeCut checked/)).toBeNull();
  });

  it("names the approvers the sealed plan still needs", async () => {
    useStage("sealed");
    render(<Providers><CommandHandoff end={666} /></Providers>);
    expect(await screen.findByText(/2 named humans still have to approve \(A\. Rahman, S\. Iyer\)\./)).toBeInTheDocument();
  });

  it("does not promise approvals when no safe plan exists", async () => {
    useStage("blocked");
    render(<Providers><CommandHandoff end={666} /></Providers>);
    expect(await screen.findByText(/Nothing can be executed: no plan satisfies every hard rule/)).toBeInTheDocument();
    expect(screen.queryByText(/named human/)).toBeNull();
  });

  it("states each future's blocked-path method from the API", async () => {
    const responses = useStage("contained");
    const sim = Object.entries(responses).find(([k]) => k.startsWith("GET /api/v1/simulations/"))![1].body as {
      futures: Array<{ paths_blocked: { method: string } }>;
    };
    render(<Providers><EchoSection end={666} /></Providers>);
    // MetricBlock appends " · SIMULATED" to the derivation.
    expect((await screen.findAllByText(`${sim.futures[0]!.paths_blocked.method} · SIMULATED`)).length).toBeGreaterThan(0);
  });
});
