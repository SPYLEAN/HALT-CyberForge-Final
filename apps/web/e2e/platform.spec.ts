// UI v2 platform routes: accessibility, presentation mode, and the no-horizontal-scroll rule (docs/UI_V2_SPEC.md).
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { approveThroughApi, resetIncident, sealThroughApi } from "./support";

const ROUTES = [
  ["mission", "/mission", "OAuth consent phishing against Finance Ops"],
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
  for (const route of ["/", "/response-demo", "/trust", "/firex", "/mission", "/incidents", "/architecture", "/incidents/INC-2417?view=overview", "/incidents/INC-2417?view=safecut", "/incidents/INC-2417/theatre"]) {
    test(`no horizontal scroll · ${route}`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBe(0);
    });
  }
});
