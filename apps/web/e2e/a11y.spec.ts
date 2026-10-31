// AT-8.8: no serious or critical axe violations on any Command Center view, in dark and light themes.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { approveThroughApi, resetIncident, sealThroughApi } from "./support";

const VIEWS = ["overview", "graph", "echolab", "safecut", "proofseal", "timeline", "policies", "report"] as const;

test.beforeAll(async ({ request }) => {
  await resetIncident(request);
  await approveThroughApi(request, await sealThroughApi(request));
});

test("landing page · dark", async ({ page }) => {
  await page.goto("/response-demo");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Stop the attack. Not the business.");
  await expect(page.getByRole("list", { name: "Proof claims" })).toBeAttached();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const blocking = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(blocking).toEqual([]);
});

for (const theme of ["dark", "light"] as const) {
  for (const view of VIEWS) {
    test(`${view} · ${theme}`, async ({ page }) => {
      await page.goto(`/incidents/INC-2417?view=${view}`);
      await expect(page.getByRole("link", { name: new RegExp(view === "overview" ? "^Overview" : "") }).first()).toBeVisible();
      await expect(page.getByRole("banner", { name: "Incident" })).toContainText("APPROVAL PENDING");
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const blocking = results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
      expect(blocking).toEqual([]);
    });
  }
}

test("evidence rail with a selection · dark (FINALIZATION_AUDIT F-01)", async ({ page }) => {
  await page.goto("/incidents/INC-2417?view=safecut");
  const rejected = page.getByRole("region", { name: "Why HALT rejected more disruptive responses" });
  await rejected.locator("summary").first().click();
  await rejected.getByRole("button", { name: /^Inspect evidence/ }).first().click();
  const rail = page.getByRole("complementary", { name: "Evidence" });
  await expect(rail.getByRole("button", { name: /EXPLAIN/ })).toBeVisible();
  const ids = await rail.locator("[id]").evaluateAll((els) => els.map((e) => e.id));
  expect(new Set(ids).size).toBe(ids.length);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const blocking = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  expect(blocking).toEqual([]);
});
