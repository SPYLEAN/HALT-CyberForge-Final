// The landing: eight scenes, ordinary scrolling, no 3D library, and a hand-off to Log Analysis.
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("has eight scenes, scrolls normally and hands off to Log Analysis", async ({ page }) => {
  await page.goto("/");
  const landing = page.getByTestId("product-landing");
  await expect(landing).toBeVisible();
  await expect(page.locator("[data-scene]")).toHaveCount(8);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Security teams do not lack alerts.");

  await page.mouse.wheel(0, 900);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);

  await page.getByRole("link", { name: /Scene 8/ }).click();
  await expect(page.getByRole("link", { name: /Scene 8/ })).toHaveAttribute("aria-current", "step");
  await page.getByRole("link", { name: "Open the Trust Centre" }).focus();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  await page.locator("#scene-8").getByRole("link", { name: "Open Log Analysis" }).click();
  await expect(page).toHaveURL(/\/firex$/);
});

test("does not download the 3D library", async ({ page }) => {
  const scripts: string[] = [];
  page.on("response", async (response) => {
    if (response.url().includes(".js")) scripts.push(await response.text().catch(() => ""));
  });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(500);
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.filter((s) => s.includes("WebGLRenderer"))).toEqual([]);
});

test("works at phone width and with reduced motion, without horizontal scroll", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("http://localhost:3000/");
  await expect(page.locator("[data-scene]")).toHaveCount(8);
  await expect(page.locator("canvas")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await context.close();
});

test("the earlier response demo keeps its own route", async ({ page }) => {
  await page.goto("/response-demo");
  await expect(page.getByTestId("landing-cursor")).toBeVisible();
});
