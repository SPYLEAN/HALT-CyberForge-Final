# Live Intake

Add logs, analyse, understand, verify, present, with no terminal once a file is in place.

## Adding a file

- **Incoming folder:** files placed in `<HALT_FIREX_DATA_ROOT>\incoming` are listed with their size, time and detected format. A request names a bare file name. A path, a traversal, a symbolic link or a name outside the allowed pattern is refused. There is no filesystem browsing.
- **Upload:** files up to 2 GiB, in 8 MiB chunks written straight to a part file, so neither the browser nor the API holds the file. Each chunk's size and SHA-256 are checked. After an interruption, the browser asks which chunks arrived and sends only the rest. An unsupported format is refused at the first chunk. An upload never overwrites an existing file.

The source is never copied into Git and is not moved or duplicated: the pipeline reads it where it is.

## Formats

| Format | Detected | Analysed |
|---|---|---|
| FortiGate key-value log | Yes | Yes, by the FireX parser |
| CSV, JSON, JSON Lines | Yes | No |

The FireX pipeline has one parser. The small adapters behind Reconstruct feed a different engine, so this path does not advertise them. A CSV or JSON file is named and refused with that reason. Supporting one here needs a new parser that maps to the canonical schema.

## Before analysis

The preflight shows file, size, SHA-256, format, adapter, parsing confidence from sampled lines, time interpretation, sample records, expected destination and a privacy warning. Files above 64 MiB are hashed once in the background, with real progress. After an API restart, hashing starts again: it cannot resume partway. `START ANALYSIS` waits for the hash and for no standing problem.

Refused with a reason: empty file, unsupported format, not enough disk (35% of the file size free, from the recorded 18% output ratio), unreadable file. Exact bytes analysed before are detected by SHA-256 across all runs, and the operator is offered the earlier result.

## Analysis

Starting registers one dataset, `live-<sha256 prefix>`, bound to the file's name, hash and the incoming folder, and calls the existing job system, so cancel, resume and restart recovery are the same as for official runs. The run binds dataset, run, filename, hash, parser, engine, configuration, artifacts and receipts, as any run does. Results never mix, because runs are keyed by dataset, hash, configuration and engine.

The pipeline reports four phases. The run page shows them, a plain sentence for the current phase, and real counts for bytes, records, rejects, duplicates, elapsed time and recovery. The ten named checks each show their phase's state, because the pipeline does not measure them separately, and no percentage is invented for them. Provenance verification in that list means the pipeline's citation checks while it writes each incident; the full SourceTrace gate runs when a result is opened.

Before completion, the page says `PROVISIONAL`, and no story or receipt is shown. A source without a usable time axis becomes a Quality Case.

## After completion

A new run gets every existing screen from its own backend data: dataset health, incidents, Attack World, timeline, Evidence Lens, SourceTrace, reachable next, Trust Centre, Case Builder and Theatre. No component names a FireX incident.

Replay and Theatre use stored events only. They send no traffic and execute nothing, and hypothetical content is labelled. If the source is removed later, the app shows `SOURCE UNAVAILABLE — stored canonical evidence remains available.`

## Recovery

| Failure | What happens |
|---|---|
| Interrupted upload | Resume sends only the missing chunks |
| Interrupted run, or API restart | The run shows as interrupted, and resume reuses finished chunks |
| Source removed before starting | Refused, and the list refreshes |
| Source removed during a run | The run fails or stops with the reason, and finished work is kept, as for any run |
| Corrupted region | Quarantined and accounted for |
| Missing or invalid timestamp | The record is rejected with its reason |
| Collapsed timestamp, time-zone conflict | Recorded, then partial or withheld as the Trust Centre describes |

## Limitations

- CSV and JSON are detected, not analysed.
- The ten checks are grouped by phase, as described above.
- There is no sign-in, so anyone who can reach this API can add files. Keep it on a trusted machine or network.
