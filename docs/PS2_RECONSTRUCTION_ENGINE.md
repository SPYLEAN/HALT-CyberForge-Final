# PS2 reconstruction engine

> **Status: Implementation Pass 1 (backend only).** The engine takes raw security logs and builds an
> evidence-backed ThreadGraph, ranked attack paths, a cited story and a receipt. No frontend uses it yet. All
> data is synthetic. The engine version is `halt.ps2.engine/1.0.1` (1.0.1 adds service criticality to graph nodes; no algorithm change) and the code lives in
> `services/api/halt/ps2/`.

The existing incident flow (`halt.scenario`, SafeCut, ProofSeal, Action Gate, audit) is unchanged. The
authored scenario is still the compatibility fallback, and PS2 runs beside it under `/api/v1/ps2`.

## Pipeline

```
raw files (JSON / JSONL / CSV)
  └─ intake: adapter → parse → map → redact preview → CanonicalEvent         intake/
       └─ R1 anomaly (unchanged scorer) + scenario-independent rules → seeds    r1_bridge.py, seeds.py
            └─ entity resolution (exact, aliases, contradictions)               resolve.py
                 └─ candidate causal edges (noisy-OR of evidence components)    edges.py
                      └─ reduction to the suspicious semantic graph             reduce.py
                           └─ ranked root→leaf paths, alternates, rejected      paths.py
                                └─ ATT&CK mapping + Attack Flow-shaped export   attack.py
                                     └─ deterministic cited story + checker     story.py
                                          └─ receipt (replay id, hashes)        engine.py
```

The engine never reads ground truth. Datasets (`datasets/<id>/`) contain only raw files, a manifest and an
organisation context. Ground truth sits in `ground_truth/<id>.json`, and only `evaluate.py` reads it.
`tests/test_ps2_reconstruct.py` enforces this by AST inspection of every inference module. No LLM is used
anywhere in graph construction or story generation.

## Phase A: intake

| Adapter | Format | Content types | Source shape (synthetic, vendor-like) |
|---|---|---|---|
| `idp_signin` | jsonl | `application/x-ndjson`, `application/jsonl` | identity-provider sign-in log |
| `idp_audit` | json (`value` envelope) | `application/json` | directory audit (MFA, consent, credentials, roles) |
| `mail_trace` | csv | `text/csv` | mail delivery trace |
| `api_activity` | jsonl | as jsonl | SaaS API / file activity |
| `cloud_audit` | json (`Records` envelope) | `application/json` | cloud control-plane audit |
| `process` | jsonl | as jsonl | process creation (Sysmon EventID 1-like) |
| `db_audit` | csv | `text/csv` | database audit |

- Each record is parsed on its own. A malformed line, a CSV row with the wrong column count, a non-object JSON
  value, NaN or Infinity, or a missing required field becomes a **rejected record** with an issue code, its
  hash and a redacted preview. It never stops the batch. Identical records are ingested once (`duplicate_record`).
- `raw_sha256` is SHA-256 of the canonical JSON of the parsed record, so key order and whitespace do not
  matter. `event_id = "ce-" + sha256(adapter_id | raw_sha256)[:20]`. The same record always gets the same id.
- Previews are at most 240 characters, after redaction by key name (password, secret, token, authorization,
  api key, …), by value pattern (bearer values, JWT-shaped strings, access-key ids) and by `key=value` secrets
  in free text. Identifiers such as token ids and session ids are kept, because they are evidence.
- A timestamp without a timezone is taken as UTC and the record is marked `normalised_with_warnings`
  (`timezone_assumed`).

## Phase B: canonical event model (`halt.canonical/1.0`)

`CanonicalEvent` (`schema.py`) is versioned (`canonical_schema`), frozen and `extra=forbid`. Its fields:

- **Required:** `event_id`, `occurred_at` (timezone-aware), `source_type`, `source_name`, `event_kind` (14
  kinds: email_delivery, authentication, mfa_method_change, app_consent, credential_change, token_issued,
  token_use, role_assumption, permission_change, resource_enumeration, resource_access, access_denied,
  process_start, database_query), `outcome`, `evidence` (source name, record id, line, raw hash, parser) and
  `raw_sha256`.
- **Typed optional:** actor (`actor_user`, `actor_kind`, `actor_alias`), target user, IPs and ASN, user agent,
  device, host, session, token, `token_issued`, application, process and parent process, resource and its
  type, business service, request count and window, scopes, publisher verification, app age, credential type,
  interactivity, link type, sender domain and age, role, permission, ATT&CK candidates and anomaly score.

Field names follow OCSF naming where practical. **This is not an OCSF implementation and does not claim OCSF
compliance.** `OrgContext` (assets, business services and dependencies, internal and known-egress CIDRs,
managed hosts, service accounts) is an input. It is never derived from ground truth.

## Phase C: entity resolution (`halt.resolve/1.0`)

- Resolution uses exact, normalised identifiers only; there is no fuzzy matching. Entity ids look like
  `user:<upn>`, `session:<id>` and `token:<id>`.
- A second identifier seen in the same record (a UPN alias, a device name beside a device id) becomes an
  **alias**, with the events that showed them together. Entities are never merged silently.
- A **contradiction** is a value that should be single-valued but is not: a session or token used by two
  actors, a device id with two names, or an alias claimed by two users. Contradictions are recorded with their
  events.
- Confidence: 1.0 for exact, 0.95 with an alias, 0.6 with a contradiction.

## Phase D: candidate causal edges (`halt.edges/1.0`)

An edge e1 → e2 requires e1 to be strictly earlier, with ties broken by event id. The event graph is therefore
a DAG by construction. Candidate pairs come from shared session, shared token, token lineage (minted → used),
parent/child process, application granted → used, mail recipient → sign-in, same identity within a window, and
each event's nearest two same-identity successors.

Confidence is a **noisy-OR** of weighted components: `1 − Π(1 − wᵢ·vᵢ)`. Every weight and window is in
`reconstruction_config.json`, and its SHA-256 goes into the receipt.

| Group | Components (weight) | Edge class |
|---|---|---|
| Exact identifier | shared_session (.90), token_lineage (.95), shared_token (.85), parent_child_process (.90), shared_application (.60) | `observed` |
| Identity + context, decayed by `exp(−Δt/τ)`, τ = 1800 s | identity_device (.55), identity_ip (.50), email_recipient_auth (.50) | `inferred` |
| Supporting only | temporal_succession (.25), stage_transition (.15), anomaly_continuity (.10) | — |

- **Temporal proximity alone never makes a causal link.** An edge with only supporting components is capped
  at `temporal_only_cap = 0.30`, below the selection threshold of 0.50.
- If the shared entity has a contradiction, confidence is multiplied by `1 − contradiction_penalty` (0.65) and
  a `contradiction` component is recorded.

## Phase E: suspicious semantic graph

Seeds are events whose suspicion is at least 0.5. Suspicion combines the scenario-independent rules in
`seeds.py`, weighted in config, with the unchanged HALT-R1 model score:

- external sign-in from a new ASN;
- a young sender domain with a link;
- MFA registered shortly after sign-in;
- consent from an unverified or young app with high-privilege scopes;
- token use from a different ASN or device;
- enumeration above a rate;
- denied access to a critical asset;
- privilege grants, wildcard policies;
- service-account interactive or external use;
- an access burst on a critical resource.

R1 scores only the human-identity event kinds it was trained on. Service, cloud, process and database events
get no anomaly score (`None`), never a guessed one. A known corporate egress range lowers both the rule score
and the model score by `known_egress_suppression` (0.6, floored at 0). Context can lower suspicion, never
raise it.

Relevance spreads from the seeds over edges at or above the threshold: up to 4 hops, multiplied by edge
confidence and a 0.85 per-hop decay. Events below 0.35 relevance are dropped from the graph. Edges below the
threshold, temporal-only edges and edges with an irrelevant endpoint are kept as **rejected hypotheses**, each
with a reason (for example "temporal proximity only"), and returned by `/hypotheses`.

## Phase F: ranked paths

Paths run root → leaf over selected edges. They are found by DFS, bounded by `max_paths = 400` and
`max_path_hops = 14`. The score is a weighted sum (`path_weights` in config) of:

| Component | Weight |
|---|---|
| mean edge confidence | .22 |
| seed coverage | .22 |
| entity continuity | .12 |
| ATT&CK progression | .12 |
| anomaly | .10 |
| evidence diversity | .08 |
| critical reach | .08 |
| temporal coherence | .06 |

The sum is then reduced by two penalties: contradictions (.15) and unsupported hops (.10).

The top path is `selected`. The next three are `alternate` and carry a rejection reason with the score gap.
The rest are `rejected`. Every path lists `missing_evidence` (for example "no evidence links this root to an
earlier event") and `unsupported_hops`. The receipt's `uncertainty` gives the score margin to the best
alternate, the minimum edge confidence, the number of inferred hops and the coverage gaps.

## Phase G: ATT&CK and Attack Flow

Every event on a kept path gets technique candidates, each with a `basis`:

- `observed`: the record itself evidences the technique (for example an MFA-method registration, T1556.006).
- `rule_inferred`: a named rule concluded it from context (for example consent by an unverified app, T1528).
- `uncertain`: one of several plausible techniques.

The primary technique is chosen by basis first, then by rule order. `attack_flow()` writes a STIX 2.1 bundle in
the **shape** of a MITRE CTID Attack Flow: deterministic uuid5 ids, `attack-action` objects in path order, and
an `x_halt_conformance` field. `validate_flow_shape()` checks only the structure; the bundle has **not** been
validated against the official Attack Flow schema.

## Phase H: story

Statements are rendered from fixed templates per event kind, in sections: `observed`, `inferred`,
`missing_evidence` and `forecast`. Each statement carries `event_ids`, `edge_ids`, `confidence`, `status` and a
`facts` map (`event:<id>:<field>`, `edge:<id>:<attr>`, `stage:<id>`, `context:<service>`).

`story.check()` re-derives every fact from the cited events, edges, stages and context. A claim is counted as
unsupported unless the re-derived value appears verbatim in the text. `unsupported_claims` is 0 on both
scenarios, and a test shows that a tampered statement is caught. Forecast statements come from the context's
`depends_on` graph (hop confidence 0.6, at most 2 hops, high or critical services only) and are always
labelled forecast, never observed.

## Phase L: receipt and determinism

`replay_id = sha256(sorted input hashes, context sha, config sha, ENGINE_VERSION)` and
`run_id = "run-" + replay_id[:16]`. `graph_hash` covers nodes, edges and forecast edges. `processing_ms` is
excluded from both hashes.

The receipt also records the adapter versions, the selected and alternate path ids, and two coverage figures:

- `evidence_coverage`: the share of selected-path hops classified `observed`. On scenario A this is 5/6,
  because the mail → sign-in hop is inferred.
- `story_citation_coverage`.

Fixture mode uses the dataset's declared `captured_at` as the ingestion time, so a fixture batch reproduces
byte-for-byte. A property test (hypothesis) shuffles the records within every file and the file order, and
checks that the event set, selected path, candidate edges and confidences, selected edges and story text do not
change.

## Phase K: API (`/api/v1/ps2`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/datasets` | bundled synthetic datasets (fixture mode) |
| POST | `/ingestions` | `{dataset_id}` **or** `{files[], context}`; returns an `IngestionResult` with per-record reports |
| GET | `/ingestions/{batch_id}` | the ingestion report |
| GET | `/ingestions/{batch_id}/events` | canonical events, `offset` / `limit` (≤ 500) |
| POST | `/reconstructions` | `{batch_id}` → `ReconstructionSummary` |
| GET | `/reconstructions/{run_id}` | summary |
| GET | `…/graph` · `…/story` · `…/hypotheses` · `…/receipt` | ThreadGraph, cited story, alternates and rejected hypotheses, receipt |
| GET | `…/attack-flow` | Attack Flow-shaped bundle |
| GET | `…/evaluation` | measured metrics; 404 when the dataset has no ground truth (uploads never do) |

Request safety:

- JSON bodies only. There is no multipart and **no URL fetching**: an unknown `url` field is rejected by
  `extra=forbid`.
- A `Content-Length` guard runs before parsing (5 MB batch + 256 KB envelope → 413).
- Per-file limit 2 MB → 413 `file_too_large`; at most 10 files; at most 20,000 records per file.
- Adapter allow-list (422 `unknown_adapter`); content type must match the adapter's format
  (415 `unsupported_content_type`).
- Filenames must match `^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$`, so there are no separators or traversal. Dataset ids
  are pattern-checked.
- Errors use the existing `ApiError` shape.
- Batches and runs live in a bounded in-memory LRU of 32 entries. A restart clears them; fixtures reproduce
  identically.

Metrics are attached to a receipt only for bundled datasets with ground truth, and they are computed **outside
the engine**, in the API layer.

## Scenario Foundry

`python -m halt.ps2.foundry` writes both datasets; `--check` fails on drift, and a test runs that check. Seeds
are fixed.

| | Scenario A (seed 2417) | Scenario B (seed 7310) |
|---|---|---|
| Story | OAuth consent phishing against Finance Operations | service-account abuse in a cloud data platform |
| Sources | mail trace (csv), sign-in (jsonl), directory audit (json), API activity (jsonl) | sign-in (jsonl), cloud audit (json), process (jsonl), DB audit (csv) |
| Records | 215 (213 accepted, 2 malformed on purpose) | 113 accepted |
| Distractors | VPN-egress sign-in, ambiguous MFA change, young-domain marketing mail, legitimate consent | hourly automation (with a CANARY secret that must never appear), CI, admin, dev, a sub-threshold listing burst |
| Selected path (7 events) | mail → sign-in → MFA → consent → token replay → enumeration → denied ledger access | SP secret sign-in → assume role → wildcard policy → list bucket → get object → mint DB token → payroll query |
| Selected edges | 10 | 19 |
| Affected / forecast service | Finance ledger, Month-end close / Finance ledger | Payroll / Payments |

## Configuration and tuning disclosure

The weights were set by hand. Two were adjusted while looking at scenario A:

- the `email_recipient_auth` weight was raised to 0.50, from a value that left the mail → sign-in edge at
  0.48;
- scenario A's phishing mail was moved to 09:33:40, inside the decay window.

Both scenarios were designed alongside the engine. See `PS2_MEASURED_RESULTS.md` for what this means for the
metrics.

## Known limitations

- Synthetic data only. The adapters model vendor-like shapes and have not been tested against real exports.
- Entity resolution is exact-match only. It does not resolve people across unrelated identifiers.
- Path enumeration is bounded, so very dense graphs are truncated at `max_paths`.
- The near-tie on scenario B (score margin 0.0036 to the best alternate) means small weight changes could
  reorder the top paths there.
- Rejection reasons print confidence to 2 decimal places, so a 0.4999 edge reads as "0.50 below the threshold
  0.50".
- The Attack Flow output is shape-checked only.
- The in-memory store is not shared across workers.
