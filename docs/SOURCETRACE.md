# SourceTrace

Search a stored run, and trace any claim back to the source record behind it, with no terminal.

## What was already stored

| Stored | Where | Use |
|---|---|---|
| Canonical fields, byte offset, chunk id, line in chunk, raw and canonical hashes | `parts/*.parquet` | Search and resolving a record |
| Line base and byte range of each chunk | `plan.json` | Turning chunk and index into a source line |
| Duplicate byte offsets | `duplicates.parquet` | Deduplication status |
| Burst samples, with truncated citations | `bursts.json` | Burst membership, stated as "no stored sample lists it" when absent |
| Quarantine segments and samples | `quarantine.json` | Quarantined lines |
| Evidence, detections, graph, story, hypotheses, proof | `incidents/<id>/` | Incident usage and the chain |

Raw text is not stored in Parquet. No derivative index is needed: one raw line is read by seeking to its stored offset.

## Search

`GET /ps2/runs/{run_id}/search`. The run id is required, and no query can reach another run.

- Parquet is read a few parts at a time through DuckDB, with a 1 GB memory limit and bound parameters.
- Each request has a 6 s scan budget. When it runs out, the response carries a cursor and says how many parts were read. "Not found" appears only after every part has been read.
- A source line goes straight to one part through `plan.json`. Timestamps use row-group statistics.
- Identifiers are answered from the incident files, with no Parquet scan.
- A raw line appears only if its SHA-256 matches the stored hash, and is capped at 600 characters in results and 4,000 in a chain.

Measured on the recorded machine: a value absent from FireX 10G took about 4 s to read all 196 parts; a source line lookup took about 0.3 s. FireX 50G has 975 parts, so a rare value there takes several `Continue search` steps.

## Labels

| Label | Meaning |
|---|---|
| `RAW RECORD` | The source line was read at its offset, and its hash matches |
| `STORED SOURCE EXCERPT` | A stored sample of a quarantined line |
| `CANONICAL EVENT` | Parsed fields only, because the raw line could not be read or verified |

## Provenance

`GET /ps2/runs/{run_id}/provenance` traces a record, statement, node, edge or incident through source record, parser mapping, canonical event, duplicate and burst handling, detection rule, evidence relationship, hypothesis, incident statement and proof receipt. Each stage gives a plain sentence, then input, transformation, output, rule and version, evidence and state.

The gate checks dataset, run, filename, source hash, cited line, canonical event, source-line hash, detection evidence, graph citation, statement citation and proof hashes. The source hash compares the plan, receipts and cited records; the whole file was hashed during the run and is not hashed again per request.

A failed check gives `PROVENANCE FAILED`, names the link, excludes the claim from verified counts in the Trust Centre (`/provenance-summary`), and replaces nothing. A removed source gives `SOURCE UNAVAILABLE`, and stored canonical evidence stays usable.

## Reviews

`POST /ps2/runs/{run_id}/reviews` appends to `results/firex-reviews/<run>.jsonl`, outside the run folder, using the audit log's hash chain. It stores the run, the incident or record, the original conclusion, decision, reason, analyst, time and audit reference. It never changes an incident or receipt. There is no sign-in in this product, so the analyst name is what the reviewer types.

## Wording

Sealed titles stay as stored. `presentTitle` shows an unconfirmed incident as a hypothesis, and the workspace also shows the stored title.

## Limitations

- The stored graph gives the account in the "Account created" incident an id of `entity:device:<name>` and the kind `critical_asset`, because the rule's target is a device-kind slot. Search states the kind from the field that holds the value. The sealed graph is left unchanged.
- Burst citations are samples, so a record may belong to a burst that does not list it.
- Text search is a scan. It is bounded and resumable, not an inverted index.
