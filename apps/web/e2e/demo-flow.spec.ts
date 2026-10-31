// AT-10.1, AT-10.2, AT-10.4: the demo as presented, determinism across runs, and the policy-blocked variant.
import { expect, test, type Page } from "@playwright/test";

import { API, INCIDENT, approveThroughApi, collectConsoleErrors, resetIncident, sealThroughApi } from "./support";

const topBar = (page: Page) => page.getByRole("banner", { name: "Incident" });

test("AT-10.1 the full demo: landing → Command Center → approve → execute → contained → roll back", async ({ page, context, request }) => {
  await resetIncident(request);
  // Load the Command Center once in another tab (warms caches); the demo itself starts on the landing page.
  const warm = await context.newPage();
  await warm.goto("/incidents/INC-2417?view=overview");
  await expect(warm.getByRole("banner", { name: "Incident" })).toBeVisible({ timeout: 60_000 });
  await warm.close();
  await resetIncident(request);

  const errors = collectConsoleErrors(page);
  await page.goto("/response-demo");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Stop the attack. Not the business.");

  // The story: scroll through the incident; HALT's analysis arrives from the API on the way down.
  await page.locator("#incident li[data-replay-t]").last().scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 200);
  await expect(page.getByTestId("landing-cursor")).toHaveText("INC-2417 · T+11:06");
  await page.locator("#echolab").scrollIntoViewIfNeeded();
  await expect(page.getByRole("article", { name: "Passive monitoring" })).toContainText("5,782 of 6,000");
  await page.locator("#proofseal").scrollIntoViewIfNeeded();
  // Ten claims, CHK-10 being the residual one: U1 is stated, not hidden.
  await expect(page.getByRole("list", { name: "Proof claims" }).getByRole("listitem")).toHaveCount(10);
  await expect(page.locator("#proofseal")).toContainText("accepted residual risk, not containment");

  // Hand-off, then the two human approvals and execution in the Action Gate.
  await page.getByTestId("enter-command-center").scrollIntoViewIfNeeded();
  await page.getByTestId("enter-command-center").click();
  await expect(topBar(page)).toContainText("APPROVAL PENDING", { timeout: 30_000 });
  await page.getByRole("button", { name: /OPEN ACTION GATE/ }).click();
  const gate = page.getByRole("dialog", { name: /Approve, execute/ });
  await expect(gate.getByRole("button", { name: /EXECUTE 3 ACTIONS/ })).toBeDisabled();
  await gate.getByRole("button", { name: /APPROVE · TIER2 ANALYST/ }).click();
  await gate.getByRole("button", { name: /APPROVE · FINANCE OPS OWNER/ }).click();
  await gate.getByRole("button", { name: /EXECUTE 3 ACTIONS/ }).click();
  await expect(topBar(page)).toContainText("CONTAINED");

  await gate.getByRole("button", { name: "Close" }).click();
  await page.getByRole("link", { name: /ThreadGraph/ }).click();
  await expect(page.locator("[data-proof-ring]")).toHaveCount(6);

  await page.getByRole("link", { name: /^Overview/ }).click();
  await page.getByRole("button", { name: /REVIEW ROLLBACK/ }).click();
  await page.getByRole("button", { name: /ROLL BACK ALL/ }).click();
  await expect(topBar(page)).toContainText("ROLLED BACK");

  const audit = await (await request.get(`${INCIDENT}/audit/verify`)).json();
  expect(audit.valid).toBe(true);
  expect(errors).toEqual([]);
});

test("AT-10.2 three consecutive runs produce identical proof certificates", async ({ request }) => {
  const certificates: string[] = [];
  for (let run = 0; run < 3; run++) {
    await resetIncident(request);
    const planId = await sealThroughApi(request);
    const latest = (await (await request.get(INCIDENT)).json()).latest;
    expect(latest.plan_id).toBe(planId);
    const proof = await (await request.get(`${API}/proofs/${latest.proof_id}`)).json();
    certificates.push(proof.certificate);
    await approveThroughApi(request, planId);
  }
  console.log(`AT-10.2 certificates: ${certificates.map((c) => c.slice(0, 12)).join(", ")}`);
  expect(new Set(certificates).size).toBe(1);
});

test("AT-10.4 the approver-unavailable variant is blocked by policy with no execute path", async ({ page, request }) => {
  await resetIncident(request);
  await page.goto("/incidents/INC-2417?view=policies");
  await page.getByLabel("Variant", { exact: true }).selectOption("approver_unavailable");
  await page.getByRole("button", { name: /RESET INCIDENT/ }).click();
  await expect(page.getByText("UNAVAILABLE", { exact: true })).toBeVisible(); // S. Iyer, reloaded with the variant
  // A reload shows the variant the API is running, not a default.
  await page.reload();
  await expect(page.getByLabel("Variant", { exact: true })).toHaveValue("approver_unavailable");

  await page.getByRole("link", { name: /^Overview/ }).click();
  await page.getByRole("button", { name: /CORRELATE WITH HALT-R1/ }).click();
  await page.getByRole("button", { name: /DERIVE ENVELOPE WITH SAFECUT/ }).click();
  await expect(topBar(page)).toContainText("BLOCKED BY POLICY");
  await page.getByRole("button", { name: /SEE CLOSEST OPTIONS/ }).click();
  await expect(page.getByText("No feasible safe plan")).toBeVisible();
  await expect(page.getByText(/missing: C04 needs finance_ops_owner/)).toBeVisible();
  await expect(page.getByRole("button", { name: /OPEN ACTION GATE/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /EXECUTE/ })).toHaveCount(0);

  // The API agrees: there is nothing to seal, so nothing can execute.
  const plan = (await (await request.get(INCIDENT)).json()).latest.plan_id;
  expect((await request.post(`${API}/plans/${plan}/proof`)).status()).toBe(409);
});
