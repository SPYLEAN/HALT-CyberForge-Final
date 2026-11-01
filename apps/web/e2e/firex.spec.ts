// FireX end to end against the real API, a real run process and a production build. The log is synthetic and written
// to a temporary data root; nothing official is read.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { API } from "./support";

const PS2 = `${API}/ps2`;
const SHOTS = join(__dirname, "../../../artifacts/immersive-product-rebirth");
mkdirSync(SHOTS, { recursive: true });
const ROOT = process.env.HALT_E2E_DATA_ROOT ?? join(tmpdir(), "halt-e2e-firex");

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

test("dataset, run and incident use real data, never the authored demo", async ({ page, request }) => {
  const { runId, top } = await finishedRun(request);
  await page.goto("/firex");
  await expect(page.getByRole("article", { name: "E2E Fixture" })).toBeVisible();
  await expect(page.getByRole("article", { name: "FireX 10G" })).toBeVisible();
  await expect(page.getByRole("link", { name: /OPEN INCIDENT/ })).toHaveCount(0);
  expect(await axe(page)).toEqual([]);

  await page.goto(`/firex/runs/${runId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("No threats found");
  expect(await axe(page)).toEqual([]);

  await page.locator(`a[href="/firex/incidents/${top}?run=${runId}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/firex/incidents/${top}\\?run=${runId}`));
  await expect(page.getByRole("heading", { name: "What happened?" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("INC-2417");
  expect(await axe(page)).toEqual([]);
});

test("Attack World renders in WebGL, selects, replays and falls back to the shared 2D view", async ({ page, request }) => {
  test.setTimeout(180_000); // software WebGL on a test machine, and a real pause longer than a replay step
  const { runId } = await finishedRun(request);
  const list = await (await request.get(`${PS2}/runs/${runId}/incidents`)).json();
  // The incident with the most steps exercises the most of the view.
  const target = [...list.items].sort((a: { detection_count: number }, b: { detection_count: number }) => b.detection_count - a.detection_count)[0].incident_id;
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`/firex/incidents/${target}?run=${runId}`);
  await page.getByRole("tab", { name: "Attack World" }).click();
  const frame = page.getByTestId("firex-3d");
  await expect(frame.locator("canvas")).toBeVisible();
  const painted = await frame.locator("canvas").evaluate((c: HTMLCanvasElement) => c.width > 0 && c.height > 0);
  expect(painted).toBe(true);

  // Selection is shared between the list, the scene and the Evidence Lens, and focus returns on close.
  const firstStep = page.getByRole("list", { name: "Attack path steps" }).getByRole("button").first();
  await firstStep.click();
  const lens = page.getByTestId("firex-drawer");
  const chosen = await lens.getByRole("heading", { level: 3 }).textContent();
  expect(chosen).toBeTruthy();

  const box = (await frame.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 20, { steps: 4 });
  await page.mouse.up();
  await page.mouse.wheel(0, 200);
  await page.getByRole("button", { name: "Focus path" }).click();

  const replay = page.getByRole("region", { name: "Replay" });
  await replay.getByRole("button", { name: "Next", exact: true }).click();
  await expect(replay.getByText(/^Step 1 of/)).toBeVisible();
  await expect(page.getByRole("region", { name: "What this step means" })).toContainText("What proves it");
  // Pause holds the step wherever it had reached, for longer than a step lasts. Play moves on from there.
  const status = replay.getByRole("status");
  await replay.getByRole("button", { name: "Play", exact: true }).click();
  await replay.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(replay.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  const paused = await status.textContent();
  await page.waitForTimeout(4_000);
  expect(await status.textContent()).toBe(paused);
  await replay.getByRole("button", { name: "Play", exact: true }).click();
  await expect(status).not.toHaveText(paused!, { timeout: 8_000 });
  const showAll = replay.getByRole("button", { name: "Show all" });
  if (await showAll.count()) await showAll.click();
  await replay.getByRole("button", { name: "Pause", exact: true }).click({ timeout: 500 }).catch(() => undefined);

  // Keyboard: the scene is reachable and steps with the arrow keys.
  await frame.focus();
  await page.keyboard.press("ArrowRight");
  await expect(replay.getByText(/^Step 1 of/)).toBeVisible();
  await page.keyboard.press("Escape");

  // Analyst mode adds the analyst controls and the flat layout, on the same selection.
  await firstStep.click();
  await page.getByRole("checkbox", { name: "Analyst mode" }).check();
  await page.getByLabel("Camera preset").selectOption("Entry Point");
  await page.getByRole("checkbox", { name: /Reachable/ }).uncheck();
  await page.getByRole("checkbox", { name: /Reachable/ }).check();
  await page.getByRole("checkbox", { name: "Flat 2D layout" }).check();
  await expect(page.getByTestId("firex-2d")).toBeVisible();
  await expect(lens.getByRole("heading", { level: 3 })).toHaveText(chosen!);
  expect(errors).toEqual([]);
  expect(await axe(page)).toEqual([]);
});

test("WebGL unavailable falls back to the flat view with the same content", async ({ browser, request }) => {
  const { runId, top } = await finishedRun(request);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  const page = await context.newPage();
  await page.goto(`http://localhost:3000/firex/incidents/${top}?run=${runId}`);
  await page.getByRole("tab", { name: "Attack World" }).click();
  await expect(page.getByText(/3D is not available in this browser/)).toBeVisible();
  await expect(page.getByTestId("firex-2d")).toBeVisible();
  await context.close();
});

test("reduced motion and phone get a usable view", async ({ page, request, browser }) => {
  const { runId, top } = await finishedRun(request);
  const reduced = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
  const motion = await reduced.newPage();
  await motion.goto(`http://localhost:3000/firex/incidents/${top}?run=${runId}`);
  await motion.getByRole("tab", { name: "Attack World" }).click();
  await expect(motion.getByTestId("firex-3d").locator("canvas")).toBeVisible();
  await reduced.close();

  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`/firex/incidents/${top}?run=${runId}`);
  await page.getByRole("tab", { name: "Attack World" }).click();
  await expect(page.getByText(/Guided view for small screens/)).toBeVisible();
  await expect(page.getByTestId("firex-3d")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Attack path steps" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("a case is built from a run, plays in Theatre and hands off to the incident", async ({ page, request }) => {
  const { runId, top } = await finishedRun(request);
  const made = await (await request.post(`${PS2}/cases`, { data: { run_id: runId, subject: "incident", incident_id: top } })).json();
  const again = await (await request.post(`${PS2}/cases`, { data: { run_id: runId, subject: "incident", incident_id: top } })).json();
  expect(again.case_id).toBe(made.case_id); // deterministic
  await page.goto(`/firex/runs/${runId}`);
  await page.getByRole("button", { name: /Build|Create|Present/ }).first().click();
  await expect(page).toHaveURL(/\/theatre\/fcase-/);
  await expect(page.getByTestId("theatre")).toBeVisible();
  await expect(page.getByText(/^1 of 8\. Situation/)).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText(/^2 of 8\. Entry point/)).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.keyboard.press("Space");
  expect(await axe(page)).toEqual([]);
  await page.getByRole("link", { name: "Open live evidence" }).click();
  await expect(page).toHaveURL(/\/firex\/incidents\/finc-/);
});

test("the Trust Centre leads with the verdict and keeps ground truth unmeasured", async ({ page, request }) => {
  const { runId } = await finishedRun(request);
  await page.goto(`/trust/${runId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("body")).toContainText("Not measured");
  expect(await axe(page)).toEqual([]);
});

test("SourceTrace finds an account, traces it to its source and records a review without changing the result", async ({ page, request }) => {
  const { runId } = await finishedRun(request);
  const list = await (await request.get(`${PS2}/runs/${runId}/incidents`)).json();
  const account = list.items.find((i: { title: string }) => i.title.startsWith("Account")).incident_id;
  const before = await (await request.get(`${PS2}/incidents/${account}/proof?run_id=${runId}`)).json();

  await page.goto(`/firex/incidents/${account}?run=${runId}`);
  await page.getByRole("button", { name: "Search evidence" }).click();
  await page.keyboard.type("temp1");
  await page.keyboard.press("Enter");
  const records = page.getByRole("region", { name: "Source records" });
  await expect(records.getByText("RAW RECORD").first()).toBeVisible();
  await expect(page.getByText(/It is not a file/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Proof receipts" })).toBeVisible();
  expect(await axe(page)).toEqual([]);

  await records.getByRole("button", { name: "Why is this here?" }).first().click();
  const panel = page.getByTestId("provenance").first();
  await expect(panel.getByText("SOURCE VERIFIED")).toBeVisible();
  await expect(panel.getByText("INCIDENT UNCONFIRMED")).toBeVisible();
  await expect(panel.getByRole("list", { name: "Provenance chain" }).locator("> li")).toHaveCount(9);

  await panel.getByText(/^Analyst review/).click();
  await panel.getByLabel("Reason").fill("The owner should confirm this account.");
  await panel.getByRole("button", { name: "Record review" }).click();
  await expect(panel.getByText(/The owner should confirm this account/).first()).toBeVisible();
  expect((await (await request.get(`${PS2}/incidents/${account}/proof?run_id=${runId}`)).json()).receipt).toEqual(before.receipt);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Search evidence" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Search evidence" })).toBeFocused();
});

test("SourceTrace works at phone width and says when nothing is found", async ({ page, request }) => {
  const { runId } = await finishedRun(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/firex/runs/${runId}`);
  await page.getByRole("button", { name: "Search evidence" }).click();
  await page.keyboard.type("no-such-value");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/has not substituted data from another dataset/)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(await axe(page)).toEqual([]);
});

test("Live Intake: a new file in the incoming folder is previewed, analysed, searched and presented", async ({ page, request }) => {
  // A fresh source for each run of the suite, so the first press really starts an analysis.
  const name = `intake-${Date.now()}.log`;
  mkdirSync(join(ROOT, "incoming"), { recursive: true });
  writeFileSync(join(ROOT, "incoming", name), `${fixtureLog()}${stamp(DAY + 900)} logid="0000000013" type="traffic" subtype="forward" level="notice" vd="root" srcip=10.1.0.9 dstip=198.51.100.200 dstport=443 sessionid=${Date.now() % 100000} proto=6 action="accept" service="HTTPS" sentbyte=1 rcvdbyte=1\n`);
  await page.goto("/firex");
  const intake = page.getByTestId("live-intake");
  await intake.getByRole("button", { name: "Check for new files" }).click();
  const row = intake.getByRole("listitem").filter({ hasText: name });
  await expect(row).toContainText("FortiGate key-value log");
  await row.getByRole("button", { name: "Select" }).click();
  const check = page.getByTestId("live-preflight");
  await expect(check.getByText(/SHA-256:/)).toBeVisible();
  await expect(check.getByRole("button", { name: "START ANALYSIS" })).toBeEnabled({ timeout: 30_000 });
  expect(await axe(page)).toEqual([]);
  await page.screenshot({ path: join(SHOTS, "live-intake-preflight-1440x900.png"), fullPage: true });
  await check.getByRole("button", { name: "START ANALYSIS" }).click();
  await expect(page).toHaveURL(/\/firex\/runs\/frun-/);
  await expect(page.getByTestId("firex-run")).toBeVisible();
  const runId = page.url().split("/").pop()!;
  await expect
    .poll(async () => (await (await request.get(`${PS2}/runs/${runId}/progress`)).json()).status, { timeout: 60_000 })
    .toBe("completed");
  await expect(page.getByText(/Ready for review|More evidence required/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("provisional")).toHaveCount(0);

  await page.getByRole("button", { name: "Search evidence" }).click();
  await page.keyboard.type("temp1");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Source records" }).getByText("RAW RECORD").first()).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Present in Theatre" }).click();
  await expect(page.getByTestId("theatre")).toBeVisible();
  await page.goto(`/firex/runs/${runId}`);
  await page.locator(`a[href^="/firex/incidents/"]`).first().click();
  await page.getByRole("tab", { name: "Attack World" }).click();
  await expect(page.getByTestId("firex-3d").locator("canvas")).toBeVisible();
  await expect(page.getByText(/Replay of stored events only/)).toBeVisible();
});

test("Live Intake refuses an unsupported upload with a clear reason, at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/firex");
  const intake = page.getByTestId("live-intake");
  await intake.getByLabel("Choose a log to upload").setInputFiles({ name: "records.jsonl", mimeType: "application/json", buffer: Buffer.from('{"a":1}\n{"a":2}\n') });
  await expect(intake.getByRole("alert")).toContainText("No adapter here reads this format");
  await page.screenshot({ path: join(SHOTS, "live-intake-unsupported-390x844.png"), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(await axe(page)).toEqual([]);
});

test("Response Handoff uses the selected incident only, states NOT EXECUTED and offers no action", async ({ page, request }) => {
  const { runId, top } = await finishedRun(request);
  await page.goto("/firex/incidents");
  await page.locator(`a[href="/firex/incidents/${top}?run=${runId}"]`).first().click();
  await page.getByRole("tab", { name: "Response Handoff" }).click();
  const panel = page.getByTestId("response-handoff");
  await expect(panel.getByText("NOT EXECUTED").first()).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Approval requirements" })).toBeVisible();
  await expect(panel.getByText(/No converter from a FireX incident/)).toBeVisible();
  await expect(panel.getByRole("button", { name: /execute|simulate|contain|approve/i })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("INC-2417");
  expect(await axe(page)).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("Adaptive Intake profiles an unfamiliar file as a proposal and cannot start it", async ({ page }) => {
  mkdirSync(join(ROOT, "incoming"), { recursive: true });
  const name = `vendor-${Date.now()}.jsonl`;
  writeFileSync(join(ROOT, "incoming", name), '{"occurred_at":"2026-11-01T08:00:00Z","client_ip":"203.0.113.21","principal":"maya","operation":"login"}\n{"occurred_at":"2026-11-01T08:02:10Z","client_ip":"203.0.113.21","principal":"maya","operation":"read"}\n');
  await page.goto("/firex");
  const row = page.getByTestId("live-intake").getByRole("listitem").filter({ hasText: name });
  await expect(row).toContainText("JSON Lines");
  await expect(row.getByRole("button", { name: "Select" })).toHaveCount(0);
  await row.getByRole("button", { name: "Profile its structure" }).click();
  const panel = row.getByTestId("adaptive-profile");
  await expect(panel.getByText("PROPOSAL ONLY")).toBeVisible();
  await expect(panel.getByText(/cannot analyse this file yet/)).toBeVisible();
  await expect(panel.getByRole("table", { name: "Proposed field mappings" })).toContainText("client_ip");
  await expect(page.getByRole("button", { name: "START ANALYSIS" })).toHaveCount(0);
  expect(await axe(page)).toEqual([]);
});

test("API failure shows an explicit error, not substituted data", async ({ page }) => {
  await page.route("**/api/v1/ps2/incidents/**", (route) => route.abort());
  await page.goto("/firex/incidents/finc-000000000000");
  await expect(page.getByRole("alert").filter({ hasText: "could not be loaded" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Try again/i })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("INC-2417");
});
