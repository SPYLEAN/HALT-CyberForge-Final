// PS3 Connector Atlas (docs/PS3_ACCEPTANCE_TESTS.md): framing, Payload Flight, state, fallback, phone, a11y, hygiene.
// The page exposes read-only probes for these checks: window.__ps3Camera, __ps3Packet, __ps3Frames.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

type Cam = { position: number[]; target: number[]; allZonesInView: boolean; zones: { zone: string; inView: boolean }[]; offscreenCritical: string[]; screen: Record<string, [number, number]> };
type Pkt = { node: string | null; moving: boolean; moves: number };

const NW = "northwind-edr-alerts";
const ORDER = ["source.fetch", "acq.auth", "acq.paginate", "acq.retry", "xf.map", "xf.normalize", "val.schema", "val.policy", "val.dedupe"].map((s) => `${NW}/${s}`).concat(["dst.case-api", "dst.siem-queue", "dst.evidence-lake"]);
const NO_WEBGL = `(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/i.test(String(t)) ? null : g.call(this, t, ...a); }; })();`;

const cam = (p: Page) => p.evaluate(() => (window as unknown as { __ps3Camera?: Cam }).__ps3Camera ?? null);
const packet = (p: Page) => p.evaluate(() => (window as unknown as { __ps3Packet?: Pkt }).__ps3Packet ?? null);
const frames = (p: Page) => p.evaluate(() => ((window as unknown as { __ps3Frames?: number[] }).__ps3Frames ?? []).length);
const state = (p: Page) => p.evaluate(() => ({ ...document.querySelector<HTMLElement>('[data-testid="atlas-state"]')!.dataset }));
const close = (a: number[], b: number[], eps = 1e-3) => a.every((v, i) => Math.abs(v - b[i]!) < eps);

/** Wait until the camera has stopped moving (two probe reads 300 ms apart agree). */
async function settled(p: Page): Promise<Cam> {
  let prev = await cam(p);
  for (let i = 0; i < 40; i++) {
    await p.waitForTimeout(300);
    const c = await cam(p);
    if (c && prev && close(c.position, prev.position, 1e-4) && close(c.target, prev.target, 1e-4)) return c;
    prev = c;
  }
  throw new Error("camera never settled");
}

async function openAtlas(p: Page, query = "") {
  await p.goto(`/atlas${query}`);
  await expect(p.getByTestId("atlas-canvas")).toBeVisible();
  await expect.poll(() => cam(p)).not.toBeNull();
  return settled(p);
}

async function axe(p: Page) {
  const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
}

/** Console warnings/errors, page errors, failed requests, and any 4xx/5xx, collected for one page. */
function hygiene(p: Page) {
  const issues: string[] = [];
  const requests: string[] = [];
  p.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") issues.push(`${m.type()}: ${m.text()}`);
  });
  p.on("pageerror", (e) => issues.push(`pageerror: ${e.message}`));
  p.on("requestfailed", (r) => issues.push(`failed: ${r.url()}`));
  p.on("response", (r) => r.status() >= 400 && issues.push(`${r.status()}: ${r.url()}`));
  p.on("request", (r) => requests.push(r.url()));
  return { issues, requests };
}

test.describe("canonical view", () => {
  for (const [w, h] of [[1440, 900], [1280, 800], [1024, 768]] as const) {
    test(`all five zones are visible at ${w}×${h}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      const c = await openAtlas(page);
      expect(c.zones.map((z) => `${z.zone}:${z.inView}`)).toEqual(["source:true", "acquisition:true", "transformation:true", "validation:true", "destination:true"]);
      for (const z of ["source", "acquisition", "transformation", "validation", "destination"]) await expect(page.locator(`[data-zone-label="${z}"]`)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    });
  }

  test("Home and Reset return to exactly the canonical view after orbit, zoom and pan", async ({ page }) => {
    const initial = await openAtlas(page);
    const box = (await page.getByTestId("atlas-canvas").boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const disturb = async () => {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 140, cy + 50, { steps: 8 });
      await page.mouse.up();
      await page.mouse.wheel(0, -500);
      await page.mouse.down({ button: "right" });
      await page.mouse.move(cx - 90, cy - 40, { steps: 8 });
      await page.mouse.up({ button: "right" });
      const moved = await settled(page);
      expect(close(moved.position, initial.position)).toBe(false);
    };
    await disturb();
    await page.getByRole("button", { name: "Home" }).click();
    const home = await settled(page);
    await disturb();
    await page.getByRole("button", { name: "Reset camera" }).click();
    const reset = await settled(page);
    expect(close(home.position, initial.position)).toBe(true);
    expect(close(home.target, initial.target)).toBe(true);
    expect(close(reset.position, home.position)).toBe(true);
    expect(close(reset.target, home.target)).toBe(true);
    expect(reset.allZonesInView).toBe(true);
  });

  test("Drift Shockwave frames every affected mapping and broken destination", async ({ page }) => {
    await openAtlas(page, "?panel=drift");
    await page.getByRole("button", { name: "Source renames detected_at → detection_time" }).click();
    const c = await settled(page);
    expect(c.offscreenCritical).toEqual([]);
    await expect(page.locator('.ps3-obj[data-node="dst.case-api"]')).toHaveAttribute("data-status", "failed");
    await expect(page.locator(`.ps3-obj[data-node="${NW}/xf.map"]`)).toHaveAttribute("data-status", "drift");
    await page.getByRole("button", { name: "Source stops sending host.name" }).click();
    expect((await settled(page)).offscreenCritical).toEqual([]);
  });
});

test.describe("Payload Flight", () => {
  test("the packet travels every stage in order, renders while moving and stops rendering when idle", async ({ page }) => {
    await openAtlas(page);
    await page.waitForTimeout(500);
    const idle0 = await frames(page);
    await page.waitForTimeout(1500);
    expect(await frames(page)).toBe(idle0); // demand rendering: nothing while idle

    const f0 = await frames(page);
    await page.evaluate(() => ((window as unknown as { __ps3Path?: string[] }).__ps3Path = []));
    await page.getByTestId("flight-play").click();
    await expect.poll(() => state(page).then((s) => s.t), { timeout: 60_000 }).toBe("11");
    await expect.poll(() => packet(page).then((p) => p?.moving), { timeout: 10_000 }).toBe(false);
    // The path is recorded in the page as the packet reaches each stage, so this check does not depend on load.
    const seen = await page.evaluate(() => (window as unknown as { __ps3Path?: string[] }).__ps3Path ?? []);
    expect(seen).toEqual(ORDER.slice(1)); // the packet starts at the source, then reaches every stage in order
    const p = (await packet(page))!;
    expect(p.moves).toBeGreaterThanOrEqual(11); // every step after the first is a real move, not a jump
    // Travel, not jumps: every move renders intermediate packet positions (0 < progress < 1) and then finishes.
    // This holds at any frame rate (CI renders in software); measured rates on real hardware are in the report.
    const moves = await page.evaluate(() => (window as unknown as { __ps3Moves?: number[] }).__ps3Moves ?? []);
    const trail = await page.evaluate(() => (window as unknown as { __ps3Trail?: [number, number][] }).__ps3Trail ?? []);
    expect(moves).toHaveLength(11);
    for (const start of moves) {
      const ks = trail.filter(([s]) => s === start).map(([, k]) => k);
      expect(ks.filter((k) => k > 0 && k < 1).length, `intermediate frames in move at ${Math.round(start)}`).toBeGreaterThanOrEqual(2);
      expect(ks[ks.length - 1], `move at ${Math.round(start)} reaches its stage`).toBe(1);
      expect(ks.every((k, i) => i === 0 || k >= ks[i - 1]!), "progress only moves forward").toBe(true);
    }
    expect((await frames(page)) - f0).toBeGreaterThan(11 * 3);
    const done = await frames(page);
    await page.waitForTimeout(1500);
    expect(await frames(page)).toBe(done); // continuous rendering stops at the destination
    expect(await state(page)).toMatchObject({ t: "11", node: "dst.evidence-lake", panel: "flight" });
    await expect(page.getByTestId("flight-step")).toHaveText("A-1001 · step 12 of 12 · Evidence lake · passed");
  });

  test("scrubbing positions the packet deterministically, without travel", async ({ page }) => {
    await openAtlas(page);
    const slider = page.getByRole("slider", { name: "Payload position" });
    await slider.focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
    await expect.poll(() => state(page)).toMatchObject({ t: "6", node: `${NW}/val.schema` });
    const p = (await packet(page))!;
    expect(p.node).toBe(`${NW}/val.schema`);
    expect(p.moving).toBe(false);
    await expect(page.getByTestId("flight-step")).toContainText("step 7 of 12 · Schema validation");
    await expect(page.getByRole("tab", { name: "Payload Flight" })).toHaveAttribute("aria-selected", "true");
  });

  test("reduced motion: the replay jumps stage to stage with no travel", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await openAtlas(page);
    const f0 = await frames(page);
    await page.getByTestId("flight-play").click();
    await expect.poll(() => state(page).then((s) => s.t), { timeout: 20_000 }).toBe("11");
    expect((await packet(page))!.moves).toBe(0);
    expect((await frames(page)) - f0).toBeLessThan(11 * 6);
    await ctx.close();
  });

  test("no animation while the tab is hidden", async ({ page }) => {
    await openAtlas(page);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    const f0 = await frames(page);
    await page.getByRole("button", { name: "Next step" }).click();
    await page.getByRole("button", { name: "Next step" }).click();
    await page.waitForTimeout(1500);
    expect(await frames(page)).toBe(f0);
  });
});

test.describe("state and keyboard", () => {
  test("rapid ] and [ move through every requested stage", async ({ page }) => {
    await openAtlas(page);
    await page.locator("body").click({ position: { x: 5, y: 895 } });
    for (let i = 0; i < 7; i++) await page.keyboard.press("]");
    await expect.poll(() => state(page).then((s) => s.node)).toBe(ORDER[6]);
    for (let i = 0; i < 4; i++) await page.keyboard.press("[");
    await expect.poll(() => state(page).then((s) => s.node)).toBe(ORDER[2]);
  });

  test("3D click, minimap, object list, URL, live region and panel agree", async ({ page }) => {
    const c = await openAtlas(page);
    const box = (await page.getByTestId("atlas-canvas").boundingBox())!;
    const [x, y] = c.screen[`${NW}/xf.normalize`]!;
    await page.mouse.click(box.x + x, box.y + y);
    await expect.poll(() => state(page).then((s) => s.node)).toBe(`${NW}/xf.normalize`);
    await expect(page.getByRole("tab", { name: "Mapping Chamber" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('.ps3-obj[aria-pressed="true"]')).toHaveAttribute("data-node", `${NW}/xf.normalize`);
    await expect(page.locator(`[data-testid="minimap"] g[data-node="${NW}/xf.normalize"] rect`).first()).toHaveAttribute("stroke-width", "3");
    await expect(page.getByTestId("atlas-live")).toHaveText("Selected OCSF normalisation");
    expect(new URL(page.url()).searchParams.get("node")).toBe(`${NW}/xf.normalize`);

    await page.locator('[data-testid="minimap"] g[data-node="dst.siem-queue"]').click({ force: true });
    await expect.poll(() => state(page)).toMatchObject({ node: "dst.siem-queue", panel: "proof", t: "10" });
    await expect(page.getByRole("tab", { name: "Proof Corridor" })).toHaveAttribute("aria-selected", "true");
  });

  test("URL state restores on load and reload; Back and Forward walk selections", async ({ page }) => {
    await openAtlas(page, `?node=${NW}%2Fval.policy&panel=proof&t=7`);
    expect(await state(page)).toMatchObject({ node: `${NW}/val.policy`, panel: "proof", t: "7" });
    await page.reload();
    await expect.poll(() => state(page)).toMatchObject({ node: `${NW}/val.policy`, panel: "proof", t: "7" });

    await page.locator(`.ps3-obj[data-node="${NW}/acq.auth"]`).click();
    await page.locator(`.ps3-obj[data-node="${NW}/xf.map"]`).click();
    await page.goBack();
    await expect.poll(() => state(page).then((s) => s.node)).toBe(`${NW}/acq.auth`);
    await page.goBack();
    await expect.poll(() => state(page).then((s) => s.node)).toBe(`${NW}/val.policy`);
    await page.goForward();
    await page.goForward();
    await expect.poll(() => state(page).then((s) => s.node)).toBe(`${NW}/xf.map`);
  });
});

test.describe("fallback and phone", () => {
  test("WebGL unavailable: the complete 2D flow works, with no three.js download", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(NO_WEBGL);
    const page = await ctx.newPage();
    const h = hygiene(page);
    await page.goto("/atlas");
    const flow = page.getByRole("group", { name: "Complete 2D flow" });
    await expect(flow).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
    await flow.getByRole("button", { name: /^Field mapping not reached/ }).first().click();
    await expect(page.getByRole("tab", { name: "Mapping Chamber" })).toHaveAttribute("aria-selected", "true");
    expect(h.requests.filter((u) => /three|2b8yi884w/.test(u) && u.includes("_next/static/chunks"))).toHaveLength(0);
    expect(await axe(page)).toEqual([]);
    await ctx.close();
  });

  test("phone: guided pipeline with readable text, 44 px targets and no overflow", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto("/atlas");
    const stage = page.getByTestId("tour-stage");
    await expect(stage).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Next →" }).tap();
    await expect(stage).toHaveAccessibleName("Stage 5 of 12: Field mapping");
    await expect(stage).toContainText("payload here");
    await expect(stage.getByRole("heading", { name: "Output" })).toBeVisible();
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("button, select, a[href], [role=tab]")]
        .filter((e) => e.getClientRects().length)
        .map((e) => ({ t: (e.textContent || "").trim().slice(0, 30), r: e.getBoundingClientRect() }))
        .filter(({ r }) => r.width < 44 || r.height < 44)
        .map(({ t, r }) => `${t} ${Math.round(r.width)}×${Math.round(r.height)}`),
    );
    expect(small).toEqual([]);
    const tiny = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>("body *")]
        .filter((e) => e.getClientRects().length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12)
        .map((e) => e.textContent!.trim().slice(0, 20)),
    );
    expect(tiny).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await page.getByRole("button", { name: "Complete flow" }).tap();
    await expect(page.getByRole("group", { name: "Complete 2D flow" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await ctx.close();
  });
});

test.describe("accessibility and hygiene", () => {
  for (const [w, h] of [[1440, 900], [390, 844]] as const) {
    test(`axe: every Atlas panel at ${w}×${h}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(w < 600 ? { isMobile: true, hasTouch: true } : {}) });
      const page = await ctx.newPage();
      const results: Record<string, string[]> = {};
      for (const [panel, q] of [["lens", ""], ["mapping", `&node=${NW}%2Fxf.map`], ["flight", "&t=5"], ["drift", "&drift=rename-detected-at"], ["proof", "&t=11"], ["gate", ""]]) {
        await page.goto(`/atlas?panel=${panel}${q}`);
        await expect(page.getByTestId("atlas-state")).toHaveAttribute("data-panel", panel!);
        await page.waitForTimeout(800);
        results[panel!] = await axe(page);
      }
      expect(results).toEqual({ lens: [], mapping: [], flight: [], drift: [], proof: [], gate: [] });
      await ctx.close();
    });
  }

  test("console and network are clean, /atlas/theatre is never requested, and no secret reaches the page", async ({ page }) => {
    const h = hygiene(page);
    await openAtlas(page);
    for (const panel of ["Source Lens", "Mapping Chamber", "Payload Flight", "Drift Shockwave", "Proof Corridor", "Activation Gate"]) {
      await page.getByRole("tab", { name: panel }).click();
      expect(await page.content()).not.toContain("CANARY");
    }
    await page.getByTestId("flight-play").click();
    await expect.poll(() => state(page).then((s) => s.t), { timeout: 20_000 }).toBe("11");
    expect(h.requests.filter((u) => u.includes("/atlas/theatre"))).toEqual([]);
    expect(h.requests.filter((u) => u.includes(":8000"))).toEqual([]); // contract-isolated: no incident API
    expect(h.issues).toEqual([]);
  });

  test("no horizontal overflow at any size", async ({ browser }) => {
    test.setTimeout(180_000); // four fresh browser contexts with WebGL
    for (const [w, h] of [[1440, 900], [1280, 800], [1024, 768], [390, 844]] as const) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const page = await ctx.newPage();
      await page.goto("/atlas?panel=mapping&node=northwind-edr-alerts%2Fxf.map");
      await page.waitForTimeout(1500);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${w}×${h}`).toBe(0);
      await ctx.close();
    }
  });
});
