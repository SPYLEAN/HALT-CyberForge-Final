// AT-7.5: the SIMULATED chip is visible whenever demo data is on; the shell renders from the shared store.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CommandCenterShell } from "@/components/shell/CommandCenterShell";
import { TopBar } from "@/components/shell/TopBar";
import { IncidentProvider } from "@/lib/state/incident-store";

const evidence = [
  { id: "evidence" as const, title: "Observed evidence", content: null },
  { id: "policy" as const, title: "Policy requirements", content: null },
];

function shell(simulated = true) {
  return render(
    <IncidentProvider incidentId="INC-2417" connect={false} initial={{ simulated, stage: "forecast_ready" }}>
      <CommandCenterShell t0="2026-10-27T09:41:12Z" end={666} evidence={evidence}>
        <p>workspace</p>
      </CommandCenterShell>
    </IncidentProvider>,
  );
}

describe("top bar", () => {
  it("shows SIMULATED when the data is simulated", () => {
    render(<TopBar incidentId="INC-2417" stage="new" simulated />);
    expect(screen.getByTestId("simulated-chip")).toHaveTextContent("SIMULATED");
  });

  it("hides the chip only when the API says the data is not simulated", () => {
    render(<TopBar incidentId="INC-2417" stage="new" simulated={false} />);
    expect(screen.queryByTestId("simulated-chip")).toBeNull();
  });

  it("uses the supplied horizontal lockup and names the stage in words", () => {
    render(<TopBar incidentId="INC-2417" stage="blocked_by_policy" simulated />);
    expect(screen.getByAltText("HALT")).toHaveAttribute("src", "/brand/halt-horizontal-bone.svg");
    expect(screen.getByText("BLOCKED BY POLICY")).toBeInTheDocument();
  });
});

describe("Command Center shell", () => {
  it("renders rail, top bar, workspace, evidence rail and replay timeline", () => {
    shell();
    const rail = screen.getByRole("navigation", { name: "Command Center" });
    const labels = within(rail).getAllByRole("link").map((a) => a.textContent?.replace(/^\d+/, ""));
    expect(labels).toEqual(["Incident Overview", "ThreadGraph", "EchoLab", "SafeCut", "ProofSeal", "Timeline", "Policies"]);
    expect(screen.getByTestId("simulated-chip")).toBeInTheDocument();
    expect(screen.getByText("FORECAST READY")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Evidence" })).toHaveTextContent("Select a node, path or action");
    expect(screen.getByRole("slider", { name: "Replay position" })).toHaveAttribute("max", "666");
    expect(screen.getByText("workspace")).toBeInTheDocument();
  });

  it("switches view through the rail without a page load", () => {
    shell();
    const link = screen.getByRole("link", { name: /SafeCut/ });
    fireEvent.click(link);
    expect(link).toHaveAttribute("aria-current", "page");
  });
});
