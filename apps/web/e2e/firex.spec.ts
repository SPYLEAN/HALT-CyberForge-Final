// FireX end to end against the real API, a real run process and a production build. The log is synthetic and written
// to a temporary data root; nothing official is read. Screenshots go to artifacts/firex-workspace/.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { API } from "./support";

const PS2 = `${API}/ps2`;
const ROOT = process.env.HALT_FIREX_DATA_ROOT ?? join(tmpdir(), "halt-e2e-firex");
const SHOTS = join(__dirname, "../../../artifacts/firex-workspace");
mkdirSync(SHOTS, { recursive: true });

const DAY = 1_800_000_000;
function stamp(ts: number): string {
  const iso = new Date(ts * 1000).toISOString();
  return `date=${iso.slice(0, 10)} time=${iso.slice(11, 19)} eventtime=${ts}000000000 tz="+0530" devname="FGT-TEST" devid="FGT-TEST"`;
}
const admin = (ts: number, user: string, src: string, action: string, status: string | null, msg: string, logid: string) =>
  `${stamp(ts)} logid="${logid}" type="event" subtype="system" level="information" vd="root" user="${user}" srcip=${src} srcintfrole="wan" dstip=10.99.0.1 dstintfrole="lan" proto=6 action="${action}"${status ? ` status="${status}"` : ""} msg="${msg}"`;
const traffic = (ts: number, src: string, dst: string, port: number, service: string, sid: number, srole = "lan", drole = "dmz") =>
  `${stamp(ts)} logid="0000000013" type="traffic" subtype="forward" level="notice" vd="root" srcip=${src} srcintfrole="${srole}" dstip=${dst} dstintfrole="${drole}" dstport=${port} sessionid=${sid} proto=6 action="accept" service="${service}" sentbyte=100 rcvdbyte=10`;
const virus = (ts: number, src: string, dst: string, name: string, sid: number) =>
  `${stamp(ts)} logid="0211008192" type="utm" subtype="virus" level="warning" vd="root" srcip=${src} srcintfrole="lan" dstip=${dst} dstintfrole="wan" dstport=80 sessionid=${sid} proto=6 action="blocked" service="HTTP" virus="${name}" hostname="bad.example"`;

function fixtureLog(): string {
  const src = "203.0.113.9";
  const host = "10.1.0.44";
  const lines: string[] = [];
  for (let i = 0; i < 40; i++) lines.push(traffic(DAY - 500 + i, `10.1.0.${(i % 200) + 1}`, `198.51.100.${(i % 200) + 1}`, 443, "HTTPS", 100 + i, "lan", "wan"));
  lines.push(admin(DAY, "ops.user", src, "Add", null, "Add system.admin temp1", "0100044547"));
  lines.push(admin(DAY + 300, "temp1", src, "login", "success", "m", "0100032001"));
  lines.push(admin(DAY + 600, "ops.user", src, "Delete", null, "Delete system.admin temp1", "0100044547"));
  for (let i = 0; i < 15; i++) lines.push(traffic(DAY + i, host, `10.20.0.${i + 1}`, 445, "SMB", 500 + i));
  for (let i = 0; i < 4; i++) lines.push(virus(DAY + 100 + i * 60, host, "198.51.100.34", `W${i}/x!tr`, 900 + i));
  lines.push(traffic(DAY + 50, host, "10.30.0.9", 8080, "HTTP", 950, "lan", "lan"));
  return `${lines.join("\n")}\n\u0090 binary junk line\n`;
}

async function finishedRun(request: APIRequestContext): Promise<{ runId: string; top: string }> {
  mkdirSync(join(ROOT, "raw"), { recursive: true });
  writeFileSync(join(ROOT, "raw", "e2e.log"), fixtureLog());
  writeFileSync(join(ROOT, "registry.json"), JSON.stringify({ "e2e-fixture": { filename: "e2e.log", title: "E2E Fixture" } }));
  const created = await (await request.post(`${PS2}/runs`, { data: { dataset_id: "e2e-fixture" } })).json();
  await expect
    .poll(async () => (await (await request.get(`${PS2}/runs/${created.run_id}/progress`)).json()).status, { timeout: 60_000 })
    .toBe("completed");
  const list = await (await request.get(`${PS2}/runs/${created.run_id}/incidents`)).json();
  return { runId: created.run_id, top: list.items[0].incident_id };
}

async function axe(page: Page): Promise<string[]> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

test("dataset, run and Open Incident use real data, never the authored demo", async ({ page, request }) => {
  const { runId, top } = await finishedRun(request);
  await page.goto("/firex");
  await expect(page.getByRole("article", { name: "E2E Fixture" })).toBeVisible();
  await expect(page.getByRole("article", { name: "FireX 10G" })).toBeVisible();
  await expect(page.getByRole("link", { name: /OPEN INCIDENT/ })).toHaveCount(0);
  expect(await axe(page)).toEqual([]);
  await page.screenshot({ path: join(SHOTS, "datasets.png"), fullPage: true });

  await page.goto(`/firex/runs/${runId}`);
  await expect(page.getByRole("heading", { name: "Completed" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Analysis stages" }).locator("li")).toHaveCount(4);
  expect(await axe(page)).toEqual([]);
  await page.screenshot({ path: join(SHOTS, "run.png"), fullPage: true });

  await page.getByRole("link", { name: `Open incident ${top}` }).click();
  await expect(page).toHaveURL(new RegExp(`/firex/incidents/${top}\\?run=${runId}`));
  await expect(page.getByRole("heading", { name: "What happened?" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("INC-2417");
  expect(await axe(page)).toEqual([]);
  await page.screenshot({ path: join(SHOTS, "incident-summary.png"), fullPage: true });
});

test("3D graph renders in WebGL, selects, replays and falls back to shared 2D", async ({ page, request }) => {
  const { runId } = await finishedRun(request);
  const list = await (await request.get(`${PS2}/runs/${runId}/incidents`)).json();
  // The incident with the most steps exercises the most of the view.
  const target = [...list.items].sort((a: { detection_count: number }, b: { detection_count: number }) => b.detection_count - a.detection_count)[0].incident_id;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/firex/incidents/${target}?run=${runId}`);
  await page.getByRole("tab", { name: "3D Attack Path" }).click();
  const frame = page.getByTestId("firex-3d");
  await expect(frame.locator("canvas")).toBeVisible();
  const painted = await frame.locator("canvas").evaluate((c: HTMLCanvasElement) => c.width > 0 && c.height > 0);
  expect(painted).toBe(true);
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS, "incident-3d.png"), fullPage: true });

  await page.getByRole("list", { name: "Attack path steps" }).getByRole("button").first().click();
  await expect(page.getByTestId("firex-drawer").getByRole("heading")).not.toBeEmpty();
  const chosen = await page.getByTestId("firex-drawer").getByRole("heading").textContent();

  const box = (await frame.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 20, { steps: 4 });
  await page.mouse.up();
  await page.mouse.wheel(0, 200);
  await page.getByRole("button", { name: "RESET CAMERA" }).click();
  await page.getByRole("button", { name: "FOCUS PATH" }).click();
  await page.getByLabel("Camera preset").selectOption("Entry Point");
  await page.getByRole("checkbox", { name: /Reachable/ }).uncheck();
  await page.getByRole("checkbox", { name: /Reachable/ }).check();

  await page.getByRole("button", { name: /^NEXT$/ }).click();
  await expect(page.getByText(/^Step 1 of/)).toBeVisible();
  await page.getByRole("button", { name: "PLAY" }).click();
  await page.getByRole("button", { name: "PAUSE" }).click(); // well within the first step's delay
  await expect(page.getByRole("button", { name: "PLAY" })).toBeVisible();
  await expect(page.getByText(/^Step 1 of/)).toBeVisible();
  await page.getByRole("button", { name: "PLAY" }).click();
  await expect(page.getByText(/^Step 2 of/)).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: "SHOW ALL" }).click();

  await page.getByRole("list", { name: "Attack path steps" }).getByRole("button").first().click();
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await expect(page.getByTestId("firex-2d")).toBeVisible();
  await expect(page.getByTestId("firex-drawer").getByRole("heading")).toHaveText(chosen!);
  await page.screenshot({ path: join(SHOTS, "incident-2d.png"), fullPage: true });
  expect(errors).toEqual([]);
  expect(await axe(page)).toEqual([]);
});

test("reduced motion and phone get a usable view", async ({ page, request, browser }) => {
  const { runId, top } = await finishedRun(request);
  const reduced = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
  const motion = await reduced.newPage();
  await motion.goto(`http://localhost:3000/firex/incidents/${top}?run=${runId}`);
  await motion.getByRole("tab", { name: "3D Attack Path" }).click();
  await expect(motion.getByTestId("firex-3d").locator("canvas")).toBeVisible();
  await reduced.close();

  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`/firex/incidents/${top}?run=${runId}`);
  await page.getByRole("tab", { name: "3D Attack Path" }).click();
  await expect(page.getByText(/Guided view for small screens/)).toBeVisible();
  await expect(page.getByTestId("firex-3d")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Attack path steps" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: join(SHOTS, "incident-phone.png"), fullPage: true });
});

test("theatre and story present the same run and hand off to the incident", async ({ page, request }) => {
  const { runId, top } = await finishedRun(request);
  await page.goto(`/firex/runs/${runId}/theatre`);
  await expect(page.getByRole("heading", { name: /pile of disconnected events/ })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("2 of 10")).toBeVisible();
  expect(await axe(page)).toEqual([]);
  await page.screenshot({ path: join(SHOTS, "theatre.png"), fullPage: true });
  await page.getByRole("link", { name: /OPEN INCIDENT/ }).click();
  await expect(page).toHaveURL(new RegExp(`/firex/incidents/${top}`));
  await page.goto("/firex/story");
  await expect(page.getByRole("heading", { name: /Every result is sealed/ })).toBeVisible();
  await page.screenshot({ path: join(SHOTS, "story.png"), fullPage: true });
});

test("API failure shows an explicit error, not substituted data", async ({ page }) => {
  await page.route("**/api/v1/ps2/incidents/**", (route) => route.abort());
  await page.goto("/firex/incidents/finc-000000000000");
  await expect(page.getByRole("alert").filter({ hasText: "could not be loaded" })).toBeVisible();
  await expect(page.getByRole("button", { name: /TRY AGAIN/ })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("INC-2417");
});
