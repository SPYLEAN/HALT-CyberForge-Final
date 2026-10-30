# PS3 data contracts (prototype, contract-isolated)

All types live in `apps/web/src/lib/ps3/engine/types.ts`. They are **client-side contracts** (assumption A-1
in `PS3_PRODUCT_RFC.md`); the FastAPI OpenAPI contract is unchanged, and no generated file is touched.

## ConnectorConfig (`schema: "halt.connector/v0"`)

| Field | Type | Notes |
|---|---|---|
| `id`, `version`, `title` | string | `version` is semver; it appears in every receipt |
| `source.kind` | `rest_api` \| `webhook` | |
| `source.endpoint` | string | `.example` domains only (A-4) |
| `source.auth` | `{ type, secret_ref, scopes? }` | `type`: `oauth2_client_credentials`, `api_key_header`, `hmac_signature`. **`secret_ref` is a reference, never a value** |
| `source.pagination` | `{ type: "cursor" \| "none", cursor_param?, cursor_field?, page_size? }` | |
| `source.rate_limit` | `{ requests_per_minute }` | |
| `source.retry` | `{ max_attempts, backoff: "exponential", base_ms }` | |
| `mapping` | `{ version, target, rules: MappingRule[] }` | `target`: `ocsf.detection_finding` \| `ocsf.authentication` |
| `validation` | `{ required[], types{}, dedupe_key, policies[] }` | policy rule: `no_field` |
| `destinations` | `{ id, kind, title, requires[] }[]` | `kind`: `api` \| `queue` \| `store` |

### MappingRule

| `op` | Meaning | Status shown |
|---|---|---|
| `rename` | copy `from` to `to` | renamed |
| `lowercase` | string, lowercased | converted |
| `epoch_ms` | ISO-8601 → integer milliseconds | converted |
| `enum` | look up `map[value]` | converted; **invalid** when the value is not in the map |
| `default` | constant `value` into `to` | defaulted |
| `drop` | remove `from` from the output | dropped |

A rule with `required: true` whose source value is missing is **unmapped-required**: the record fails at the
mapping stage with that rule as evidence.

## Recorded exchanges (`fixtures/ps3/exchanges/*.json`)

`{ connector_id, captured_at, exchanges: [{ seq, at, request: { method, url, headers }, response: { status, headers, body } }] }`.
Request headers may contain a credential **in the recorded file**; `redactExchange()` replaces every value of
`authorization`, `x-api-key`, `x-signature`, `cookie`, and any key matching `/secret|token|password/i` with
`[redacted]` before anything else reads it. A canary value in the fixture proves this (unit + E2E test).

## Plan (compiler output)

`{ connector_id, config_hash, mapping_hash, stages: Stage[] }`, `Stage = { id, zone, kind, title }`.
Zones: `source`, `acquisition`, `transformation`, `validation`, `destination`.
Stages, in order: `source.fetch`, `acq.auth`, `acq.paginate`, `acq.retry`, `xf.map`, `xf.normalize`,
`val.schema`, `val.policy`, `val.dedupe`, then one `dst.<id>` per destination.
Compile errors: unknown `op`, rule writing an OCSF field the target does not declare, `required` field with no
rule that writes it, destination requirement no rule can satisfy.

## Trace (dry-run output)

`{ plan, records: RecordTrace[], pages, retries, digest }`.
`RecordTrace = { source_id, steps: Step[], outcome: "delivered" | "partial" | "rejected" | "duplicate" }`.
`Step = { stage_id, status: "ok" | "failed" | "skipped", before, after, evidence: string[], hash }`.
`hash` = SHA-256 of the canonical JSON (sorted keys) of `after`. `digest` = SHA-256 over all step hashes.
Destination acceptance is **simulated**: `ack` = `sim-ack-` + the first 12 hex of SHA-256(destination id +
record hash). It is labelled SIMULATED wherever shown.

## Drift

`DriftScenario = { id, title, op: "rename" | "remove", field, to? }` (fixture).
`analyseDrift(config, exchanges, scenario)` → `{ affected_rules[], failed_validations[], broken_destinations[],
unaffected_destinations[], repair: RepairDraft | null, before: Trace, after: Trace }`.
A `RepairDraft` (rename only) is proposed **only** when exactly one new field carries the removed field's
value in every record; otherwise `repair` is `null` and the reason is stated.

## Receipt

`{ id: "IR-" + 12 hex, connector_id, config_version, config_hash, mapping_version, mapping_hash, digest,
records: { delivered, partial, rejected, duplicate }, destinations: { id, accepted, rejected }[], retries, simulated: true }`.

## Scene model

`toScene(plan(s), trace, drift, selection, t)` → `{ nodes: SceneNode[], edges: SceneEdge[], packet }`.
Pure and deterministic (unit-tested): same inputs, same positions, statuses and packet location.
`SceneNode.status`: `idle` \| `passed` \| `active` \| `failed` \| `drift` \| `receded`, always paired with a text label.

## URL state (`/atlas`)

`?connector=<id>&node=<stage or connector id>&panel=lens|mapping|flight|drift|proof|gate&t=<step>&record=<n>&drift=<scenario id>`.
Restoring a URL reproduces the same selection, step and drift (tested).
