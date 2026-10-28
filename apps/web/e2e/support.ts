import type { APIRequestContext, Page } from "@playwright/test";

export const API = "http://localhost:8000/api/v1";
export const INCIDENT = `${API}/incidents/INC-2417`;

export async function resetIncident(request: APIRequestContext, variant = "baseline"): Promise<void> {
  const r = await request.post(`${INCIDENT}/replay/reset`, { data: { variant } });
  if (!r.ok()) throw new Error(`reset failed: ${r.status()}`);
}

/** Drive the incident to approval_pending through the API (fast path for tests that start later in the flow). */
export async function sealThroughApi(request: APIRequestContext): Promise<string> {
  await request.post(`${INCIDENT}/correlate`, { data: {} });
  const plan = await (await request.post(`${INCIDENT}/plans`, { data: {} })).json();
  await request.post(`${INCIDENT}/simulations`, {
    data: { plans: [{ label: "A", source: "preset_aggressive" }, { label: "B", source: "preset_passive" }, { label: "C", source: "plan", plan_id: plan.id }] },
  });
  await request.post(`${API}/plans/${plan.id}/proof`);
  return plan.id as string;
}

export async function approveThroughApi(request: APIRequestContext, planId: string): Promise<void> {
  for (const [policy, approver] of [["IR-OAUTH-02", "a_rahman"], ["IR-CA-05", "s_iyer"]] as const) {
    await request.post(`${API}/plans/${planId}/approvals`, { data: { policy_id: policy, approver_id: approver }, headers: { "X-Halt-Actor": approver } });
  }
}

export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    // Dev-only noise: hot reload socket, and StrictMode closing the first replay socket before it opens.
    if (m.type() === "error" && !/_next\/hmr|closed before the connection is established/.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

export async function seekTo(page: Page, t: number): Promise<void> {
  await page.getByRole("slider", { name: "Replay position" }).evaluate((el, value) => {
    const input = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(value));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, t);
}
