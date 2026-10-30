// AT-8.1 (real API), AT-8.4, AT-8.7: the operator flow end to end in the Command Center.
import { expect, test } from "@playwright/test";

import { API, INCIDENT, approveThroughApi, collectConsoleErrors, resetIncident, sealThroughApi, seekTo } from "./support";

const topBar = (page: import("@playwright/test").Page) => page.getByRole("banner", { name: "Incident" });

test.beforeEach(async ({ request }) => resetIncident(request));

test("operator flow: correlate → SafeCut → EchoLab → ProofSeal → approve → execute → roll back", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/incidents/INC-2417");
  await expect(topBar(page)).toContainText("FORECAST READY");
  await expect(page.getByRole("button", { name: /CORRELATE WITH HALT-R1/ })).toBeEnabled();

  await page.getByRole("button", { name: /CORRELATE WITH HALT-R1/ }).click();
  await expect(page.getByRole("group", { name: "Incident confidence" })).toContainText("16 of 16");
  await page.getByRole("button", { name: /DERIVE ENVELOPE WITH SAFECUT/ }).click();
  await expect(page.getByRole("group", { name: "Users affected by the plan" })).toContainText("3 users");
  await page.getByRole("button", { name: /COMPARE FUTURES IN ECHOLAB/ }).click();
  await page.getByRole("button", { name: /SEAL WITH PROOFSEAL/ }).click();
  await expect(page.getByRole("group", { name: "Required paths reachable after plan" })).toContainText("0 of 6");
  await expect(page.getByRole("group", { name: "Residual reach under the plan" })).toContainText("Not zero risk");
  await expect(topBar(page)).toContainText("APPROVAL PENDING");

  await page.getByRole("button", { name: /OPEN ACTION GATE/ }).click();
  const gate = page.getByRole("dialog", { name: /Approve, execute/ });
  await expect(gate.getByRole("button", { name: /EXECUTE 3 ACTIONS/ })).toBeDisabled();
  await gate.getByRole("button", { name: /APPROVE · TIER2 ANALYST/ }).click();
  await gate.getByRole("button", { name: /APPROVE · FINANCE OPS OWNER/ }).click();
  await gate.getByRole("button", { name: /EXECUTE 3 ACTIONS/ }).click();
  await expect(topBar(page)).toContainText("CONTAINED");

  // AT-8.4: after applied, six proof rings in the gaps and the business thread continuous.
  await gate.getByRole("button", { name: "Close" }).click();
  await page.getByRole("link", { name: /ThreadGraph/ }).click();
  await expect(page.locator("[data-proof-ring]")).toHaveCount(6);
  expect(await page.locator("[data-thread-edge]").count()).toBeGreaterThan(0);
  await expect(page.getByTestId("graph-summary")).toHaveText("After containment: 6 of 7 enumerated paths cut; U1 open as accepted residual risk, business thread continuing.");

  await page.getByRole("link", { name: /^Overview/ }).click();
  await page.getByRole("button", { name: /REVIEW ROLLBACK/ }).click();
  await page.getByRole("button", { name: /ROLL BACK ALL/ }).click();
  await expect(page.getByText("ROLLED BACK · SNAPSHOT RESTORED")).toBeVisible();
  await expect(topBar(page)).toContainText("ROLLED BACK");
  await expect(page.locator("[data-thread-edge]").first()).toBeAttached(); // the thread never left the DOM

  expect(errors).toEqual([]);
});

test("reload keeps the incident, the view and the plan", async ({ page, request }) => {
  await request.post(`${INCIDENT}/correlate`, { data: {} });
  await request.post(`${INCIDENT}/plans`, { data: {} });
  await page.goto("/incidents/INC-2417?view=safecut");
  await expect(page.getByText("Revoke DocuSync Pro OAuth grant")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: /SafeCut/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Revoke DocuSync Pro OAuth grant")).toBeVisible();
});

test("AT-8.7 seeking the replay shows the same graph as GET /graph?at=t", async ({ page, request }) => {
  await page.goto("/incidents/INC-2417?view=graph");
  await expect(topBar(page)).toContainText("FORECAST READY");
  for (const t of [100, 400]) {
    await seekTo(page, t);
    const rest = await (await request.get(`${INCIDENT}/graph?at=${t}`)).json();
    const expected = (rest.nodes as Array<{ id: string }>).map((n) => n.id).sort().join(" ");
    await expect(page.getByTestId("threadgraph")).toHaveAttribute("data-node-ids", expected);
  }
});

test("the cut renders in its final state under reduced motion (FINALIZATION_AUDIT F-14)", async ({ page, request }) => {
  await resetIncident(request);
  const planId = await sealThroughApi(request);
  await approveThroughApi(request, planId);
  const proof = (await (await request.get(INCIDENT)).json()).latest.proof_id as string;
  expect((await request.post(`${API}/plans/${planId}/execute`, { data: { proof_id: proof }, headers: { "X-Halt-Actor": "a_rahman" } })).ok()).toBe(true);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/incidents/INC-2417?view=graph");
  const rings = page.locator("[data-proof-ring]");
  await expect(rings).toHaveCount(6);
  const states = await rings.evaluateAll((gs) =>
    gs.map((g) => ({
      running: g.getAnimations({ subtree: true }).length,
      dash: getComputedStyle(g.querySelector(".ring-stroke")!).strokeDashoffset,
      core: getComputedStyle(g.querySelector(".ring-core")!).transform,
    })),
  );
  expect(states.every((s) => s.running === 0 && s.dash === "0px" && (s.core === "none" || s.core === "matrix(1, 0, 0, 1, 0, 0)"))).toBe(true);
});
