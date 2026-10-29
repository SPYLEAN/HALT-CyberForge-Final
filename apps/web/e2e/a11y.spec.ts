// AT-8.8: no serious or critical axe violations on any Command Center view, in dark and light themes.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { approveThroughApi, resetIncident, sealThroughApi } from "./support";

const VIEWS = ["overview", "graph", "echolab", "safecut", "proofseal", "timeline", "policies"] as const;

test.beforeAll(async ({ request }) => {
  await resetIncident(request);
  await approveThroughApi(request, await sealThroughApi(request));
});

test("landing page · dark", async ({ page }) => {
  await page.goto("/");
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
      await expect(page.getByRole("link", { name: new RegExp(view === "overview" ? "Incident Overview" : "") }).first()).toBeVisible();
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
