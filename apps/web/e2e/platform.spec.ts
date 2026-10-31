// UI v2 platform routes: accessibility, presentation mode, and the no-horizontal-scroll rule (docs/UI_V2_SPEC.md).
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { approveThroughApi, resetIncident, sealThroughApi } from "./support";

const ROUTES = [
  ["mission", "/mission", "Mission Control"],
  ["incident rooms", "/incidents", "One incident, replayable under controlled variants"],
  ["architecture", "/architecture", "Where HALT sits, and what is real today"],
] as const;

test.beforeAll(async ({ request }) => {
  await resetIncident(request);
  await approveThroughApi(request, await sealThroughApi(request));
});

async function blockingViolations(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

for (const [name, route, heading] of ROUTES) {
  test(`${name} · dark`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading, { timeout: 30_000 });
    expect(await blockingViolations(page)).toEqual([]);
  });
}

test("the synthetic lab is labelled wherever it opens, and is not in the primary navigation", async ({ page }) => {
  const label = "Synthetic Response Lab — separate demonstration, not derived from the selected FireX run.";
  for (const route of ["/incidents", "/incidents/INC-2417?view=overview", "/incidents/INC-2417/theatre", "/response-demo", "/mission"]) {
    await page.goto(route);
    await expect(page.getByTestId("synthetic-lab-notice"), route).toHaveText(label);
  }
  await page.goto("/mission");
  await expect(page.getByRole("heading", { level: 2, name: "OAuth consent phishing against Finance Ops" })).toBeVisible({ timeout: 30_000 });
  const platform = page.getByRole("navigation", { name: "Platform", exact: true });
  await expect(platform.getByRole("link", { name: "Incident Rooms" })).toHaveAttribute("href", "/firex/incidents");
  for (const route of ["/mission", "/architecture", "/firex", "/firex/incidents", "/trust"]) {
    await page.goto(route);
    await expect(page.getByRole("banner", { name: "HALT platform" }).getByRole("link", { name: /OPEN.*INCIDENT/ }), route).toHaveCount(0);
  }
  await page.goto("/firex/incidents");
  await expect(page.getByTestId("synthetic-lab-notice")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("INC-2417");
});

test("forensic mode · dark", async ({ page }) => {
  await page.goto("/incidents/INC-2417?view=safecut&mode=forensic");
  await expect(page.getByRole("banner", { name: "Incident" })).toContainText("APPROVAL PENDING");
  expect(await blockingViolations(page)).toEqual([]);
});

test("presentation mode: nine steps on the arrow keys, Esc returns to the Command Center", async ({ page }) => {
  await page.goto("/incidents/INC-2417/theatre");
  const steps = page.getByRole("list", { name: "Presentation steps" }).getByRole("button");
  await expect(steps).toHaveCount(9);
  await expect(steps.nth(0)).toHaveAttribute("aria-current", "step");
  expect(await blockingViolations(page)).toEqual([]);
  for (let i = 0; i < 8; i += 1) await page.keyboard.press("ArrowRight");
  await expect(steps.nth(8)).toHaveAttribute("aria-current", "step");
  await page.keyboard.press("ArrowRight"); // the last step stays the last
  await expect(steps.nth(8)).toHaveAttribute("aria-current", "step");
  await page.keyboard.press("ArrowLeft");
  await expect(steps.nth(7)).toHaveAttribute("aria-current", "step");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/incidents\/INC-2417\?view=overview/);
});

test.describe("phone width (390 × 844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  for (const route of ["/", "/response-demo", "/trust", "/firex", "/firex/incidents", "/mission", "/incidents", "/architecture", "/incidents/INC-2417?view=overview", "/incidents/INC-2417?view=safecut", "/incidents/INC-2417/theatre"]) {
    test(`no horizontal scroll · ${route}`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBe(0);
    });
  }
});
