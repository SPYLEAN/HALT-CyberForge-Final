# HALT Data Contracts

Pydantic v2 models in `services/api/halt/contracts/` are the single source of truth. FastAPI emits OpenAPI 3.1; `openapi-typescript` generates `apps/web/src/lib/api/schema.d.ts`. CI fails if the committed types drift from the exported schema.

Notation below is TypeScript-style for readability. All timestamps are ISO-8601 UTC (`Z`). All IDs are strings. All hashes are lowercase hex SHA-256. Every top-level response carries `meta`.

## 0. Common

```ts
type Provenance = "observed" | "inferred" | "forecast";
type Strength   = "hard" | "soft";             // hard = removes capability; soft = evadable
type Sha256     = string;                      // 64 hex chars

interface Meta {
  incident_id: string;            // "INC-2417"
  simulated: true;                // MVP: always true; UI shows SIMULATED chip when true
  seed: number;                   // 2417
  schema_version: "1.0";
  generated_at: string;
  input_hashes: Record<string, Sha256>;   // e.g. { graph: "...", policies: "..." }
}

interface Derivation {            // required wherever a number is shown
  numerator?: number;             // e.g. 4912
  denominator?: number;           // e.g. 6000
  method: string;                 // "EchoLab rollouts reaching db.finance_ledger within 600 s"
  source_ids: string[];           // EV-xx, SIM-xx, CHK-xx
}

interface ApiError { code: string; message: string; detail?: unknown; request_id: string }
```

## 1. Events (HALT-R1 input)

```ts
interface SecurityEvent {
  id: string;                     // "EV-01".."EV-06" for incident events, "BG-0001".. for background
  ts: string;
  source: { system: string; record_id: string };   // { system: "Entra sign-in logs", record_id: "SL-4471" }
  kind: "mail_delivered" | "sign_in" | "mfa_method_added" | "oauth_consent"
      | "token_replay" | "resource_enumeration" | "benign";
  actor_node_ids: string[];       // graph nodes referenced
  attributes: Record<string, string | number | boolean>;   // asn, user_agent, scopes, request_count...
  attack: { technique_id: string; technique_name: string } | null;  // MITRE ATT&CK
  synthetic: true;
}
```

## 2. Graph

```ts
type NodeKind = "user" | "device" | "session" | "token" | "application" | "api"
              | "service" | "database" | "process" | "attacker";      // matches NodeGlyph

interface GraphNode {
  id: string;                     // "user.m_verma", "grant.docusync_mverma", "db.finance_ledger"
  kind: NodeKind;
  label: string;
  provenance: Provenance;         // forecast nodes (session.s3) do not exist yet
  attacker_controlled: boolean;
  criticality: "none" | "standard" | "critical";
  business?: { process_id?: string; users: number; deadline?: string; owner?: string };
  evidence_ids: string[];         // non-empty iff provenance = observed
  first_seen?: string;            // replay visibility
  layout: { x: number; y: number };   // preset coordinates (scenario data, not computed in UI)
}

type EdgeKind = "hostile" | "dependency" | "identity";

interface GraphEdge {
  id: string;                     // "e.user-grant"
  source: string; target: string;
  kind: EdgeKind;
  relation: string;               // "consented_to", "replayed_as", "calls", "reads", "requires_human"
  provenance: Provenance;
  evidence_ids: string[];         // observed hostile edges: ≥1 EV id; forecast: []
  inference?: { confidence: number; rationale: string };       // inferred only
  transition?: { p: number; delay_s: [number, number] };       // hostile, used by EchoLab
  historical: boolean;            // true = already happened; cannot be cut
  first_seen?: string;
}

interface GraphSnapshot {
  id: string; hash: Sha256; at: string;           // replay time the snapshot represents
  nodes: GraphNode[]; edges: GraphEdge[];
  removed: { node_ids: string[]; edge_ids: string[] };  // post-action snapshots only
  meta: Meta;
}
```

## 3. Findings and paths

```ts
interface Finding {
  id: string;                     // "F-01"
  title: string;
  stage: "initial_access" | "credential_persistence" | "token_abuse" | "discovery" | "collection" | "exfiltration";
  evidence_ids: string[];         // ≥ 1, validator enforces
  score: { value: number; derivation: Derivation; method: "rule" | "logreg" | "gbm" };
  attack: { technique_id: string; technique_name: string }[];
  limits: string[];               // what would raise / lower this
}

interface AttackPath {
  id: string;                     // "P1".."P6"; "U1" for below-threshold
  node_ids: string[]; edge_ids: string[];
  target_id: string;              // "db.finance_ledger"
  provenance: "observed" | "mixed" | "forecast";
  reach: Derivation;              // numerator = rollouts reaching target via this path
  risk: number;                   // reach_rate × criticality_weight
  high_risk: boolean;             // risk ≥ policy threshold (0.20)
  uncertain: boolean;             // contains an inferred edge with confidence < 0.8
}
```

## 4. Response actions

```ts
interface ResponseAction {
  id: string;                     // "C01".."C12" candidates
  type: "revoke_oauth_grant" | "revoke_session" | "conditional_access_step_up"
      | "isolate_api" | "isolate_database" | "isolate_subnet" | "disable_account"
      | "block_asn" | "revoke_all_consents" | "force_password_reset" | "quarantine_mailbox";
  title: string;
  targets: string[];              // node ids
  cuts: { ref: string; ref_type: "node" | "edge"; strength: Strength; rationale: string }[];
  impact: {                       // REQUIRED
    users: string[];              // user ids affected (distinct counting happens in SafeCut)
    processes: { process_id: string; downtime_min: number }[];   // computed, then stored
    description: string;
  };
  reversibility: {                // REQUIRED
    reversible: boolean;
    rollback_id: string;          // "RB-1"
    method: string;
    seconds: number;
  };
  authorisation: {                // REQUIRED
    policy_ids: string[];         // "IR-OAUTH-02"
    required_roles: string[];     // "tier2_analyst", "finance_ops_owner"
    permission_scope: string;     // simulated connector scope string, informational
  };
  evidence_preserving: boolean;
  connector: "simulated";         // MVP: the only allowed value
}

interface DisplayAction {         // grouping of candidates shown as A1..An
  id: string;                     // "A1"
  candidate_ids: string[];        // ["C02","C03"]
  title: string;
  blocks_path_ids: string[];      // derived: paths whose hard cut includes this group
}
```

API rejects (422) any `ResponseAction` missing `impact`, `reversibility` or `authorisation`.

## 5. Constraints and policies

```ts
interface Constraint {
  id: "C-COVER" | "C-DOWNTIME" | "C-USERS" | "C-REVERSIBLE" | "C-AUTH" | "C-EVIDENCE";
  label: string;
  kind: "hard" | "soft";
  limit: number | boolean | null; // C-USERS: 5, C-DOWNTIME: 0, C-REVERSIBLE: 300 (s)
  unit?: "min" | "users" | "s" | "paths";
}

interface ConstraintResult {
  constraint_id: Constraint["id"];
  state: "met" | "binding" | "violated";
  value: string;                  // "3 users"
  limit: string;                  // "≤ 5 users"
  derivation: Derivation;
}

interface Policy {
  id: string;                     // "IR-CA-05"
  title: string;
  applies_to_action_types: ResponseAction["type"][];
  required_roles: string[];
  window?: { start: string; end: string; exception_role: string };   // IR-CHG-03 change freeze
  rationale: string;
}

interface Approver { id: string; name: string; roles: string[]; available: boolean }
```

## 6. Simulation (EchoLab)

```ts
interface SimulationRequest {
  plans: { label: "A" | "B" | "C"; source: "preset_aggressive" | "preset_passive" | "plan"; plan_id?: string }[];
  rollouts: number;               // default 6000, max 20000
  horizon_s: number;              // default 600
  seed: number;                   // default 2417
}

interface FutureResult {
  label: "A" | "B" | "C";
  action_ids: string[];
  paths_blocked: Derivation;      // "6 of 6"
  target_reached: Derivation;     // rollouts reaching db within horizon
  users_affected: Derivation;
  downtime_min: Record<string, number>;   // per process
  availability: { process_id: string; down_from_s: number | null }[];
  reversible: boolean;
  evidence_preserved: boolean;
}

interface SimulationRun { id: string; request: SimulationRequest; futures: FutureResult[]; hash: Sha256; meta: Meta }
```

## 7. Plan (SafeCut)

```ts
interface Plan {
  id: string;
  status: "optimal" | "infeasible";
  selected_candidate_ids: string[];          // empty if infeasible
  display_actions: DisplayAction[];
  objective: { value: number; terms: Record<string, number> };
  constraints: ConstraintResult[];
  rejected: { candidate_id: string; reasons: string[] }[];   // every unselected candidate explained
  infeasibility?: {
    violated_constraint_ids: Constraint["id"][];
    closest_options: { candidate_ids: string[]; breaks: ConstraintResult[] }[];   // ≤ 3
  };
  solver: { engine: "ortools-cp-sat"; version: string; wall_ms: number; status_raw: string };
  input_hashes: { graph: Sha256; paths: Sha256; actions: Sha256; policies: Sha256 };
  meta: Meta;
}
```

## 8. Proof (ProofSeal)

```ts
interface ProofClaim {
  id: string;                     // "CHK-01"
  text: string;                   // "0 of 6 high-risk paths reachable after the plan"
  method: string;                 // "NetworkX reachability on post-action snapshot <hash>"
  evidence_ids: string[];
  result: Derivation;
  status: "verified" | "failed" | "stale" | "not_run";
}

interface Proof {
  id: string;                     // "PS-2417-01"
  plan_id: string;
  snapshot_hash: Sha256;          // pre-action graph
  post_snapshot_hash: Sha256;
  claims: ProofClaim[];           // coverage, business, downtime, users, auth, evidence, rollback, optimality, irredundancy
  enumeration: { subsets_checked: number; feasible: number; optimal_count: number; unique: boolean };
  not_covered: string[];          // explicit scope limits
  versions: Record<string, string>;
  certificate: Sha256;            // sha256(JCS(body without certificate/signature))
  signature: { alg: "Ed25519"; key_id: string; value: string; demo_key: true };
  sealed_at: string;
  valid_until: string | null;     // invalidated by new telemetry
  meta: Meta;
}
```

## 9. Gate, execution, audit

```ts
type GateState = "review" | "blocked_by_policy" | "executing" | "applied" | "rolled";

interface Approval { id: string; plan_id: string; policy_id: string; approver_id: string;
                     decision: "approved" | "declined"; at: string; note?: string }

interface Execution {
  id: string; plan_id: string; proof_id: string; state: GateState;
  steps: { display_action_id: string; candidate_id: string; status: "pending" | "applied" | "rolled_back" | "failed";
           at?: string; post_snapshot_hash?: Sha256 }[];
  rollback_window_until: string | null;
}

interface AuditEntry { seq: number; at: string; actor: string; kind: string; subject_id: string;
                       payload: unknown; prev_hash: Sha256; hash: Sha256 }
```

## 10. HTTP API (`/api/v1`)

| Method | Path | Body | Response | Errors |
|---|---|---|---|---|
| GET | `/health` | — | `{status, db, version}` | — |
| GET | `/incidents` | — | `IncidentSummary[]` | — |
| GET | `/incidents/{id}` | — | `Incident` (summary, state, confidence `Derivation`) | 404 |
| GET | `/incidents/{id}/events?until=<s>` | — | `SecurityEvent[]` | 404 |
| POST | `/incidents/{id}/correlate` | `{until?}` | `Finding[]` | 404 |
| GET | `/incidents/{id}/graph?at=<s>&plan_id=` | — | `GraphSnapshot` | 404 |
| GET | `/incidents/{id}/paths` | — | `AttackPath[]` | 409 if not correlated |
| GET | `/incidents/{id}/actions` | — | `ResponseAction[]` | — |
| GET | `/incidents/{id}/policies` | — | `{policies: Policy[], approvers: Approver[]}` | — |
| POST | `/incidents/{id}/simulations` | `SimulationRequest` | `SimulationRun` | 422 |
| GET | `/simulations/{sim_id}` | — | `SimulationRun` | 404 |
| POST | `/incidents/{id}/plans` | `{variant?: string, constraint_overrides?: Partial<Constraint>[]}` | `Plan` | 409 if no paths |
| GET | `/plans/{plan_id}` | — | `Plan` | 404 |
| POST | `/plans/{plan_id}/proof` | — | `Proof` | 409 if infeasible |
| GET | `/proofs/{proof_id}` | — | `Proof` | 404 |
| POST | `/proofs/{proof_id}/verify` | — | `{certificate_match, signature_valid, recomputed: Sha256}` | 404 |
| POST | `/plans/{plan_id}/approvals` | `{policy_id, approver_id, decision, note?}` | `Approval` | 403 role missing, 409 stale |
| POST | `/plans/{plan_id}/execute` | `{proof_id}` | `Execution` | 409 missing approvals / unsealed / stale proof |
| GET | `/executions/{exec_id}` | — | `Execution` | 404 |
| POST | `/executions/{exec_id}/rollback` | — | `Execution` | 409 window closed |
| GET | `/incidents/{id}/audit` | — | `AuditEntry[]` | — |
| GET | `/incidents/{id}/audit/verify` | — | `{valid, length, head_hash}` | — |
| POST | `/incidents/{id}/replay/reset` | `{variant?}` | `Incident` | — |
| POST | `/incidents/{id}/explain` | `{subject_id}` | `{text, cited_ids[], engine: "template" \| "llm"}` | 422 if citations invalid |

Requests that change state require header `X-Halt-Actor: <approver_id>` (demo identity, recorded in audit; not authentication).

## 11. WebSocket `/ws/incidents/{id}`

Client → server:
```ts
{ type: "play" | "pause"; speed?: 1 | 4 | 16 } | { type: "seek"; t: number } | { type: "subscribe" }
```

Server → client (every message carries `seq` and `t`, replay seconds since `09:41:12Z`):
```ts
| { type: "clock"; t; playing: boolean; speed }
| { type: "event"; t; event: SecurityEvent }
| { type: "graph_delta"; t; add_nodes: GraphNode[]; add_edges: GraphEdge[] }
| { type: "finding"; t; finding: Finding }
| { type: "stage"; t; state: IncidentState }      // new, correlating, forecast, simulating, plan, approval...
| { type: "gate"; t; execution: Execution }
| { type: "stale"; t; reason: string }            // new telemetry after sealing
```

Replay is server-authoritative and deterministic: the same `seek(t)` yields the same message set in the same order. The client may also rebuild state at any `t` from REST (`/events?until=t`, `/graph?at=t`), which the landing → Command Center handoff uses.

## 12. Scenario fixture format

`services/api/halt/scenario/inc_2417/`: `incident.json`, `events.json`, `background_events.json` (generated, seeded), `topology.json` (nodes, edges, layout), `actions.json` (12 candidates), `policies.json`, `approvers.json`, `constraints.json`, `variants.json`. Validated against the contract models at load time; a malformed fixture stops the API from starting.
