// Release check against the stored official runs: `node scripts/verify-stored-runs.mjs`, with the app and an API pointed at
// the real data root. It reads through the API and writes only case manifests, which are built from stored files.
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const WEB = process.env.QA_WEB ?? "http://localhost:3000";
const API = process.env.QA_API ?? "http://localhost:8000/api/v1/ps2";
const get = async (path) => (await fetch(API + path)).json();
const post = async (path, body) => (await fetch(API + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

const facts = (await get("/facts")).items;
const fact = (id) => facts.find((f) => f.dataset_id === id);
const ten = fact("firex-10g");
const thirty = fact("firex-30g");
const fifty = fact("firex-50g");
check("three stored runs with three separate outcomes", Boolean(ten && thirty && fifty), [ten, thirty, fifty].map((f) => `${f?.dataset_id}: ${f?.narrative}`).join("; "));
check("10G is reconstructed and unconfirmed", ten?.state === "Unconfirmed" && ten?.incidents === 11);
check("30G is withheld with no incidents", thirty?.state === "Degraded" && thirty?.incidents === 0);
check("50G is partial, degraded, with 11 incidents", fifty?.state === "Degraded" && fifty?.incidents === 11);
check("50G counts", fifty?.canonical_records === 61970767 && fifty?.collapsed_records === 43681473 && fifty?.usable_records === 18289294 && fifty?.exact_duplicates === 7645803);

for (const f of [ten, fifty]) {
  const trust = await get(`/runs/${f.run_id}/trust`);
  check(`${f.dataset_id}: benchmark seal and all proofs valid`, trust.benchmark_seal_valid === true && trust.proofs.length === 11 && trust.proofs.every((p) => p.seal_valid));
  check(`${f.dataset_id}: every incident unconfirmed and scoped`, trust.incident_scopes.length === 11 && trust.incident_scopes.every((s) => s.status === "unconfirmed"), [...new Set(trust.incident_scopes.map((s) => s.scope))].join(","));
  check(`${f.dataset_id}: source verified, ground truth not measured`, trust.health.dimensions[0].status === "Verified" && trust.health.dimensions[3].status === "Not measured");
}
const thirtyTrust = await get(`/runs/${thirty.run_id}/trust`);
check("30G latency is Not applicable, not 0 ms", thirtyTrust.health.incident_open_latency_label === "Not applicable");

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
const errors = [];
async function page(width = 1440, height = 900, options = {}) {
  const context = await browser.newContext({ viewport: { width, height }, ...options });
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
}
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const axe = async (p) => (await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations.map((v) => v.id);
const text = (p) => p.locator("body").innerText();

{
  const p = await page();
  await p.goto(`${WEB}/firex`);
  await p.getByRole("article", { name: "FireX 50G" }).waitFor();
  await p.getByRole("article", { name: "FireX 50G" }).getByText("Partial reconstruction", { exact: false }).first().waitFor({ timeout: 60000 });
  const card = await p.getByRole("article", { name: "FireX 50G" }).innerText();
  check("Log Analysis shows the 50G verdict and benchmark", card.includes("Degraded") && card.includes("Partial reconstruction") && card.includes("61,970,767") && card.includes("29.51%"));
  check("Log Analysis axe", (await axe(p)).length === 0);

  await p.goto(`${WEB}/firex/runs/${fifty.run_id}`);
  await p.getByRole("heading", { name: "Partial reconstruction", exact: true }).waitFor();
  const run = await text(p);
  check("50G run: partial finding and no Quality Case", run.includes("do not cover the complete source") && !run.includes("Open the Quality Case") && !/no threats found/i.test(run));

  await p.goto(`${WEB}/firex/runs/${thirty.run_id}`);
  await p.getByRole("link", { name: "Open the Quality Case" }).waitFor();
  const withheld = await text(p);
  check("30G run: Quality Case, not partial", !withheld.includes("Partial reconstruction") && !/no threats found/i.test(withheld));
  await p.goto(`${WEB}/firex/runs/${thirty.run_id}/quality`);
  await p.getByText("Reconstruction withheld because the source does not provide a trustworthy time axis.").first().waitFor();
  check("30G Quality Case draws no attack world", (await p.getByTestId("firex-3d").count()) === 0);

  await p.goto(`${WEB}/firex/runs/${ten.run_id}`);
  await p.locator(`a[href^="/firex/incidents/"]`).first().waitFor();
  const tenRun = await text(p);
  check("10G run: incidents, neither other finding", !tenRun.includes("Partial reconstruction") && !tenRun.includes("Open the Quality Case"));

  await p.goto(`${WEB}/trust/${fifty.run_id}`);
  await p.getByRole("table", { name: "What each incident rests on" }).waitFor();
  check("Trust Centre shows 50G scope", (await p.getByRole("table", { name: "What each incident rests on" }).locator("tbody tr").count()) === 11);
  check("Trust Centre axe", (await axe(p)).length === 0);
  await p.context().close();
}

for (const f of [ten, fifty]) {
  const candidates = await get(`/runs/${f.run_id}/case-candidates`);
  const best = candidates.items.find((c) => c.recommended);
  const url = `${WEB}/firex/incidents/${best.incident_id}?run=${f.run_id}`;
  const p = await page();
  await p.goto(url);
  await p.getByRole("tab", { name: "Attack World" }).click({ timeout: 60000 });
  const frame = p.getByTestId("firex-3d");
  await frame.locator("canvas").waitFor({ timeout: 60000 });
  check(`${f.dataset_id}: Attack World canvas`, await frame.locator("canvas").isVisible());
  const replay = p.getByRole("region", { name: "Replay" });
  await replay.getByRole("button", { name: "Next", exact: true }).click();
  await p.getByRole("region", { name: "What this step means" }).waitFor();
  check(`${f.dataset_id}: replay narrates the step`, (await p.getByRole("region", { name: "What this step means" }).innerText()).includes("What proves it"));
  await replay.getByRole("button", { name: "Inspect evidence" }).click();
  const lens = p.getByTestId("firex-drawer");
  await lens.waitFor();
  check(`${f.dataset_id}: evidence stays in sync`, ((await lens.innerText()) ?? "").length > 0 && (await p.getByRole("list", { name: "Attack path steps" }).getByRole("button").first().getAttribute("aria-pressed")) === "true");
  await lens.getByRole("button", { name: "Close evidence" }).click();
  await p.getByRole("checkbox", { name: "Analyst mode" }).check();
  await p.getByRole("checkbox", { name: "Flat 2D layout" }).check();
  check(`${f.dataset_id}: 2D fallback`, await p.getByTestId("firex-2d").isVisible());
  check(`${f.dataset_id}: incident axe`, (await axe(p)).length === 0);
  const made = await post("/cases", { run_id: f.run_id, subject: "incident", incident_id: best.incident_id });
  const again = await post("/cases", { run_id: f.run_id, subject: "incident", incident_id: best.incident_id });
  check(`${f.dataset_id}: case is deterministic`, made.case_id === again.case_id);
  await p.goto(`${WEB}/theatre/${made.case_id}`);
  await p.getByTestId("theatre").waitFor({ timeout: 60000 });
  await p.keyboard.press("ArrowRight");
  await p.getByText(/^2 of 8\./).waitFor();
  check(`${f.dataset_id}: Theatre plays and returns to live evidence`, (await p.getByRole("link", { name: "Open live evidence" }).getAttribute("href")) === `/firex/incidents/${best.incident_id}?run=${f.run_id}`);
  await p.context().close();

  const noGl = await page(1280, 800);
  await noGl.context().addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  await noGl.goto(url);
  await noGl.getByRole("tab", { name: "Attack World" }).click({ timeout: 60000 });
  await noGl.getByTestId("firex-2d").waitFor({ timeout: 60000 });
  check(`${f.dataset_id}: WebGL fallback`, await noGl.getByText(/3D is not available/).isVisible());
  await noGl.context().close();

  const reduced = await page(1280, 800, { reducedMotion: "reduce" });
  await reduced.goto(url);
  await reduced.getByRole("tab", { name: "Attack World" }).click({ timeout: 60000 });
  await reduced.getByTestId("firex-3d").locator("canvas").waitFor({ timeout: 60000 });
  check(`${f.dataset_id}: reduced motion`, true);
  await reduced.context().close();

  const phone = await page(390, 844);
  await phone.goto(url);
  await phone.getByRole("tab", { name: "Attack World" }).click({ timeout: 60000 });
  await phone.getByText(/Guided view for small screens/).waitFor();
  check(`${f.dataset_id}: phone guided view, no overflow`, (await overflow(phone)) <= 1);
  await phone.context().close();
}

{
  // The mentor workflow: search the account, open its source line, follow the chain, reach the proof.
  const p = await page();
  await p.goto(`${WEB}/firex/runs/${ten.run_id}`);
  await p.getByRole("button", { name: "Search evidence" }).click({ timeout: 60000 });
  await p.keyboard.type("svc_backup30");
  await p.keyboard.press("Enter");
  const records = p.getByRole("region", { name: "Source records" });
  await records.waitFor({ timeout: 60000 });
  const text1 = await p.getByRole("dialog").innerText();
  check("svc_backup30 is an account, not a file", text1.includes("is an account") && text1.includes("It is not a file"));
  check("source line 3,226,313 with its original message", text1.includes("Line 3,226,313") && text1.includes("RAW RECORD") && text1.includes('msg="Add system.admin svc_backup30"'));
  check("sign-in and deletion records resolve", text1.includes("Line 3,227,163") && text1.includes("logged in successfully") && text1.includes("Delete system.admin svc_backup30"));
  check("the incident is hypothesis-safe", text1.includes("Possible short-lived administrator-account activity") && text1.includes("unconfirmed"));
  await records.getByRole("button", { name: "Why is this here?" }).first().click();
  const chain = p.getByTestId("provenance").first();
  await chain.waitFor({ timeout: 60000 });
  const text2 = await chain.innerText();
  check("the chain shows rule, relationship and status", text2.includes("account_lifecycle") && text2.includes("SOURCE VERIFIED") && text2.includes("RELATIONSHIP INFERRED") && text2.includes("INCIDENT UNCONFIRMED"));
  check("SourceTrace axe", (await axe(p)).length === 0);
  check("the proof can be opened", (await p.getByRole("region", { name: "Proof receipts" }).getByRole("link", { name: "Open proof" }).first().getAttribute("href"))?.includes("tab=Verification") === true);
  await p.keyboard.press("Escape");
  check("Escape closes the search", (await p.getByRole("dialog").count()) === 0);
  await p.context().close();

  const otherRun = await get(`/runs/${thirty.run_id}/search?q=svc_backup30`);
  check("30G returns no other run's evidence", !otherRun.canonical_events.length && !otherRun.incident_steps.length && otherRun.run.run_id === thirty.run_id, otherRun.run.narrative);
  const summary = await get(`/runs/${ten.run_id}/provenance-summary`);
  check("every cited 10G record verifies to its source", summary.status === "SOURCE VERIFIED" && summary.verified_records === summary.cited_records, `${summary.verified_records} of ${summary.cited_records}`);
  const fiftySummary = await get(`/runs/${fifty.run_id}/provenance-summary`);
  check("every cited 50G record verifies to its source", fiftySummary.status === "SOURCE VERIFIED" && fiftySummary.verified_records === fiftySummary.cited_records, `${fiftySummary.verified_records} of ${fiftySummary.cited_records}`);
  const hand = await get(`/incidents/${(await get(`/runs/${ten.run_id}/case-candidates`)).items[0].incident_id}/handoff?run_id=${ten.run_id}`);
  check("Response Handoff is not executed and stays in its run", hand.execution_state === "NOT EXECUTED" && hand.run_id === ten.run_id && !JSON.stringify(hand).includes("INC-2417"));
  const files = await get("/live/files");
  check("the incoming folder is discoverable", typeof files.incoming_path === "string" && Array.isArray(files.items), files.incoming_path);
}

{
  const q = await post("/cases", { run_id: thirty.run_id, subject: "quality" });
  const part = await post("/cases", { run_id: fifty.run_id, subject: "partial" });
  check("Quality case has the required chapters", q.chapters?.[0]?.title === "19.62 GB received" && q.chapters.length === 8);
  check(
    "Partial case has the required chapters",
    JSON.stringify(part.chapters?.map((c) => c.title)) ===
      JSON.stringify(["32.70 GB received", "61.97 million records processed", "7.65 million duplicates removed", "18.29 million records retained usable ordering", "43.68 million records have collapsed time", "Eleven unconfirmed incidents reconstructed", "Proof receipts verified", "Analyst review required"]),
    part.chapters?.map((c) => c.title).join(" | "),
  );
  const p = await page();
  await p.goto(`${WEB}/theatre/${part.case_id}`);
  await p.getByTestId("theatre").waitFor({ timeout: 60000 });
  check("Partial Theatre draws no attack world", (await p.getByTestId("firex-3d").count()) === 0);
  check("Partial Theatre axe", (await axe(p)).length === 0);
  await p.context().close();
}

{
  const p = await page();
  const scripts = [];
  p.on("response", async (r) => {
    if (r.url().includes(".js")) scripts.push(await r.text().catch(() => ""));
  });
  await p.goto(`${WEB}/`);
  await p.getByText("32.70 GB").waitFor({ timeout: 60000 });
  await p.waitForLoadState("networkidle");
  check("Landing shows 50G from the API, with no 3D library", scripts.length > 0 && !scripts.some((s) => s.includes("WebGLRenderer")));
  const body = await text(p);
  check("Landing keeps the three outcomes apart", body.includes("Reconstructed, unconfirmed incidents") && body.includes("Reconstruction withheld") && body.includes("Partial reconstruction from a degraded source"));
  await p.locator("#scene-8").getByRole("link", { name: "Open Log Analysis" }).click();
  await p.waitForURL(/\/firex$/);
  check("Landing hands off to Log Analysis", true);
  await p.context().close();
}

await browser.close();
check("no page errors", errors.length === 0, errors.slice(0, 3).join(" | ").slice(0, 300));
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
