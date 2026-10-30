# PS3 product RFC: HALT Connector Atlas

Status: prototype. Branch `ps3/spatial-integration-platform`, cut from `frontend-rebirth/god-mode` at `0498053`,
which stays frozen as the UI v2 reference. Nothing here is merged to `main`.

## Problem (as supplied)

> PS3 — Config-Driven Generic Integration Platform: "Add new tool integrations without writing code."

Only this one-line statement and the HALT spatial brief were supplied. **The detailed PS3 problem statement
has not been provided.** Following the brief's own rule, this branch is a *contract-isolated spatial
prototype*: it does not change the FastAPI service, its contracts, or the incident-response product. Every
assumption below is marked **[A-n]** and listed in one place so it can be confirmed or overturned.

## Positioning

**HALT: the config-driven security integration fabric.** Connect any security tool. Write configuration,
not connector code. Signature promise: *see the complete data journey before you activate it.*

## What the prototype does

1. A connector is a **declarative configuration** (JSON): source, authentication reference, pagination,
   rate limit, retry, field mapping to an OCSF class, validation rules, destinations. No connector code.
2. A **compiler** turns the configuration into a connector plan (ordered pipeline stages) and rejects
   invalid configurations with stated reasons.
3. A **dry-run engine** executes the plan against **recorded source exchanges** (fixture HTTP pages,
   including a real-shaped 429 retry) and produces a deterministic trace: the record before and after every
   stage, validation results, deduplication, per-destination acceptance, and SHA-256 hashes of each state.
4. **Drift simulation** mutates one source field, re-runs the plan, and diffs the two traces to show which
   mappings, validations and destinations are affected. A repair is proposed only when it can be derived
   from evidence, and only as a draft the engineer must apply.
5. **Proof Corridor** and the **Integration Receipt** are computed from the trace. **Activation Gate**
   records an explicit approval. Everything is labelled **SIMULATED**: no connector is live.
6. The **Connector Atlas** renders that state in 3D (React Three Fiber) with a complete DOM equivalent: object
   list, 2D flow (minimap and full fallback), detail panels and a guided mobile tour.

## Assumptions

| ID | Assumption | Why | How to overturn |
|---|---|---|---|
| A-1 | The engine runs in the browser as a pure TypeScript reference implementation | No PS3 backend contract was supplied; the brief forbids rewriting the backend around guesses | Port `src/lib/ps3/engine` to the API behind a versioned contract once PS3 is detailed |
| A-2 | Source data is recorded exchanges, not live calls | No authorised credentials or real connectors exist | Replace the recorded-exchange adapter with a live fetcher behind the same `Exchange` type |
| A-3 | Target schema is OCSF 1.x *Detection Finding* (class 2004) and *Authentication* (class 3002), a subset of attributes | The brief names OCSF normalisation | Supply the required OCSF profile |
| A-4 | The tools are fictional ("Northwind EDR", "Lumen IdP"); endpoints use `.example` domains | No fake *connected* integrations | Name real tools only with a real, authorised connector |
| A-5 | Approval is recorded in the browser session only, with fixture approvers | No identity provider or approval API exists for PS3 | Back the Activation Gate with the existing Action Gate approval API pattern |
| A-6 | Secrets are references (`vault://…`) and never values; recorded exchanges are redacted at load | The brief forbids rendering secrets | Unchanged in a real system: the browser must never receive secret values |
| A-7 | Colour semantics extend the brand for PS3: gold = active data, violet = drift/uncertainty, cyan-teal = verified, ember = failure | Stated in the PS3 brief; the original brand had four colours | Brand owner review |

## Non-goals

No backend changes, no live connectors, no credential handling, no persistence of approvals, no changes to the
incident-response product (it remains on `frontend-rebirth/god-mode`).

## Risks

- **Scope drift once the full PS3 statement arrives.** Mitigation: the engine and the scene are separated by a
  pure scene-model function; the configuration format is versioned (`schema: "halt.connector/v0"`).
- **WebGL availability and performance.** Mitigation: the 3D view is optional; every task completes in DOM.
