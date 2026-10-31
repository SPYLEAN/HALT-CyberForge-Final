// The landing: eight scenes, figures only from the API, three separate outcomes, and no 3D library in its import graph.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductLanding } from "@/components/landing/ProductLanding";

const FACTS = {
  note: "Recorded FireX benchmark results on the recorded machine. Not a performance guarantee.",
  items: [
    { run_id: "frun-a", dataset_id: "firex-a", source_bytes: 1_230_000_000, duration_s: 12.5, exact_duplicates: 777, peak_memory_mb: 1500, incidents: 3, reconstruction: "ran", state: "Unconfirmed", narrative: "Reconstructed, unconfirmed incidents", canonical_records: 900, usable_records: 400, collapsed_records: 500, proofs_valid: 3, benchmark_seal_valid: true },
    { run_id: "frun-b", dataset_id: "firex-b", source_bytes: 4_560_000_000, duration_s: 34.5, exact_duplicates: 888, peak_memory_mb: 1600, incidents: 0, reconstruction: "withheld", state: "Degraded", narrative: "Reconstruction withheld", canonical_records: 800, usable_records: 0, collapsed_records: 800, proofs_valid: 0, benchmark_seal_valid: true },
    { run_id: "frun-c", dataset_id: "firex-c", source_bytes: 7_890_000_000, duration_s: 56.5, exact_duplicates: 999, peak_memory_mb: 1700, incidents: 2, reconstruction: "partial", state: "Degraded", narrative: "Partial reconstruction from a degraded source", canonical_records: 700, usable_records: 200, collapsed_records: 500, proofs_valid: 2, benchmark_seal_valid: true },
  ],
};

function stubFacts(ok = true) {
  vi.stubGlobal("fetch", async (input: Request | string) => {
    const url = typeof input === "string" ? input : input.url;
    if (!ok) throw new TypeError("network down");
    if (url.endsWith("/facts")) return new Response(JSON.stringify(FACTS), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ code: "not_found", message: "not found", request_id: "x" }), { status: 404, headers: { "content-type": "application/json" } });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("product landing", () => {
  it("has exactly eight scenes and opens with the required message", () => {
    stubFacts();
    const { container } = render(<ProductLanding />);
    expect(container.querySelectorAll("[data-scene]")).toHaveLength(8);
    expect(within(screen.getByRole("navigation", { name: "Scenes" })).getAllByRole("link")).toHaveLength(8);
    const hero = screen.getByRole("heading", { level: 1 });
    expect(hero).toHaveTextContent("Security teams do not lack alerts.");
    expect(hero).toHaveTextContent("They lack a defensible explanation of how those alerts connect.");
  });

  it("states recorded figures only from the API, with their limits", async () => {
    stubFacts();
    render(<ProductLanding />);
    expect(await screen.findByText("1.23 GB")).toBeInTheDocument();
    expect(screen.getByText("FireX A, read in 12.5 s")).toBeInTheDocument();
    expect(screen.getByText("777")).toBeInTheDocument();
    expect(screen.getByText(/Not a performance guarantee/)).toBeInTheDocument();
  });

  it("keeps the three outcomes apart", async () => {
    stubFacts();
    render(<ProductLanding />);
    const list = await screen.findByRole("list", { name: "What each source supported" });
    const rows = within(list).getAllByRole("listitem").map((li) => li.textContent);
    expect(rows[0]).toContain("Reconstructed, unconfirmed incidents");
    expect(rows[1]).toContain("Reconstruction withheld");
    expect(rows[2]).toContain("Partial reconstruction from a degraded source");
  });

  it("never reads a withheld source as clean", async () => {
    stubFacts();
    render(<ProductLanding />);
    await screen.findByText("1.23 GB");
    expect(screen.getByText(/which is not a clean result/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/no threats found|zero false|guarantee[sd]? (accuracy|detection)/i);
  });

  it("says so when figures are unavailable, invents none, and still hands off", async () => {
    stubFacts(false);
    render(<ProductLanding />);
    await waitFor(() => expect(screen.getByText(/Recorded figures are not available/)).toBeInTheDocument());
    expect(document.body.textContent).not.toMatch(/\d+\.\d+ GB/);
    expect(screen.getAllByRole("link", { name: "Open Log Analysis" }).every((a) => a.getAttribute("href") === "/firex")).toBe(true);
  });

  it("has no 3D library in its import graph", () => {
    const src = join(dirname(__filename), "../../src");
    const seen = new Set<string>();
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const text = readFileSync(file, "utf8");
      expect(text).not.toMatch(/from "three|import\("three|AttackWorld|worldScene/);
      for (const m of text.matchAll(/^import (?!type)[^"]*"(@\/|\.\/)([^"]+)"/gm)) {
        if (m[2]!.endsWith(".css")) continue;
        const base = m[1] === "@/" ? join(src, m[2]!) : join(dirname(file), m[2]!);
        for (const ext of [".ts", ".tsx"]) {
          try {
            readFileSync(base + ext);
            walk(base + ext);
            break;
          } catch {
            /* the other extension */
          }
        }
      }
    };
    walk(join(src, "components/landing/ProductLanding.tsx"));
    expect(seen.size).toBeGreaterThan(3);
  });
});
