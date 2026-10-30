#!/usr/bin/env node
// Visual QA screenshots (docs/VISUAL_QA_REPORT.md). Needs the API on :8000 and the web app on :3000.
//   node scripts/shoot.mjs <out-dir> [route-set]
// Drives the real API into a known state first (correlate → plan → simulate → seal), so every screen shows
// backend data; nothing is mocked. Also records each page's horizontal overflow, for the no-scroll rule.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "../../artifacts/ui-v2/shots";
const set = process.argv[3] ?? "v2";
const WEB = process.env.HALT_WEB ?? "http://localhost:3000";
const API = (process.env.HALT_API ?? "http://localhost:8000") + "/api/v1";
const I = `${API}/incidents/INC-2417`;

const SIZES = [
  ["1440x900", 1440, 900],
  ["1280x800", 1280, 800],
  ["1024x768", 1024, 768],
  ["390x844", 390, 844],
].filter(([name]) => !process.env.HALT_SIZES || process.env.HALT_SIZES.split(",").includes(name));

const ROUTES = {
  v1: [
    ["landing", "/"],
    ["overview", "/incidents/INC-2417?view=overview"],
    ["threadgraph", "/incidents/INC-2417?view=graph"],
    ["echolab", "/incidents/INC-2417?view=echolab"],
    ["safecut", "/incidents/INC-2417?view=safecut"],
    ["proofseal", "/incidents/INC-2417?view=proofseal"],
    ["policies", "/incidents/INC-2417?view=policies"],
  ],
  v2: [
    ["landing", "/"],
    ["mission", "/mission"],
    ["rooms", "/incidents"],
    ["overview", "/incidents/INC-2417?view=overview"],
    ["threadgraph", "/incidents/INC-2417?view=graph"],
    ["echolab", "/incidents/INC-2417?view=echolab"],
    ["safecut", "/incidents/INC-2417?view=safecut"],
    ["proofseal", "/incidents/INC-2417?view=proofseal"],
    ["timeline", "/incidents/INC-2417?view=timeline"],
    ["policies", "/incidents/INC-2417?view=policies"],
    ["report", "/incidents/INC-2417?view=report"],
    ["forensic-safecut", "/incidents/INC-2417?view=safecut&mode=forensic"],
    ["theatre", "/incidents/INC-2417/theatre"],
    ["architecture", "/architecture"],
  ],
};

async function post(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function prepare() {
  await post(`${I}/reset-to-seed`);
  await post(`${I}/correlate`, {});
  const plan = await post(`${I}/plans`, {});
  await post(`${I}/simulations`, {
    plans: [
      { label: "A", source: "preset_aggressive" },
      { label: "B", source: "preset_passive" },
      { label: "C", source: "plan", plan_id: plan.id },
    ],
  });
  await post(`${API}/plans/${plan.id}/proof`);
}

await prepare();
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const report = [];
for (const [size, width, height] of SIZES) {
  const page = await browser.newPage({ viewport: { width, height } });
  for (const [name, route] of ROUTES[set]) {
    await page.goto(WEB + route, { waitUntil: "networkidle" }).catch(() => undefined);
    await page.waitForTimeout(2500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const file = join(out, `${name}-${size}.png`);
    await page.screenshot({ path: file, fullPage: false });
    report.push({ name, size, overflow });
  }
  await page.close();
}
await browser.close();
writeFileSync(join(out, "overflow.json"), JSON.stringify(report, null, 1));
console.log(report.filter((r) => r.overflow > 0).map((r) => `${r.name}@${r.size}: +${r.overflow}px`).join("\n") || "no horizontal overflow");
