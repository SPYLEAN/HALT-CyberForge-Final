# PS2 enterprise readiness plan

> **Status: PROVISIONAL.** HALT is **not** production-ready. Columns separate what is implemented (verified in
> code on `frontend-rebirth/god-mode`) from what the hackathon needs, what is only demonstrated in architecture,
> and the commercial roadmap.

Legend: **IMPL** implemented and tested · **HACK** required for the hackathon · **ARCH** architecture demonstrated
(designed/partially wired, not production) · **ROAD** commercial roadmap · **OUT** outside scope.

| Area | Today (verified) | Classification | Hackathon work | Roadmap |
|---|---|---|---|---|
| Tenant isolation | none: single incident, no tenant id in code | HACK (field) / ROAD (isolation) | add `tenant_id` to canonical events and new tables; single tenant in demo | row-level security per tenant, per-tenant keys |
| RBAC | no authentication; approvals are per **role** with demo identities via the `X-Halt-Actor` header | ARCH | keep demo identities, labelled "demo identity" (as today) | OIDC SSO, role mapping, least-privilege scopes |
| Secrets management | signing key from `HALT_SIGNING_KEY_PATH`; DB URLs from env; no secrets in repo | IMPL (basic) | upload must never accept or echo credentials found in logs (redaction at ingest) | vault integration, rotation |
| Immutable audit trail | append-only journal enforced by the application; DB role separation (`halt_app` vs owner, `db-init/01-app-role.sql`) | IMPL (app-level) | journal intake batches and reconstruction runs | DB-level enforcement (no UPDATE/DELETE grants verified in Docker), external anchoring |
| Data retention | none | ROAD | document "demo data only" | per-tenant retention policies, legal hold |
| Encryption | TLS not configured in local dev; at rest = PostgreSQL defaults | ROAD | — | TLS everywhere, encrypted columns for raw logs |
| Source provenance | events carry `source.system` and `record_id` | IMPL (partial) → HACK | `raw_sha256`, file, line number, ingest time per record | signed source attestations |
| Idempotent ingestion | n/a (no ingestion) | HACK | `event_uid = sha256(source ‖ raw_sha256)`; re-upload is a no-op | exactly-once streaming |
| Retries / dead-letter | n/a | HACK (quarantine) | quarantine table with reasons | DLQ + replay tooling |
| Observability | structlog JSON logs, request ids, `/health` and `/ready` | IMPL | log intake counts and reconstruction timing | metrics (OpenTelemetry), tracing |
| Schema versioning | `Meta` carries versions in contracts (`halt/contracts/common.py`); OpenAPI regenerated, CI drift check | IMPL | version `CanonicalEvent` (`schema: halt.event/v1`) | migration framework per version |
| Policy versioning | policy profiles in data; plan records `profile_id` | IMPL (partial) | — | signed, versioned policy store |
| Incident export | ProofSeal certificate + report view (print to PDF) | IMPL | add reconstruction section | STIX 2.1 / case-management export |
| API security | no auth, CORS configured, Pydantic validation of all bodies | ARCH | keep local-only; state it | authN/Z, input size limits, WAF |
| SSRF protection | no outbound fetches exist | IMPL by absence | intake must not fetch URLs found in logs | allow-list egress if connectors added |
| File-upload validation | n/a | HACK | size limit, extension + content sniffing, line limits, UTF-8 validation, zip-bomb refusal, quarantine | malware scanning |
| Rate limiting | none | HACK (upload only) | simple per-process limit on upload | gateway rate limits |
| Deterministic offline demo | `npm run demo` (production build, local API, reset to seed); seeded simulations | IMPL | include scenario A and B raw files | — |
| PostgreSQL persistence | IMPL (148 tests with PostgreSQL) | IMPL | new tables + migrations | managed Postgres, backups |
| Recovery after restart | IMPL (restart-safe incidents, tested AT-S.1–7) | IMPL | re-run reconstruction from stored raw records | — |
| Docker / CI | compose file and GitHub Actions workflow exist; **neither has been run** (Docker not installed; no remote) | ARCH | run CI on a pushed branch if a remote is created | — |
| Load / failure testing | dependency-failure tests (DB unreachable → 503, UI shows reason) | IMPL (failure) / ROAD (load) | time reconstruction on the demo set | load tests at tenant scale |

## What the team should say

> "HALT runs as a deterministic, restart-safe service with an append-only audit journal, schema-checked contracts
> and a reproducible offline demo. Authentication, tenant isolation and encryption are designed but not built;
> this is a hackathon system on synthetic data, not a production deployment."
