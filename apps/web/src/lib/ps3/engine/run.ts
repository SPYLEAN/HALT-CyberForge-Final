// The dry run: execute a plan against recorded exchanges. Pure and deterministic: the same plan and recording
// always give the same trace and digest. Nothing is sent anywhere; destination acceptance is simulated.
import { hashOf, sha256 } from "./hash";
import { OCSF } from "./ocsf";
import { clone, getPath, leafPaths, setPath } from "./paths";
import { redactRecording } from "./redact";
import type { Json, JsonObject, PageEvent, Plan, Recording, RecordTrace, RetryEvent, RuleResult, Step, StepStatus, Trace } from "./types";

interface RawRecord {
  raw: JsonObject;
  page: number; // index into pages
}

function cursorOf(url: string, param?: string): string | null {
  if (!param) return null;
  return new URL(url).searchParams.get(param);
}

function acquire(plan: Plan, rec: Recording) {
  const src = plan.connector.source;
  const xs = [...rec.exchanges].sort((a, b) => a.seq - b.seq);
  const pages: PageEvent[] = [];
  const retries: RetryEvent[] = [];
  const records: RawRecord[] = [];
  let auth: Trace["auth"] = { ok: false, evidence: ["No authentication exchange recorded"], at: null };

  if (src.kind === "webhook") {
    const checked = xs.filter((x) => x.request.headers["x-signature-check"] === "passed").length;
    auth = {
      ok: checked === xs.length && xs.length > 0,
      evidence: [
        `Signature check ${checked === xs.length ? "passed" : "failed"} for ${checked} of ${xs.length} recorded deliveries (checked at capture)`,
        `Signing key held at ${src.auth.secret_ref}; its value never leaves the vault`,
      ],
      at: xs[0]?.at ?? null,
    };
    xs.forEach((x) => {
      const items = getPath(x.request.body, src.records_field);
      const list = Array.isArray(items) ? (items as JsonObject[]) : [];
      pages.push({ seq: x.seq, at: x.at, cursor_in: null, cursor_out: null, records: list.length });
      list.forEach((r) => records.push({ raw: r, page: pages.length - 1 }));
    });
    return { auth, pages, retries, records };
  }

  const token = xs.find((x) => x.request.method === "POST" && getPath(x.request.body, "grant_type") !== undefined);
  if (token) {
    const ok = token.response.status === 200;
    const scope = getPath(token.response.body, "scope");
    const expires = getPath(token.response.body, "expires_in");
    auth = {
      ok,
      evidence: ok
        ? [`Token issued (${new URL(token.request.url).host}, seq ${token.seq}) for scope ${String(scope)}; expires in ${String(expires)} s; value redacted`, `Client secret held at ${src.auth.secret_ref}`]
        : [`Token request failed with HTTP ${token.response.status} (seq ${token.seq})`],
      at: token.at,
    };
  }
  const gets = xs.filter((x) => x.request.method === "GET");
  gets.forEach((x, i) => {
    if (x.response.status >= 400) {
      const next = gets.slice(i + 1).find((y) => y.request.url === x.request.url);
      const ra = x.response.headers["retry-after"];
      retries.push({ seq: x.seq, at: x.at, status: x.response.status, retry_after_s: ra ? Number(ra) : null, then: next?.seq ?? null });
      return;
    }
    const items = getPath(x.response.body, src.records_field);
    const list = Array.isArray(items) ? (items as JsonObject[]) : [];
    const out = src.pagination.cursor_field ? getPath(x.response.body, src.pagination.cursor_field) : null;
    pages.push({ seq: x.seq, at: x.at, cursor_in: cursorOf(x.request.url, src.pagination.cursor_param), cursor_out: typeof out === "string" ? out : null, records: list.length });
    list.forEach((r) => records.push({ raw: r, page: pages.length - 1 }));
  });
  return { auth, pages, retries, records };
}

function applyRules(plan: Plan, raw: JsonObject): { out: JsonObject; rules: RuleResult[] } {
  const out: JsonObject = {};
  const rules = plan.connector.mapping.rules.map<RuleResult>((rule) => {
    const input = rule.from ? getPath(raw, rule.from) : undefined;
    const missing = rule.op !== "default" && (input === undefined || input === null);
    if (rule.op === "drop") return { rule, status: "dropped", input, output: undefined };
    if (missing) return { rule, status: rule.required ? "unmapped-required" : "missing-optional", input, output: undefined };
    let output: Json | undefined;
    let status: RuleResult["status"] = "converted";
    switch (rule.op) {
      case "rename":
        output = input;
        status = "renamed";
        break;
      case "lowercase":
        output = typeof input === "string" ? input.toLowerCase() : undefined;
        break;
      case "epoch_ms": {
        const ms = typeof input === "string" ? Date.parse(input) : Number.NaN;
        output = Number.isFinite(ms) ? ms : undefined;
        break;
      }
      case "enum":
        output = rule.map?.[String(input)];
        break;
      case "default":
        output = rule.value ?? null;
        status = "defaulted";
        break;
    }
    if (output === undefined) return { rule, status: "invalid", input, output: undefined };
    setPath(out, rule.to!, output);
    return { rule, status, input, output };
  });
  return { out, rules };
}

const typeOk = (v: Json | undefined, t: "integer" | "string") => (t === "integer" ? Number.isInteger(v) : typeof v === "string");

export function dryRun(plan: Plan, recording: Recording): Trace {
  const rec = redactRecording(recording);
  const cfg = plan.connector;
  const { auth, pages, retries, records } = acquire(plan, rec);
  const seen = new Map<string, string>();
  const used = cfg.mapping.rules.map((r) => r.from).filter((f): f is string => Boolean(f));
  const target = OCSF[cfg.mapping.target];

  const traces = records.map<RecordTrace>(({ raw, page }) => {
    const steps: Step[] = [];
    let stopped = false;
    let current: Json = raw;
    const push = (stage_id: string, status: StepStatus, after: Json, evidence: string[]) => {
      const before = current;
      const s: StepStatus = stopped ? "skipped" : status;
      const out = stopped ? current : after;
      steps.push({ stage_id, status: s, before, after: out, evidence: stopped ? ["Not reached: an earlier stage stopped this record"] : evidence, hash: hashOf(out) });
      if (!stopped) current = out;
      if (s === "failed" || s === "duplicate") stopped = true;
    };
    const p = pages[page]!;
    const id = String(getPath(raw, cfg.mapping.rules.find((r) => r.required && r.op === "rename")?.from ?? "") ?? "unknown");

    push("source.fetch", "ok", raw, [`Received in ${cfg.source.kind === "webhook" ? "delivery" : "page"} seq ${p.seq} at ${p.at}`]);
    push("acq.auth", auth.ok ? "ok" : "failed", raw, auth.evidence);
    push(
      "acq.paginate",
      "ok",
      raw,
      cfg.source.pagination.type === "cursor"
        ? [`Page ${page + 1} of ${pages.length}`, `Cursor in: ${p.cursor_in ?? "none (first page)"} · cursor out: ${p.cursor_out ?? "none (last page)"}`]
        : [`Delivery ${page + 1} of ${pages.length} (webhook push, no pagination)`],
    );
    const before = retries.filter((r) => r.then === p.seq);
    push(
      "acq.retry",
      before.length < cfg.source.retry.max_attempts ? "ok" : "failed",
      raw,
      before.length
        ? before.map((r) => `HTTP ${r.status} at seq ${r.seq}${r.retry_after_s !== null ? `, retry-after ${r.retry_after_s} s` : ""}; retried as seq ${r.then} (attempt ${before.length + 1} of ${cfg.source.retry.max_attempts})`)
        : [`No retry needed · limit ${cfg.source.rate_limit.requests_per_minute} requests/min`],
    );

    const { out, rules } = applyRules(plan, raw);
    const bad = rules.filter((r) => r.status === "unmapped-required" || (r.status === "invalid" && r.rule.required));
    push(
      "xf.map",
      bad.length ? "failed" : "ok",
      out,
      bad.length
        ? bad.map((r) => `${r.rule.id} ${r.status === "invalid" ? "cannot convert" : "has no input for required"} ${r.rule.from ?? ""} → ${r.rule.to ?? ""}${r.input !== undefined ? ` (value ${JSON.stringify(r.input)})` : ""}`)
        : [`${rules.filter((r) => r.status !== "dropped" && r.output !== undefined).length} fields written, ${rules.filter((r) => r.status === "dropped").length} dropped`],
    );

    const norm = clone(out);
    Object.entries(target.constants).forEach(([k, v]) => setPath(norm, k, v));
    push("xf.normalize", "ok", norm, [`${target.title}: ${Object.entries(target.constants).map(([k, v]) => `${k}=${String(v)}`).join(", ")}`]);

    const missing = cfg.validation.required.filter((f) => getPath(norm, f) === undefined);
    const wrongType = Object.entries(cfg.validation.types).filter(([f, t]) => getPath(norm, f) !== undefined && !typeOk(getPath(norm, f), t));
    push(
      "val.schema",
      missing.length || wrongType.length ? "failed" : "ok",
      norm,
      missing.length || wrongType.length
        ? [...missing.map((f) => `Missing required ${f}`), ...wrongType.map(([f, t]) => `${f} is not ${t === "integer" ? "an integer" : "a string"}`)]
        : [`${cfg.validation.required.length} required fields present; ${Object.keys(cfg.validation.types).length} types correct`],
    );

    const violations = cfg.validation.policies.filter((pol) => getPath(norm, pol.field) !== undefined);
    push(
      "val.policy",
      violations.length ? "failed" : "ok",
      norm,
      violations.length ? violations.map((v) => `${v.id} violated: ${v.field} present`) : cfg.validation.policies.map((v) => `${v.id} passed: ${v.title}`),
    );

    const key = String(getPath(norm, cfg.validation.dedupe_key) ?? "");
    const first = seen.get(key);
    if (!first && !stopped) seen.set(key, `seq ${p.seq}`);
    push("val.dedupe", first ? "duplicate" : "ok", norm, first ? [`Duplicate of ${key}, first received in ${first}; not delivered again`] : [`Key ${cfg.validation.dedupe_key} = ${key} is new`]);

    const recordHash = hashOf(norm);
    cfg.destinations.forEach((d) => {
      const lacks = d.requires.filter((f) => getPath(norm, f) === undefined);
      if (stopped) return push(d.id, "skipped", norm, []);
      const ack = `sim-ack-${sha256(d.id + recordHash).slice(0, 12)}`;
      steps.push({
        stage_id: d.id,
        status: lacks.length ? "failed" : "ok",
        before: norm,
        after: lacks.length ? norm : { ack, simulated: true },
        evidence: lacks.length ? lacks.map((f) => `${d.title} requires ${f}, which this record does not have`) : [`Accepted · ${ack} (SIMULATED acknowledgement)`],
        hash: hashOf(lacks.length ? norm : { ack, simulated: true }),
      });
    });

    const dst = steps.filter((s) => s.stage_id.startsWith("dst."));
    const outcome: RecordTrace["outcome"] = steps.some((s) => s.status === "duplicate")
      ? "duplicate"
      : stopped
        ? "rejected"
        : dst.every((s) => s.status === "ok")
          ? "delivered"
          : dst.some((s) => s.status === "ok")
            ? "partial"
            : "rejected";
    const ignored = leafPaths(raw).filter((f) => !used.some((u) => f === u || f.startsWith(`${u}.`)));
    return { source_id: id, page, steps, rules, outcome, ignored_fields: ignored };
  });

  const digest = sha256(traces.flatMap((t) => t.steps.map((s) => s.hash)).join(""));
  return { plan, captured_at: rec.captured_at, auth, pages, retries, records: traces, digest };
}
