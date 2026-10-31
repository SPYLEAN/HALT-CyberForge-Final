# Trust Centre

Verdict first. Hashes are one expansion away. All verdicts are derived on the server by `halt/firex/trust.py` from stored files.

## Overall state

| State | Meaning | Rule |
|---|---|---|
| Failed | The run or a receipt cannot be relied on | Run not completed, bytes unaccounted, or a seal invalid |
| Degraded | Processing is sound, but the source cannot support reconstruction | Nearly all valid records share one timestamp |
| Unconfirmed | Results exist or none were found, with no ground truth | Default without validation |
| Verified | Validated against ground truth | Not reachable today: no ground truth exists |

## Four separate dimensions

| Dimension | Answers |
|---|---|
| Source integrity | Is this the file we think it is? Hash, size, valid and quarantined bytes, reject reasons, timestamp quality, time-zone conflict |
| Processing integrity | Was it processed completely? Versions, commit, bytes accounted, records, duplicates, duration, throughput, peak memory, recovery |
| Reconstruction trust | Can its story be relied on? Incidents, observed and inferred links, missing evidence, coverage, why it ran or was withheld |
| Ground-truth validation | Is it known to be correct? Availability and accuracy state |

Labels: Verified, Needs review, Not measured, Not applicable, Failed.

`Verified` on source or processing never means an incident is true. Ground truth stays `Not measured`, and incidents stay Unconfirmed.

## Withheld reconstruction

When at least 99% of valid records share a collapsed timestamp, no trustworthy time axis exists. Reconstruction trust is
`Needs review`, overall state is Degraded, and the Quality Case explains it. Zero incidents is never presented as zero threats, and
incident-open latency is `Not applicable`.

## Partial reconstruction

At or above two thirds of valid records in a collapsed timestamp, and below the withheld threshold, reconstruction is
`partial`. Overall state is Degraded, reconstruction trust is `Needs review`, and the verdict says the incidents do not
cover the complete source. The threshold (`PARTIAL_COLLAPSED_FRACTION`) labels a stored result. It changes no detection.
It is a judgement call: FireX 10G sits below it at 57.83%, still discloses its collapse, and stays `ran`.

## Time scope

For any run with a collapsed timestamp, the Trust Centre shows the usable and collapsed regions and what each incident
rests on: the trustworthy region only, the collapsed region only, or both. Cited records are checked by line, and
detection and step spans by time, which also covers merged records a detection counts without citing. All of this is
read from stored files. Incidents stay unconfirmed whatever their scope.

## Proof

Benchmark receipt, each incident's proof, artifact hashes, the seal algorithm and live re-verification. Seals are SHA-256 over canonical
JSON: tamper evidence, not a legal digital signature.
