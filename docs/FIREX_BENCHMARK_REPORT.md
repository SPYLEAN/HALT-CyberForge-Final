# FireX benchmark report

> **Only controlled byte ranges have been run through HALT.** The complete 10G and 30G tiers are unmeasured, and the
> operator runs them with `POWERSHELL_OPERATOR_COMMANDS.md`. Add their receipts here when they exist.

## Measured: controlled ranges of `firex-10G.log`

Source: first bytes of the official file, at commit `08dbd6f`, on an 8-core AMD64 Windows machine with 13.9 GB RAM,
Python 3.12.10 and 7 parser workers. Figures come from each run's sealed `benchmark_receipt.json` in
`C:\HALT-DATA\results\firex-runs\`.

| Measure | 100 MB range | 1 GB range |
|---|---|---|
| Run id | `frun-0624f1102ae3d93f` | `frun-5440e8e3ecc61461` |
| Bytes processed | 99,999,914 | 999,999,951 |
| Valid records | 189,414 | 1,895,255 |
| Rejected records | 0 | 0 |
| Every byte accounted for | Yes | Yes |
| Exact duplicates | 0 | 0 |
| Behavioural bursts | 184 | 1,808 |
| Detections | 0 | 7 |
| Incidents | 0 | 7 |
| Duration | 18.75 s | 116.81 s |
| Plan / parse / prepare / reconstruct | 0.34 / 16.12 / 0.42 / 1.49 s | 2.26 / 94.41 / 1.84 / 18.06 s |
| Throughput | 10,102 records/s, 5.33 MB/s | 16,225 records/s, 8.56 MB/s |
| Peak memory (upper bound) | 2,188 MB | 2,969 MB |
| Parquet output | 19.8 MB | 197.6 MB |
| Slowest incident open at seal time | No incidents | 77.44 ms |

Incident open reads the stored files for one incident. On the 1 GB run, the operator `latency` command measured
259.62 ms on the first pass and 10.73–12.29 ms on the next four. It does not include API or browser time.

On the 1 GB run, all receipt seals verified, and replay reproduced every graph hash.

**Peak memory** is an upper bound: the highest worker peak × workers + the driver's peak. It is not a sampled total.
The operator commands include a process-tree monitor for a real total.

## What these ranges do not cover

Both ranges end before the binary tail and the collapsed timestamp, so they had no quarantine segments and no collapsed
records. Those paths are covered by synthetic fixtures only.

**These figures are not extrapolated to the full tiers.** The later file differs: millions of records sharing one
timestamp, and a binary region.

## Validator on the 1 GB range

> Expected cases come from profile candidates and remain unconfirmed. They are not organiser ground truth, so these
> metrics do not measure real detection accuracy.

| Metric | Result |
|---|---|
| Candidates detected | 7 of 9 in range |
| Labels correct | 7 of 7 |
| Paths recovered | 7 of 9 |
| Incidents matching no candidate (not proven false) | 0 of 7 |
| Ordering errors | 0 across 7 incidents |
| Unsupported correlations | 0 of 3 links |
| Duplicate incidents | 0 of 7 |

The two misses are `web-attack-concentration` and `smb-rdp-fanout` (10.10.10.44). The first record of each candidate
falls inside the range, so the validator counts them. This run did not detect either one. Whether the rest of their
activity falls after the 1 GB boundary needs the full run to confirm. Two further candidates start after the range and
are not scored: the temporary admin account and the VPN alternation.

Outputs: `C:\HALT-DATA\results\firex-validation-1g\`.

## Recorded whole-file runs

Read from each run's stored receipt and quality file on the recorded machine. These are measurements of one machine, not
guarantees. Peak memory is an upper bound (highest worker peak × workers + driver peak).

| Dataset | Run | Bytes | Valid records | Exact duplicates | Collapsed time | Incidents | Duration | Throughput | Peak memory | Incident open |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| FireX 10G | `frun-69553b2c1dfeb3fe` | 6,543,120,032 | 9,125,382 | 812,235 | 5,277,135 | 11 | 497.45 s | 13.15 MB/s | 3,621.9 MB | 87.3 ms |
| FireX 30G | `frun-65a98ab95c55af35` | 19,621,285,387 | 8,138,878 | 1,310,857 | 8,138,878 | 0 | 543.53 s | 36.1 MB/s | 2,558.6 MB | Not applicable |
| FireX 50G | `frun-49e56859504c8df7` | 32,702,905,053 | 61,970,767 | 7,645,803 | 43,681,473 | 11 | 4,216.33 s | 7.76 MB/s | 6,439.2 MB | 79.52 ms |

Three sources gave three different answers, and they must not be conflated:

- **10G: reconstructed, unconfirmed incidents.** 57.83% of its valid records also share one timestamp, and 26.40% of its
  bytes are quarantined, so reconstruction trust is `Needs review`.
- **30G: reconstruction withheld.** Every valid record shares one timestamp. Zero incidents does not mean zero threats.
- **50G: partial reconstruction from a degraded source.** 70.49% of its records share one timestamp, and a time-zone
  conflict affects every record. Zero rejected records means every line parsed, not that its time can be trusted.

In both the 10G and 50G runs, all 11 incidents rest only on the trustworthy time region: no cited record and no detection
span reaches the collapsed timestamp. Activity among the collapsed records is unknown, not absent. The 11 incidents do
not cover the complete source.

## Unmeasured

| Item | Status |
|---|---|
| Official detection, labelling and false-positive rates | Unmeasured; no ground truth |
| Live Groq or xAI responses | Stub tested only |

## Official targets (not claims)

Over 90% detection, over 85% correct labels, all planted paths recovered, under 10% false-positive incidents, under one
hour of processing, under 8 GB memory, under 500 ms indexed incident open.

## Not to be confused with

The read-only profiler's 3,342 s and 405.7 MB describe that separate tool, not HALT.
