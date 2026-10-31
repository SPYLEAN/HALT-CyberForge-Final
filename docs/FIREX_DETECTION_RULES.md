# FireX detection rules

Rules are in `services/api/halt/firex/detection_rules.json` (`halt.firex.rules/1.0.0`). Every threshold, pattern and
label is configuration, and the configuration hash is sealed in each receipt. No user name, address, timestamp or
evidence id from any profile appears in the engine or its rules; a test fails otherwise.

Every detection is **unconfirmed**. These thresholds were set from profile knowledge of this data set and the rule
intent. They have not been tuned against organiser ground truth, because none has been provided.

| Rule | Candidate pattern | Key thresholds | ATT&CK | Stage |
|---|---|---|---|---|
| `account_lifecycle` | Account created, then used and/or deleted within the window | 24 h. Create alone is not a detection | T1136.001 | installation |
| `logging_tamper` | Logging disabled, then changes and/or restore by the same user or source | 24 h. Disable alone is not a detection | T1562 | defense evasion |
| `web_attack_concentration` | Many IPS events on one target using several attack names over HTTP or HTTPS | 50 events, 3 signatures | T1190 | exploitation |
| `internal_fanout` | One host reaching many internal hosts on SMB or RDP | 10 destinations | T1021 | lateral movement |
| `sustained_dns` | One host, one resolver, high volume over time | 500 records, 10 min | T1071.004 | command and control |
| `repeated_malware` | Repeated malware records between one host and one destination | 3 events within 24 h | T1105 | delivery |
| `denial_flood` | Many denied connections from many sources against one target | 1,000 events, 100 sources, 100 in the peak hour | T1498 | impact |
| `vpn_alternation` | One identity's tunnels alternating between addresses | 3 tunnels, 2 changes, 2 h | T1133 | credential access |
| `failure_then_success` | Failures sharing the account or source, then a success | 5 failures within 1 h | T1110 | credential access |

## What is never a detection on its own

`level=alert`, a single IPS record, a single antivirus record, a high application risk rating, an `attackid`, or
any volume of failed logins with no relation to a later success.

## Partial sequences

A sequence with a missing step keeps a lower confidence (×0.7), and the gap is listed on the incident.

## Time-window rules and collapsed timestamps

`sustained_dns` and `denial_flood` depend on rates and durations, so they read only records outside collapsed
timestamps. The number of collapsed records is reported in `DatasetQualitySummary`. Activity inside a collapsed
timestamp cannot trigger these two rules. This is a known limit.

The other rules group by entity and can include collapsed records, labelled `collapsed` on the detection, with source
order used for sequence.

## Identity of an attack

The attack name plus entities is the identity. `attackid` is kept as source metadata only, because the profile found
one id mapping to several names.

## Bursts

`burst.repeated_behaviour` groups records with the same actor, target and action per hour (at least 20) outside
collapsed timestamps. A burst is not a detection: it reduces repeated behaviour and keeps counts and sample evidence.
