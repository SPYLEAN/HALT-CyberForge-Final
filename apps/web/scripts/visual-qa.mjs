// Visual QA against a running app and stored runs: `node scripts/visual-qa.mjs [shot-name-filter]`.
// Screenshots go to artifacts/immersive-product-rebirth/. Reads the API only; it changes nothing but case manifests.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../../artifacts/immersive-product-rebirth");
mkdirSync(OUT, { recursive: true });
const WEB = process.env.QA_WEB ?? "http://localhost:3000";
const API = process.env.QA_API ?? "http://localhost:8000/api/v1/ps2";
const filter = process.argv[2] ?? "";
const SIZES = [
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [768, 1024],
  [390, 844],
];

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
const errors = [];

async function open(width, height, url, reducedMotion) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: reducedMotion ? "reduce" : "no-preference" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${url}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/favicon|404/.test(m.text()) && errors.push(`${url}: ${m.text().slice(0, 200)}`));
  await page.goto(WEB + url, { waitUntil: "domcontentloaded", timeout: 120000 });
  return { page, context };
}

async function overflow(page, name) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 1) errors.push(`${name}: horizontal overflow ${over}px`);
}

async function shot(name, width, height, url, prepare, { full = true, reducedMotion = false } = {}) {
  const label = `${name}-${width}x${height}`;
  if (filter && !label.includes(filter)) return;
  const { page, context } = await open(width, height, url, reducedMotion);
  try {
    if (prepare) await prepare(page);
    else await page.waitForTimeout(2500);
    await overflow(page, label);
    await page.screenshot({ path: join(OUT, `${label}.png`), fullPage: full });
    console.log("ok", label);
  } catch (e) {
    errors.push(`${label}: ${String(e).slice(0, 300)}`);
    console.log("FAIL", label);
  }
  await context.close();
}

const worldTab = (settle = 7000) => async (page) => {
  await page.getByRole("tab", { name: "Attack World" }).click({ timeout: 60000 });
  await page.waitForTimeout(settle);
};
const played = (steps) => async (page) => {
  await worldTab()(page);
  for (let i = 0; i < steps; i += 1) await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForTimeout(3500);
};

const runs = (await (await fetch(`${API}/runs`)).json()).items;
const ten = runs.find((r) => r.dataset_id === "firex-10g" && !r.byte_range?.[1] === false && r.metrics.incidents === 11)?.run_id;
const thirty = runs.find((r) => r.dataset_id === "firex-30g" && r.status === "completed")?.run_id;
const fifty = runs.find((r) => r.dataset_id === "firex-50g" && r.status === "completed")?.run_id;
const incidents = ten ? (await (await fetch(`${API}/runs/${ten}/incidents`)).json()).items : [];
const find = (text) => incidents.find((i) => i.title.toLowerCase().includes(text))?.incident_id;
const inc = (id) => `/firex/incidents/${id}?run=${ten}`;
const post = async (body) => (await (await fetch(`${API}/cases`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json()).case_id;

for (const [w, h] of SIZES) {
  await shot("landing", w, h, "/", async (p) => p.waitForTimeout(3000), { full: false });
  await shot("log-analysis", w, h, "/firex");
  if (ten) {
    await shot("run-10g", w, h, `/firex/runs/${ten}`);
    await shot("trust-10g", w, h, `/trust/${ten}`);
    await shot("incident-overview", w, h, inc(find("web attack")), async (p) => p.waitForSelector("text=What happened?", { timeout: 60000 }));
    await shot("world-web-attack", w, h, inc(find("web attack")), worldTab(), { full: false });
  }
  if (thirty) await shot("quality-30g", w, h, `/firex/runs/${thirty}/quality`);
  if (fifty) {
    await shot("run-50g", w, h, `/firex/runs/${fifty}`);
    await shot("trust-50g", w, h, `/trust/${fifty}`);
  }
}
for (const [w, h] of [[1440, 900], [390, 844]]) {
  for (let scene = 1; scene <= 8; scene += 1) {
    await shot(`landing-scene-${scene}`, w, h, `/#scene-${scene}`, async (p) => {
      await p.waitForSelector("[data-testid=product-landing]");
      await p.waitForTimeout(800);
      await p.evaluate((n) => document.getElementById(`scene-${n}`)?.scrollIntoView({ behavior: "instant" }), scene);
      await p.waitForTimeout(3500);
    }, { full: false });
  }
}
if (ten) {
  await shot("world-web-attack-step2", 1440, 900, inc(find("web attack")), played(2));
  await shot("world-account", 1440, 900, inc(find("account created")), worldTab(), { full: false });
  await shot("world-logging", 1440, 900, inc(find("logging")), worldTab(), { full: false });
  await shot("world-fanout", 1440, 900, inc(incidents.filter((i) => i.title.includes("fan-out"))[1]?.incident_id ?? find("fan-out")), worldTab(), { full: false });
  await shot("world-dns", 1440, 900, inc(find("dns")), worldTab(), { full: false });
  await shot("world-flood", 1440, 900, inc(find("flood")), worldTab(), { full: false });
  await shot("world-vpn", 1440, 900, inc(find("vpn")), worldTab(), { full: false });
  await shot("world-reduced-motion", 1440, 900, inc(find("web attack")), played(1), { full: false, reducedMotion: true });
  const incidentCase = await post({ run_id: ten, subject: "incident", incident_id: find("web attack") });
  for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]]) {
    await shot("theatre-incident", w, h, `/theatre/${incidentCase}`, async (p) => {
      await p.waitForSelector("[data-testid=theatre]", { timeout: 60000 });
      await p.waitForTimeout(6000);
      await p.keyboard.press("ArrowRight");
      await p.keyboard.press("ArrowRight");
      await p.waitForTimeout(3000);
    }, { full: false });
  }
}
if (thirty) {
  const qualityCase = await post({ run_id: thirty, subject: "quality" });
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    await shot("theatre-quality", w, h, `/theatre/${qualityCase}`, async (p) => {
      await p.waitForSelector("[data-testid=theatre]", { timeout: 60000 });
      for (let i = 0; i < 4; i += 1) await p.keyboard.press("ArrowRight");
      await p.waitForTimeout(1200);
    }, { full: false });
  }
}
if (fifty) {
  const partialCase = await post({ run_id: fifty, subject: "partial" });
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    await shot("theatre-partial", w, h, `/theatre/${partialCase}`, async (p) => {
      await p.waitForSelector("[data-testid=theatre]", { timeout: 60000 });
      for (let i = 0; i < 4; i += 1) await p.keyboard.press("ArrowRight");
      await p.waitForTimeout(1200);
    }, { full: false });
  }
}
await browser.close();
console.log(errors.length ? `PROBLEMS\n${errors.join("\n")}` : "no page errors or overflow");
