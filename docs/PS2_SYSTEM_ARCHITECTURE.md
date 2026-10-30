# PS2 system architecture

> **Status: PROVISIONAL.** Components marked **EXISTS** are on `frontend-rebirth/god-mode`; **NEW** must be built;
> **EXTEND** changes an existing module. No backend contract is changed by this document.

## 1. Pipeline

```
raw logs (upload | replay)
  → A  source adapters          NEW   halt/intake/adapters/*.py
  → B  normalisation            NEW   halt/intake/normalise.py → CanonicalEvent
  → C  entity resolution        NEW   halt/resolve/
  → D  temporal correlation     EXTEND halt/r1 (scoring) + NEW halt/correlate/edges.py (edge inference)
  → E  ThreadGraph              EXTEND halt/threadgraph (graph built from D, not topology.json)
  → F  ATT&CK mapping           EXTEND halt/r1/attack_map.py → evidence-scored
  → G  Attack Story             EXTEND halt/explain (sentence-level citations, refusal)
  → H  EchoLab forecast         EXISTS halt/echolab (+ calibration evaluation)
  → I  SafeCut                  EXISTS halt/safecut
  → J  ProofSeal                EXTEND halt/proofseal (+ reconstruction claims)
  → K  Action Gate              EXISTS halt/gate
```

Business context (critical services, criticality, users, deadlines) is **organisation context**, not attacker
evidence: it stays a curated input (`topology.json` → `org_context.json`), and the graph marks which nodes and
edges come from context versus logs.

## 2. A. Ingestion

| Source family | Scenario A format (proposed) | Scenario B | Notes |
|---|---|---|---|
| Identity (sign-ins) | Entra-style sign-in JSON lines | yes | user, IP, device id, session id, result, MFA detail |
| OAuth / app audit | Entra-style audit JSON (consent, MFA method added) | yes | app id, scopes, actor |
| Endpoint | Sysmon-style XML/JSON (process, network) | yes | host, user, process, parent |
| Cloud | M365/Graph activity or CloudTrail-style JSON | yes | resource, operation, token id |
| Network | Zeek-style `conn.log` TSV | optional | src/dst IP, ports, bytes |
| Mail | message-trace CSV | A only | sender, recipient, URL click |

- **Batch upload** (`POST /api/v1/intake/batches`, multipart, size and type limits) and **replay mode** (existing
  replay stream, now fed from parsed logs). Streaming: interface designed (`IntakeSink` protocol), not built.
- **Malformed data:** each adapter returns `ParsedRecord | Quarantined(reason, line, raw_hash)`. Quarantine is
  counted per source and shown; nothing is dropped silently.
- **Missing telemetry:** a source declared but absent is a recorded gap ("no endpoint telemetry for host X"),
  which lowers edge confidence instead of being ignored.
- **Provenance:** every record keeps `source_system`, `source_file`, `line_no`, `raw_sha256`, `ingested_at`.

## 3. B. Normalisation

`CanonicalEvent` (internal, OCSF-aligned names where practical):

| Field | Note |
|---|---|
| `event_uid` | deterministic: `sha256(source_system ‖ raw_sha256)` → stable across replays |
| `tenant_id` | required; single tenant in the demo |
| `time` (UTC, ms) + `time_original` | timestamps normalised; skew between sources recorded |
| `class` | OCSF class name (Authentication, Account Change, API Activity, Process Activity, Network Activity, Email Activity) |
| `actor`, `device`, `src_ip`, `session_id`, `token_id`, `app_id`, `resource` | raw identifiers before resolution |
| `raw_ref` | pointer to the preserved original record |

Original evidence is **never mutated**; normalised events reference it.

## 4. C. Entity resolution

Entity types: user, device, IP, session, token, application, API, cloud service, database, business service.

Method (deterministic, ordered): exact identifier match → normalised identifier match (UPN case, device FQDN/short
name) → co-occurrence rules (same session id ⇒ same user + device; token issued in session ⇒ token belongs to that
session). No fuzzy name matching in the hackathon scope.

Every resolution and relationship carries: `evidence` (event UIDs), `method` (rule id), `confidence` (rule-defined,
0–1), `first_seen`, `last_seen`.

## 5. D. Temporal correlation

Candidate edges are generated from deterministic relations and scored:

| Signal | Edge it supports | Strength |
|---|---|---|
| shared session id | user → session, session → resource | deterministic |
| token lineage (issued → used) | consent → token → replay | deterministic |
| same IP / device within window | sign-in ↔ endpoint activity | statistical (window, rarity) |
| resource-access transition | resource A → resource B | statistical |
| ATT&CK transition prior | stage n → stage n+1 | prior only (never sufficient alone) |
| asset reachability (org context) | resource → critical service | context |

An edge is **accepted** when its combined score ≥ threshold *and* it has ≥ 1 deterministic or ≥ 2 independent
statistical signals. Otherwise it is kept as a **rejected hypothesis** with its reason. The R1 event scorer
(logistic regression) decides which events are relevant; it does not create edges. **No LLM participates.**

## 6. E. ThreadGraph

Node/edge provenance classes, all carried in the existing `GraphEdge` evidence fields (contract unchanged where
possible; any contract change goes through the HANDOFF regeneration commands):

| Class | Meaning | Visual |
|---|---|---|
| observed | supported by deterministic evidence | solid |
| inferred | accepted on statistical evidence | dashed, confidence shown |
| forecast | EchoLab only, not observed | violet dashed |
| rejected | below threshold; kept for audit | hidden by default, listed |
| context | business dependency from org context | continuity thread |

Existing algorithms (time-sliced snapshots, maximal path enumeration, cuts) run unchanged on the reconstructed graph.

## 7. F. ATT&CK mapping

Technique candidates per event from (a) the existing kind table as a prior, (b) field evidence (e.g. MFA method
added by non-owner session), (c) sequence position. Output: technique id, tactic, confidence, evidence UIDs.
Unknown ⇒ "unmapped" (never guessed).

## 8. G. Attack Story

Sentence templates per stage; each sentence object = `{text, cited_event_uids[], confidence}`. A checker rejects
any sentence with zero citations or citing an event not in the incident. Refusal: if a stage has no accepted edge,
the story says "No evidence links X to Y" instead of narrating.

## 9. H–K. Forecast, response, proof, gate

- **EchoLab**: unchanged engine on the reconstructed graph; adds a calibration check (forecast reach counts vs
  held-out scenario continuations) and always labels results "simulated rollouts".
- **SafeCut**: unchanged CP-SAT model; evidence-preservation constraint (no action destroys logs needed for the
  story) added as a constraint if the detailed statement requires it.
- **ProofSeal**: adds claims: CHK-R1 every edge cites evidence; CHK-R2 story sentences all cited; CHK-R3 rejected
  hypotheses listed; CHK-R4 input hashes match the uploaded raw files.
- **Action Gate**: unchanged.

## 10. Deployment and data flow

Single FastAPI service (existing) + PostgreSQL (existing) + Next.js web (existing). New tables:
`intake_batch`, `raw_record` (hash + pointer), `canonical_event`, `entity`, `entity_link`, `edge_hypothesis`.
Offline demo mode: everything runs locally with the bundled synthetic scenarios.
