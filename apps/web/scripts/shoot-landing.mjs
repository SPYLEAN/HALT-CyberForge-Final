#!/usr/bin/env node
// Visual QA for the landing narrative: one screenshot per section, scrolled into view (the story is a scroll).
//   node scripts/shoot-landing.mjs <out-dir>   (needs the API on :8000 and the web app on :3000)
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "../../artifacts/ui-v2/landing";
const WEB = process.env.HALT_WEB ?? "http://localhost:3000";
const SECTIONS = ["hero", "paradox", "incident", "context", "echolab", "safecut", "halt", "proofseal", "command"];
const SIZES = [
  ["1440x900", 1440, 900],
  ["390x844", 390, 844],
].filter(([name]) => !process.env.HALT_SIZES || process.env.HALT_SIZES.split(",").includes(name));

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
for (const [size, width, height] of SIZES) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(WEB + "/", { waitUntil: "networkidle" }).catch(() => undefined);
  await page.waitForTimeout(3000);
  for (const [i, id] of SECTIONS.entries()) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    await page.evaluate((s) => document.getElementById(s)?.scrollIntoView({ block: "start" }), id);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: join(out, `landing-${i + 1}-${id}-${size}.png`) });
  }
  await page.close();
}
await browser.close();
console.log(`landing sections → ${out}`);
