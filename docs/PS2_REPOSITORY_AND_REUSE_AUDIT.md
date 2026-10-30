# PS2 repository and reuse audit

> **Status: PROVISIONAL.** The detailed PS2 statement has not been supplied. This audit records the repository as
> verified on 2026-10-30; it copies nothing and creates no branch.

## 1. Verified repository state

| Item | Verified value |
|---|---|
| Current branch | `ps3/spatial-integration-platform` |
| HEAD | `03be337` test(ps3-atlas): cover spatial state and fallback behaviour |
| Working tree | clean except untracked `artifacts/ps3-atlas-audit/`, `artifacts/ps3-atlas-stabilised/` (screenshots, intentionally uncommitted) |
| Remote | **none configured** (local repository only) |
| `main` | `142f368`, untouched |
| Instruction files | `apps/web/AGENTS.md` (written by `next dev`, git-ignored): *"This is NOT the Next.js you know … read `node_modules/next/dist/docs/` before writing code."* |
| Locally excluded | `halt-full-package/` (identical duplicate of `assets/halt-package/`, in `.git/info/exclude`) |

Branch topology is strictly linear; every branch contains the one before it:

```
main 142f368
 └─ stabilization/god-mode d98c0ff      (+1)  policy-aware residual risk
     └─ frontend-rebirth/god-mode 0498053 (+6) UI v2 (incident-response Command Center, landing, platform routes)
         └─ ps3/spatial-integration-platform 03be337 (+5) PS3 Connector Atlas (frozen)
```

**PS3 freeze:** `ps3/spatial-integration-platform` stays at `03be337`. A PS2 branch, when authorised, should be cut
from `frontend-rebirth/god-mode` (`0498053`), **not** from PS3, so PS3 code never enters PS2 history; individual
generic modules can then be ported deliberately (see §4).

Build and test commands (unchanged): `npm run check` (checksums, ruff, format, mypy, pytest, lint, tsc, vitest,
tokens, contract drift), `npm run test:e2e` (Playwright on a production build), `npm run build`, `npm run demo`.
Last verified on `03be337`: API 148 (PostgreSQL), web unit 138, E2E 59.

## 2. What already exists for PS2 (it is most of the original HALT)

The original HALT product (on `main` → `frontend-rebirth`) is an incident-response system built around a
kill-chain scenario that matches PS2's primary scenario almost exactly:

| PS2 system | Existing implementation | PS2 gap |
|---|---|---|
| Signal Intake | `halt/scenario/loader.py` loads **pre-normalised synthetic** `SecurityEvent` fixtures (6 incident + 405 background events, 4 sources). `SecurityEvent.synthetic` is `Literal[True]` | **No raw-log ingestion, no source adapters, no upload, no parsing of vendor formats** |
| Normalisation | Events are authored already in the canonical contract | No normaliser; no OCSF mapping; no provenance of an original raw record |
| Entity resolution | Entities exist only in the **hand-authored** `topology.json` (18 nodes, 35 edges) | **Not derived from logs.** This is the central PS2 gap |
| Temporal correlation | `halt/r1/correlate.py`: per-event score (rules + logistic regression), time clustering into incidents, stage findings | Correlation does not create graph edges; edges are authored |
| ThreadGraph | `halt/threadgraph/`: networkx MultiDiGraph, time-sliced snapshots by `first_seen`, maximal simple-path enumeration from footholds to the target, cut analysis | Must be built from resolved entities and correlated evidence instead of a fixture |
| ATT&CK mapping | `halt/r1/attack_map.py`: fixed table, one technique per event kind | Static by kind; no confidence, no multi-technique, no evaluation |
| Attack Story | `halt/explain/templates.py` (deterministic templates citing IDs); optional LLM rewording, off by default, rejected (422) if it cites unknown IDs | No sentence-level citation model; no refusal rule documented as a requirement |
| EchoLab | `halt/echolab/`: seeded Monte Carlo futures (6,000 rollouts, seed 2417), counts not probabilities | Calibration not evaluated; forecast uses authored transition probabilities |
| SafeCut | `halt/safecut/`: OR-Tools CP-SAT minimum-disruption cut under policy profiles | Reusable as is for PS2 |
| ProofSeal | `halt/proofseal/`: independent re-check (2ⁿ enumeration), 10 claims, Ed25519 demo key | Reusable; add reconstruction claims (evidence coverage) |
| Action Gate | `halt/gate/`: per-role approvals, simulated execution, rollback, append-only audit | Reusable as is |
| Persistence / ops | PostgreSQL, restart-safe incidents, append-only journal, deterministic replay over WebSocket, health/ready | Reusable |

Measured today (synthetic-on-synthetic; pipeline correctness, not real-world efficacy): R1 PR-AUC on held-out
synthetic data, rules 0.916, logistic regression 0.9758 (selected), gradient boosting 0.9822 (rejected: below the
0.02 margin). No reconstruction metric (recall, precision, false-link rate) exists yet.

## 3. Reuse matrix

Legend: **R0** reusable without modification · **R1** reusable after renaming · **R2** conceptually reusable,
technically incompatible · **X** PS3-specific, prohibited from PS2.

### 3a. From the original HALT foundation (`frontend-rebirth/god-mode`)

| Component | Class | Tests available | PS2 action |
|---|---|---|---|
| `halt/safecut`, `halt/proofseal`, `halt/gate`, `halt/audit`, `halt/db`, `halt/replay` | R0 | pytest (safecut property tests, proofseal, gate, audit, restart, ws replay) | keep |
| `halt/echolab` | R0 → extend | `test_echolab.py` | keep; add calibration evaluation |
| `halt/threadgraph` paths, cuts, snapshots | R0 → re-source | `test_threadgraph.py` | keep algorithms; graph input becomes reconstruction output |
| `halt/r1` scorer + correlate | R0 → extend | `test_r1.py` | keep scorer; add entity resolution and edge inference |
| `halt/r1/attack_map.py` | R2 | partial | replace with evidence-scored mapping (keep table as prior) |
| `halt/explain` | R0 → extend | `test_explain.py` | add sentence-level citations and refusal |
| `halt/scenario` (inc_2417) | R1 | `test_scenario_load.py` | becomes ground truth + raw logs generator, not graph source |
| Web Command Center v2 (`components/v2`), landing, Theatre | R0/R1 | unit + E2E (41) | adapt views (see Command Center IA) |
| Design tokens, brand assets, procedural r128 scene | R0 | brand checksum tests | keep; landing hero needs new asset (see asset audit) |

### 3b. From PS3 (`ps3/spatial-integration-platform`), generic infrastructure

| PS3 module | Class | Tests | PS2 replacement / note |
|---|---|---|---|
| `lib/ps3/camera.ts` (bounds framing, `frameBox`, `fits`, `project`) | R1 (rename to `lib/spatial/camera.ts`) | `ps3-camera.test.ts` | reuse for the landing and any 3D ThreadGraph |
| Packet tween + demand rendering pattern (`AtlasCanvas` Packet, Stats, probes) | R2 | `atlas.spec.ts` flight tests | concept reused for "evidence travelling"; code is Atlas-shaped |
| `lib/ps3/store.ts` reducer + History API mirroring | R2 | `ps3-store.test.ts` | pattern reusable; query shape is connector-specific |
| `FlowGrid` (DOM fallback for a spatial scene) | R2 | `ps3-atlas.test.tsx` | pattern reusable; content is pipeline-zone-specific |
| WebGL detection, `SceneBoundary`, reduced-motion hook, compact hook | R1 | unit tests | rename into a shared `spatial` module |
| Zone-label DOM projection (no drei `Html`) | R1 | E2E label visibility | reuse |
| three r182 pin (R3F `THREE.Clock` warning) + dedupe | R0 | E2E hygiene test | carry the pin if R3F is used in PS2 |
| `lib/ps3/engine/*` (connector config, dry run, drift, receipt) | **X** | — | prohibited: PS3 product logic |
| `fixtures/connectors.json`, `exchanges.json` | **X** | — | prohibited |
| `/atlas` route, Atlas panels, PS3 docs | **X** | — | prohibited; PS2 must not show connector messaging |
| `lib/ps3/engine/hash.ts` (sync SHA-256) | R1 | `ps3-engine.test.ts` | reusable if the browser must hash; the API already hashes server-side |

### 3c. Merge conflicts and risks

| Risk | Detail | Mitigation |
|---|---|---|
| Route groups | PS3 moved incident routes into `app/(halt)` and added `app/(ps3)` | cut PS2 from `frontend-rebirth`; port the `(halt)` group split only if needed |
| Dependency change | PS3 added `three@0.182.0`, R3F 9.8.2, drei 10.7.9 and renamed r128 to `three-r128` (copy script + brand test path) | port as one reviewed dependency commit |
| `package-lock.json` | large lock diff | regenerate in PS2 rather than cherry-pick |
| PS3 docs in `docs/` | PS3_* files would appear in PS2 if branched from PS3 | branch from `frontend-rebirth` |

### 3d. Licensing

All reused code is first-party. Libraries are MIT/Apache/BSD as recorded in `docs/THIRD_PARTY_LEDGER.md` and
`docs/THIRD_PARTY_3D_LEDGER.md`. No unclear-licence code is involved. The legacy file
`SentinelRoute shield emblem.png` is first-party but contains shield imagery (excluded by the brief) and must not be
used on the landing; it stays in the repository because `scripts/verify_repo.py` checksums it.

## 4. Recommended reuse procedure (when authorised)

1. Create `ps2/kill-chain-intelligence` from `frontend-rebirth/god-mode`.
2. Port, as separate reviewed commits: (a) the 3D dependency set and r128 alias; (b) `spatial/camera.ts` +
   tests; (c) the WebGL/reduced-motion/fallback hooks. Nothing from `lib/ps3/engine` or `/atlas`.
3. Keep `main` untouched until a reviewed merge.
