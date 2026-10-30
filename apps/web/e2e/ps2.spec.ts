// PS2 reconstruction workspace end to end, against the real API and a production build. Nothing is mocked
// except, in one test, a network failure. Screenshots go to artifacts/ps2-workspace/.
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { API } from "./support";

const PS2 = `${API}/ps2`;
const SHOTS = join(__dirname, "../../../artifacts/ps2-workspace");
mkdirSync(SHOTS, { recursive: true });

async function runFor(request: APIRequestContext, dataset: "scenario-a" | "scenario-b"): Promise<string> {
  const ing = await (await request.post(`${PS2}/ingestions`, { data: { dataset_id: dataset } })).json();
  const run = await (await request.post(`${PS2}/reconstructions`, { data: { batch_id: ing.batch_id } })).json();
  return run.run_id as string;
}

const stage = (page: Page, label: string) =>
  page.getByRole("region", { name: "Reconstruction stages" }).locator("li", { has: page.locator("strong", { hasText: new RegExp(`^${label}$`) }) });

async function openRun(page: Page, runId: string): Promise<void> {
  await page.goto(`/reconstructions/${runId}`);
  await expect(stage(page, "Receipt sealed")).toHaveAttribute("data-state", "done");
}

async function axe(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test("bundled dataset: select, ingest, reconstruct; stages advance only on real responses", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", (r) => r.method() === "POST" && r.url().includes("/ps2/") && posts.push(r.url()));
  await page.goto("/reconstruct");
  await page.getByRole("radio", { name: /OAuth consent phishing/ }).check();
  expect(posts).toEqual([]);
  await page.getByRole("button", { name: /INGEST DATASET/ }).click();
  await expect(page.getByLabel("Ingestion totals")).toContainText("Accepted213");
  await expect(page.getByLabel("Ingestion totals")).toContainText("Rejected2");
  await page.screenshot({ path: join(SHOTS, "intake-ingested-1440x900.png"), fullPage: true });
  await page.getByRole("button", { name: /RECONSTRUCT ATTACK PATH/ }).click();
  await expect(page).toHaveURL(/\/reconstructions\/run-[0-9a-f]{16}$/);
  await expect(stage(page, "Story verified")).toHaveAttribute("data-state", "done");
  expect(posts.filter((u) => u.endsWith("/reconstructions"))).toHaveLength(1);

  // Browser back shows the earlier ingestion and offers the existing run; forward returns; nothing re-posts.
  await page.goBack();
  await expect(page.getByRole("button", { name: /OPEN RECONSTRUCTION/ })).toBeVisible();
  await page.goForward();
  await expect(page.getByTestId("ps2-graph")).toBeVisible();
  expect(posts.filter((u) => u.endsWith("/reconstructions"))).toHaveLength(1);
  expect(posts.filter((u) => u.endsWith("/ingestions"))).toHaveLength(1);
});

test("scenario B's graph differs from scenario A's; both come from the API graph", async ({ page, request }) => {
  const a = await runFor(request, "scenario-a");
  const b = await runFor(request, "scenario-b");
  const graphA = await (await request.get(`${PS2}/reconstructions/${a}/hypotheses`)).json();
  const graphB = await (await request.get(`${PS2}/reconstructions/${b}/hypotheses`)).json();
  await openRun(page, a);
  await expect(page.getByTestId("ps2-graph")).toHaveAttribute("data-path", graphA.selected.event_ids.join(" "));
  await openRun(page, b);
  await expect(page.getByTestId("ps2-graph")).toHaveAttribute("data-path", graphB.selected.event_ids.join(" "));
  expect(graphB.selected.event_ids).not.toEqual(graphA.selected.event_ids);
});

test("keyboard: arrows walk the selected path into the inspector; tabs switch with arrows; Escape clears", async ({ page, request }) => {
  const run = await runFor(request, "scenario-a");
  const hyp = await (await request.get(`${PS2}/reconstructions/${run}/hypotheses`)).json();
  await openRun(page, run);
  const canvas = page.getByRole("group", { name: /ThreadGraph canvas/ });
  await canvas.focus();
  await expect(canvas).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const inspector = page.getByTestId("inspector");
  await expect(inspector).toContainText(hyp.selected.event_ids[0]);
  await page.keyboard.press("End");
  await expect(inspector).toContainText(hyp.selected.event_ids.at(-1));
  await expect(inspector).toContainText("Raw-record hash");
  await page.keyboard.press("Escape");
  await expect(inspector).toContainText("Select a node");

  await page.getByRole("tab", { name: "ATTACK STORY" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "ATT&CK" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "ATT&CK" })).toHaveAttribute("aria-selected", "true");
});

test("edge and node evidence, story references and missing evidence", async ({ page, request }) => {
  const run = await runFor(request, "scenario-a");
  const story = await (await request.get(`${PS2}/reconstructions/${run}/story`)).json();
  await openRun(page, run);
  const inferred = story.statements.find((s: { section: string }) => s.section === "inferred");
  await page.getByRole("button", { name: `Inspect ${inferred.edge_ids[0]}` }).first().click();
  const inspector = page.getByTestId("inspector");
  await expect(inspector).toContainText("Edge evidence");
  await expect(inspector).toContainText("INFERRED");
  await expect(inspector.getByRole("region", { name: "Confidence components table" })).toBeVisible();
  const gap = story.statements.find((s: { section: string }) => s.section === "missing_evidence");
  await page.getByRole("button", { name: `Inspect ${gap.text}` }).first().click();
  await expect(inspector).toContainText(gap.text);
});

test("refresh restores the run from its URL; an expired run says so", async ({ page, request }) => {
  const run = await runFor(request, "scenario-b");
  await openRun(page, run);
  await page.reload();
  await expect(page.getByTestId("ps2-graph")).toBeVisible();
  await expect(page.getByText(run).first()).toBeVisible();
  await page.goto("/reconstructions/run-0000000000000000");
  await expect(page.getByRole("region", { name: "Reconstruction run not found" })).toContainText("expired");
  await expect(page.getByTestId("ps2-graph")).toHaveCount(0);
});

test("service unavailable: no figures, retry recovers", async ({ page, request }) => {
  const run = await runFor(request, "scenario-a");
  await page.route("**/api/v1/ps2/**", (r) => r.abort("connectionrefused"));
  await page.goto(`/reconstructions/${run}`);
  await expect(page.getByRole("region", { name: "Reconstruction service unavailable" })).toBeVisible();
  await expect(page.getByTestId("ps2-graph")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(run);
  await page.unroute("**/api/v1/ps2/**");
  await page.getByRole("button", { name: /TRY AGAIN/ }).click();
  await expect(page.getByTestId("ps2-graph")).toBeVisible();
});

test("upload with partial rejection; the secret never reaches the page", async ({ page }) => {
  await page.goto("/reconstruct");
  await page.getByRole("radio", { name: "UPLOAD FILES" }).click();
  const lines = [
    JSON.stringify({ RecordId: "r1", CreationTime: "2026-10-29T09:00:00Z", UserId: "u@example.test", SessionId: "s1", ClientIP: "10.0.0.5", Operation: "FileAccessed", ObjectId: "docs", ResultStatus: "Succeeded" }),
    '{"RecordId": "r2", "CreationTime": ',
    JSON.stringify({ RecordId: "r3", UserId: "u@example.test", Note: "password=hunter2" }),
  ];
  await page.getByLabel(/^Log files/).setInputFiles({ name: "api_activity.jsonl", mimeType: "application/x-ndjson", buffer: Buffer.from(lines.join("\n") + "\n") });
  await expect(page.getByRole("combobox", { name: "Log source for api_activity.jsonl" })).toHaveValue("api_activity");
  await expect(page.getByRole("button", { name: /UPLOAD 1 FILE/ })).toBeDisabled();
  await page.getByRole("checkbox", { name: /synthetic or public-demo data only/ }).check();
  await page.getByRole("button", { name: /UPLOAD 1 FILE/ }).click();
  await expect(page.getByLabel("Ingestion totals")).toContainText("Accepted1");
  await expect(page.getByLabel("Ingestion totals")).toContainText("Rejected2");
  await page.getByText(/api_activity\.jsonl: 2 rejected/).click();
  await expect(page.getByText("malformed_record")).toBeVisible();
  expect(await page.content()).not.toContain("hunter2");
});

test("synthetic evaluation: disclosure, and every value is the API's own", async ({ page, request }) => {
  const run = await runFor(request, "scenario-a");
  const response = page.waitForResponse((r) => r.url().endsWith(`/reconstructions/${run}/evaluation`));
  await openRun(page, run);
  const report = await (await response).json();
  await page.getByRole("tab", { name: "EVALUATION" }).click();
  await expect(page.getByTestId("synthetic-disclosure")).toContainText("Synthetic evaluation — demonstrates pipeline behaviour, not real-world accuracy.");
  const rows = page.getByTestId("metric-row");
  await expect(rows).toHaveCount(report.metrics.length);
  for (let i = 0; i < report.metrics.length; i++) {
    const m = report.metrics[i];
    const cells = rows.nth(i).getByRole("cell");
    await expect(cells.nth(0)).toHaveText(m.value != null ? m.value.toLocaleString("en-GB", { maximumFractionDigits: 3 }) : "unavailable");
    await expect(cells.nth(2)).toHaveText(m.target != null ? m.target.toLocaleString("en-GB", { maximumFractionDigits: 3 }) : "—");
  }
});

test("reduced motion: the selected path appears without animation", async ({ page, request }) => {
  const run = await runFor(request, "scenario-a");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openRun(page, run);
  await expect(page.getByTestId("ps2-graph")).toHaveAttribute("data-path-reveal", "instant");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.reload();
  await expect(page.getByTestId("ps2-graph")).toHaveAttribute("data-path-reveal", "animated");
});

test("axe: intake and every workspace tab have no serious or critical violations", async ({ page, request }) => {
  await page.goto("/reconstruct");
  await expect(page.getByRole("radiogroup", { name: "Bundled datasets" })).toBeVisible();
  expect(await axe(page)).toEqual([]);
  const run = await runFor(request, "scenario-b");
  await openRun(page, run);
  for (const tab of ["ATTACK STORY", "ATT&CK", "HYPOTHESES", "PROOF", "EVALUATION"]) {
    await page.getByRole("tab", { name: tab }).click();
    if (tab === "EVALUATION") await expect(page.getByTestId("synthetic-disclosure")).toBeVisible();
    expect(await axe(page), tab).toEqual([]);
  }
  await page.getByRole("button", { name: /^Inspect Payroll/ }).first().click();
  expect(await axe(page), "inspector").toEqual([]);
});

for (const [w, h] of [
  [1440, 900],
  [1024, 768],
] as const) {
  test(`screenshots ${w}x${h}`, async ({ page, request }) => {
    await page.setViewportSize({ width: w, height: h });
    for (const ds of ["scenario-a", "scenario-b"] as const) {
      const run = await runFor(request, ds);
      await openRun(page, run);
      await expect(page.getByTestId("ps2-graph")).toHaveAttribute("data-path-reveal", /animated|instant/);
      await page.waitForTimeout(1500); // let the one-time path reveal finish before the capture
      await page.screenshot({ path: join(SHOTS, `workspace-${ds}-${w}x${h}.png`) });
      if (w === 1024) {
        await page.getByRole("button", { name: /^Inspect / }).first().click();
        await expect(page.getByRole("dialog", { name: "Evidence inspector" })).toBeVisible();
        expect(await axe(page), "tablet drawer").toEqual([]);
        await page.screenshot({ path: join(SHOTS, `workspace-${ds}-drawer-${w}x${h}.png`) });
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog", { name: "Evidence inspector" })).toHaveCount(0);
      }
    }
    await page.goto("/reconstruct");
    await expect(page.getByRole("radiogroup", { name: "Bundled datasets" })).toBeVisible();
    await page.screenshot({ path: join(SHOTS, `intake-${w}x${h}.png`) });
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
}

test("phone 390: guided sequence, readable evidence, 44px controls, no horizontal overflow, axe", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/reconstruct");
  await expect(page.getByRole("radiogroup", { name: "Bundled datasets" })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(await axe(page), "intake phone").toEqual([]);
  await page.screenshot({ path: join(SHOTS, "intake-390x844.png"), fullPage: true });

  const run = await runFor(request, "scenario-a");
  await openRun(page, run);
  const steps = page.getByRole("navigation", { name: "Reconstruction sequence" });
  for (const b of await steps.getByRole("button").all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByTestId("ps2-graph")).toHaveCount(0); // no shrunken topology on a phone
  for (const step of ["Overview", "Story", "Path", "Evidence", "Receipt"]) {
    await steps.getByRole("button", { name: step }).click();
    await expect(page.getByTestId(`step-${step.toLowerCase()}`)).toBeVisible();
    expect(await overflow(page), step).toBeLessThanOrEqual(0);
    expect(await axe(page), step).toEqual([]);
    await page.screenshot({ path: join(SHOTS, `phone-${step.toLowerCase()}-390x844.png`), fullPage: true });
  }
  await steps.getByRole("button", { name: "Path" }).click();
  await page.getByTestId("path-text").getByRole("button", { name: /^Inspect / }).first().click();
  await expect(page.getByTestId("step-evidence")).toBeVisible();
  await expect(page.getByTestId("inspector")).toContainText("Event evidence");
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});
