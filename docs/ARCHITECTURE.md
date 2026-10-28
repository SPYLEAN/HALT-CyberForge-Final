# HALT Architecture

## 1. Repository layout (target)

```
/
├─ apps/web/                 Next.js (App Router) + TypeScript + Tailwind — landing + Command Center
├─ services/api/             Python 3.12 · FastAPI · Pydantic v2 · SQLAlchemy 2 · Alembic
├─ assets/halt-package/      Verbatim, read-only copy of halt-full-package.zip (source of truth for brand)
├─ docs/                     RFC, architecture, contracts, scenario, design system, tests, ledger
├─ docker-compose.yml        postgres, api, web
├─ .github/workflows/ci.yml
└─ SentinelRoute shield emblem.png   Pre-existing legacy file. Untouched, not used, excluded from builds.
```

npm workspaces at the root (pnpm is not installed; npm 11 is). The Python service is managed by `uv` if available, otherwise `pip` + `requirements*.txt` generated from `pyproject.toml`.

## 2. Runtime topology

```
Browser ──HTTP/JSON──▶ FastAPI /api/v1 ──▶ domain engines (pure Python) ──▶ PostgreSQL
   ▲                        │
   └──── WebSocket /ws ─────┘  deterministic replay stream (server clock, seekable)
```

- **web** (port 3000): Next.js. Server components fetch incident metadata; client components hold the live incident store and the WebSocket.
- **api** (port 8000): FastAPI. Stateless request handlers over pure domain modules. OpenAPI at `/api/v1/openapi.json`.
- **db** (port 5432): PostgreSQL 16. Append-only audit table enforced by trigger.

Docker Compose runs all three. For a no-Docker fallback the API can run with `HALT_DB_URL=sqlite+pysqlite:///./halt.db`; the append-only guarantee is then enforced in the repository layer only and the UI shows `AUDIT: APP-ENFORCED` instead of `AUDIT: DB-ENFORCED`.

## 3. Pipeline

```
Scenario fixture (seed 2417)
   │
   ▼
HALT-R1  ── events → entity linking → rule + baseline-model scores → Findings (EV refs, ATT&CK)
   │
   ▼
ThreadGraph ── nodes/edges (NetworkX MultiDiGraph) → path enumeration (attacker entry → critical target)
   │
   ▼
EchoLab ── 6,000 seeded rollouts / plan → per-path reach counts → risk = reach × criticality → high-risk set
   │
   ▼
SafeCut ── CP-SAT: hard-cut cover + hard constraints, min disruption → Plan | Infeasible + relaxations
   │
   ▼
EchoLab ── re-simulate futures A (aggressive), B (passive), C (SafeCut plan) for comparison
   │
   ▼
ProofSeal ── post-action reachability, constraint recheck, 2^12 enumeration, canonical hash, Ed25519 seal
   │
   ▼
Action Gate ── approvals → simulated execution step by step → contained → rollback window
   │
   ▼
Audit log (hash-chained, append-only) — every transition above writes one entry
```

Every stage is a pure function of its inputs plus the seed. Each persisted artefact stores the SHA-256 of its canonical JSON and the hashes of its inputs, so any result can be traced and re-derived.

## 4. Backend modules (`services/api/halt/`)

| Package | Key responsibility | Depends on |
|---|---|---|
| `contracts/` | Pydantic models = the single schema source (→ OpenAPI → TS) | — |
| `scenario/` | Load + validate the INC-2417 fixture and its variants | contracts |
| `r1/` | Correlation rules, features, scoring, baseline model, ATT&CK mapping | contracts, scenario |
| `threadgraph/` | Graph build, snapshot hashing, path enumeration, post-action reachability | networkx |
| `echolab/` | Seeded attacker walk + business availability model | threadgraph, numpy |
| `safecut/` | CP-SAT model, solve, infeasibility core, relaxations, grouping into display actions | ortools |
| `proofseal/` | Canonical JSON, independent verification, enumeration, sealing | threadgraph, cryptography |
| `gate/` | State machine, approval/authorisation checks, simulated connectors, rollback | proofseal, audit |
| `audit/` | Append-only hash-chained log | db |
| `replay/` | Deterministic replay clock + WebSocket broadcaster | scenario |
| `explain/` | Template explanations (default) + optional LLM adapter with citation validator | contracts |
| `db/` | SQLAlchemy models, session, repositories | sqlalchemy |
| `api/` | FastAPI routers, dependencies, error mapping | all |

Rule: domain packages never import `api/` or `db/`; they take and return contract models. This keeps every engine unit-testable without a database.

## 5. SafeCut model (CP-SAT)

Sets: candidate actions `A` (12), high-risk paths `P` (6), users `U`, critical processes `B`.

Variables: `x_a ∈ {0,1}` select action; `broken_b` process b loses a dependency; `u_k` named user k affected; `g_j` bulk group j affected.

Coverage, breakage and impact are derived per candidate in `safecut/instance.py` from the graph (hard cuts ∩ live routes; dependency closures), never listed by hand. Plan time defaults to t0 + 15 min (09:56Z), which is inside the IR-CHG-03 freeze, so its exception role is required.

Hard constraints:

1. **Coverage**: for each `p ∈ P`: `Σ_{a ∈ hardcut(p)} x_a ≥ 1`, where `hardcut(p)` = actions whose declared cut set contains an edge or node of `p` with `strength = hard`, computed from the graph, not listed by hand.
2. **Downtime**: for each `b ∈ B`: `Σ_a downtime(a,b)·x_a ≤ limit_b` (baseline limit 0 min). `downtime(a,b)` is computed by removing `a`'s cut set and testing the business dependency closure of `b`.
3. **User impact**: `u_k ≥ x_a` for each `k ∈ users(a)`; `Σ_k u_k ≤ 5`.
4. **Reversibility**: `x_a = 0` for any `a` with `rollback.seconds > 300` or `rollback.method = none`.
5. **Authorisation**: `x_a = 0` unless every approver role required by `a`'s policies (including change freezes active at plan time) has an available holder.
6. **Evidence**: `x_a = 0` for any `a` with `evidence_preserving = false`. Seal-before-execute is enforced by the Gate (409 otherwise).

Objective (single weighted sum, integer weights so ties are impossible by construction except true ties):

```
minimise 1000·window·Σ_b broken_b + 100·(Σ u_k + Σ size_j·g_j) + 10·Σ x_a + 1·Σ approvals_required(a)·x_a
```

The downtime constraint covers critical processes; the objective counts downtime of every process. CP-SAT runs single-worker with `random_seed = seed`, so plans are deterministic.

Infeasible → re-solve once per constraint family with that family dropped (C-COVER becomes soft with a 10,000,000 penalty per open path, so coverage is maximised first). The families whose relaxation alone restores feasibility are reported as `violated_constraint_ids`, and the distinct solutions (up to 3, fewest broken constraints first) are the "closest options", each listing the constraints it breaks. SafeCut never returns a partial plan as `optimal`.

## 6. ProofSeal independence

ProofSeal does **not** reuse SafeCut's matrices. It:

1. Applies the plan's cut sets to a fresh copy of the graph snapshot and runs NetworkX reachability from every attacker entry to every critical target along each high-risk path → expects 0 reachable.
2. Recomputes business dependency closure → every critical process keeps all dependencies.
3. Rechecks each constraint from raw action fields.
4. Enumerates all `2^|A|` subsets (4,096) with the same feasibility predicate and objective, confirms the plan is optimal and reports whether it is unique.
5. Confirms irredundancy: removing any single selected action leaves at least one high-risk path reachable.
6. Seals: `certificate = sha256(JCS(proof_body))`, signed with an Ed25519 key generated per deployment and labelled `DEMO KEY`. `sealed_at` comes from the replay clock (plan time), so the certificate is identical across runs and keys; `valid_until` = sealed_at + 40 min. The proof states what it does **not** cover: below-threshold routes left open, with their simulated reach under the plan (U1: 502 of 6,000), attacker capabilities outside the graph, simulated probabilities and simulated execution.

`halt/proofseal` never imports `halt.safecut` (a test enforces it); coverage, closure, eligibility and the objective are re-implemented in `proofseal/enumerate.py` from the documented rules.

## 7. Action Gate state machine

```
review ──(all required approvals recorded ∧ proof sealed ∧ Execute)──▶ executing
executing ──(each action applied in plan order)──▶ applied (contained)
applied ──(Roll back all, within window)──▶ rolled
review ──(new telemetry after sealing)──▶ review   (proof marked stale; execution refused until re-sealed)
review ──(authorisation unavailable)──▶ blocked_by_policy
```

Telemetry after execution does not undo an applied plan; it is handled by the rollback window. Approvals are per role: each required role (policy roles plus active freeze exceptions) needs a latest decision of `approved` from an available approver holding it; a decline blocks that role.

Simulated connectors mutate a copy of the graph snapshot. Each step writes an audit entry. No code path executes an action without a recorded human approval for every policy that requires one; this is asserted in unit and E2E tests.

## 8. Frontend architecture (`apps/web/src/`)

- **Routing**: `/` landing, `/incidents/[incidentId]` Command Center with `?view=overview|graph|echolab|safecut|proofseal|timeline|policies&t=<replay seconds>`.
- **Continuity**: the root layout mounts `IncidentProvider` (React context + reducer). The landing page and the Command Center read the same store, so client-side navigation keeps the incident and replay cursor. The cursor is mirrored in `?t=` so reload and deep links also resume.
- **Data**: typed client generated from OpenAPI (`openapi-typescript` + `openapi-fetch`). WebSocket messages validated with zod against the same schema.
- **Graph**: Cytoscape.js with a `preset` layout (coordinates are scenario data). An absolutely positioned SVG overlay, synced on `viewport`/`render` events, draws proof rings in cut gaps, the 8 px business pulse and forecast marching dots per `docs/DESIGN_SYSTEM.md`.
- **3D**: the supplied `halt-scene-a.js` + `halt-scene-b.js` (three.js r128) wrapped in a `dynamic(() => import(...), { ssr: false })` island on the landing hero only. Falls back to the supplied SVG posters for reduced motion, no WebGL, or low power.
- **Motion**: `motion` (the Framer Motion successor) with durations/easings read from tokens. Reduced motion renders end states.
- **Styling**: `tokens.css` generated from `assets/halt-package/02-design-system/tokens.json`; Tailwind theme maps to the CSS variables. No brand hex in components (lint rule).

## 9. Persistence (PostgreSQL)

Tables (as built, `halt/db/models.py`): `incidents`; `artefacts` (simulation, plan, proof, approval and execution documents stored as canonical JSON with their hash, keyed by id); `audit_log` (one hash chain per incident). Events, graph and policies come from the versioned fixture and are not copied into the database. The schema is created with `metadata.create_all`; on PostgreSQL the same step installs the append-only triggers. Alembic is deferred until the schema needs a second version.

The live incident runtime (`halt/service.py`) is held in memory and written through: a restart keeps artefacts and audit but starts a fresh runtime (use `replay/reset`). The operator clock is logical: it starts at plan time (t0 + 15 min) and advances 15 s per state-changing call, so repeated demo runs produce identical plan ids, simulation hashes, proof certificates and audit hashes (tested).

`audit_log(incident_id, seq, at, actor, kind, subject_id, payload, prev_hash, hash)` with `BEFORE UPDATE OR DELETE` (row) and `BEFORE TRUNCATE` (statement) triggers that raise. `hash = sha256(prev_hash || JCS(row_without_hash))`. `GET /audit/verify` walks the chain.

## 10. Observability and config

- `structlog` JSON logs with `request_id`, `incident_id`, `stage`, `duration_ms`, `seed`.
- Backend config via `pydantic-settings`; the app refuses to start on invalid env (`HALT_DB_URL`, `HALT_SEED`, `HALT_SIGNING_KEY_PATH`, `HALT_LLM_ENABLED=false`, `HALT_CORS_ORIGINS`).
- Frontend config validated with zod at build/start (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_DEMO_MODE=simulated`).

## 11. Security posture (MVP)

- No outbound network calls from the API (LLM adapter off by default; when on, sends only structured, synthetic evidence).
- CORS restricted to the web origin. Demo personas selected in UI; requests carry `X-Halt-Actor`, recorded in audit. This is not authentication and is labelled as such.
- Inputs validated by Pydantic; no SQL string building; no `eval`.
