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
| EV-06 | 09:52:18 | resource_access | Graph activity GA-30918 | T1213.002 | 214 requests to Finance-Close library in 4 min |

Background: 405 benign events (`BG-xxxx`) generated with seed 2417 across 60 synthetic users so correlation has noise to reject. They use the same kinds and attribute keys as the incident, and include hard negatives: a travel sign-in followed by an MFA change, a 180-request quarter-end export, a VPN session hop and an unverified internal app. Detection must not depend on reading the `EV-` prefix (a test renames every id and checks the result is unchanged). EV-06 uses the ordinary `resource_access` kind, like background traffic; enumeration is concluded from its rate and the user's history.

## 3. ThreadGraph

### Nodes

| ID | Kind | Label | Provenance | Notes |
|---|---|---|---|---|
| attacker.phish_sender | attacker | Phishing sender | observed | EV-01 |
| attacker.as64500 | attacker | ASN AS64500 | observed | EV-02, EV-05 |
| attacker.docusync_app | attacker | DocuSync Pro (unverified publisher) | observed | EV-04 |
| user.m_verma | user | M. Verma · Finance Ops | observed | EV-01..05; releaser for the 16:00 supplier run |
| device.mv_laptop | device | M. Verma laptop (managed) | structural | Device inventory |
| token.grant_docusync | token | OAuth grant · DocuSync Pro | observed | EV-04 |
| session.s1 / session.s2 | session | Sessions S-1, S-2 (replayed) | observed | EV-05 |
| session.s3 | session | Session S-3 | **forecast** | Does not exist yet |
| api.finance | api | Finance API | structural | Dependency map v14; EV-06; ≈310 users; critical |
| process.payment | process | Payment processing | structural | ≈85 users, 16:00 supplier run, critical; EV-06 |
| process.payroll | process | Payroll | structural | 640 employees, 18:00 run, critical |
| process.reconciliation | process | Reconciliation | structural | 22 users, 17:00 daily, critical |
| process.support | process | Customer support | structural | 38 agents, standard |
| db.finance_ledger | database | Finance ledger database (`fin-ledger-db`) | structural | Critical target |
| user.finance_staff | user | Finance staff (group) | structural | Business thread origin |
| user.s_iyer, user.j_okafor | user | Finance approvers | structural | Prompted by step-up |

### Edges (full list in `topology.json`)

Historical hostile edges (already happened, cannot be cut, no transition): `e.phish-user` (EV-01), `e.asn-user` (EV-02), `i.phish-asn` (inferred 0.74), `e.user-grant` (EV-04).

Live hostile edges (EchoLab inputs; each succeeds independently with probability p after a uniform delay):

| ID | From → To | Provenance | p | Delay (s) |
|---|---|---|---|---|
| e.app-grant | docusync_app → grant | observed EV-04 | 1.00 | 0 |
| e.asn-s1, e.asn-s2 | as64500 → s1 / s2 | observed EV-05 | 0.95 | 5–30 |
| e.s1-fapi | s1 → api.finance | observed EV-06 | 0.90 | 10–60 |
| e.s2-pay | s2 → payment | observed EV-06 | 0.85 | 10–60 |
| f.grant-fapi | grant → api.finance | forecast | 0.80 | 30–180 |
| f.grant-recon | grant → reconciliation | forecast | 0.55 | 60–240 |
| f.grant-payroll | grant → payroll | forecast | 0.45 | 60–240 |
| f.user-s3 | m_verma → s3 (new session) | forecast | 0.60 | 30–180 |
| f.s3-pay | s3 → payment | forecast | 0.80 | 30–120 |
| f.fapi-db / f.pay-db / f.recon-db / f.payroll-db | → ledger | forecast | 0.85 / 0.70 / 0.60 / 0.55 | 30–150 |
| i.asn-support | as64500 → support | inferred 0.55 | 0.35 | 60–240 |
| f.support-fapi | support → api.finance | forecast | 0.30 | 60–240 |

Identity edges: `e.user-s1`, `e.user-s2` (EV-05), `e.user-device`. Dependency edges point from dependent to dependency: processes and support → `api.finance`; `api.finance` and processes → ledger; `user.finance_staff` → processes (business thread); **`d.payment-verma`**: payment → m_verma (`requires_human`, runbook FR-12).

Transition probabilities are scenario **inputs**. Path risks are **outputs** of EchoLab over those inputs (see the measured table below).

### Paths ThreadGraph must enumerate (→ `db.finance_ledger`)

Path rule (Phase 2): take simple paths over **live** hostile edges, starting from a foothold (an attacker-controlled node, or a node the attacker reached through historical edges) and ending at the target. Keep only maximal paths, dropping any path that is a suffix of another. Historical prefixes are kept as entry routes for display.

| ID | Live route | Entry route (historical) | Provenance | Reach, seed 2417 (of 6,000) | Risk |
|---|---|---|---|---|---|
| P1 | AS64500 → S-1 → Finance API → ledger | phish ⇢ AS64500 (inferred) | mixed | 4,335 | 0.7225 |
| P2 | DocuSync Pro → grant → Finance API → ledger | phish/AS64500 → M. Verma → consent | mixed | 4,050 | 0.675 |
| P3 | AS64500 → S-2 → Payment processing → ledger | phish ⇢ AS64500 (inferred) | mixed | 3,431 | 0.5718 |
| P4 | M. Verma → new session S-3 → Payment processing → ledger | phish/AS64500 → M. Verma | forecast | 2,068 | 0.3447 |
| P5 | DocuSync Pro → grant → Reconciliation → ledger | phish/AS64500 → M. Verma → consent | mixed | 1,884 | 0.314 |
| P6 | DocuSync Pro → grant → Payroll → ledger | phish/AS64500 → M. Verma → consent | mixed | 1,480 | 0.2467 |
| U1 | AS64500 ⇢ Customer support → Finance API → ledger | phish ⇢ AS64500 (inferred) | forecast + inferred, uncertain | 502 | 0.0837 |

Ids are derived, not chosen: ThreadGraph identifies a path by its live edge sequence, and EchoLab (Phase 3) ranks them with no response. High-risk paths become P1.. in descending risk, the rest U1... The reach counts above are measured by `tests/test_echolab.py` (AT-3.2) with seed 2417 and 6,000 rollouts.

High-risk threshold: `reach_rate × criticality ≥ 0.20` with ledger criticality 1.0. Acceptance requires exactly P1–P6 high-risk and U1 not. A cut blocks a path only when it hits a node or edge on the **live** route.

## 4. Candidate response catalogue (12 → 4,096 subsets)

Cut strength `hard` removes a capability; `soft` can be evaded by the modelled attacker (EchoLab lets the attacker switch egress ASN with p = 0.6), so soft cuts never satisfy coverage. Historical edges cannot be cut. Process downtime is computed in Phase 4: a critical process whose dependency closure an action breaks is down for the containment window (240 min), because actions stay in force that long.

| ID | Action | Hard cuts | Soft cuts | Users affected | Process downtime | Rollback | Policies / roles |
|---|---|---|---|---|---|---|---|
| C01 | Revoke DocuSync Pro grant | node token.grant_docusync | — | m_verma | none | RB-1 · 30 s | IR-OAUTH-02 · tier2 |
| C02 | Revoke session S-1 | node session.s1 | — | m_verma | none | RB-2a · 60 s | IR-SESS-01 · tier2 |
| C03 | Revoke session S-2 | node session.s2 | — | m_verma | none | RB-2b · 60 s | IR-SESS-01 · tier2 |
| C04 | Phishing-resistant step-up for finance apps (60 min) | edge f.user-s3 | — | m_verma, s_iyer, j_okafor | none | RB-3 · 20 s | IR-CA-05 + IR-CHG-03 · tier2 + finance_ops_owner |
| C05 | Isolate Finance API | node api.finance | — | 310 (group) | payment, payroll, recon, support: 240 min | RB-5 · 4 h manual | IR-ISO-02 · soc_lead |
| C06 | Isolate finance database | node db.finance_ledger | — | 412 (group) | every process: 240 min | RB-6 · 4 h 20 manual | IR-ISO-03 · soc_lead + ciso |
| C07 | Network-isolate finance subnet | nodes api.finance, db.finance_ledger | — | 412 (group) | every process: 240 min | RB-7 · 3 h manual | IR-ISO-04 · soc_lead + ciso |
| C08 | Disable M. Verma account | node user.m_verma | — | m_verma | payment: 240 min (releaser unavailable via `d.payment-verma`) | RB-8 · 30 s | IR-ACCT-01 · tier2 |
| C09 | Block AS64500 at the edge | — | e.asn-s1, e.asn-s2, i.asn-support | none | none | RB-9 · 10 s | IR-NET-01 · tier2 |
| C10 | Revoke all third-party consents tenant-wide | node token.grant_docusync (+13 others) | — | 212 (group) | none modelled; 14 integrations | RB-10 · 3 h manual | IR-OAUTH-09 · soc_lead |
| C11 | Force password reset | — (tokens and grants survive) | — | m_verma | none | not reversible | IR-ACCT-02 · tier2 |
| C12 | Quarantine mailbox | — (phish edge is historical) | — | m_verma | none | RB-12 · 60 s | IR-MAIL-01 · tier2 |

`blocks` is never hand-listed: coverage is computed by intersecting each action's hard cuts with each path's nodes and edges.

### EchoLab comparison futures (`presets.json`)

| Future | Actions | Measured, seed 2417 (AT-3.4) |
|---|---|---|
| A · Aggressive isolation | C07 + C08 | 7 of 7 enumerated paths blocked; ledger reached in 0 of 6,000; 4 processes down 240 min; 413 users; not reversible within 5 min |
| B · Passive monitoring | none | 0 of 7 blocked; ledger reached in 5,782 of 6,000 |
| C · SafeCut plan | derived in Phase 4 | — |

Residual risk is a policy decision (PRODUCT_RFC §3a). Under **Continuity Balanced** (default) the plan C01–C04 cuts P1–P6 and leaves U1 open: the ledger is still reached in 502 of 6,000 rollouts, all via U1, within the profile's 600 allowance. EchoLab reports the plan as **6 of 7** paths blocked, the plan's residual names U1, ProofSeal's CHK-10 states it, and `not_covered` calls it "accepted residual risk, not containment". Under **Critical Asset Zero Tolerance** the baseline has no feasible plan: only C05, C06 and C07 hard-cut U1, and each breaks C-REVERSIBLE and C-DOWNTIME. With the `support_route_blockable` variant (C09's cut on the support route becomes hard), Zero Tolerance adds C09 and closes U1 (0 of 6,000) at no extra users or downtime. Measured: `POLICY_EVALUATION.md`.

## 5. Hard constraints (baseline variant)

| ID | Rule |
|---|---|
| C-COVER | every high-risk path has ≥ 1 hard cut |
| C-DOWNTIME | critical-process downtime ≤ 0 min |
| C-USERS | distinct users affected ≤ 5 |
| C-REVERSIBLE | every selected action reversible in ≤ 300 s |
| C-AUTH | every required role has an available approver (incl. change-freeze exception, IR-CHG-03 09:00–11:00Z) |
| C-EVIDENCE | every selected action evidence-preserving; seal before execution |

### What the solver derives (reasoning confirmed by tests: AT-4.1, brute force over 4,096 subsets)

- P6 (grant → Payroll) is hard-cut only by C01, C10, C06, C07. C10 breaks C-USERS; C06–C07 break C-DOWNTIME → **C01 required**. C01 also covers P2 and P5.
- P1 (S-1) is hard-cut by C02, C05, C06, C07 (C09 is soft) → **C02 required**. P3 (S-2) likewise by C03, C06, C07 → **C03 required**.
- P4 (S-3) is hard-cut by C04, C08, C06, C07. C08 breaks C-DOWNTIME (M. Verma releases the 16:00 run) → **C04 required**.
- {C01, C02, C03, C04}: 6/6 covered, 0 min downtime, 3 users, max rollback 60 s, approvals A. Rahman (tier2) + S. Iyer (finance_ops_owner). Any superset only adds cost → **unique optimum** (objective 345 = 3 users × 100 + 4 actions × 10 + 5 approvals; confirmed by brute force).
- Displayed as A1 = C01, A2 = C02 + C03 (same type, target user and policy), A3 = C04.

If the implementation produces a different answer, the scenario or the code is wrong; tests decide, the UI does not.

## 6. Reconciliation with the supplied prototype

| Prototype | Issue | Resolution here |
|---|---|---|
| Paths carry a hardcoded `a:'A1'` and actions a hardcoded `blocks:'P1, P2'` | Winning plan baked into data | Coverage computed from cut sets |
| A3 "blocks P3, P6" (prototype numbering) | A1 already cuts the Payroll path; step-up does not affect a grant's refresh tokens in this model | ProofSeal reports every cutting action per path; A3 shown as covering the S-3 path (P4 here) |
| A3 "step-up authentication" | Attacker registered an authenticator in EV-03, so ordinary step-up is satisfiable by the attacker | C04 requires a phishing-resistant method (flagged for approval) |
| "Disable account" rejected as "leaves the grant alive" | Does not explain why it loses for the S-3 path | Rejected by C-DOWNTIME (releaser dependency `d.payment-verma`) |
| "Block ASN" rejected as "blocks 2 of 6" | Not a reason in a set cover | Its cuts are soft (attacker can change egress) |
| Fixed figures (4,912 of 6,000, 82 %, 2,280 rollouts) | Not computed | Replaced by EchoLab output; prototype values are not asserted |
| Incident ID HLT-2047 in Command Center, INC-2417 elsewhere | Inconsistent | INC-2417 (pending approval) |

## 7. Variants (prove it is not hardcoded)

| Variant key | Change | Expected behaviour (asserted by tests) |
|---|---|---|
| `baseline` | — | optimal {C01,C02,C03,C04}, unique ✓ |
| `verma_not_releaser` | remove `d.payment-verma` | C08 becomes feasible with fewer users → plan changes to {C01,C02,C03,C08} |
| `approver_unavailable` | S. Iyer and delegates unavailable | C04 fails C-AUTH → `infeasible`; Gate state `blocked_by_policy`; closest options include "5 of 6 covered (P4 open)" |
| `no_phish_resistant_mfa` | C04 cut strength becomes soft | P4 only coverable by C06/C07/C08 → `infeasible`; closest options name the downtime each breaks |
| `relaxed_users_250` | C-USERS limit 250 | Optimum unchanged (objective still prefers fewer users) — guards against constraint-driven artefacts ✓ |

✓ = asserted by `tests/test_safecut.py`. Measured closest options: `approver_unavailable` → {C01–C04} breaking C-AUTH (C04 needs finance_ops_owner), {C01,C02,C03,C08} breaking C-DOWNTIME (240 min), {C01,C02,C03} breaking C-COVER (5 of 6, P4 open). `no_phish_resistant_mfa` → the last two. `verma_not_releaser` → {C01,C02,C03,C08} ✓, objective 144.

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
