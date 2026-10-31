# Demo inputs

> **Synthetic data only.** Every record in this folder was written by hand for the HALT demo. The people,
> domain (`northwind.example`, a reserved example domain), sessions, resources and addresses are fictional. The
> addresses come from private (RFC 1918) and documentation (RFC 5737) ranges. There is no personal data and there
> are no credentials, tokens or keys. Results on this file show pipeline behaviour, not real-world detection
> accuracy.

## `ps2-small-demo.jsonl`

A small cloud-app activity log (M365-like) for showing a **manual upload** on `/reconstruct`.

| | |
|---|---|
| Format | JSON Lines, one record per line, 20 lines, about 6 KB |
| Log source to choose | **Cloud app / API activity (M365-like) (`api_activity@1.0`)** |
| Organisation context | none (leave the context file empty) |
| Source | written for this repository; deterministic, no random values |

The file name does not match an adapter id, so the intake screen does not pre-select a log source. Choose
`api_activity` from the "Log source" list. The upload button stays disabled until you also tick the
synthetic-data confirmation.

### What the records describe

1. **08:02–09:18:** three people (`a.mensah`, `l.chen`, `r.okafor`) list and read shared folders from office
   addresses (`10.20.4.x`).
2. **09:31–09:36:** the identity `a.mensah@northwind.example` appears in a new session (`sess-a-77`) from an
   external documentation-range address (`203.0.113.45`). It does the following:
   - lists `finance-shared` (180 requests in 60 s) and `payroll-exports` (210 requests);
   - reads and downloads from `payroll-exports`;
   - is denied on `hr-records`;
   - downloads from `finance-shared`.
3. **09:40–09:52:** ordinary activity continues. One record (`demo-019`, a `SharingSet` operation) is an
   operation the adapter does not map. It is there on purpose, to show an honest rejection.

### Expected ingestion

| Field | Value |
|---|---|
| Input records | 20 |
| Accepted | **19** |
| Rejected | **1**: `demo-019`, `unsupported_operation`, "operation 'sharingset' is not mapped by this adapter" |
| Warnings | 0 |
| Canonical events | 19 |

### Expected reconstruction (engine `halt.ps2.engine/1.0.1`)

The run id is deterministic: the same file with no context always gives **`run-07fc183c9b2f9ddb`**.

| Field | Value |
|---|---|
| Suspicious seeds | 2: the two enumeration bursts (`demo-011`, `demo-012`), rule `enumeration_burst` |
| Edges | 15 of 28 candidate edges selected |
| Selected path | `demo-011` → `demo-012` → `demo-016`: list `finance-shared`, list `payroll-exports`, then read from `finance-shared`. Both hops are `shared_session`, observed (confidence 0.97 and 0.94) |
| Inferred hops | 0 |
| ATT&CK | T1083 File and Directory Discovery (uncertain) for the listings, T1213 Data from Information Repositories (rule-inferred) for the read |
| Story | 4 statements checked, 0 unsupported. One missing-evidence note: nothing earlier in the batch links to `demo-011`, so it is treated as the root |
| Alternates | 3 four-event alternates insert one of the payroll or `hr-records` events |
| **Ambiguity** | the selected path leads the next alternate by **0.0099** (below the 0.01 near-tie line). The Hypotheses tab shows the ambiguity notice |
| Affected services | none: no organisation context was supplied, so no service impact is forecast |
| Evaluation tab | unavailable: there is no ground truth for an upload |
| After an API restart | the run expires (uploads are kept in memory only). Re-upload the file to get the same run id again |

These values are pinned by `services/api/tests/test_ps2_operator_input.py` (API) and by the "operator file" test
in `apps/web/e2e/ps2.spec.ts` (browser upload). If the engine version changes, re-run them and update this table
from their output. Never edit these numbers by hand.
