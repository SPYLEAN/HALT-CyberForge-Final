// Configuration → connector plan. A plan is the ordered pipeline the dry run executes; compile errors say
// exactly which part of the configuration cannot work.
import { hashOf } from "./hash";
import { OCSF } from "./ocsf";
import type { CompileError, ConnectorConfig, Json, Plan, Stage } from "./types";

const OPS = new Set(["rename", "lowercase", "epoch_ms", "enum", "default", "drop"]);

export function compile(config: ConnectorConfig): Plan {
  const errors: CompileError[] = [];
  const target = OCSF[config.mapping.target];
  if (!target) errors.push({ where: "mapping.target", message: `Unknown target ${config.mapping.target}` });
  const written = new Set<string>(Object.keys(target?.constants ?? {}));

  for (const r of config.mapping.rules) {
    const where = `mapping.rules.${r.id}`;
    if (!OPS.has(r.op)) {
      errors.push({ where, message: `Unknown operation "${r.op}"` });
      continue;
    }
    if (r.op !== "default" && !r.from) errors.push({ where, message: `"${r.op}" needs a source field (from)` });
    if (r.op !== "drop") {
      if (!r.to) errors.push({ where, message: `"${r.op}" needs a target field (to)` });
      else if (target && !target.fields.includes(r.to)) errors.push({ where, message: `${r.to} is not a field of ${target.title}` });
      else written.add(r.to);
    }
    if (r.op === "enum" && !r.map) errors.push({ where, message: `"enum" needs a value map` });
    if (r.op === "default" && r.value === undefined) errors.push({ where, message: `"default" needs a value` });
  }
  for (const f of config.validation.required) {
    if (!written.has(f)) errors.push({ where: "validation.required", message: `${f} is required but no rule writes it` });
  }
  for (const d of config.destinations) {
    for (const f of d.requires) {
      if (!written.has(f)) errors.push({ where: `destinations.${d.id}`, message: `${d.title} requires ${f}, which no rule writes` });
    }
  }

  const stages: Stage[] = [
    { id: "source.fetch", zone: "source", kind: "source.fetch", title: config.source.kind === "webhook" ? "Webhook receiver" : "Source API" },
    { id: "acq.auth", zone: "acquisition", kind: "acq.auth", title: config.source.kind === "webhook" ? "Signature check" : "Authentication" },
    { id: "acq.paginate", zone: "acquisition", kind: "acq.paginate", title: config.source.pagination.type === "cursor" ? "Cursor pagination" : "Delivery batches" },
    { id: "acq.retry", zone: "acquisition", kind: "acq.retry", title: "Rate limit and retry" },
    { id: "xf.map", zone: "transformation", kind: "xf.map", title: "Field mapping" },
    { id: "xf.normalize", zone: "transformation", kind: "xf.normalize", title: "OCSF normalisation" },
    { id: "val.schema", zone: "validation", kind: "val.schema", title: "Schema validation" },
    { id: "val.policy", zone: "validation", kind: "val.policy", title: "Policy checks" },
    { id: "val.dedupe", zone: "validation", kind: "val.dedupe", title: "Deduplication" },
    ...config.destinations.map<Stage>((d) => ({ id: d.id, zone: "destination", kind: "dst.deliver", title: d.title, destination: d })),
  ];
  return {
    connector: config,
    config_hash: hashOf(config as unknown as Json),
    mapping_hash: hashOf(config.mapping as unknown as Json),
    stages,
    errors,
  };
}
