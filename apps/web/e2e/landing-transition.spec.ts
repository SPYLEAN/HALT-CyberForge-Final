// AT-9.1 – AT-9.4: landing → Command Center without a reset; deep links restore; reduced motion; LCP.
import { expect, test } from "@playwright/test";

import { resetIncident } from "./support";

test.beforeEach(async ({ request }) => resetIncident(request));

test("AT-9.1 scrolling drives the replay and the hand-off keeps incident and cursor", async ({ page, context }) => {
  // Load the Command Center route once in another tab (warms caches; with a dev server it also compiles it).
  const warm = await context.newPage();
  await warm.goto("/incidents/INC-2417?view=overview");
  await expect(warm.getByRole("banner", { name: "Incident" })).toBeVisible({ timeout: 60_000 });
  await warm.close();
  await page.goto("/response-demo");
  const chip = page.getByTestId("landing-cursor");
  await expect(chip).toHaveText("INC-2417 · T+00:00");

  // Reading the incident timeline advances the shared replay cursor.
  await page.locator('#incident li[data-replay-t]').nth(4).scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 200);
  await expect(chip).not.toHaveText("INC-2417 · T+00:00");

  // The story's analysis ran through the API: the hand-off section is reached with a sealed plan.
  const enter = page.getByTestId("enter-command-center");
  await enter.scrollIntoViewIfNeeded();
  await expect(page.getByRole("list", { name: "Proof claims" })).toBeVisible();
  const before = (await chip.textContent())!.split(" · ")[1]!;

  await page.evaluate(() => ((window as unknown as { __noReload: string }).__noReload = "kept"));
  await enter.click();
  await expect(page).toHaveURL(/\/incidents\/INC-2417\?view=overview&t=\d+/, { timeout: 30_000 });
  expect(await page.evaluate(() => (window as unknown as { __noReload?: string }).__noReload)).toBe("kept");
  await expect(page.getByTestId("replay-clock")).toHaveText(before);
  await expect(page.getByRole("banner", { name: "Incident" })).toContainText("APPROVAL PENDING");
});

test("AT-9.2 a deep link restores view and replay position after reload", async ({ page }) => {
  await page.goto("/incidents/INC-2417?t=420&view=graph");
  const slider = page.getByRole("slider", { name: "Replay position" });
  await expect(slider).toHaveValue("420");
  await page.reload();
  await expect(slider).toHaveValue("420");
  await expect(page.getByTestId("replay-clock")).toHaveText("T+07:00");
  await expect(page.getByRole("link", { name: /ThreadGraph/ })).toHaveAttribute("aria-current", "page");
});

test.describe("AT-9.3 reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("shows the supplied SVG poster and never creates a WebGL context", async ({ page }) => {
    await page.goto("/response-demo");
    await expect(page.getByTestId("halt-3d")).toHaveAttribute("data-mode", "poster");
    await expect(page.getByTestId("halt-3d-poster")).toHaveAttribute("src", "/3d/svg/halt-fallback-dormant.svg");
    expect(await page.evaluate(() => typeof (window as unknown as { THREE?: unknown }).THREE)).toBe("undefined");
  });
});

test("AT-9.4 landing LCP under 2.5 s (local API, production build)", async ({ page }) => {
  await page.goto("/response-demo"); // warm: compile and cache
  await page.goto("about:blank");
  await page.goto("/response-demo");
  const lcp = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          resolve(entries[entries.length - 1]!.startTime);
        }).observe({ type: "largest-contentful-paint", buffered: true });
      }),
  );
  console.log(`AT-9.4 landing LCP: ${Math.round(lcp)} ms`);
  expect(lcp).toBeLessThan(2500);
});
