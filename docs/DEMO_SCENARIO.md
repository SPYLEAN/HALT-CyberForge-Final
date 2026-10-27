# Demo Scenario — INC-2417 (SIMULATED)

All data in this scenario is synthetic. Names, ASNs, record IDs and organisations are fictional. AS64500 is from the documentation-reserved ASN range (RFC 5398). Seed: **2417**.

Source: reconciled from the supplied Command Center prototype (`05-command-center/source-parts/p2_data.js`, `p13_safe.js`) and the design-system mock-data contract (`02-design-system/5-handoff.md`). Differences are listed in §6.

## 1. Story (one paragraph for the presenter)

At 09:41 UTC a consent-phishing message reaches M. Verma in Finance Ops. Within ten minutes the attacker signs in from a new ASN, registers a second authenticator, consents a fake app ("DocuSync Pro") to mail and file scopes, replays two session tokens and starts enumerating the Finance-Close library. Six routes now lead to the finance ledger database. Isolating finance would stop the attacker and the 16:00 supplier run, the 17:00 reconciliation and the 18:00 payroll. HALT finds a smaller answer and proves it.

## 2. Observed events (replay clock T0 = 09:41:12Z)

| ID | Time (Z) | Kind | Source record | ATT&CK | Summary |
|---|---|---|---|---|---|
| EV-01 | 09:41:12 | mail_delivered | Mail gateway MT-88241 | T1566.002 | Consent link delivered to M. Verma |
| EV-02 | 09:42:36 | sign_in | Entra sign-in SL-4471 | T1078.004 | Sign-in from AS64500, unseen user agent |
| EV-03 | 09:43:21 | mfa_method_added | Entra audit AU-9120 | T1556.006 | Second authenticator (software TOTP) added |
| EV-04 | 09:43:50 | oauth_consent | Entra audit AU-9124 | T1528 | DocuSync Pro granted Mail.Read, Files.ReadWrite.All, offline_access |
| EV-05 | 09:47:03 | token_replay | Entra sign-in SL-4502 | T1550.004 | Sessions S-1 and S-2 replayed from AS64500 |
| EV-06 | 09:52:18 | resource_enumeration | Graph activity GA-30918 | T1213.002 | 214 requests to Finance-Close library in 4 min |

Background: ~400 benign events (`BG-xxxx`) generated with seed 2417 across 60 synthetic users so correlation has noise to reject. Detection must not depend on reading the `EV-` prefix.

## 3. ThreadGraph

### Nodes

| ID | Kind | Label | Provenance | Notes |
|---|---|---|---|---|
| attacker.phish_sender | attacker | Phishing sender | observed | EV-01 |
| attacker.as64500 | attacker | ASN AS64500 | observed | EV-02, EV-05 |
| attacker.docusync_app | attacker | DocuSync Pro (unverified publisher) | observed | EV-04 |
| user.m_verma | user | M. Verma · Finance Ops | observed | Releaser for the 16:00 supplier run |
| token.grant_docusync | token | OAuth grant · DocuSync Pro → M. Verma | observed | EV-04 |
| session.s1 | session | Session S-1 (replayed) | observed | EV-05 |
| session.s2 | session | Session S-2 (replayed) | observed | EV-05 |
| session.s3 | session | Session S-3 | **forecast** | Does not exist yet |
| api.finance | api | Finance API | observed | EV-06; ≈310 users |
| process.payment | process | Payment processing | observed | ≈85 users, 16:00 supplier run, critical |
| process.payroll | process | Payroll | static | 640 employees, 18:00 run, critical |
| process.reconciliation | process | Reconciliation | static | 22 users, 17:00 daily, critical |
| process.support | process | Customer support | static | 38 agents, standard |
| db.finance_ledger | database | Finance ledger database (`fin-ledger-db`) | observed | Critical target |
| user.finance_staff | user | Finance staff (group) | static | Business thread origin |
| user.s_iyer, user.j_okafor | user | Finance approvers | static | Prompted by step-up |

### Edges (abridged; full list in `topology.json`)

| ID | From → To | Kind | Provenance | Historical | Evidence / transition |
|---|---|---|---|---|---|
| e.phish-user | phish_sender → m_verma | hostile | observed | yes | EV-01 |
| e.asn-user | as64500 → m_verma | hostile | observed | yes | EV-02 |
| i.phish-asn | phish_sender → as64500 | hostile | inferred 0.74 | yes | shared hosting |
| e.user-grant | m_verma → grant_docusync | hostile | observed | yes | EV-04 |
| e.asn-s1, e.asn-s2 | as64500 → s1 / s2 | hostile | observed | no | EV-05 (replay continues) |
| e.user-s1, e.user-s2 | m_verma → s1 / s2 | identity | observed | yes | EV-05 |
| e.s1-fapi | s1 → api.finance | hostile | observed | no | EV-06 |
| e.s2-pay | s2 → process.payment | hostile | observed | no | EV-06 |
| f.grant-fapi | grant → api.finance | hostile | forecast | no | p 0.74 |
| f.grant-recon | grant → reconciliation | hostile | forecast | no | p 0.33 |
| f.grant-payroll | grant → payroll | hostile | forecast | no | p 0.21 |
| f.user-s3 | m_verma → s3 (new interactive session) | hostile | forecast | no | p 0.38 |
| f.s3-pay | s3 → payment | hostile | forecast | no | p 0.38 |
| f.fapi-db, f.pay-db, f.recon-db, f.payroll-db | → db.finance_ledger | hostile | forecast | no | 0.82 / 0.41 / 0.33 / 0.21 |
| d.* | api.finance → payment, payroll, reconciliation; support → api.finance; processes → db | dependency | observed | no | dependency map v14 |
| d.verma-payment | m_verma → payment (`requires_human`, releaser) | dependency | observed | no | 16:00 run |
| f.asn-support | as64500 → support | hostile | forecast | no | p 0.06 → U1 (below threshold) |

Transition probabilities are scenario **inputs**. The six path risks are **outputs** of EchoLab over those inputs.

### Paths ThreadGraph must enumerate (attacker entry → `db.finance_ledger`)

| ID | Route | Provenance |
|---|---|---|
| P1 | phish_sender → M. Verma → grant → Finance API → ledger | mixed |
| P2 | grant → Reconciliation → ledger | forecast |
| P3 | M. Verma → new session S-3 → Payment processing → ledger | forecast |
| P4 | AS64500 → S-1 → Finance API → ledger | mixed |
| P5 | AS64500 → S-2 → Payment processing → ledger | mixed |
| P6 | grant → Payroll → ledger | forecast |
| U1 | AS64500 → Customer support (no route to ledger in horizon) | forecast, **below threshold**, drawn as uncertain |

High-risk threshold: `reach_rate × criticality ≥ 0.20` with ledger criticality 1.0. Acceptance requires exactly P1–P6 high-risk and U1 not.

## 4. Candidate response catalogue (12 → 4,096 subsets)

Cut strength `hard` removes a capability; `soft` can be evaded by the modelled attacker (EchoLab lets the attacker switch egress ASN with p = 0.6), so soft cuts never satisfy coverage. Historical edges cannot be cut.

| ID | Action | Hard cuts | Soft cuts | Users affected | Process downtime | Rollback | Policies / roles |
|---|---|---|---|---|---|---|---|
| C01 | Revoke DocuSync Pro grant | node token.grant_docusync | — | m_verma | none | RB-1 · 30 s | IR-OAUTH-02 · tier2 |
| C02 | Revoke session S-1 | node session.s1 | — | m_verma | none | RB-2a · 60 s | IR-SESS-01 · tier2 |
| C03 | Revoke session S-2 | node session.s2 | — | m_verma | none | RB-2b · 60 s | IR-SESS-01 · tier2 |
| C04 | Phishing-resistant step-up for finance apps (60 min) | edge f.user-s3 | — | m_verma, s_iyer, j_okafor | none | RB-3 · 20 s | IR-CA-05 + IR-CHG-03 · tier2 + finance_ops_owner |
| C05 | Isolate Finance API | node api.finance | — | ≈310 | payment, payroll, recon, support ≈ 240 min | manual · 4 h | IR-ISO-02 |
| C06 | Isolate finance database | node db.finance_ledger | — | all finance | all ≈ 260 min | manual · 4 h 20 | IR-ISO-03 |
| C07 | Network-isolate finance subnet | api.finance, db | — | ≈412 | all ≈ 180 min | manual · 3 h | IR-ISO-04 |
| C08 | Disable M. Verma account | edge f.user-s3 | — | m_verma | payment (releaser unavailable) ≈ 120 min | RB-8 · 30 s | IR-ACCT-01 · tier2 |
| C09 | Block AS64500 at the edge | — | e.asn-s1, e.asn-s2, f.asn-support | none | none | RB-9 · 10 s | IR-NET-01 · tier2 |
| C10 | Revoke all third-party consents tenant-wide | node grant_docusync (+13 others) | — | 212 | 14 integrations | manual · hours | IR-OAUTH-09 · SOC lead |
| C11 | Force password reset | — (tokens and grants survive) | — | m_verma | none | n/a | IR-ACCT-02 |
| C12 | Quarantine mailbox | — (phish edge is historical) | — | m_verma | none | RB-12 · 60 s | IR-MAIL-01 |

`blocks` is never hand-listed: coverage is computed by intersecting each action's hard cuts with each path's nodes and edges.

## 5. Hard constraints (baseline variant)

| ID | Rule |
|---|---|
| C-COVER | every high-risk path has ≥ 1 hard cut |
| C-DOWNTIME | critical-process downtime ≤ 0 min |
| C-USERS | distinct users affected ≤ 5 |
| C-REVERSIBLE | every selected action reversible in ≤ 300 s |
| C-AUTH | every required role has an available approver (incl. change-freeze exception, IR-CHG-03 09:00–11:00Z) |
| C-EVIDENCE | every selected action evidence-preserving; seal before execution |

### What the solver should derive (reasoning, to be confirmed by tests — not hardcoded)

- P6 (grant → Payroll) is hard-cut only by C01, C10, C05, C06, C07. C10 breaks C-USERS; C05–C07 break C-DOWNTIME → **C01 required**. C01 also covers P1, P2.
- P4 is hard-cut by C02, C05, C06, C07 (C09 is soft) → **C02 required**. P5 likewise → **C03 required**.
- P3 is hard-cut by C04, C08, C06, C07. C08 breaks C-DOWNTIME (M. Verma releases the 16:00 run) → **C04 required**.
- {C01, C02, C03, C04}: 6/6 covered, 0 min downtime, 3 users, max rollback 60 s, approvals A. Rahman (tier2) + S. Iyer (finance_ops_owner). Any superset only adds cost → expected **unique optimum**.
- Displayed as A1 = C01, A2 = C02 + C03 (same type, target user and policy), A3 = C04.

If the implementation produces a different answer, the scenario or the code is wrong; tests decide, the UI does not.

## 6. Reconciliation with the supplied prototype

| Prototype | Issue | Resolution here |
|---|---|---|
| Paths carry a hardcoded `a:'A1'` and actions a hardcoded `blocks:'P1, P2'` | Winning plan baked into data | Coverage computed from cut sets |
| A3 "blocks P3, P6" | A1 already cuts P6; step-up does not affect a grant's refresh tokens in this model | ProofSeal reports every cutting action per path; A3 shown as covering P3 |
| A3 "step-up authentication" | Attacker registered an authenticator in EV-03, so ordinary step-up is satisfiable by the attacker | C04 requires a phishing-resistant method (flagged for approval) |
| "Disable account" rejected as "leaves the grant alive" | Does not explain why it loses for P3 | Rejected by C-DOWNTIME (releaser dependency `d.verma-payment`) |
| "Block ASN" rejected as "blocks 2 of 6" | Not a reason in a set cover | Its cuts are soft (attacker can change egress) |
| Fixed figures (4,912 of 6,000, 82 %, 2,280 rollouts) | Not computed | Replaced by EchoLab output; prototype values are not asserted |
| Incident ID HLT-2047 in Command Center, INC-2417 elsewhere | Inconsistent | INC-2417 (pending approval) |

## 7. Variants (prove it is not hardcoded)

| Variant key | Change | Expected behaviour (asserted by tests) |
|---|---|---|
| `baseline` | — | optimal {C01,C02,C03,C04}, unique |
| `verma_not_releaser` | remove `d.verma-payment` | C08 becomes feasible with fewer users → plan changes to {C01,C02,C03,C08} |
| `approver_unavailable` | S. Iyer and delegates unavailable | C04 fails C-AUTH → `infeasible`; Gate state `blocked_by_policy`; closest options include "5 of 6 covered (P3 open)" |
| `no_phish_resistant_mfa` | C04 cut strength becomes soft | P3 only coverable by C06/C07/C08 → `infeasible`; closest options name the downtime each breaks |
| `relaxed_users_250` | C-USERS limit 250 | Optimum unchanged (objective still prefers fewer users) — guards against constraint-driven artefacts |

## 8. Replay script (presenter beats)

| Replay t | State | What the screen shows |
|---|---|---|
| 0–84 s | new | EV-01, EV-02 arrive; two nodes |
| 84–420 s | correlating | MFA change, consent, replay; inferred links dashed |
| 420 s | forecast | Six paths appear dotted toward the ledger; U1 long-dashed neutral |
| 666 s | simulating | EchoLab runs A / B / C (6,000 rollouts each) |
| — | plan | SafeCut result, constraints, rejected candidates with reasons |
| — | approval | Gate: two approvals required, Execute disabled with reason |
| — | executing → contained | Actions apply in order; gaps open; proof rings land; Verdigris thread never pauses |
| — | rollback | Window open until valid_until or new telemetry |

Times after 666 s are driven by user actions, not the clock.
