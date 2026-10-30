// Connector Atlas without WebGL (jsdom has none): the 2D flow carries every object and action, selection stays in
// sync across flow, object list, panel, live region and URL, and the phone gets the guided pipeline.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AtlasApp } from "@/components/ps3/AtlasApp";

let search = "";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search) }));

function phone(on: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: on && query.includes("max-width: 959px"), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
}

beforeEach(() => {
  search = "";
  window.history.replaceState(null, "", "/atlas");
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  phone(false);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const state = () => screen.getByTestId("atlas-state").dataset;

describe("desktop without WebGL", () => {
  it("shows the complete 2D flow instead of the canvas, with every stage as a button", () => {
    const { container } = render(<AtlasApp />);
    expect(screen.getByText(/3D is unavailable on this device/)).toBeInTheDocument();
    expect(container.querySelector("canvas")).toBeNull();
    const flow = screen.getByRole("group", { name: "Complete 2D flow" });
    // 2 sources + 2×(3 acquisition + 2 transformation + 3 validation) + 3 shared destinations
    expect(within(flow).getAllByRole("button")).toHaveLength(21);
    expect(screen.queryByRole("group", { name: "Camera" })).toBeNull();
  });

  it("selecting in the 2D flow selects in the object list, opens the stage's panel, announces it and updates the URL", () => {
    render(<AtlasApp />);
    const flow = screen.getByRole("group", { name: "Complete 2D flow" });
    const mapping = within(flow).getAllByRole("button").find((b) => b.dataset.node === "northwind-edr-alerts/xf.map")!;
    fireEvent.click(mapping);
    expect(state().node).toBe("northwind-edr-alerts/xf.map");
    expect(state().panel).toBe("mapping");
    expect(state().t).toBe("4");
    expect(mapping).toHaveAttribute("aria-pressed", "true");
    const list = screen.getByRole("navigation", { name: "Spatial objects" });
    expect(list.querySelector('[aria-pressed="true"]')).toHaveAttribute("data-node", "northwind-edr-alerts/xf.map");
    expect(screen.getByRole("tab", { name: "Mapping Chamber" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("atlas-live")).toHaveTextContent("Selected Field mapping");
    expect(window.location.search).toBe("?node=northwind-edr-alerts%2Fxf.map&panel=mapping&t=4");
  });

  it("restores the selection from the URL and from Back (popstate)", () => {
    search = "node=dst.siem-queue&panel=proof&t=10";
    render(<AtlasApp />);
    expect(state()).toMatchObject({ node: "dst.siem-queue", panel: "proof", t: "10" });
    act(() => {
      window.history.pushState(null, "", "/atlas?node=northwind-edr-alerts%2Facq.auth&panel=flight&t=1");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(state()).toMatchObject({ node: "northwind-edr-alerts/acq.auth", panel: "flight", t: "1" });
  });

  it("rapid `]` presses advance one stage each", () => {
    render(<AtlasApp />);
    for (let i = 0; i < 5; i++) fireEvent.keyDown(window, { key: "]" });
    expect(state().node).toBe("northwind-edr-alerts/xf.map");
    fireEvent.keyDown(window, { key: "[" });
    fireEvent.keyDown(window, { key: "[" });
    expect(state().node).toBe("northwind-edr-alerts/acq.paginate");
  });

  it("timeline: rapid steps all apply, and the selection follows the payload", () => {
    render(<AtlasApp />);
    const slider = screen.getByRole("slider", { name: "Payload position" });
    for (let t = 1; t <= 5; t++) fireEvent.change(slider, { target: { value: String(t) } });
    const nextBtn = screen.getByRole("button", { name: "Next step" });
    fireEvent.click(nextBtn);
    fireEvent.click(nextBtn);
    expect(state().t).toBe("7");
    expect(state().node).toBe("northwind-edr-alerts/val.policy");
    expect(screen.getByTestId("flight-step")).toHaveTextContent("step 8 of 12 · Policy checks");
  });

  it("scrollable payloads are focusable, labelled regions; rule buttons are named by their visible text", () => {
    search = "node=northwind-edr-alerts/xf.map";
    const { rerender } = render(<AtlasApp />);
    for (const name of [/^Source payload A-1001, redacted$/, /^Mapped ocsf\.detection_finding output for A-1001$/]) {
      fireEvent.click(screen.getByRole("tab", { name: "Source Lens" }));
      expect(screen.getByRole("region", { name: name })).toHaveAttribute("tabindex", "0");
    }
    fireEvent.click(screen.getByRole("tab", { name: "Mapping Chamber" }));
    rerender(<AtlasApp />);
    const rules = screen.getByRole("region", { name: "Rules: input → operation → output" });
    for (const b of within(rules).getAllByRole("button")) {
      expect(b).not.toHaveAttribute("aria-label");
      expect(b.textContent!.length).toBeGreaterThan(0);
    }
  });

  it("has no Theatre link while /atlas/theatre does not exist, and never renders a secret", () => {
    const { container } = render(<AtlasApp />);
    expect(container.querySelector('a[href^="/atlas/theatre"]')).toBeNull();
    expect(screen.queryByRole("link", { name: /theatre/i })).toBeNull();
    for (const panel of ["Source Lens", "Mapping Chamber", "Payload Flight", "Drift Shockwave", "Proof Corridor", "Activation Gate"]) {
      fireEvent.click(screen.getByRole("tab", { name: panel }));
      expect(document.body.innerHTML).not.toContain("CANARY");
    }
  });
});

describe("phone: guided pipeline", () => {
  beforeEach(() => phone(true));

  it("one stage at a time with its neighbours, and Next/Previous move through the pipeline", () => {
    render(<AtlasApp />);
    expect(screen.queryByRole("navigation", { name: "Spatial objects" })).toBeNull();
    const stage = () => screen.getByTestId("tour-stage");
    expect(stage()).toHaveAccessibleName("Stage 1 of 12: Source API");
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(stage()).toHaveAccessibleName("Stage 3 of 12: Cursor pagination");
    expect(stage()).toHaveTextContent("payload here");
    expect(stage()).toHaveTextContent("Page 1 of 2");
    expect(screen.getByRole("button", { name: /^Previous stage Authentication/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Next stage Rate limit and retry/ })).toBeInTheDocument();
  });

  it("never shows completed-run evidence beside 'not reached'", () => {
    // Record 4 is the repeated A-1002: deduplication stops it, so no destination is ever reached.
    search = "record=3&node=dst.case-api";
    render(<AtlasApp />);
    const stage = screen.getByTestId("tour-stage");
    expect(stage).toHaveTextContent("not reached");
    expect(stage).toHaveTextContent("The record never reached this stage: it stopped at Deduplication.");
    expect(within(stage).queryByRole("heading", { name: "Transformation" })).toBeNull();
  });

  it("a link that names a stage opens with the payload there: status and evidence agree", () => {
    search = "node=northwind-edr-alerts/xf.map";
    render(<AtlasApp />);
    const stage = screen.getByTestId("tour-stage");
    expect(stage).toHaveTextContent("payload here");
    expect(stage).not.toHaveTextContent("not reached");
    expect(within(stage).getByRole("heading", { name: "Input" })).toBeInTheDocument();
    expect(within(stage).getByRole("heading", { name: "Output" })).toBeInTheDocument();
    expect(stage).toHaveTextContent('finding_info.uid: "A-1001"');
    expect(state()).toMatchObject({ node: "northwind-edr-alerts/xf.map", t: "4", panel: "mapping" });
  });

  it("offers the complete flow as readable DOM, not a shrunken diagram", () => {
    render(<AtlasApp />);
    fireEvent.click(screen.getByRole("button", { name: "Complete flow" }));
    const flow = screen.getByRole("group", { name: "Complete 2D flow" });
    fireEvent.click(within(flow).getAllByRole("button").find((b) => b.dataset.node === "northwind-edr-alerts/val.schema")!);
    expect(screen.getByTestId("tour-stage")).toHaveAccessibleName("Stage 7 of 12: Schema validation");
  });
});
