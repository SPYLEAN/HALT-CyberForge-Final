# PS2 data and evaluation plan

> **Status: PROVISIONAL.** All data is synthetic unless a licensed public dataset is added and disclosed. If the
> organisers supply logs, they replace the generators below as the primary input.

## 1. Scenario A: OAuth consent phishing against Finance Operations (primary)

Already modelled as INC-2417 (6 incident events, 405 benign background events). PS2 turns it into **raw logs plus
ground truth** instead of pre-normalised events plus an authored graph.

| Stage | Ground-truth event | Raw source (proposed) | Ground-truth entities | ATT&CK |
|---|---|---|---|---|
| 1 | Phishing email delivered, link clicked | mail message trace CSV | sender domain, user M. Verma, URL | T1566.002 |
| 2 | Suspicious authentication from new ASN | Entra-style sign-in JSONL | user, IP 203.0.113.x, session S-1 | T1078.004 |
| 3 | MFA method added from that session | Entra-style audit JSON | user, session S-1, authenticator | T1556.006 |
| 4 | Malicious OAuth consent (unverified publisher) | Entra-style audit JSON | app DocuSync Pro, scopes, grant | T1528 |
| 5 | Token replay from attacker infrastructure | sign-in JSONL (token reuse) | token, session S-2, IP | T1550.004 |
| 6 | Finance-resource discovery | Graph/M365 activity JSON | resources, request burst | T1213.002 |
| 7 | Potential ledger access (**forecast, not observed**) | none | finance ledger DB | forecast only |

**Background noise:** existing generator (`halt.scenario.background`) re-emitted as raw lines across the same
sources (normal sign-ins, normal consents, routine Graph reads).
**Ambiguous events:** a legitimate MFA change by another Finance user the same morning; a VPN sign-in from a
similar ASN; a benign consent to a verified app.
**False-positive bait:** an impossible-travel-looking pair caused by a known VPN egress (must *not* link).
**Missing telemetry:** no endpoint log for the attacker's device (expected: edge stays "inferred" with stated gap).
**Expected evidence links:** session S-1 ↔ MFA change (same session id); consent → token (token lineage);
token → replay (token id); replay → resource reads (session S-2).
**Rejected correlations:** the VPN pair; the benign consent; the other user's MFA change.
**Response constraints:** Payment processing, Payroll and Reconciliation must keep running; policy profiles as today.

## 2. Scenario B (generalisation): credential stuffing → account takeover → mailbox rule + data access

Chosen over service-account abuse because it exercises different sources (network + endpoint) and different
techniques, so a scenario-A-shaped pipeline cannot pass it by accident.

| Stage | Event | Source | ATT&CK |
|---|---|---|---|
| 1 | Password-spray / stuffing burst against many users | sign-in JSONL + Zeek conn.log | T1110.004 |
| 2 | One success without MFA (legacy protocol) | sign-in JSONL | T1078 |
| 3 | Inbox forwarding rule created | Exchange-style audit JSON | T1114.003 |
| 4 | Endpoint: PowerShell download on the user's laptop | Sysmon-style JSON | T1059.001 |
| 5 | Access to a customer-records share | cloud/file audit JSON | T1039 |

Built by a **separately configured generator**, different user names, IP ranges and timing, with its own
noise, ambiguous events and missing telemetry. Its ground truth is written **before** the pipeline is tuned and
never used for tuning.

## 3. Ground-truth format (per scenario)

`ground_truth.json`: entities (type, canonical id, aliases), attack event UIDs and stage labels, ATT&CK labels,
edges (source, target, kind, required evidence UIDs), rejected correlations, forecast targets that are *not*
observed, response constraints. Versioned and hashed; the evaluation report cites the hash.

## 4. Candidate techniques (simplest first)

| Task | Baseline (ship if it meets target) | Candidate only if baseline fails | Not proposed |
|---|---|---|---|
| Event relevance | existing logistic regression on 21 features (PR-AUC 0.9758 synthetic) | HistGradientBoosting (already compared; +0.0064, rejected) | deep models |
| Event classification (ATT&CK) | kind table prior + field rules | logistic regression per tactic | LLM classification |
| Temporal sequence | ordered stage transitions with time windows | first-order Markov transition scores | RNN/transformer |
| Graph inference | deterministic link rules + scored statistical links | logistic regression on edge features | GNN |
| Next-target forecast | existing EchoLab Monte Carlo over the reconstructed graph | transition probabilities estimated from training runs | — |
| Calibration | reliability of forecast counts vs held-out continuations; Brier score | isotonic/Platt on edge confidence | — |

A large language model is **not** proposed for any of these.

## 5. Data splits

Split by **complete attack run / simulated organisation**, never by neighbouring events:

| Split | Content |
|---|---|
| Train | generator seeds 1000–1019 for scenario-A-family runs (attack chains with varied timing, noise levels) |
| Validation | seeds 2000–2004, used for thresholds |
| Test A | the canonical INC-2417 raw logs (seed 2417), never used to tune |
| Test B | scenario B (separate generator), never used to tune |

Thresholds are frozen before Test A/B are run; the report records the commit at which they were frozen.

## 6. Honesty rules

Synthetic-on-synthetic results measure **pipeline correctness**, not real-world detection efficacy, and are always
labelled so. If a public dataset (e.g. a licensed, citable security-log corpus) is used, it gets its own row in the
disclosure plan and its own results table.
