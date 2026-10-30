# PS2 research ledger

> **Ideas only.** No code, rules, schemas, datasets or text were downloaded or copied from any project or paper
> below. Nothing was vendored and no dependency was added for PS2. HALT does **not** implement any of these
> papers or tools. Where this pass borrowed an idea, the table says which idea and where it lives in
> `services/api/halt/ps2/`.

| Source | What it is | Idea taken | Where in HALT | What HALT does *not* do |
|---|---|---|---|---|
| **OCSF** (Open Cybersecurity Schema Framework) | open, vendor-neutral event schema, organised into categories and classes (Authentication, API Activity, Process Activity, Email Activity, …) | normalise each vendor record into one versioned event model with typed fields; use OCSF-style field names where practical | `schema.py` `CanonicalEvent` (`halt.canonical/1.0`) | no OCSF class ids, profiles or full attribute dictionary; **not OCSF-compliant** |
| **MITRE ATT&CK** (Enterprise) | knowledge base of adversary tactics and techniques | label each reconstructed step with a tactic and technique, and say how the label was reached | `attack.py` (T1566.002, T1078.004, T1556.006, T1528, T1550.001, T1083, T1619, T1098.003, T1530, T1213, …) with `basis` = observed / rule_inferred / uncertain | no full technique coverage, no sub-technique completeness, no detection content |
| **Attack Flow** (MITRE Center for Threat-Informed Defense) | STIX 2.1 extension for describing sequences of adversary actions | export the selected path as an ordered flow of actions others can import | `attack.py` `attack_flow()`, `/reconstructions/{id}/attack-flow` | shape-checked only (`validate_flow_shape`); not validated against the official schema or tooling (`x_halt_conformance` says so) |
| **Sigma** | generic, declarative detection-rule format | keep detection logic declarative, named and versioned, with weights in config rather than code | `seeds.py` rules, `reconstruction_config.json` | no Sigma parser, no Sigma rules, no Sigma backends |
| **SLEUTH** (Hossain et al., USENIX Security 2017) | real-time attack-scenario reconstruction from audit data, using tag-based provenance graphs | start from suspicious seeds and spread relevance over a dependency graph so that benign bulk is pruned | `reduce.py` (seed → bounded propagation with decay) | no system-call provenance, no tag algebra, no kernel audit sources |
| **ATLAS** (Alsaheel et al., USENIX Security 2021) | builds attack stories from causal graphs of audit logs, with sequence learning | the output is an *attack story*: ordered, entity-centred steps, not a list of alerts | `story.py`, `paths.py` | no learning model for path selection; HALT's story is template-based and checked fact by fact |
| **SPARSE** (provenance-graph attack-investigation research, as named in the PS2 brief) | attack investigation that tracks suspicious semantics along graph paths | rank candidate paths and keep alternates and rejected paths for review instead of a single answer | `paths.py` (selected / alternate / rejected, with reasons) | the bibliographic details were **not re-verified** in this pass; nothing from its method is reproduced |
| **Timesketch** (open-source collaborative timeline analysis) | forensic timeline tool | everything is anchored to a time-ordered event list with source provenance per row | canonical events sorted by `(occurred_at, event_id)` and `/ingestions/{id}/events`; `EvidenceRef` per event | no timeline UI, no sketches or annotations |
| **Hayabusa** (Yamato Security) | fast Windows event-log triage and timeline generator using Sigma-style rules | per-record parsing that never stops on a bad record, and rule hits reported per record | `intake/` (rejected-record reports with issue codes) | no Windows EVTX parsing |
| **Chainsaw** (WithSecure) | rapid search and hunting over Windows event logs | fast first-pass hunting over raw logs before deeper analysis | the seed pass in `seeds.py` | no EVTX support, no Sigma execution |

## Original to HALT in this pass

- The **noisy-OR edge model** with exact, identity and supporting component groups, and the rule that
  temporal-only edges are capped below the selection threshold (`edges.py`).
- The **fact-keyed story checker**. Each value rendered into a sentence is re-derived from the cited event,
  edge, stage or context, and must appear verbatim (`story.py`).
- The **reconstruction receipt**: a replay id over inputs, context, config and engine version; a graph hash;
  uncertainty; and coverage (`engine.py`).
- The **R1 bridge**. The unchanged HALT-R1 model scores only the event kinds it was trained on, and gives
  `None`, not a guess, for everything else (`r1_bridge.py`).
