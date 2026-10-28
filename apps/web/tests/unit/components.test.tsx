// AT-7.3: each of the 17 ported components honours the rule listed in docs/DESIGN_SYSTEM.md §4.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  ApprovalControl,
  Button,
  CHIP,
  ConstraintIndicator,
  Dialog,
  Drawer,
  EDGE_NAMES,
  EdgeStroke,
  EvidenceRow,
  HaltMark,
  MetricBlock,
  Nav,
  NODE,
  NodeGlyph,
  Skeleton,
  StatusChip,
  Tabs,
  TimelineEvent,
  Toast,
  Tooltip,
  type ChipKind,
  type EdgeKind,
  type NodeKind,
} from "@/components/halt";

describe("HaltMark", () => {
  it("draws in currentColor and refuses to render under 24px", () => {
    const { container } = render(<HaltMark size={12} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("height")).toBe("24");
    expect(container.querySelector("path")!.getAttribute("fill")).toBe("currentColor");
    expect(screen.getByRole("img", { name: "HALT" })).toBeInTheDocument();
  });
});

describe("Button", () => {
  it("states why it is disabled", () => {
    render(
      <Button disabled reason="Disabled until both approvals are recorded.">
        EXECUTE 3 ACTIONS
      </Button>,
    );
    expect(screen.getByRole("button", { name: "EXECUTE 3 ACTIONS" })).toBeDisabled();
    expect(screen.getByText("Disabled until both approvals are recorded.")).toBeInTheDocument();
  });
});

describe("Nav", () => {
  it("marks the active item with aria-current", () => {
    const onSelect = vi.fn();
    render(<Nav items={[{ id: "a", label: "ThreadGraph" }, { id: "b", label: "SafeCut" }]} active="b" onSelect={onSelect} />);
    expect(screen.getByRole("link", { name: /SafeCut/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /ThreadGraph/ })).not.toHaveAttribute("aria-current");
    fireEvent.click(screen.getByRole("link", { name: /ThreadGraph/ }));
    expect(onSelect).toHaveBeenCalledWith("a");
  });
});

describe("Tabs", () => {
  it("moves selection with arrow keys", () => {
    render(<Tabs items={[{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }]} label="Futures" />);
    const a = screen.getByRole("tab", { name: "A" });
    expect(a).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(a, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "C" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "C" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "A" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("StatusChip", () => {
  it("pairs a glyph with a word for every kind", () => {
    for (const kind of Object.keys(CHIP) as ChipKind[]) {
      const { container, unmount } = render(<StatusChip kind={kind} />);
      expect(container.querySelector("svg")).not.toBeNull();
      expect(container.textContent).toBe(CHIP[kind][0]);
      unmount();
    }
  });
});

describe("MetricBlock", () => {
  it("always shows its derivation and the SIMULATED mark", () => {
    render(<MetricBlock label="Paths reachable" value="0 of 6" derivation="Route check on post-action snapshot" simulated />);
    expect(screen.getByRole("group", { name: "Paths reachable" })).toHaveTextContent("Route check on post-action snapshot · SIMULATED");
  });
});

describe("EvidenceRow", () => {
  it("links the evidence id and styles inferred evidence differently", () => {
    const { container } = render(<EvidenceRow id="EV-05" source="SL-4502" text="Sessions replayed" time="09:47:03Z" inferred />);
    expect(screen.getByRole("link", { name: "EV-05" })).toHaveAttribute("href", "#EV-05");
    expect(container.firstChild).toHaveClass("halt-ev-inferred");
  });
});

describe("ConstraintIndicator", () => {
  it("names its state in words", () => {
    const states = { met: "MET", binding: "AT LIMIT", violated: "VIOLATED" } as const;
    for (const [state, word] of Object.entries(states)) {
      const { unmount } = render(<ConstraintIndicator name="Users affected" rule="≤ 5" value="3" state={state as keyof typeof states} />);
      expect(screen.getByText(word)).toBeInTheDocument();
      unmount();
    }
  });
});

describe("TimelineEvent", () => {
  it("labels forecast events FORECAST and SIMULATED", () => {
    render(<TimelineEvent time="T+10:00" kind="forecast" title="New session S-3" meta="2,068 of 6,000 rollouts" />);
    expect(screen.getByText("FORECAST · 2,068 of 6,000 rollouts · SIMULATED")).toBeInTheDocument();
  });
});

describe("ApprovalControl", () => {
  it("shows impact, reversibility and authorisation, and reports aria-pressed", () => {
    const onApprove = vi.fn();
    const { rerender } = render(
      <ApprovalControl name="A. Rahman" role="Tier-2 analyst" impact="1 user" reversibility="RB-1 · 30 s" authorisation="IR-OAUTH-02" onApprove={onApprove} />,
    );
    for (const word of ["Impact", "Reversibility", "Authorisation"]) expect(screen.getByText(word)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: /APPROVE/ });
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(onApprove).toHaveBeenCalledOnce();
    rerender(<ApprovalControl name="A. Rahman" role="Tier-2 analyst" state="approved" at="09:57Z" />);
    expect(screen.getByRole("button", { name: /APPROVED/ })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Tooltip", () => {
  it("describes its child without carrying essential text", () => {
    render(
      <Tooltip content="4,335 of 6,000 rollouts" title="Derivation">
        <button type="button">P1</button>
      </Tooltip>,
    );
    const tip = screen.getByRole("tooltip");
    expect(screen.getByRole("button", { name: "P1" })).toHaveAttribute("aria-describedby", tip.id);
  });
});

describe("Drawer", () => {
  it("is non-modal and closes on Escape", () => {
    const onClose = vi.fn();
    render(<Drawer title="Action Gate" onClose={onClose}>body</Drawer>);
    expect(screen.getByRole("dialog", { name: "Action Gate" })).toHaveAttribute("aria-modal", "false");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("Dialog", () => {
  it("is modal, traps focus and closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <Dialog title="Execute 3 actions" onClose={onClose} footer={<button type="button">Confirm</button>}>
        body
      </Dialog>,
    );
    const dialog = screen.getByRole("alertdialog", { name: "Execute 3 actions" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const close = screen.getByRole("button", { name: "Close" });
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(close).toHaveFocus();
    confirm.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("Toast", () => {
  it("alerts for threats and is a status otherwise", () => {
    const { unmount } = render(<Toast kind="threat" title="New sign-in from AS64500" />);
    expect(screen.getByRole("alert")).toHaveTextContent("New sign-in from AS64500");
    unmount();
    render(<Toast kind="success" title="Contained" />);
    expect(screen.getByRole("status")).toHaveTextContent("Contained");
  });
});

describe("Skeleton", () => {
  it("draws loading in dashed forecast language with an accessible label", () => {
    const { container } = render(<Skeleton variant="graph" label="Computing paths" />);
    expect(screen.getByRole("img", { name: "Computing paths" })).toBeInTheDocument();
    expect(container.querySelectorAll(".halt-skel-graph").length).toBeGreaterThan(1);
  });
});

describe("NodeGlyph", () => {
  it("renders all ten silhouettes with state in the accessible name", () => {
    for (const kind of Object.keys(NODE) as NodeKind[]) {
      const { unmount } = render(<NodeGlyph kind={kind} state="forecast" />);
      expect(screen.getByRole("img", { name: `${NODE[kind][0]} node, forecast` })).toBeInTheDocument();
      unmount();
    }
    expect(Object.keys(NODE)).toHaveLength(10);
  });
});

describe("EdgeStroke", () => {
  it("renders all six strokes; hostile never thicker than 3px, preserved is the thickest", () => {
    const widths: Record<string, number> = {};
    for (const kind of Object.keys(EDGE_NAMES) as EdgeKind[]) {
      const { container, unmount } = render(<EdgeStroke kind={kind} animate={false} />);
      expect(screen.getByRole("img", { name: EDGE_NAMES[kind] })).toBeInTheDocument();
      widths[kind] = Math.max(...Array.from(container.querySelectorAll("path")).map((p) => Number(p.getAttribute("stroke-width") ?? 0)));
      unmount();
    }
    expect(widths.observed).toBeLessThanOrEqual(3);
    expect(widths.forecast).toBeLessThanOrEqual(3);
    expect(widths.preserved).toBe(Math.max(...Object.values(widths)));
  });
});
