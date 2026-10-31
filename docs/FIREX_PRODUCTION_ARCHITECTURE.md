# FireX production architecture

> **Status legend.** *Implemented and tested* means covered by automated tests in this repository.
> *Unmeasured* means no result exists yet. Nothing in this document is a measured result. See
> `docs/FIREX_BENCHMARK_REPORT.md` for measurements.

## Purpose

HALT reads the official FireX FortiGate logs without loading them into memory, detects candidate attack
activity with configurable rules, reconstructs bounded incident graphs, and seals each result in a receipt.
Every incident is **unconfirmed** until an independent validator or an analyst confirms it.

## Stages and ownership

| Stage | UI stage | Owner | Output |
|---|---|---|---|
| Plan: hash, chunk boundaries, line numbers | READ | `halt/firex/pipeline.py` | `plan.json` |
| Streaming parse, canonicalise, quarantine | READ | `halt/firex/parser.py`, worker pool | `parts/*.parquet`, `chunks/*.json` |
| Exact duplicates, data quality | PREPARE | `halt/firex/store.py` | `quality.json`, `duplicates/` |
| Behavioural bursts | PREPARE | `halt/firex/detect.py` | `bursts.json` |
| Detection (config-driven) | RECONSTRUCT | `halt/firex/detect.py`, `detection_rules.json` | `detections.json` |
| Bounded correlation, incident graph, hypotheses | RECONSTRUCT | `halt/firex/reconstruct.py` | `incidents/<id>/*.json` |
| ATT&CK and kill-chain labels | RECONSTRUCT | `detection_rules.json` | on each detection |
| Reachable next (hypothetical) | EXPLAIN | `halt/firex/reconstruct.py` | `reachability.json` |
| Attack Story (deterministic) | EXPLAIN | `halt/firex/reconstruct.py` | `story.json` |
| Receipts | EXPLAIN | `halt/firex/receipts.py` | `benchmark_receipt.json`, `proof.json` |
| Run registry and job control | all | `halt/firex/jobs.py` | `run.json` |
| API | all | `halt/firex/api.py` | `/api/v1/ps2/...` |
| Optional grounded explanation | after EXPLAIN | `halt/firex/llm.py` | `narrative/*.json` |
| Independent validation | outside runtime | `services/api/validation/` | validation reports |

No global graph exists. Only incident subgraphs are materialised, with a node cap.

## Execution model

- A run is a separate process (`python -m halt.firex run ...`). The API starts it, and the operator can run the
  same command directly. An API restart does not stop it.
- **Plan.** One sequential read computes the SHA-256, chunk boundaries on line ends, and the line number at the
  start of each chunk. It holds one read buffer at a time.
- **Parse.** A process pool handles each chunk independently and writes one Parquet part plus one chunk manifest
  atomically (temporary file, then rename). Each worker holds one chunk's rows at a time.
- **Resume.** A chunk with a complete manifest and part file is not redone. The result is identical because
  chunk boundaries and evidence ids depend only on the source.
- **Cancel.** A `cancel` flag file is checked between chunks. The run stops at `cancelled` and can be resumed.
- **Query.** DuckDB reads Parquet with a memory limit and an on-disk temp directory, so duplicate detection and
  grouping can spill to disk.

## Data-quality rules

| Problem in the data | Rule |
|---|---|
| `tz` disagrees with `eventtime` | `eventtime` is the UTC primary. Originals are kept. The conflict is recorded once per dataset with a count. |
| Many records share one timestamp | Detected by a configurable threshold, never a known value. Byte offset is the secondary order. Time-window rules exclude those records and the exclusion is reported. No all-to-all temporal edges. |
| Binary or non-log data | Contiguous invalid lines become one `QuarantineSegment`. Every source byte is accounted for. |
| Session ids collide across event types | Never a link alone. Source, destination or port must agree. |
| `attackid` maps to many names | Kept as metadata. The attack name plus entities is the identity. |
| Failed-login background | Not an incident without a same-account or same-source relation to a later success. |
| `level=alert`, IPS, antivirus, app risk | Never an incident on their own. |

## Failure and recovery

| Failure | Behaviour |
|---|---|
| Worker crash or killed process | No manifest for that chunk, so it is redone on resume. The run shows `interrupted`. |
| API restart | Runs are read back from `run.json`. A live process keeps running; a dead one becomes `interrupted`. |
| Double click on Start | The run id derives from dataset, range, config and engine, so the same run is returned. |
| Hash mismatch with the registry | The run fails before parsing. |
| LLM down, unset or returning unsupported claims | The deterministic Attack Story is shown. |
| API unavailable in the UI | An explicit error state; never a substituted authored incident. |

## Acceptance gates

1. Byte accounting equals the processed range exactly.
2. Identical input and config give identical evidence ids, graph hashes and seals.
3. Production modules cannot reference validator-only files (a test fails otherwise).
4. Backend, frontend, type, lint and contract-drift checks pass.
5. Profiler figures are never presented as HALT results.

## Files expected to change

New: `services/api/halt/firex/`, `services/api/validation/`, `services/api/tests/test_firex_*.py`,
`apps/web/src/app/firex/`, `apps/web/src/components/firex/`, `apps/web/src/lib/firex/`, the documents listed in
this file. Changed: `services/api/halt/main.py`, `services/api/halt/config.py`, `services/api/pyproject.toml`,
`services/api/openapi.json`, `apps/web/src/lib/api/schema.d.ts`, the platform shell and landing page, `README.md`,
`.env.example`, `docs/THIRD_PARTY_LEDGER.md`.

## Storage choice

DuckDB plus Parquet (ZSTD). The dataset does not fit in memory and needs disk-backed group-by and
deduplication. DuckDB spills to disk under a memory limit, runs in-process, and needs no server. PyArrow writes
the parts because workers build columnar batches.
