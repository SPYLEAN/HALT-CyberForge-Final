// Captures the real Attack World, without page chrome, for the deck. It only reads: the browser's API calls go to an
// API on the real data root (DECK_API), whichever API the web app was started with.
// node presentation/capture-world.mjs
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "assets");
mkdirSync(OUT, { recursive: true });
const WEB = process.env.DECK_WEB ?? "http://localhost:3000";
const API = process.env.DECK_API ?? "http://localhost:8001";
const RUN = "frun-69553b2c1dfeb3fe";
const SHOTS = [
  ["world-web-attack", "finc-04607e5cfc23"],
  ["world-logging", "finc-2789986258ba"],
  ["world-fanout", "finc-452cb25cecda"],
  ["world-account", "finc-18b9ea482583"],
];

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
for (const [name, incident] of SHOTS) {
  const context = await browser.newContext({ viewport: { width: 1760, height: 990 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.route(/\/api\/v1\//, async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${API}${url.pathname}${url.search}` });
    await route.fulfill({ response, headers: { ...response.headers(), "access-control-allow-origin": "*" } });
  });
  await page.goto(`${WEB}/firex/incidents/${incident}?run=${RUN}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Attack World" }).click({ timeout: 60000 });
  await page.locator("[data-testid=firex-3d] canvas").waitFor({ timeout: 60000 });
  await page.addStyleTag({ content: "[data-testid=firex-3d]{position:fixed!important;inset:0!important;height:100vh!important;width:100vw!important;z-index:99999!important;border:0!important;border-radius:0!important} [data-testid=firex-3d] > p{display:none!important} nextjs-portal{display:none!important}" });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: join(OUT, `${name}.jpg`), type: "jpeg", quality: 92 });
  console.log("ok", name);
  await context.close();
}
await browser.close();
